/**
 * Client-side fetch wrapper that automatically includes the internal API key
 * and sets Content-Type: application/json.
 */
export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { headers = {}, ...rest } = options
  return fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY ?? '',
      ...(headers as Record<string, string>),
    },
    ...rest,
  })
}
