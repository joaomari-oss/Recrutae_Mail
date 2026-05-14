import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { SendEmailRequest } from '@/lib/types'
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limiter'

// In-memory registry of sent emails — prevents duplicate sends within a process lifetime
const sentRegistry = new Map<string, { messageId: string; sentAt: string }>()

function getSendKey(campaignId: string, candidateEmail: string): string {
  return `${campaignId}::${candidateEmail.toLowerCase()}`
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const RESEND_ERROR_MAP: Record<string, string> = {
  missing_required_field: 'Campos obrigatórios faltando.',
  validation_error: 'Dados inválidos para o Resend.',
  rate_limit_exceeded: 'Limite de envio do Resend excedido. Aguarde alguns minutos.',
  not_found: 'Domínio de envio não encontrado no Resend.',
}

export async function POST(req: NextRequest) {
  if (!validateApiKey(req)) return unauthorizedResponse()

  // Rate limit: 300 requests per minute globally (Resend paid plans support 100/sec)
  const { allowed: globalAllowed, remaining: globalRemaining } = checkRateLimit(
    'send-global',
    300,
    60_000
  )
  if (!globalAllowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit excedido. Tente novamente em breve.' },
      { status: 429, headers: { 'X-RateLimit-Remaining': String(globalRemaining) } }
    )
  }

  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  const replyToEmail = process.env.REPLY_TO_EMAIL

  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'RESEND_API_KEY não configurada no servidor.' },
      { status: 500 }
    )
  }

  if (!fromEmail) {
    return NextResponse.json(
      { success: false, error: 'RESEND_FROM_EMAIL não configurado no servidor.' },
      { status: 500 }
    )
  }

  let body: SendEmailRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Corpo da requisição inválido.' },
      { status: 400 }
    )
  }

  const { to, subject, body: emailBody, candidateName, recruiterName, replyTo, campaignId, candidateEmail } = body

  // Input validation
  if (!to || !subject || !emailBody) {
    return NextResponse.json(
      { success: false, error: 'Campos obrigatórios ausentes: to, subject, body.' },
      { status: 400 }
    )
  }

  if (!EMAIL_REGEX.test(to)) {
    return NextResponse.json({ success: false, error: 'Endereço de e-mail inválido.' }, { status: 400 })
  }

  if (emailBody.length > 10_000) {
    return NextResponse.json(
      { success: false, error: 'Corpo do e-mail muito longo (máx. 10.000 caracteres).' },
      { status: 400 }
    )
  }

  if (subject.length > 200) {
    return NextResponse.json(
      { success: false, error: 'Assunto muito longo (máx. 200 caracteres).' },
      { status: 400 }
    )
  }

  // Sanitize sender name to prevent header injection
  const safeSenderName = recruiterName?.replace(/[\r\n<>]/g, '').trim().slice(0, 100)

  // Idempotency check: if this campaignId + email was already sent, return cached result
  if (campaignId && candidateEmail) {
    const sendKey = getSendKey(campaignId, candidateEmail)
    const existing = sentRegistry.get(sendKey)
    if (existing) {
      return NextResponse.json({
        success: true,
        messageId: existing.messageId,
        alreadySent: true,
        sentAt: existing.sentAt,
      })
    }
  }

  // Global daily cap — set high to avoid blocking large campaigns on warm serverless instances
  const globalDailyKey = `global-daily::${new Date().toISOString().slice(0, 10)}`
  const { allowed: globalDailyOk } = checkRateLimit(globalDailyKey, 10_000, 24 * 60 * 60 * 1000)
  if (!globalDailyOk) {
    return NextResponse.json(
      { success: false, error: 'Limite diário global de envios atingido (10.000/dia).' },
      { status: 429 }
    )
  }

  const resend = new Resend(apiKey)

  const senderName = safeSenderName ? `${safeSenderName} - Recrutae Talent` : 'Recrutae Talent'
  const from = `${senderName} <${fromEmail}>`

  const htmlBody = emailBody
    .split('\n')
    .map((line) =>
      line.trim() === ''
        ? '<p style="margin:0 0 12px 0;padding:0;">&nbsp;</p>'
        : `<p style="margin:0 0 12px 0;padding:0;">${line}</p>`
    )
    .join('')

  const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <div style="max-width:600px;padding:24px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#1a1a1a;">
    ${htmlBody}
  </div>
</body>
</html>`

  // reply_to: prefer body field, fall back to env var
  const effectiveReplyTo = replyTo?.trim() || replyToEmail

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html: fullHtml,
      text: emailBody,
      ...(effectiveReplyTo ? { reply_to: effectiveReplyTo } : {}),
      // Tag with campaignId so Resend webhooks can route email.opened events back to us
      ...(campaignId ? { tags: [{ name: 'campaign_id', value: campaignId }] } : {}),
    })

    if (error) {
      console.error('[/api/send] Resend error:', error)
      const friendlyMessage = RESEND_ERROR_MAP[(error as any).name] || error.message
      return NextResponse.json(
        { success: false, error: friendlyMessage },
        { status: 400 }
      )
    }

    // Register the send for idempotency
    if (data?.id && campaignId && candidateEmail) {
      const sendKey = getSendKey(campaignId, candidateEmail)
      sentRegistry.set(sendKey, {
        messageId: data.id,
        sentAt: new Date().toISOString(),
      })
    }

    return NextResponse.json({ success: true, messageId: data?.id })
  } catch (err) {
    console.error('[/api/send] Unexpected error:', err)
    const message = err instanceof Error ? err.message : 'Erro desconhecido ao enviar email.'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
