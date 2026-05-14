import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { SendClientEmailRequest, SendClientEmailResponse } from '@/lib/clientTypes'

const resend = new Resend(process.env.RESEND_API_KEY)

// In-memory idempotency registry: campaignId+contactEmail → messageId
const sentRegistry = new Map<string, string>()

function bodyToHtml(body: string, replyToEmail: string): string {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const htmlLines = body.split('\n').map((line) => {
    const safe = escapeHtml(line)
    const trimmed = safe.trim()
    if (trimmed === '') return '<p style="margin:0 0 10px 0;">&nbsp;</p>'
    // Make http URLs clickable
    const linked = trimmed.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" style="color:#1a1a2e;">$1</a>'
    )
    return `<p style="margin:0 0 10px 0;">${linked}</p>`
  })

  // Minimal HTML — no background, no wrapper divs, looks like a personal email
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#1a1a2e;margin:0;padding:20px;">
${htmlLines.join('\n')}
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
      html: bodyToHtml(emailBody, replyTo?.trim() || recruiterEmail),
      text: emailBody,
      reply_to: replyTo?.trim() || recruiterEmail,
      headers: {
        'List-Unsubscribe': `<mailto:${replyTo?.trim() || recruiterEmail}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `${campaignId ?? 'client'}-${contactEmail ?? ''}-${Date.now()}`,
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
