import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { SendClientEmailRequest, SendClientEmailResponse } from '@/lib/clientTypes'

const resend = new Resend(process.env.RESEND_API_KEY)

// In-memory idempotency registry: campaignId+contactEmail → messageId
const sentRegistry = new Map<string, string>()

function buildHtml(
  body: string,
  recruiterName: string,
  recruiterRole: string,
  recruiterEmail: string,
): string {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const htmlLines = body.split('\n').map((line) => {
    const safe = escapeHtml(line)
    const trimmed = safe.trim()
    if (trimmed === '') return '<p style="margin:0 0 12px 0;">&nbsp;</p>'
    // Make http URLs clickable with a legible blue
    const linked = trimmed.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" style="color:#2563eb;text-decoration:underline;">$1</a>'
    )
    return `<p style="margin:0 0 12px 0;">${linked}</p>`
  })

  const safeName = escapeHtml(recruiterName || 'Recrutaê')
  const safeRole = escapeHtml(recruiterRole || '')
  const safeEmail = escapeHtml(recruiterEmail || '')

  const signatureHtml = `
<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-collapse:collapse;width:100%;">
  <tr>
    <td style="padding-top:16px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:13px;font-weight:700;color:#111827;line-height:1.5;">${safeName}</p>
      ${safeRole ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;line-height:1.4;">${safeRole} &middot; Recrutaê</p>` : `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;line-height:1.4;">Recrutaê</p>`}
      ${safeEmail ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;line-height:1.4;">${safeEmail}</p>` : ''}
    </td>
  </tr>
</table>`

  // Looks like a personal email — plain white background, standard fonts, no decorative elements
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<!--[if !mso]><!-->
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<!--<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#ffffff;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;">
  <tr>
    <td style="padding:28px 32px 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;">
        <tr>
          <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#111827;">
            ${htmlLines.join('\n            ')}
            ${signatureHtml}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

function sanitizeName(name: string): string {
  return name.replace(/[<>"']/g, '').trim().slice(0, 80)
}

export async function POST(request: NextRequest): Promise<NextResponse<SendClientEmailResponse>> {
  try {
    const body: SendClientEmailRequest = await request.json()
    const { to, subject, body: emailBody, contactName, recruiterName, recruiterEmail, recruiterRole, replyTo, campaignId, contactEmail } = body

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
    const safeRole = (recruiterRole || '').replace(/[<>"']/g, '').trim().slice(0, 100)
    const fromAddress = `${safeName} <${recruiterEmail}>`
    const effectiveReplyTo = replyTo?.trim() || recruiterEmail

    const result = await resend.emails.send({
      from: fromAddress,
      to: [to],
      subject,
      html: buildHtml(emailBody, safeName, safeRole, recruiterEmail),
      text: emailBody,
      reply_to: effectiveReplyTo,
      headers: {
        'List-Unsubscribe': `<mailto:${effectiveReplyTo}?subject=unsubscribe>`,
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
