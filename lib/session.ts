const SESSION_KEY = 'recrutae-session-id'

/**
 * Returns a stable session ID unique to this browser tab.
 * Uses sessionStorage so it survives page refreshes but dies when the tab closes.
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server'

  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}
