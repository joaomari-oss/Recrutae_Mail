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

export type PreparedRosEmail = {
  payload: RosEmailPayload
  idempotencyKey: string
}

export type RosSendDependencies = {
  isSuppressed: (email: string) => Promise<boolean>
  getExpectedRecipient: (campaignId: string, contactId: string) => Promise<string>
  claimContact: (campaignId: string, contactId: string) => Promise<boolean>
  send: (payload: RosEmailPayload, options: { idempotencyKey: string }) => Promise<SendResponse>
  markSent: (contactId: string, messageId: string) => Promise<void>
  markFailed: (contactId: string, message: string) => Promise<void>
  preparePayload: (
    campaignId: string,
    contactId: string,
    payload: RosEmailPayload,
    idempotencyKey: string,
  ) => Promise<PreparedRosEmail>
  createToken: (input: UnsubscribeTokenInput) => Promise<string>
  appBaseUrl: string
  logoUrl: string
  /** Emblema circular do modelo de assinatura. */
  emblemUrl?: string
}

export type RosSendResult =
  | { success: true; messageId: string }
  | {
      success: false
      error: string
      suppressed?: true
      claimed?: false
      invalidRecipient?: true
      recipientMismatch?: true
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

  let expectedRecipient: string
  try {
    expectedRecipient = normalizeSuppressionEmail(
      await deps.getExpectedRecipient(request.campaignId, request.contactId),
    )
  } catch {
    return { success: false, unavailable: true, error: 'Não foi possível validar o destinatário do contato.' }
  }
  if (expectedRecipient !== email) {
    return { success: false, recipientMismatch: true, error: 'Destinatário não corresponde ao contato.' }
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

  const idempotencyKey = `ros/${request.campaignId}/${request.contactId}`
  let prepared: PreparedRosEmail
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
      emblemUrl: deps.emblemUrl,
      // A assinatura mostra o endereço de resposta: é para lá que o contato escreve.
      recruiterEmail: request.replyTo || request.recruiterEmail,
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
    prepared = await deps.preparePayload(
      request.campaignId,
      request.contactId,
      candidatePayload,
      idempotencyKey,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao preparar e-mail ROS.'
    const persisted = await safelyMarkFailed(deps, request.contactId, message)
    return persisted
      ? { success: false, error: message }
      : { success: false, unavailable: true, error: 'Não foi possível preparar nem persistir a falha do envio.' }
  }

  // Passada a janela de retenção do Resend a tentativa é renovada com uma
  // chave derivada; o que não pode é vir de outro contato ou campanha.
  const keyBelongsToContact = prepared.idempotencyKey === idempotencyKey
    || prepared.idempotencyKey.startsWith(`${idempotencyKey}/r`)
  if (!keyBelongsToContact) {
    const message = 'A chave idempotente persistida não corresponde ao contato.'
    const persisted = await safelyMarkFailed(deps, request.contactId, message)
    return persisted
      ? { success: false, error: message }
      : { success: false, unavailable: true, error: 'Não foi possível validar nem persistir a falha do envio.' }
  }

  let effectiveRecipient: string
  try {
    if (!Array.isArray(prepared.payload.to) || prepared.payload.to.length !== 1 ||
      typeof prepared.payload.to[0] !== 'string') throw new Error('Destinatário inválido.')
    effectiveRecipient = normalizeSuppressionEmail(prepared.payload.to[0])
  } catch {
    const message = 'O payload persistido possui destinatário inválido.'
    const persisted = await safelyMarkFailed(deps, request.contactId, message)
    return persisted
      ? { success: false, recipientMismatch: true, error: message }
      : { success: false, unavailable: true, error: 'Não foi possível bloquear nem persistir a falha do envio.' }
  }

  let currentExpectedRecipient: string
  try {
    currentExpectedRecipient = normalizeSuppressionEmail(
      await deps.getExpectedRecipient(request.campaignId, request.contactId),
    )
  } catch {
    await safelyMarkFailed(deps, request.contactId, 'Não foi possível revalidar o destinatário do contato.')
    return { success: false, unavailable: true, error: 'Não foi possível revalidar o destinatário do contato.' }
  }

  if (effectiveRecipient !== email || effectiveRecipient !== expectedRecipient ||
    effectiveRecipient !== currentExpectedRecipient) {
    const message = 'O destinatário do payload persistido não corresponde ao contato.'
    const persisted = await safelyMarkFailed(deps, request.contactId, message)
    return persisted
      ? { success: false, recipientMismatch: true, error: message }
      : { success: false, unavailable: true, error: 'Não foi possível bloquear nem persistir a falha do envio.' }
  }

  try {
    suppressed = await deps.isSuppressed(effectiveRecipient)
  } catch {
    await safelyMarkFailed(deps, request.contactId, 'Não foi possível revalidar a supressão do destinatário.')
    return { success: false, unavailable: true, error: 'Não foi possível revalidar a supressão.' }
  }
  if (suppressed) {
    const persisted = await safelyMarkFailed(deps, request.contactId, 'E-mail suprimido antes do envio.')
    return persisted
      ? { success: false, suppressed: true, error: 'E-mail suprimido.' }
      : { success: false, unavailable: true, error: 'E-mail suprimido, mas a falha não pôde ser persistida.' }
  }

  let result: SendResponse
  try {
    result = await deps.send(prepared.payload, { idempotencyKey: prepared.idempotencyKey })
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
    // Keep `sending` plus its durable payload. Enquanto o Resend retém a chave,
    // uma nova tentativa repete os mesmos bytes e é agrupada; passada a janela,
    // a tentativa é renovada em vez de repetida.
    return { success: false, unavailable: true, error: 'E-mail aceito, mas o status não pôde ser persistido.' }
  }
}
