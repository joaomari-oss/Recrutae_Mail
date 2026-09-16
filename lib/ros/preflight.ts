export type RosPreflightCheck = {
  key: 'apiKey' | 'domain' | 'dmarc' | 'appUrl' | 'unsubscribe' | 'webhook' | 'database'
  status: 'ok' | 'warning' | 'error'
  message: string
}

export type RosPreflightResult = {
  canSend: boolean
  checks: RosPreflightCheck[]
  fromEmail: string
  /** Endereços do domínio oferecidos na composição. */
  senderOptions: string[]
}

export type RosPreflightDependencies = {
  env: Record<string, string | undefined>
  listDomains: () => Promise<Array<{ name: string; status: string }>>
  resolveTxt: (hostname: string) => Promise<string[][]>
}

import { DEFAULT_ROS_SENDER, listRosSenderOptions, ROS_SENDER_DOMAIN } from './senders'

const DEFAULT_FROM_EMAIL = DEFAULT_ROS_SENDER
const RECRUTAE_DOMAIN = ROS_SENDER_DOMAIN

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function senderDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase()
  const match = /^[^\s@]+@([^\s@]+)$/.exec(normalized)
  return match?.[1] ?? null
}

export async function runRosPreflight(deps: RosPreflightDependencies): Promise<RosPreflightResult> {
  const fromEmail = deps.env.ROS_FROM_EMAIL ?? DEFAULT_FROM_EMAIL
  const domain = senderDomain(fromEmail)
  const checks: RosPreflightCheck[] = []

  checks.push(deps.env.RESEND_API_KEY
    ? { key: 'apiKey', status: 'ok', message: 'API do Resend configurada.' }
    : { key: 'apiKey', status: 'error', message: 'RESEND_API_KEY não configurada.' })

  if (domain !== RECRUTAE_DOMAIN) {
    checks.push({ key: 'domain', status: 'error', message: 'O remetente deve usar @recrutae.com.br.' })
    checks.push({ key: 'dmarc', status: 'warning', message: 'DMARC não consultado para remetente inválido.' })
  } else if (!deps.env.RESEND_API_KEY) {
    checks.push({ key: 'domain', status: 'error', message: 'O domínio não pode ser verificado sem RESEND_API_KEY.' })
    checks.push({ key: 'dmarc', status: 'warning', message: 'DMARC não consultado sem configuração do Resend.' })
  } else {
    try {
      const domains = await deps.listDomains()
      const verified = domains.some(item => item.name.trim().toLowerCase() === domain && item.status === 'verified')
      checks.push(verified
        ? { key: 'domain', status: 'ok', message: 'Domínio Recrutaê verificado no Resend.' }
        : { key: 'domain', status: 'error', message: 'Domínio recrutae.com.br não está verificado no Resend.' })
    } catch {
      checks.push({ key: 'domain', status: 'error', message: 'Não foi possível verificar o domínio no Resend.' })
    }

    try {
      const records = await deps.resolveTxt(`_dmarc.${domain}`)
      const hasDmarc = records.some(record => record.join('').trim().toUpperCase().startsWith('V=DMARC1;'))
      checks.push(hasDmarc
        ? { key: 'dmarc', status: 'ok', message: 'Registro DMARC encontrado.' }
        : { key: 'dmarc', status: 'warning', message: 'Registro DMARC não encontrado.' })
    } catch {
      checks.push({ key: 'dmarc', status: 'warning', message: 'Não foi possível confirmar o registro DMARC.' })
    }
  }

  checks.push(isHttpsUrl(deps.env.APP_BASE_URL)
    ? { key: 'appUrl', status: 'ok', message: 'URL pública HTTPS configurada.' }
    : { key: 'appUrl', status: 'error', message: 'APP_BASE_URL deve ser uma URL HTTPS pública.' })

  const unsubscribeSecret = deps.env.UNSUBSCRIBE_SIGNING_SECRET ?? ''
  checks.push(new TextEncoder().encode(unsubscribeSecret).byteLength >= 32
    ? { key: 'unsubscribe', status: 'ok', message: 'Assinatura de descadastro configurada.' }
    : { key: 'unsubscribe', status: 'error', message: 'UNSUBSCRIBE_SIGNING_SECRET deve ter pelo menos 32 bytes.' })

  checks.push(deps.env.RESEND_WEBHOOK_SECRET
    ? { key: 'webhook', status: 'ok', message: 'Webhook do Resend configurado.' }
    : { key: 'webhook', status: 'warning', message: 'RESEND_WEBHOOK_SECRET não configurado.' })

  const databaseReady = isHttpsUrl(deps.env.NEXT_PUBLIC_SUPABASE_URL) && !!deps.env.SUPABASE_SERVICE_ROLE_KEY
  checks.push(databaseReady
    ? { key: 'database', status: 'ok', message: 'Supabase server-side configurado com service role.' }
    : { key: 'database', status: 'error', message: 'Supabase exige URL HTTPS e SUPABASE_SERVICE_ROLE_KEY para envio e supressão.' })

  const blockingKeys = new Set<RosPreflightCheck['key']>(['apiKey', 'domain', 'appUrl', 'unsubscribe', 'database'])
  const canSend = !checks.some(check => blockingKeys.has(check.key) && check.status === 'error')
  return { canSend, checks, fromEmail, senderOptions: listRosSenderOptions(deps.env) }
}
