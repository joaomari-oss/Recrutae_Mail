/**
 * Lê a resposta de uma rota da API sem estourar quando ela não vem em JSON.
 *
 * Em produção a borda da Vercel pode devolver uma página HTML de verificação de
 * segurança no lugar da rota. O `response.json()` cru quebrava com
 * "Unexpected token '<'", que não diz nada a quem está usando o sistema.
 */
export type RosApiResult<T> =
  | { ok: true; status: number; data: T }
  /** `data` vem preenchido quando o erro trouxe um corpo JSON legítimo. */
  | { ok: false; status: number; error: string; data?: T }

const SECURITY_CHECKPOINT = 'A verificação de segurança da Vercel respondeu no lugar do servidor. '
  + 'Recarregue a página e tente de novo.'

const NOT_JSON = 'O servidor respondeu em um formato inesperado. '
  + 'Recarregue a página e tente de novo.'

export async function readRosApiResponse<T>(response: Response): Promise<RosApiResult<T>> {
  const body = await response.text()

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    const looksLikeHtml = /^\s*<(?:!doctype|html)/i.test(body)
    const isCheckpoint = looksLikeHtml && /security checkpoint|vercel/i.test(body.slice(0, 2000))
    return { ok: false, status: response.status, error: isCheckpoint ? SECURITY_CHECKPOINT : NOT_JSON }
  }

  if (!response.ok) {
    const message = parsed && typeof parsed === 'object' && 'error' in parsed
      && typeof (parsed as { error: unknown }).error === 'string'
      ? (parsed as { error: string }).error
      : `O servidor respondeu com erro ${response.status}.`
    return { ok: false, status: response.status, error: message, data: parsed as T }
  }

  return { ok: true, status: response.status, data: parsed as T }
}

/**
 * Igual ao anterior, mas o corpo JSON continua valendo mesmo com status de erro.
 *
 * O preflight é o caso: ele responde 503 quando bloqueia o envio, e esse corpo
 * é justamente a lista de checagens que a tela precisa mostrar. Lança apenas
 * quando a resposta não é JSON — aí não há resultado nenhum.
 */
export async function readRosApiBody<T>(response: Response): Promise<T> {
  const result = await readRosApiResponse<T>(response)
  if (result.ok) return result.data
  if (result.data !== undefined) return result.data
  throw new Error(result.error)
}

/** Mensagem legível para uma falha de rede antes mesmo de haver resposta. */
export function networkErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof TypeError) return 'Não foi possível falar com o servidor. Verifique a conexão.'
  return cause instanceof Error && cause.message ? cause.message : fallback
}
