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
  createToken: (input: UnsubscribeTokenInput) => Promise<string>
  appBaseUrl: string
  logoUrl: string
}

export type RosSendResult =
  | { success: true; messageId: string }
  | { success: false; error: string; suppressed?: true; claimed?: false }

function headerText(value: string, fallback: string, maxLength: number): string {
  return value.replace(/[\r\n<>]/g, '').trim().slice(0, maxLength) || fallback
}

function httpsUnsubscribeUrl(appBaseUrl: string, token: string): string {
  const base = new URL(appBaseUrl)
  if (base.protocol !== 'https:') throw new Error('A URL de descadastro deve usar HTTPS.')
  const url = new URL('/api/unsubscribe', base)
  url.searchParams.set('token', token)
  return url.toString()
}

export async function sendRosEmail(
  request: SendRosEmailRequest,
  deps: RosSendDependencies,
): Promise<RosSendResult> {
  const email = normalizeSuppressionEmail(request.to)

  if (await deps.isSuppressed(email)) {
    return { success: false, suppressed: true, error: 'E-mail suprimido.' }
  }

  const claimed = await deps.claimContact(request.campaignId, request.contactId)
  if (!claimed) {
    return { success: false, claimed: false, error: 'Contato não disponível para envio.' }
  }

  try {
    const token = await deps.createToken({ email, campaignId: request.campaignId })
    const unsubscribeUrl = httpsUnsubscribeUrl(deps.appBaseUrl, token)
    const rendered = renderOutreachEmail({
      body: request.body,
      recruiterName: request.recruiterName,
      recruiterRole: request.recruiterRole,
      recruiterLinkedin: request.recruiterLinkedin,
      recruiterWhatsapp: request.recruiterWhatsapp,
      brand: 'ros',
      logoUrl: deps.logoUrl,
      unsubscribeUrl,
    })
    const recruiterName = headerText(request.recruiterName, 'Recrutaê', 80)
    const replyTo = normalizeSuppressionEmail(request.replyTo || request.recruiterEmail)
    const result = await deps.send({
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
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }, { idempotencyKey: `ros/${request.campaignId}/${request.contactId}` })

    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || 'O Resend não retornou o identificador da mensagem.')
    }

    await deps.markSent(request.contactId, result.data.id)
    return { success: true, messageId: result.data.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao enviar e-mail ROS.'
    await deps.markFailed(request.contactId, message)
    return { success: false, error: message }
  }
}
