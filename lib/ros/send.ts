import { renderOutreachEmail } from '@/lib/outreach/emailHtml'
import { normalizeSuppressionEmail, type UnsubscribeTokenInput } from '@/lib/outreach/unsubscribe'
import type { SendRosEmailRequest } from '@/lib/rosTypes'

export type RosEmailPayload = {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  reply_to: string
  tags: Array<{ name: string; value: string }>
  headers: Record<string, string>
}

type SendResponse = {
  data: { id: string } | null
  error: { message: string } | null
}

export type RosSendDependencies = {
  isSuppressed: (email: string) => Promise<boolean>
  claimContact: (campaignId: string, contactId: string) => Promise<boolean>
  send: (payload: RosEmailPayload, options: { idempotencyKey: string }) => Promise<SendResponse>
  markSent: (contactId: string, messageId: string) => Promise<void>
  markFailed: (contactId: string, message: string) => Promise<void>
  preparePayload: (campaignId: string, contactId: string, payload: RosEmailPayload) => Promise<RosEmailPayload>
  createToken: (input: UnsubscribeTokenInput) => Promise<string>
  appBaseUrl: string
  logoUrl: string
}

export type RosSendResult =
  | { success: true; messageId: string }
  | {
      success: false
      error: string
      suppressed?: true
      claimed?: false
      invalidRecipient?: true
      unavailable?: true
    }

function headerText(value: string, fallback: string, maxLength: number): string {
  return value.replace(/[\r\n<>]/g, '').trim().slice(0, maxLength) || fallback
}

function httpsUnsubscribeUrls(appBaseUrl: string, token: string): { human: string; oneClick: string } {
  const base = new URL(appBaseUrl)
  if (base.protocol !== 'https:') throw new Error('A URL de descadastro deve usar HTTPS.')
  const human = new URL('/unsubscribe', base)
  human.searchParams.set('token', token)
  const oneClick = new URL('/api/unsubscribe', base)
  oneClick.searchParams.set('token', token)
  return { human: human.toString(), oneClick: oneClick.toString() }
}

async function safelyMarkFailed(deps: RosSendDependencies, contactId: string, message: string): Promise<boolean> {
  try {
    await deps.markFailed(contactId, message)
    return true
  } catch {
    return false
  }
}

export async function sendRosEmail(
  request: SendRosEmailRequest,
  deps: RosSendDependencies,
): Promise<RosSendResult> {
  let email: string
  try {
    email = normalizeSuppressionEmail(request.to)
  } catch {
    return { success: false, invalidRecipient: true, error: 'Destinatário inválido.' }
  }

  let suppressed: boolean
  try {
    suppressed = await deps.isSuppressed(email)
  } catch {
    return { success: false, unavailable: true, error: 'Não foi possível consultar a supressão.' }
  }
  if (suppressed) {
    return { success: false, suppressed: true, error: 'E-mail suprimido.' }
  }

  let claimed: boolean
  try {
    claimed = await deps.claimContact(request.campaignId, request.contactId)
  } catch {
    return { success: false, unavailable: true, error: 'Não foi possível reservar o contato.' }
  }
  if (!claimed) {
    return { success: false, claimed: false, error: 'Contato não disponível para envio.' }
  }

  let payload: RosEmailPayload
  try {
    const token = await deps.createToken({ email, campaignId: request.campaignId })
    const unsubscribeUrls = httpsUnsubscribeUrls(deps.appBaseUrl, token)
    const rendered = renderOutreachEmail({
      body: request.body,
      recruiterName: request.recruiterName,
      recruiterRole: request.recruiterRole,
      recruiterLinkedin: request.recruiterLinkedin,
      recruiterWhatsapp: request.recruiterWhatsapp,
      brand: 'ros',
      logoUrl: deps.logoUrl,
      unsubscribeUrl: unsubscribeUrls.human,
    })
    const recruiterName = headerText(request.recruiterName, 'Recrutaê', 80)
    const replyTo = normalizeSuppressionEmail(request.replyTo || request.recruiterEmail)
    const candidatePayload: RosEmailPayload = {
      from: `${recruiterName} - Recrutaê | OS <${request.recruiterEmail}>`,
      to: [email],
      subject: headerText(request.subject, 'Oportunidade', 998),
      html: rendered.html,
      text: rendered.text,
      reply_to: replyTo,
      tags: [
        { name: 'campaign_id', value: request.campaignId },
        { name: 'contact_id', value: request.contactId },
      ],
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrls.oneClick}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }
    payload = await deps.preparePayload(request.campaignId, request.contactId, candidatePayload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao preparar e-mail ROS.'
    const persisted = await safelyMarkFailed(deps, request.contactId, message)
    return persisted
      ? { success: false, error: message }
      : { success: false, unavailable: true, error: 'Não foi possível preparar nem persistir a falha do envio.' }
  }

  let result: SendResponse
  try {
    result = await deps.send(payload, { idempotencyKey: `ros/${request.campaignId}/${request.contactId}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao enviar e-mail ROS.'
    const persisted = await safelyMarkFailed(deps, request.contactId, message)
    return persisted
      ? { success: false, error: message }
      : { success: false, unavailable: true, error: 'Falha no envio e ao persistir seu estado.' }
  }

  if (result.error || !result.data?.id) {
    const message = result.error?.message || 'O Resend não retornou o identificador da mensagem.'
    const persisted = await safelyMarkFailed(deps, request.contactId, message)
    return persisted
      ? { success: false, error: message }
      : { success: false, unavailable: true, error: 'Falha no envio e ao persistir seu estado.' }
  }

  try {
    await deps.markSent(request.contactId, result.data.id)
    return { success: true, messageId: result.data.id }
  } catch {
    // Keep `sending` plus its durable payload. A later retry replays the exact
    // same bytes under the same Resend key and can finish persistence safely.
    return { success: false, unavailable: true, error: 'E-mail aceito, mas o status não pôde ser persistido.' }
  }
}
