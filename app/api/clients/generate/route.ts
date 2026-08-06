import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import Groq from 'groq-sdk'
import { GenerateClientEmailRequest } from '@/lib/clientTypes'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabase } from '@/lib/supabase'
import { generateWithFallback, describeAIFailure } from '@/lib/aiFallback'
import { renderTemplate, isFaithfulToTemplate } from '@/lib/templateRender'

const db = supabaseAdmin ?? supabase

function buildSystemPrompt() {
  return `Você é um motor de personalização de e-mails de prospecção B2B.
Sua única função é adaptar um e-mail template escrito pelo recrutador para cada contato específico.

REGRAS ABSOLUTAS:
1. PRESERVE rigorosamente a estrutura, mensagem, tom e intenção do template original
2. O template JA CHEGA com os dados do contato preenchidos (nome, empresa, cargo). NAO existem marcadores para substituir — se voce encontrar algo como [Nome], {{EMPRESA}} ou {Cargo}, foi engano: remova o marcador, nunca o copie para o e-mail final
3. NUNCA invente nome, empresa, cargo ou segmento/setor que nao esteja no texto recebido. Se o template nao menciona a empresa ou o segmento, o e-mail final tambem nao deve mencionar — nem com frase generica ("sua empresa", "seu setor", "seu segmento")
4. Se o template começa com "Olá," sem nome, adicione o primeiro nome: "Olá, {primeiro_nome}!"
5. Faça variações SUTIS de fraseado (10-15% do texto): troque conectores, reordene adjetivos, varie construção de frases — sem alterar o significado
6. NUNCA adicione conteúdo, seções ou informações que não estão no template
7. NUNCA remova partes do template original
8. NUNCA use palavras de spam: grátis, promoção, urgente, clique agora, oferta imperdível, exclusivo, garantido
9. A assinatura fornecida deve aparecer EXATAMENTE no final do body
10. O subject deve refletir o tema do template, personalizado com o nome da empresa do contato se fizer sentido — máximo 60 caracteres, sem emojis

ANTI-SPAM (crítico):
- Cada email gerado deve ter variações visíveis em relação aos outros da campanha
- Varie a primeira frase, os conectores e o penúltimo parágrafo
- Mantenha linguagem profissional e consultiva — nunca comercial agressiva
- Não use múltiplos pontos de exclamação seguidos
- Não use CAPS LOCK excessivo
- Não use palavras de alarme: "urgente", "exclusivo", "imperdível", "promoção", "grátis"
- O e-mail deve parecer escrito individualmente, não em massa

REGRAS DO ASSUNTO (CRÍTICAS PARA NÃO CAIR EM SPAM):
- NUNCA comece o assunto com: "Oportunidade", "Oferta", "Proposta", "Urgente", "Exclusivo", "Parceria"
- Prefira assuntos curtos e naturais como: "{empresa} — uma conversa rápida", "Fala, {primeiro_nome}", "Ideia para {empresa}"
- Máximo 55 caracteres
- Sem emojis, sem CAPS LOCK, sem pontos de exclamação no assunto
- O assunto deve parecer que foi escrito por uma pessoa, não por automação

Retorne APENAS JSON válido no formato: { "subject": "...", "body": "..." }
O body usa \\n para quebras de linha.`
}

function stripTrailingSignature(body: string): string {
  // Remove anything after the closing salutation — visual signature is added by the HTML template
  return body
    .replace(/(\n{0,3}(Abraços|Abra[cç]os|Atenciosamente|Att\.?)[,.]?\s*\n[\s\S]*)$/, '\n\nAbraços,')
    .replace(/((Abraços|Abra[cç]os|Atenciosamente|Att\.?)[,.]?\s*\n[\s\S]+)$/, '$2,')
    .trimEnd()
}

function buildUserPrompt(req: GenerateClientEmailRequest): string {
  const { contact, segment, emailTemplate, variationSeed } = req
  const firstName = contact.firstName || contact.fullName.split(' ')[0] || 'pessoal'

  // Campo ausente NAO entra no prompt. Mandar "Empresa: nao informada" fazia a IA
  // escrever justamente isso no e-mail; sem a linha, ela nao tem o que mencionar.
  const knownFields = [
    `- Nome completo: ${contact.fullName}`,
    `- Primeiro nome: ${firstName}`,
    contact.company ? `- Empresa: ${contact.company}` : null,
    contact.position ? `- Cargo: ${contact.position}` : null,
    segment?.trim() ? `- Segmento: ${segment.trim()}` : null,
  ].filter(Boolean).join('\n')

  const missing = [
    !contact.company ? 'a empresa do contato' : null,
    !contact.position ? 'o cargo do contato' : null,
    !segment?.trim() ? 'o segmento ou setor de atuação' : null,
  ].filter(Boolean)

  const omissionRule = missing.length
    ? `\nDADOS QUE VOCE NAO TEM: ${missing.join(', ')}.
REGRA ABSOLUTA: nao mencione esses dados, nao invente valor para eles e nao escreva
frases genericas no lugar (nada de "sua empresa", "seu setor", "nao informado",
"do seu segmento"). Simplesmente escreva o e-mail sem tocar nesses assuntos.\n`
    : ''

  const variationHints = [
    'Varie especialmente a primeira frase após a saudação.',
    'Varie especialmente os conectores entre parágrafos.',
    'Varie especialmente o penúltimo parágrafo.',
    'Varie especialmente a frase de fechamento antes da assinatura.',
    'Varie especialmente a apresentação da empresa no segundo parágrafo.',
  ]
  const hint = variationHints[(variationSeed ?? 0) % variationHints.length]

  return `TEMPLATE DE E-MAIL (escrito pelo recrutador):
---
${emailTemplate || '(template não fornecido)'}
---

CONTATO A PERSONALIZAR:
${knownFields}
${omissionRule}
REGRA CRÍTICA DE ASSINATURA: O body deve terminar com a saudação de fechamento do template (ex: "Abraços," ou "Atenciosamente,") e NADA MAIS depois disso.
NÃO inclua nome do recrutador, cargo ou qualquer texto após o fechamento — a assinatura visual é gerada automaticamente pelo sistema.

INSTRUÇÃO: Adapte o template acima para este contato específico. Substitua marcadores e referências genéricas pelos dados reais. ${hint} Preserve a mensagem e estrutura originais.`
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateClientEmailRequest & { subjectTemplate?: string } = await request.json()
    const { contact, campaignId, recruiterName, recruiterEmail, recruiterRole, segment, emailTemplate, subjectTemplate, aiProvider, variationSeed } = body

    // segment e opcional: campanhas sem segmento definido nao devem mencionar setor.
    if (!contact || !recruiterName || !emailTemplate) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
    }

    /** Persist generated content to Supabase (server-side, uses admin key → bypasses RLS) */
    async function persistGenerated(subject: string, generatedBody: string) {
      if (!db || !contact?.id) return
      await db.from('client_contacts').update({
        status: 'ready',
        generated_subject: subject,
        generated_body: generatedBody,
        edited_subject: subject,
        edited_body: generatedBody,
      }).eq('id', contact.id)
      if (campaignId) {
        await db.from('client_campaigns').update({ status: 'generating' }).eq('id', campaignId)
      }
    }

    const seed = variationSeed ?? Math.floor(Math.random() * 1000)

    // Preenche [Nome], [Empresa], [Cargo] ANTES de chamar a IA. Assim o modelo
    // recebe "Olá, Alessandro, tudo bem?" ja pronto e nunca ve um marcador —
    // nao ha como ele deixar passar, ignorar ou reescrever o campo.
    const templateContact = {
      firstName: contact.firstName,
      lastName: contact.lastName,
      fullName: contact.fullName,
      email: contact.email,
      company: contact.company,
      position: contact.position,
      segment,
    }
    const filledBody = renderTemplate(emailTemplate, templateContact)
    const filledSubject = renderTemplate(subjectTemplate ?? '', templateContact).trim()

    const systemPrompt = buildSystemPrompt()
    const userPrompt = buildUserPrompt({
      contact, campaignId, recruiterName, recruiterEmail, recruiterRole, segment,
      emailTemplate: filledBody,
      variationSeed: seed,
    })

    const provider = aiProvider ?? 'openai'

    /** Assunto final: template do recrutador (ja preenchido) tem prioridade. */
    const resolveSubject = (aiSubject?: string) =>
      filledSubject || (aiSubject ?? '').trim() || `${recruiterName} — Recrutaê`

    const callProvider = async (p: 'openai' | 'groq'): Promise<string> => {
      if (p === 'groq') {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
        const completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.75,
          max_tokens: 900,
          response_format: { type: 'json_object' },
        })
        return completion.choices[0]?.message?.content ?? ''
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: 900,
        response_format: { type: 'json_object' },
      })
      return completion.choices[0]?.message?.content ?? ''
    }

    try {
      // Fallback automatico entre OpenAI e Groq quando um deles fica sem creditos.
      const { result: text, usedProvider, didFallback } = await generateWithFallback(provider, callProvider)

      if (didFallback) {
        console.info(`[clients/generate] fallback ${provider} -> ${usedProvider}`)
      }

      const parsed = JSON.parse(text)
      if (!parsed?.body || typeof parsed.body !== 'string') {
        throw new Error('Resposta da IA sem body utilizavel.')
      }

      const subject = resolveSubject(parsed.subject)
      const aiBody = stripTrailingSignature(parsed.body)

      // A IA pode variar o fraseado, mas nao truncar, repetir ou inventar secoes.
      // Se ela corromper o texto, vale o template do recrutador — e o que ele pediu.
      const fidelity = isFaithfulToTemplate(aiBody, filledBody)
      if (!fidelity.ok) {
        console.warn(`[clients/generate] IA fugiu do modelo (${fidelity.reason}) — usando template preenchido`)
        const safeBody = stripTrailingSignature(filledBody)
        await persistGenerated(subject, safeBody)
        return NextResponse.json({
          subject,
          body: safeBody,
          usedProvider: 'template',
          didFallback: true,
          templateEnforced: true,
          notice: `O texto gerado fugiu do seu modelo (${fidelity.reason}); enviamos o seu modelo preenchido.`,
        })
      }

      await persistGenerated(subject, aiBody)
      return NextResponse.json({ subject, body: aiBody, usedProvider, didFallback })
    } catch (err: unknown) {
      // Nivel 3: os dois provedores falharam (sem credito, limite diario,
      // JSON invalido ou timeout). O template ja esta preenchido, entao o
      // e-mail sai assim mesmo — a campanha nunca trava por causa da IA.
      console.warn('[clients/generate] IA indisponivel, usando template preenchido:', describeAIFailure(err))

      const subject = resolveSubject()
      const finalBody = stripTrailingSignature(filledBody)
      await persistGenerated(subject, finalBody)

      return NextResponse.json({
        subject,
        body: finalBody,
        usedProvider: 'template',
        didFallback: true,
        aiUnavailable: true,
        notice: describeAIFailure(err),
      })
    }
  } catch (err) {
    console.error('[clients/generate] Error:', err)
    return NextResponse.json({ error: 'Erro interno na geração do e-mail.' }, { status: 500 })
  }
}
