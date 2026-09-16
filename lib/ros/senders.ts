export const ROS_SENDER_DOMAIN = 'recrutae.com.br'
export const DEFAULT_ROS_SENDER = `contato@${ROS_SENDER_DOMAIN}`

const RECRUTAE_EMAIL = new RegExp(`^[^\\s@]+@${ROS_SENDER_DOMAIN.replace(/\./g, '\\.')}$`, 'i')

/** Endereço de envio válido para a divulgação: precisa ser do domínio verificado. */
export function isRosSenderEmail(value: string): boolean {
  return RECRUTAE_EMAIL.test(value.trim())
}

/**
 * Opções de remetente oferecidas na composição.
 *
 * Vêm do ambiente, nunca de nomes inventados: `ROS_SENDER_OPTIONS` (lista
 * separada por vírgula), mais o remetente configurado da divulgação e o do
 * Resend quando forem do domínio. O padrão entra sempre, para a tela nunca
 * abrir sem opção. O operador ainda pode digitar outro endereço do domínio.
 */
export function listRosSenderOptions(env: Record<string, string | undefined>): string[] {
  const candidates = [
    ...(env.ROS_SENDER_OPTIONS ?? '').split(','),
    env.ROS_FROM_EMAIL ?? '',
    env.RESEND_FROM_EMAIL ?? '',
    DEFAULT_ROS_SENDER,
  ]

  const seen = new Set<string>()
  const options: string[] = []
  for (const candidate of candidates) {
    const email = candidate.trim().toLowerCase()
    if (!email || !isRosSenderEmail(email) || seen.has(email)) continue
    seen.add(email)
    options.push(email)
  }
  return options
}
