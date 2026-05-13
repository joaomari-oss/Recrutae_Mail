import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import Groq from 'groq-sdk'
import { GenerateClientEmailRequest } from '@/lib/clientTypes'

const VARIATION_OPENERS = [
  'Estou entrando em contato porque',
  'O motivo do meu contato é que',
  'Resolvi chegar até você porque',
  'Estou te escrevendo pois',
  'Gostaria de me apresentar porque',
]

const VARIATION_CLOSINGS = [
  'Quais horários ficam melhores para você nessa semana ou na próxima?',
  'Teria 30 minutos nessa semana ou na próxima para uma conversa rápida?',
  'Conseguimos agendar 30 minutos para nos apresentarmos?',
  'Quando você teria disponibilidade para uma conversa de 30 minutos?',
  'Podemos marcar uma agenda rápida de 30 minutos?',
]

function buildSystemPrompt(seed: number) {
  const opener = VARIATION_OPENERS[seed % VARIATION_OPENERS.length]
  const closing = VARIATION_CLOSINGS[seed % VARIATION_CLOSINGS.length]

  return `Você é um especialista em prospecção B2B da Recrutaê, empresa de recrutamento digital brasileira.
Escreva um e-mail de prospecção comercial em nome de um recrutador da Recrutaê para um potencial cliente empresarial.

REGRAS ABSOLUTAS:
1. Escreva SEMPRE em português brasileiro formal mas cordial
2. Comece SEMPRE com "Olá, {PRIMEIRO_NOME}!" — nunca outro saudação
3. Use o opener sugerido de forma natural: "${opener}"
4. Finalize SEMPRE com a pergunta: "${closing}"
5. Máximo 340 palavras no corpo do e-mail
6. NUNCA use palavras de spam: grátis, promoção, urgente, clique agora, oferta imperdível
7. NUNCA use mais de 1 emoji e preferencialmente nenhum
8. Personalize mencionando o nome da empresa e/ou cargo do destinatário naturalmente
9. Use no máximo 4 bullet points com →
10. Tom: profissional, consultivo, direto — nunca excessivamente comercial ou agressivo

ESTRUTURA (siga esta ordem):
- Saudação (Olá, {PRIMEIRO_NOME}!)
- 1-2 frases de contexto/apresentação usando o opener
- Apresentação da Recrutaê e relevância para o segmento do cliente
- 3-4 diferenciais com → (varie quais incluir e em que ordem)
- Proposta de reunião com a pergunta de fechamento

DIFERENCIAIS DA RECRUTAÊ (escolha 3-4 e varie a ordem):
→ Short-list com os melhores candidatos em até 5 dias úteis — 4x mais rápido que o mercado
→ Candidatos 2x mais qualificados: avaliação técnica, comportamental e de fit cultural antes de qualquer apresentação
→ Status Report em tempo real — acompanhe o andamento sem precisar cobrar atualização
→ Atendimento consultivo do início ao fim: não terceirizamos etapas
→ Especialistas no segmento: entendemos o modelo de negócio e falamos a língua do setor
→ Parceria com Find HR (executive search para C-level e diretorias) — cobertura completa de todos os níveis

SOBRE A RECRUTAÊ: empresa de recrutamento digital especializada em processos de analista a gerência.

Retorne APENAS JSON válido no formato: { "subject": "...", "body": "..." }
O body usa \\n para quebras de linha e → para bullet points.
O subject deve ser personalizado, direto e curto (máximo 60 caracteres). Não use emojis no subject.`
}

function buildUserPrompt(req: GenerateClientEmailRequest): string {
  const { contact, recruiterName, segment, keyPoints } = req
  const firstName = contact.firstName || contact.fullName.split(' ')[0] || 'pessoal'

  return `Destinatário:
- Nome: ${contact.fullName}
- Primeiro nome: ${firstName}
- Empresa: ${contact.company || 'a empresa'}
- Cargo: ${contact.position || 'não informado'}
- Segmento: ${segment}

Remetente (recrutador): ${recruiterName}

Pontos-chave que o recrutador quer destacar:
${keyPoints || 'Apresentar a Recrutaê e propor uma reunião de 30 minutos.'}

Escreva um e-mail personalizado para esta pessoa, mencionando o segmento "${segment}" de forma relevante ao negócio dela.`
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateClientEmailRequest = await request.json()
    const { contact, recruiterName, recruiterEmail, segment, keyPoints, aiProvider, variationSeed } = body

    if (!contact || !recruiterName || !segment) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
    }

    const seed = variationSeed ?? Math.floor(Math.random() * 1000)
    const systemPrompt = buildSystemPrompt(seed)
    const userPrompt = buildUserPrompt({ contact, recruiterName, recruiterEmail, segment, keyPoints, variationSeed: seed })

    const provider = aiProvider ?? 'openai'

    if (provider === 'groq') {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: 900,
        response_format: { type: 'json_object' },
      })
      const text = completion.choices[0]?.message?.content ?? ''
      const parsed = JSON.parse(text)
      return NextResponse.json({ subject: parsed.subject, body: parsed.body })
    }

    // OpenAI (default)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    try {
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
      const text = completion.choices[0]?.message?.content ?? ''
      const parsed = JSON.parse(text)
      return NextResponse.json({ subject: parsed.subject, body: parsed.body })
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      if (status === 429) {
        return NextResponse.json({ error: 'Quota OpenAI atingida.', quotaExceeded: true }, { status: 429 })
      }
      throw err
    }
  } catch (err) {
    console.error('[clients/generate] Error:', err)
    return NextResponse.json({ error: 'Erro interno na geração do e-mail.' }, { status: 500 })
  }
}
