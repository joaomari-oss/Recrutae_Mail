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

  // Chave ausente OU invalida: nos dois casos o provedor esta inutilizavel,
  // mas o outro pode funcionar — entao vale tentar a alternativa.
  if (
    msg.includes('nao configurada') ||
    msg.includes('não configurada') ||
    msg.includes('api key') ||
    msg.includes('invalid_api_key') ||
    msg.includes('unauthorized')
  ) {
    return 'missing_key'
  }
  // Limite temporario vem PRIMEIRO: a mensagem de rate limit do Groq inclui um
  // link de billing/upgrade, e se checassemos "billing" antes, um limite diario
  // que zera em minutos seria tratado como conta sem saldo.
  if (
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('try again in') ||
    msg.includes('tokens per day') ||
    msg.includes('requests per') ||
    msg.includes('too many requests') ||
    msg.includes('resource_exhausted')
  ) {
    return 'rate_limited'
  }
  // Sem saldo: so os codigos explicitos — repetir no mesmo provedor nao adianta.
  if (
    msg.includes('insufficient_quota') ||
    msg.includes('credit_balance_exhausted') ||
    msg.includes('no credits remaining') ||
    msg.includes('exceeded your current quota') ||
    msg.includes('billing_hard_limit_reached') ||
    msg.includes('sem creditos') ||
    msg.includes('sem créditos')
  ) {
    return 'out_of_credits'
  }
  if (status === 429 || msg.includes('429') || msg.includes('quota')) {
    return 'rate_limited'
  }
  return 'other'
}

/**
 * Extrai "tente novamente em X" da mensagem do provedor, quando existir.
 * O Groq informa isso no rate limit diario (ex.: "Please try again in 17m40.992s").
 */
export function extractRetryHint(err: unknown): string | null {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const match = raw.match(/try again in ([\dhms.]+)/i)
  if (!match) return null
  const spec = match[1]
  const h = spec.match(/(\d+)h/)
  const m = spec.match(/(\d+)m/)
  const parts: string[] = []
  if (h) parts.push(`${h[1]}h`)
  if (m) parts.push(`${m[1]}min`)
  if (!parts.length) return 'menos de 1 minuto'
  return parts.join(' ')
}

/** Mensagem em pt-BR explicando por que a geracao falhou e o que fazer. */
export function describeAIFailure(err: unknown): string {
  const kind = classifyAIError(err)
  const retry = extractRetryHint(err)

  if (kind === 'rate_limited') {
    return retry
      ? `Limite de uso da IA atingido nos dois provedores. O limite libera em cerca de ${retry} — tente de novo depois disso, ou adicione créditos na OpenAI para continuar agora.`
      : 'Limite de uso da IA atingido nos dois provedores. Aguarde alguns minutos e tente de novo, ou adicione créditos na OpenAI.'
  }
  if (kind === 'out_of_credits') {
    return 'Os provedores de IA estão sem saldo. Adicione créditos na OpenAI (ou configure uma chave Groq com limite maior) para voltar a gerar e-mails.'
  }
  if (kind === 'missing_key') {
    return 'Nenhum provedor de IA disponível — chave ausente ou inválida. Verifique OPENAI_API_KEY e GROQ_API_KEY.'
  }
  return 'Não foi possível gerar o e-mail. Tente novamente em instantes.'
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

      const detail = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300)
      console.warn(`[ai-fallback] ${provider} falhou (${kind}) — tentando alternativa | ${detail}`)
    }
  }

  throw lastError ?? new Error('Nenhum provedor de IA disponível.')
}
