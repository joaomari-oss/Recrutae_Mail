import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { GenerateEmailRequest } from '@/lib/types'
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limiter'
import { generateWithFallback, describeAIFailure } from '@/lib/aiFallback'

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions'
const OPENAI_MODEL = 'gpt-4o-mini'

function buildSystemPrompt(): string {
  return `Voce e uma IA especializada em gerar emails de abordagem para recrutamento de talentos.

REGRAS OBRIGATORIAS:
1. O email DEVE seguir a estrutura fixa abaixo.
2. Escreva INTEIRAMENTE em portugues brasileiro (pt-BR) com acentos e pontuacao corretos.
3. NAO use emojis em hipotese alguma.
4. A estrutura e o tom devem ser consistentes, mas com pequenas variacoes naturais de fraseado entre emails diferentes para evitar filtros anti-spam.
5. NUNCA mencione a empresa atual do candidato.
6. NUNCA soe como spam, marketing ou linguagem corporativa exagerada.
7. NUNCA use frases como "Espero que este email te encontre bem", "oportunidade imperdivel", "incrivel oportunidade".
8. A empresa da vaga e SEMPRE a "hiringCompany" — NUNCA use "recruiterCompany" como empresa da vaga.
9. O recrutador trabalha para uma agencia de recrutamento, mas a OPORTUNIDADE e na hiringCompany.
10. NUNCA diga que a oportunidade e na empresa do recrutador ou na "Recrutae".

ESTRUTURA DO EMAIL (siga esta ordem exata):
1. Saudacao OBRIGATORIA: "Olá, {firstName}!" (EXATAMENTE assim, com acento, virgula e exclamacao)
2. Introducao curta e direta (varie levemente entre emails — use alternativas como "Queria te apresentar uma oportunidade...", "Vi seu perfil e achei que essa posicao pode fazer sentido...", "Estou te escrevendo pois identifiquei uma oportunidade...")
3. Apresentacao da oportunidade (cargo + hiringCompany)
4. Descricao breve da posicao (baseada no jobDescription)
5. Um destaque (crescimento, impacto, modelo remoto, etc.)
6. Link para mais informacoes (se fornecido)
7. Paragrafo de indicacoes (se houver link)
8. CTA suave
9. Fechamento OBRIGATORIO (sempre ao final, SEM nome do recrutador — a assinatura e adicionada automaticamente):
   "Abraços,"

REGRA CRITICA DE SAUDACAO:
- A PRIMEIRA LINHA do email DEVE ser SEMPRE: "Olá, {firstName}!"
- Use EXATAMENTE "Olá" (com acento no a) seguido de virgula, espaco, o primeiro nome do candidato e ponto de exclamacao.
- NUNCA use "Ola" (sem acento), "Oi", "Hey", "Caro", "Prezado" ou qualquer outra saudacao.
- NUNCA omita a virgula apos "Olá".

TEMPLATE BASE (siga rigorosamente, mas varie levemente o fraseado):
"Olá, {firstName}!

{frase_de_introducao_variada} {role} na {hiringCompany}. {descricao_natural_e_objetiva_da_empresa}.

A posicao envolve {resumo_claro_baseado_no_jobDescription}, sendo uma boa oportunidade para quem busca {leve_personalizacao_profissional}.

{linha_opcional_sobre_modelo_de_trabalho_ou_destaque}

Para mais informacoes:
{link}

{paragrafo_indicacoes_variado}

Se fizer sentido para voce, fico a disposicao para conversarmos melhor.

Abracos,"

REGRA CRITICA DE ASSINATURA: O body DEVE terminar com "Abraços," e NADA MAIS.
NAO inclua nome do recrutador, cargo, empresa ou qualquer texto apos "Abraços," — a assinatura visual e gerada automaticamente pelo sistema.

VARIACAO CONTROLADA (MUITO IMPORTANTE):
- Mantenha a MESMA estrutura em todos os emails
- Varie o fraseado LEVEMENTE em cada secao (15-25% de variacao)
- Use sinonimos e mudancas naturais de fraseado:
  * "Queria te apresentar" vs "Vi seu perfil" vs "Estou te escrevendo pois"
  * "pode fazer sentido" vs "pode ser uma boa encaixe" vs "pode ser de seu interesse"
  * "sendo uma boa oportunidade" vs "sendo uma excelente oportunidade" vs "sendo uma opcao interessante"
  * Paragrafo de indicacoes com variacoes:
    - "Se você conhece profissionais interessados nessa área, sinta-se livre para compartilhar. Indicações são sempre bem-vindas!"
    - "Caso conheça alguém qualificado para essa posição, fique à vontade para indicar. Toda indicação é valiosa!"
    - "Se souber de profissionais que se encaixem, compartilhe este e-mail. Indicações são fundamentais no nosso processo!"
- Alterne a estrutura das frases de forma sutil (ordem de clausulas, conectores diferentes)
- NAO crie emails totalmente diferentes
- NAO adicione secoes extras
- GARANTIR: cada email gerado para o mesmo candidato deve ser visivelmente diferente

REGRA CRITICA SOBRE NOME DA EMPRESA:
- {hiringCompany} e a empresa que TEM a vaga aberta.
- NUNCA substitua {hiringCompany} pelo nome da empresa do recrutador.

REGRAS DE GERACAO:
- Comprimento: 120 a 160 palavras
- Frases concisas e naturais
- Mantenha espacamento entre paragrafos igual ao template
- Inclua um BREVE resumo do jobDescription (2-3 linhas no maximo)
- Personalizacao sutil (1 frase apenas)
- NAO personalize com dados do candidato alem do firstName
- NAO invente fatos sobre o candidato
- NAO exagere beneficios
- Tom humano, direto, como um recrutador real
- Se nao houver link, omita as secoes "Para mais informacoes:" E o paragrafo de indicacoes inteiramente
- NAO use listas com marcadores ou bullet points

REGRAS DE PORTUGUES (CRITICAS):
- Use SEMPRE acentos corretos: á, é, í, ó, ú, ã, õ, ç
- Exemplos corretos: "oportunidade", "apresentar", "interessado", "próximas", "módulos"
- Exemplos ERRADOS que NAO devem aparecer: "oportunidade", "nao" (deve ser "não"), "ja" (deve ser "já")
- Use "você" (com acento) e "à" (quando apropriado)
- Mantenha coerencia: se usa "módulos" num email, varie para "area" ou "funcao" em outro
- Nenhum "u" sem til quando necessario: "oportunidade", "frequente" (se usado)

ANTI-SPAM (MUITO IMPORTANTE):
- Evite frases identicas entre emails — SEMPRE varie fraseado mesmo que ligeiramente
- Evite palavras promocionais e suspeitas: "imperdivel", "incrivel", "fantastica", "unica chance", "urgente", "limitado"
- Evite multiplos pontos de exclamacao seguidos (!!!, ???)
- Evite CAPSlock excessivo (use APENAS em abreviacoes como "RH")
- Tom neutro e profissional — soe como um recrutador real, nao como marketing
- Apenas UM link permitido (se fornecido)
- Sem formatacao HTML pesada ou markdown
- Nao use "Re:", "Fwd:" ou similares que sugerem respostas anteriores
- Nao use "sender" ou "noreply" — sempre assinado com nome do recrutador
- Construa credibilidade: cite a empresa com naturalidade, nao de forma promocional
- A saudacao "Olá, {firstName}!" adiciona legitimidade (emails spammers usam "Prezado(a)" ou "Caro(a)")

REGRA DO ASSUNTO (OBRIGATORIA — nao desvie):
- O assunto SEMPRE deve seguir este formato EXATO:
  "Apresentação Recrutaê — {role} | Indicação {recruiterCompany}"
- Exemplo: "Apresentação Recrutaê — Desenvolvedor Backend Sênior | Indicação Find HR"
- Use o valor exato de {role} e {recruiterCompany} fornecidos no prompt do usuario.
- NAO invente ou altere este formato.

FORMATO DE SAIDA - Retorne APENAS um JSON valido, sem markdown, sem texto extra:
{
  "subject": "string",
  "body": "string com quebras de linha como \\n"
}`
}

function buildUserPrompt(
  firstName: string,
  role: string,
  hiringCompany: string,
  jobDescription: string,
  link: string | undefined,
  recruiterName: string,
  recruiterCompany: string,
  recruiterRole?: string,
): string {
  return `Gere um email de abordagem de recrutamento para este candidato:

firstName: ${firstName}
role: ${role}
hiringCompany: ${hiringCompany}
recruiterCompany: ${recruiterCompany}
jobDescription: ${jobDescription}
link: ${link || 'nenhum'}
recruiterName: ${recruiterName}
recruiterRole: ${recruiterRole || 'não informado'}

IMPORTANTE: A oportunidade é na "${hiringCompany}". Use "${hiringCompany}" como nome da empresa no email. NAO use o nome da empresa do recrutador.

REGRA CRITICA DO BODY:
- DEVE comecar EXATAMENTE com "Olá, ${firstName}!"
- DEVE terminar EXATAMENTE com "Abraços," e NADA MAIS depois disso.
- NAO inclua nome, cargo, empresa ou qualquer texto apos "Abraços,".

REGRA CRITICA DO SUBJECT:
- DEVE ser EXATAMENTE: "Apresentação Recrutaê — ${role} | Indicação ${recruiterCompany}"

Retorne apenas o JSON com os campos "subject" e "body". Escreva inteiramente em portugues brasileiro com acentos corretos.`
}

function stripTrailingSignature(body: string): string {
  // Remove any text after "Abraços," — the HTML signature is added automatically
  return body
    .replace(/(\n{0,3}(Abraços|Abra[cç]os)[,.]?\s*\n[\s\S]*)$/, '\n\nAbraços,')
    .replace(/(Abraços[,.]?\s*\n[\s\S]+)$/, 'Abraços,')
    .trimEnd()
}

function ensureGreeting(body: string, firstName: string): string {
  const correctGreeting = `Olá, ${firstName}!`
  // Remove leading whitespace/newlines
  let cleaned = body.replace(/^\s+/, '')
  // Check if it already starts correctly
  if (cleaned.startsWith(correctGreeting)) return cleaned
  // Fix common AI mistakes: "Ola," (no accent), "Ola " (no comma), "Olá " (no comma)
  const greetingPattern = /^(Ol[aá][,]?\s*[^!\n]*!?)/
  const match = cleaned.match(greetingPattern)
  if (match) {
    cleaned = cleaned.replace(greetingPattern, correctGreeting)
  } else {
    // No greeting found at all — prepend it
    cleaned = correctGreeting + '\n\n' + cleaned
  }
  return cleaned
}

function parseAIResponse(content: string, firstName?: string): { subject: string; body: string } | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    if (parsed.subject && parsed.body) {
      const cleanBody = stripTrailingSignature(
        firstName ? ensureGreeting(parsed.body, firstName) : parsed.body
      )
      return { subject: parsed.subject, body: cleanBody }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Monta o e-mail sem IA, seguindo o TEMPLATE BASE documentado no prompt do sistema.
 * Usado quando nenhum provedor responde — a campanha nao pode travar por isso.
 */
function renderBaseTemplate(params: {
  firstName: string
  role: string
  hiringCompany: string
  jobDescription: string
  link?: string
  recruiterCompany: string
}): string {
  const { firstName, role, hiringCompany, jobDescription, link, recruiterCompany } = params

  // Resumo curto da vaga: primeiras frases da descricao, sem estourar o tamanho.
  const summary = jobDescription
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(' ')
    .slice(0, 320)

  const parts = [
    `Olá, ${firstName}!`,
    '',
    `Estou te escrevendo pois identifiquei uma oportunidade que pode ser do seu interesse: ${role} na ${hiringCompany}.`,
    '',
    `A posição envolve ${summary || 'desafios alinhados ao seu perfil'}`,
  ]

  if (link) {
    parts.push(
      '',
      'Para mais informações:',
      link,
      '',
      'Se você conhece profissionais interessados nessa área, sinta-se livre para compartilhar. Indicações são sempre bem-vindas!'
    )
  }

  parts.push(
    '',
    'Se fizer sentido para você, fico à disposição para conversarmos melhor.',
    '',
    'Abraços,'
  )

  void recruiterCompany // a assinatura visual e montada pelo template de e-mail
  return parts.join('\n')
}

function isQuotaError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return (
      msg.includes('rate_limit') ||
      msg.includes('rate limit') ||
      msg.includes('quota') ||
      msg.includes('tokens') ||
      msg.includes('429') ||
      msg.includes('resource_exhausted') ||
      msg.includes('too many requests')
    )
  }
  return false
}

async function generateWithGroq(
  systemPrompt: string,
  userPrompt: string,
  firstName: string,
): Promise<{ subject: string; body: string }> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY nao configurada no servidor.')

  const groq = new Groq({ apiKey })
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.75,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
  })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('IA nao retornou conteudo.')

  const parsed = parseAIResponse(content, firstName)
  if (!parsed) throw new Error('Resposta da IA em formato invalido.')
  return parsed
}

async function generateWithOpenAI(
  systemPrompt: string,
  userPrompt: string,
  firstName: string,
): Promise<{ subject: string; body: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY nao configurada no servidor.')

  const res = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.75,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    // O corpo precisa ir junto: e' ele que diferencia "sem creditos"
    // (insufficient_quota) de um rate limit temporario.
    const err = new Error(`OpenAI HTTP ${res.status} — ${errBody.slice(0, 300)}`)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI nao retornou conteudo.')

  const parsed = parseAIResponse(content, firstName)
  if (!parsed) throw new Error('Resposta da OpenAI em formato invalido.')
  return parsed
}

export async function POST(req: NextRequest) {
  if (!validateApiKey(req)) return unauthorizedResponse()

  const { allowed } = checkRateLimit('generate-global', 200, 60_000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit excedido. Aguarde um momento antes de gerar mais emails.' },
      { status: 429 }
    )
  }

  let body: GenerateEmailRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisicao invalido.' }, { status: 400 })
  }

  const { candidate, role, jobDescription, link, hiringCompany, recruiterName, recruiterCompany, recruiterRole, aiProvider, subjectTemplate } = body as GenerateEmailRequest & { subjectTemplate?: string }

  if (!candidate || !role || !jobDescription || !recruiterName || !hiringCompany) {
    return NextResponse.json({ error: 'Dados obrigatorios ausentes.' }, { status: 400 })
  }

  const provider = aiProvider || 'openai'
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(
    candidate.firstName,
    role,
    hiringCompany,
    jobDescription,
    link,
    recruiterName,
    recruiterCompany || '',
    recruiterRole,
  )

  // Subject: use recruiter's template if provided, otherwise compute deterministically
  const forcedSubject = subjectTemplate?.trim() ||
    (recruiterCompany
      ? `Apresentação Recrutaê — ${role} | Indicação ${recruiterCompany}`
      : `Apresentação Recrutaê — ${role}`)

  try {
    // Fallback automatico: se a OpenAI estiver sem creditos ou limitada,
    // o Groq assume sozinho — o recrutador nao precisa trocar na mao.
    const { result, usedProvider, didFallback } = await generateWithFallback(provider, (p) =>
      p === 'groq'
        ? generateWithGroq(systemPrompt, userPrompt, candidate.firstName)
        : generateWithOpenAI(systemPrompt, userPrompt, candidate.firstName)
    )

    if (didFallback) {
      console.info(`[/api/generate] fallback ${provider} -> ${usedProvider}`)
    }

    return NextResponse.json({
      subject: forcedSubject,
      body: result.body,
      usedProvider,
      didFallback,
    })
  } catch (err) {
    console.error(`[/api/generate] ${provider} error:`, err)

    // Nivel 3: nenhum provedor respondeu. Vale para QUALQUER falha — sem credito,
    // limite diario, chave invalida, JSON quebrado ou timeout. Monta pelo template
    // base em vez de devolver erro, para a campanha nunca travar por causa da IA.
    console.warn('[/api/generate] IA indisponivel, usando template base:', describeAIFailure(err))
    return NextResponse.json({
      subject: forcedSubject,
      body: renderBaseTemplate({
        firstName: candidate.firstName,
        role,
        hiringCompany,
        jobDescription,
        link,
        recruiterCompany: recruiterCompany || '',
      }),
      usedProvider: 'template',
      didFallback: true,
      aiUnavailable: true,
      notice: describeAIFailure(err),
    })
  }
}
