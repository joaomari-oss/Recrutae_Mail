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

  // Rate limit: 60 requests per minute globally
  const { allowed: globalAllowed, remaining: globalRemaining } = checkRateLimit(
    'send-global',
    60,
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

  const { to, subject, body: emailBody, candidateName, recruiterName, campaignId, candidateEmail } = body

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

  // Anti-spam: max 1 send to same email per day (per campaign)
  if (campaignId && to) {
    const dailyKey = `daily::${campaignId}::${to.toLowerCase()}::${new Date().toISOString().slice(0, 10)}`
    const { allowed: dailyOk } = checkRateLimit(dailyKey, 1, 24 * 60 * 60 * 1000)
    if (!dailyOk) {
      return NextResponse.json(
        { success: false, error: 'Este e-mail já foi enviado hoje para este destinatário nesta campanha.' },
        { status: 429 }
      )
    }
  }

  // Global daily cap
  const globalDailyKey = `global-daily::${new Date().toISOString().slice(0, 10)}`
  const { allowed: globalDailyOk } = checkRateLimit(globalDailyKey, 500, 24 * 60 * 60 * 1000)
  if (!globalDailyOk) {
    return NextResponse.json(
      { success: false, error: 'Limite diário global de envios atingido (500/dia).' },
      { status: 429 }
    )
  }

  const resend = new Resend(apiKey)

  const senderName = safeSenderName ? `${safeSenderName} - Recrutae Talent` : 'Recrutae Talent'
  const from = `${senderName} <${fromEmail}>`

  const htmlBody = emailBody
    .split('\n')
    .map((line) => (line.trim() === '' ? '<br>' : `<p>${line}</p>`))
    .join('')

  const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #222;">
${htmlBody}
</body>
</html>`

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html: fullHtml,
      text: emailBody,
      ...(replyToEmail ? { replyTo: replyToEmail } : {}),
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
