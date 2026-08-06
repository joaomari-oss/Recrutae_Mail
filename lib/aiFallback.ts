import type { AIProvider } from './types'

/**
 * Classificação de erros de IA + fallback automático entre provedores.
 *
 * Motivo: quando a conta da OpenAI fica sem créditos ela responde 429
 * `insufficient_quota` em TODA requisição. Antes, isso derrubava a geração inteira
 * e exigia o recrutador trocar de provedor na mão, candidato por candidato.
 * Agora o servidor cai para o Groq sozinho e lembra do estado por alguns minutos
 * para não desperdiçar uma chamada perdida por candidato.
 */

export type AIFailureKind =
  | 'out_of_credits' // sem saldo/quota — repetir no mesmo provedor não adianta
  | 'rate_limited' // limite temporário — vale esperar ou trocar
  | 'missing_key' // provedor não configurado
  | 'other'

/** Quanto tempo lembramos que um provedor está sem crédito antes de tentar de novo. */
const OUT_OF_CREDITS_TTL_MS = 10 * 60_000

const exhaustedUntil = new Map<AIProvider, number>()

export function markProviderExhausted(provider: AIProvider): void {
  exhaustedUntil.set(provider, Date.now() + OUT_OF_CREDITS_TTL_MS)
}

export function isProviderExhausted(provider: AIProvider): boolean {
  const until = exhaustedUntil.get(provider)
  if (!until) return false
  if (Date.now() > until) {
    exhaustedUntil.delete(provider)
    return false
  }
  return true
}

export function clearProviderExhausted(provider: AIProvider): void {
  exhaustedUntil.delete(provider)
}

/**
 * Distingue "sem saldo" de "rate limit temporário". A diferença importa:
 * sem saldo, tentar de novo no mesmo provedor é garantia de falha.
 */
export function classifyAIError(err: unknown): AIFailureKind {
  const status = (err as { status?: number })?.status
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const msg = raw.toLowerCase()

  if (msg.includes('nao configurada') || msg.includes('não configurada') || msg.includes('api key')) {
    return 'missing_key'
  }
  if (
    msg.includes('insufficient_quota') ||
    msg.includes('credit_balance_exhausted') ||
    msg.includes('no credits remaining') ||
    msg.includes('exceeded your current quota') ||
    msg.includes('billing') ||
    msg.includes('sem creditos') ||
    msg.includes('sem créditos')
  ) {
    return 'out_of_credits'
  }
  if (
    status === 429 ||
    msg.includes('rate_limit') ||
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('too many requests') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota')
  ) {
    return 'rate_limited'
  }
  return 'other'
}

export function otherProvider(provider: AIProvider): AIProvider {
  return provider === 'openai' ? 'groq' : 'openai'
}

export function isProviderConfigured(provider: AIProvider): boolean {
  return provider === 'groq' ? !!process.env.GROQ_API_KEY : !!process.env.OPENAI_API_KEY
}

export type GenerationOutcome<T> = {
  result: T
  /** Provedor que realmente gerou o conteúdo (pode diferir do pedido). */
  usedProvider: AIProvider
  /** True quando o provedor pedido falhou e o fallback assumiu. */
  didFallback: boolean
}

/**
 * Executa a geração no provedor pedido e, se ele estiver sem saldo ou
 * limitado, tenta automaticamente o outro provedor configurado.
 *
 * Lança o erro do fallback (ou do provedor original, se não houver fallback)
 * apenas quando todas as opções falharem.
 */
export async function generateWithFallback<T>(
  requested: AIProvider,
  run: (provider: AIProvider) => Promise<T>
): Promise<GenerationOutcome<T>> {
  const alternative = otherProvider(requested)

  // Se sabemos que o provedor pedido está sem saldo, comece direto pelo outro.
  const order: AIProvider[] =
    isProviderExhausted(requested) && isProviderConfigured(alternative)
      ? [alternative, requested]
      : [requested, alternative]

  let lastError: unknown = null

  for (const provider of order) {
    if (!isProviderConfigured(provider)) {
      lastError = lastError ?? new Error(
        `${provider === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY'} nao configurada no servidor.`
      )
      continue
    }

    try {
      const result = await run(provider)
      clearProviderExhausted(provider)
      return { result, usedProvider: provider, didFallback: provider !== requested }
    } catch (err) {
      lastError = err
      const kind = classifyAIError(err)

      if (kind === 'out_of_credits') markProviderExhausted(provider)

      // Erros que não são de quota (prompt inválido, rede, parsing) não melhoram
      // ao trocar de provedor — propaga direto.
      if (kind === 'other') throw err

      console.warn(`[ai-fallback] ${provider} falhou (${kind}) — tentando alternativa`)
    }
  }

  throw lastError ?? new Error('Nenhum provedor de IA disponível.')
}
