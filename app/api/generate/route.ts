import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { GenerateEmailRequest } from '@/lib/types'
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limiter'

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
9. Assinatura

9. Assinatura OBRIGATORIA (sempre ao final):
   "Abraços,"
   [linha em branco]
   {recruiterName}
   {recruiterRole (se fornecido)}

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

Abracos,

{recruiterName}"

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

REGRAS DO ASSUNTO (varie entre eles):
- "{role} na {hiringCompany}"
- "Oportunidade: {role} | {hiringCompany}"
- "{role} | {hiringCompany}"

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
  recruiterRole?: string,
): string {
  const signatureLines = [
    recruiterName,
    recruiterRole || '',
  ].filter(Boolean).join('\n')

  return `Gere um email de abordagem de recrutamento para este candidato:

firstName: ${firstName}
role: ${role}
hiringCompany: ${hiringCompany}
jobDescription: ${jobDescription}
link: ${link || 'nenhum'}
recruiterName: ${recruiterName}
recruiterRole: ${recruiterRole || 'não informado'}

IMPORTANTE: A oportunidade é na "${hiringCompany}". Use "${hiringCompany}" como nome da empresa no email e no assunto. NAO use o nome da empresa do recrutador.

REGRA CRITICA: O body DEVE comecar EXATAMENTE com "Olá, ${firstName}!" (com acento no a, virgula, nome e exclamacao).

ASSINATURA OBRIGATORIA: O email DEVE terminar com:
Abraços,

${signatureLines}

Retorne apenas o JSON com os campos "subject" e "body". Escreva inteiramente em portugues brasileiro com acentos corretos.`
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
      return {
        subject: parsed.subject,
        body: firstName ? ensureGreeting(parsed.body, firstName) : parsed.body,
      }
    }
    return null
  } catch {
    return null
  }
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
    if (res.status === 429) {
      throw new Error('Rate limit exceeded (429)')
    }
    throw new Error(`OpenAI HTTP ${res.status} — ${errBody.slice(0, 200)}`)
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

  const { candidate, role, jobDescription, link, hiringCompany, recruiterName, recruiterRole, aiProvider } = body

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
    recruiterRole,
  )

  try {
    const result = provider === 'groq'
      ? await generateWithGroq(systemPrompt, userPrompt, candidate.firstName)
      : await generateWithOpenAI(systemPrompt, userPrompt, candidate.firstName)

    return NextResponse.json({ subject: result.subject, body: result.body })
  } catch (err) {
    console.error(`[/api/generate] ${provider} error:`, err)

    // Check if it's a quota/rate limit error
    if (isQuotaError(err)) {
      const message = err instanceof Error ? err.message : 'Limite de tokens excedido.'
      return NextResponse.json(
        { error: message, quotaExceeded: true },
        { status: 429 }
      )
    }

    const message = err instanceof Error ? err.message : 'Erro desconhecido ao chamar a IA.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
