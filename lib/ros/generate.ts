import Groq from 'groq-sdk'
import OpenAI from 'openai'
import { generateWithFallback, type GenerationOutcome } from '@/lib/aiFallback'
import { validateRosVariation } from '@/lib/outreach/fidelity'
import type { GenerateRosEmailRequest } from '@/lib/rosTypes'
import { renderEmailTemplate } from '@/lib/templateRender'
import type { AIProvider } from '@/lib/types'

const OPENAI_MODEL = 'gpt-4o-mini'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
const ROS_TEMPERATURE = 0.35

type RosContactInput = Partial<GenerateRosEmailRequest['contact']> & Pick<GenerateRosEmailRequest['contact'], 'firstName' | 'fullName' | 'email' | 'company' | 'position'>

export type PersonalizeRosEmailRequest = Omit<GenerateRosEmailRequest, 'contact'> & {
  contact: RosContactInput
}

export type RosProviderInput = {
  systemPrompt: string
  userPrompt: string
  temperature: number
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
Altere no máximo 8% das palavras e preserve a mesma intenção e estrutura do CTA.`
}

function buildUserPrompt(body: string, variationSeed: number): string {
  return `TEMPLATE PREENCHIDO:
---
${body}
---
Faça uma variação lexical muito leve para a semente ${variationSeed}. Preserve URLs, números, parágrafos e CTA exatamente em significado e estrutura.`
}

async function defaultCallProvider(provider: AIProvider, input: RosProviderInput): Promise<string> {
  const messages = [
    { role: 'system' as const, content: input.systemPrompt },
    { role: 'user' as const, content: input.userPrompt },
  ]

  if (provider === 'groq') {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY nao configurada no servidor.')
    const groq = new Groq({ apiKey })
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      temperature: input.temperature,
      max_tokens: 900,
      response_format: { type: 'json_object' },
    })
    return completion.choices[0]?.message?.content ?? ''
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY nao configurada no servidor.')
  const openai = new OpenAI({ apiKey })
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    temperature: input.temperature,
    max_tokens: 900,
    response_format: { type: 'json_object' },
  })
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

/** Serviço puro na borda: preenchimento, geração injetável e guarda de fidelidade. */
export async function personalizeRosEmail(
  request: PersonalizeRosEmailRequest,
  deps: RosGenerationDeps = {}
): Promise<RosGenerationResult> {
  const filled = renderEmailTemplate(request.subjectTemplate, request.emailTemplate, request.contact)
  const provider = request.aiProvider ?? 'openai'
  const providerInput: RosProviderInput = {
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(filled.body, request.variationSeed),
    temperature: ROS_TEMPERATURE,
  }
  const callProvider = deps.callProvider ?? defaultCallProvider

  try {
    const outcome = deps.callProvider && !deps.runWithFallback
      ? { result: await callProvider(provider, providerInput), usedProvider: provider, didFallback: false }
      : await (deps.runWithFallback ?? generateWithFallback)(provider, (candidate) => callProvider(candidate, providerInput))
    const generated = parseModelResponse(outcome.result)
    const fidelity = validateRosVariation(filled.body, generated.body)

    if (!fidelity.ok) {
      return templateResult(filled.subject, filled.body, {
        templateEnforced: true,
        notice: `Variação rejeitada: ${fidelity.reason}.`,
      })
    }

    return {
      subject: request.varySubject ? generated.subject : filled.subject,
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
