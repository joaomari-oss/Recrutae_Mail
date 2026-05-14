import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { SendClientEmailRequest, SendClientEmailResponse } from '@/lib/clientTypes'

const resend = new Resend(process.env.RESEND_API_KEY)

// In-memory idempotency registry: campaignId+contactEmail → messageId
const sentRegistry = new Map<string, string>()

function bodyToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const lines = escaped.split('\n')
  const htmlLines = lines.map((line) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('→') || trimmed.startsWith('-&gt;')) {
      const text = trimmed.replace(/^→|-&gt;/, '').trim()
      return `<p style="margin:6px 0 6px 12px;color:#1a1a2e;">• ${text}</p>`
    }
    // Make LinkedIn / http URLs clickable
    const linkedUrl = trimmed.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" style="color:#F26A4F;text-decoration:none;">$1</a>'
    )
    if (trimmed === '') return '<p style="margin:0 0 6px 0;">&nbsp;</p>'
    return `<p style="margin:8px 0;color:#1a1a2e;">${linkedUrl}</p>`
  })

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <div style="max-width:600px;padding:24px 20px;font-family:'Georgia',serif;font-size:15px;line-height:1.75;color:#1a1a2e;">
${htmlLines.join('\n')}
  </div>
</body>
</html>`
}

function sanitizeName(name: string): string {
  return name.replace(/[<>"']/g, '').trim().slice(0, 80)
}

export async function POST(request: NextRequest): Promise<NextResponse<SendClientEmailResponse>> {
  try {
    const body: SendClientEmailRequest = await request.json()
    const { to, subject, body: emailBody, contactName, recruiterName, recruiterEmail, replyTo, campaignId, contactEmail } = body

    if (!to || !subject || !emailBody || !recruiterEmail) {
      return NextResponse.json({ success: false, error: 'Campos obrigatórios ausentes.' }, { status: 400 })
    }

    // Validate recruiter email is @recrutae.com.br
    if (!recruiterEmail.toLowerCase().endsWith('@recrutae.com.br')) {
      return NextResponse.json(
        { success: false, error: 'O e-mail do recrutador deve ser @recrutae.com.br.' },
        { status: 400 }
      )
    }

    // Idempotency check
    if (campaignId && contactEmail) {
      const key = `${campaignId}:${contactEmail}`
      const existingId = sentRegistry.get(key)
      if (existingId) {
        return NextResponse.json({ success: true, messageId: existingId, alreadySent: true })
      }
    }

    const safeName = sanitizeName(recruiterName || 'Recrutaê')
    const fromAddress = `${safeName} <${recruiterEmail}>`

    const result = await resend.emails.send({
      from: fromAddress,
      to: [to],
      subject,
      html: bodyToHtml(emailBody),
      text: emailBody,
      reply_to: replyTo?.trim() || recruiterEmail,
      headers: {
        'X-Entity-Ref-ID': `${campaignId ?? 'client'}-${Date.now()}`,
      },
    })

    if (result.error) {
      console.error('[clients/send] Resend error:', result.error)
      return NextResponse.json({ success: false, error: result.error.message }, { status: 500 })
    }

    const messageId = result.data?.id ?? `msg-${Date.now()}`

    if (campaignId && contactEmail) {
      sentRegistry.set(`${campaignId}:${contactEmail}`, messageId)
    }

    return NextResponse.json({ success: true, messageId })
  } catch (err) {
    console.error('[clients/send] Error:', err)
    return NextResponse.json({ success: false, error: 'Erro interno ao enviar e-mail.' }, { status: 500 })
  }
}
