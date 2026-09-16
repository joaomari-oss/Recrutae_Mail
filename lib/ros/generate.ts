import Groq from 'groq-sdk'
import OpenAI from 'openai'
import { generateWithFallback, otherProvider, type GenerationOutcome } from '@/lib/aiFallback'
import { validateRosVariation } from '@/lib/outreach/fidelity'
import type { GenerateRosEmailRequest } from '@/lib/rosTypes'
import { renderEmailTemplate } from '@/lib/templateRender'
import type { AIProvider } from '@/lib/types'

const OPENAI_MODEL = 'gpt-4o-mini'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
const ROS_TEMPERATURE = 0.35
const PROVIDER_TIMEOUT_MS = 15_000

type RosContactInput = Partial<GenerateRosEmailRequest['contact']> & Pick<GenerateRosEmailRequest['contact'], 'firstName' | 'fullName' | 'email' | 'company' | 'position'>

export type PersonalizeRosEmailRequest = Omit<GenerateRosEmailRequest, 'contact'> & {
  contact: RosContactInput
}

export type RosProviderInput = {
  systemPrompt: string
  userPrompt: string
  temperature: number
  signal?: AbortSignal
}

export type RosProviderCall = (provider: AIProvider, input: RosProviderInput) => Promise<string>

export type RosGenerationDeps = {
  callProvider?: RosProviderCall
  runWithFallback?: (
    provider: AIProvider,
    run: (candidate: AIProvider) => Promise<string>
  ) => Promise<GenerationOutcome<string>>
}

export type RosGenerationResult = {
  subject: string
  body: string
  usedProvider: AIProvider | 'template'
  didFallback: boolean
  templateEnforced?: boolean
  aiUnavailable?: boolean
  notice?: string
}

function buildSystemPrompt(): string {
  return `Você personaliza e-mails ROS com fidelidade estrita.
Retorne somente JSON válido com os campos "subject" e "body".
O template já está preenchido: não invente dados, URLs, números, parágrafos ou CTAs.
Altere no máximo 8% das palavras e preserve a mesma intenção e estrutura do CTA.
A marcação **negrito** e os links [rótulo](url) são literais: copie cada marcador,
cada rótulo e cada URL exatamente como aparecem, sem adicionar nem remover nenhum.`
}

function buildUserPrompt(subject: string, body: string, varySubject: boolean, variationSeed: number): string {
  return `ASSUNTO PREENCHIDO:
${subject}

TEMPLATE PREENCHIDO:
---
${body}
---
Faça uma variação lexical muito leve para a semente ${variationSeed}. Preserve URLs, números, parágrafos e CTA exatamente em significado e estrutura.
${varySubject ? 'Você pode variar o assunto somente dentro dos mesmos limites de fidelidade do corpo.' : 'Não altere o assunto preenchido; ele será mantido pelo sistema.'}`
}

async function defaultCallProvider(provider: AIProvider, input: RosProviderInput): Promise<string> {
  const messages = [
    { role: 'system' as const, content: input.systemPrompt },
    { role: 'user' as const, content: input.userPrompt },
  ]

  if (provider === 'groq') {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY nao configurada no servidor.')
    const groq = new Groq({ apiKey, maxRetries: 0 })
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      temperature: input.temperature,
      max_tokens: 900,
      response_format: { type: 'json_object' },
    }, { signal: input.signal })
    return completion.choices[0]?.message?.content ?? ''
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY nao configurada no servidor.')
  const openai = new OpenAI({ apiKey, maxRetries: 0 })
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    temperature: input.temperature,
    max_tokens: 900,
    response_format: { type: 'json_object' },
  }, { signal: input.signal })
  return completion.choices[0]?.message?.content ?? ''
}

function parseModelResponse(raw: string): { subject: string; body: string } {
  const parsed = JSON.parse(raw) as { subject?: unknown; body?: unknown }
  if (typeof parsed.subject !== 'string' || !parsed.subject.trim() || typeof parsed.body !== 'string' || !parsed.body.trim()) {
    throw new Error('Resposta da IA sem subject ou body utilizável.')
  }
  return { subject: parsed.subject.trim(), body: parsed.body.trim() }
}

function templateResult(subject: string, body: string, extra: Pick<RosGenerationResult, 'templateEnforced' | 'aiUnavailable' | 'notice'>): RosGenerationResult {
  return {
    subject,
    body,
    usedProvider: 'template',
    didFallback: true,
    ...extra,
  }
}

function timeoutError(): Error & { status: number } {
  const error = new Error(`Tentativa do provedor excedeu ${PROVIDER_TIMEOUT_MS / 1_000} segundos.`) as Error & { status: number }
  // generateWithFallback trata falhas transitórias como candidatas ao outro provedor.
  error.status = 429
  return error
}

async function callWithDeadline(
  provider: AIProvider,
  input: RosProviderInput,
  callProvider: RosProviderCall
): Promise<string> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(timeoutError())
      controller.abort()
    }, PROVIDER_TIMEOUT_MS)
  })

  try {
    return await Promise.race([
      callProvider(provider, { ...input, signal: controller.signal }),
      deadline,
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function runInjectedFallback(
  provider: AIProvider,
  run: (candidate: AIProvider) => Promise<string>
): Promise<GenerationOutcome<string>> {
  let lastError: unknown
  for (const candidate of [provider, otherProvider(provider)]) {
    try {
      return { result: await run(candidate), usedProvider: candidate, didFallback: candidate !== provider }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

/** Serviço puro na borda: preenchimento, geração injetável e guarda de fidelidade. */
export async function personalizeRosEmail(
  request: PersonalizeRosEmailRequest,
  deps: RosGenerationDeps = {}
): Promise<RosGenerationResult> {
  const filled = renderEmailTemplate(request.subjectTemplate, request.emailTemplate, request.contact)
  const provider = request.aiProvider ?? 'openai'
  const providerInput: RosProviderInput = {
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(filled.subject, filled.body, request.varySubject, request.variationSeed),
    temperature: ROS_TEMPERATURE,
  }
  const callProvider = deps.callProvider ?? defaultCallProvider

  try {
    const runWithFallback = deps.runWithFallback ?? (deps.callProvider ? runInjectedFallback : generateWithFallback)
    const outcome = await runWithFallback(provider, (candidate) => callWithDeadline(candidate, providerInput, callProvider))
    const generated = parseModelResponse(outcome.result)
    const fidelity = validateRosVariation(filled.body, generated.body)

    if (!fidelity.ok) {
      return templateResult(filled.subject, filled.body, {
        templateEnforced: true,
        notice: `Variação rejeitada: ${fidelity.reason}.`,
      })
    }

    return {
      subject: request.varySubject && validateRosVariation(filled.subject, generated.subject).ok
        ? generated.subject
        : filled.subject,
      body: generated.body,
      usedProvider: outcome.usedProvider,
      didFallback: outcome.didFallback,
    }
  } catch {
    return templateResult(filled.subject, filled.body, {
      aiUnavailable: true,
      notice: 'IA indisponível; usando o template preenchido.',
    })
  }
}
