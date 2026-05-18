import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Resend } from 'resend'
import { SendClientEmailRequest, SendClientEmailResponse } from '@/lib/clientTypes'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabase } from '@/lib/supabase'

const db = supabaseAdmin ?? supabase

const resend = new Resend(process.env.RESEND_API_KEY)

// In-memory idempotency registry: campaignId+contactEmail → messageId
const sentRegistry = new Map<string, string>()

const FONT = `'Helvetica Neue', Helvetica, Arial, sans-serif`

function getLogoDataUri(): string {
  try {
    const buf = readFileSync(join(process.cwd(), 'public', 'recrutae.webp'))
    return `data:image/webp;base64,${buf.toString('base64')}`
  } catch {
    return ''
  }
}

function buildHtml(
  body: string,
  recruiterName: string,
  recruiterRole: string,
  recruiterEmail: string,
): string {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const htmlBody = body.split('\n').map((line) => {
    const safe = escapeHtml(line)
    const trimmed = safe.trim()
    if (trimmed === '') return `<p style="margin:0 0 8px 0;font-family:${FONT};">&nbsp;</p>`
    const linked = trimmed.replace(
      /(https?:\/\/[^\s<]+)/g,
      `<a href="$1" style="color:#E8603A;font-family:${FONT};text-decoration:underline;font-weight:500;">$1</a>`
    )
    return `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:1.75;color:#1a1a2e;">${linked}</p>`
  }).join('')

  const logoSrc = getLogoDataUri()
  const safeName = escapeHtml(recruiterName || 'Recrutaê')
  const safeRole = escapeHtml(recruiterRole || '')

  const logoBlock = logoSrc
    ? `<img src="${logoSrc}" alt="Recrutaê" width="100" height="auto" style="display:block;border:0;width:100px;max-width:100px;" />`
    : `<p style="margin:0;font-family:${FONT};font-size:16px;font-weight:700;color:#1a1a2e;">Recrutaê</p>`

  const signatureHtml = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:32px;">
  <tr>
    <td style="border-top:1px solid #e5e5ea;padding-top:24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:20px;vertical-align:middle;">${logoBlock}</td>
          <td style="border-left:3px solid #F5A623;padding-left:16px;vertical-align:middle;">
            <p style="margin:0;font-family:${FONT};font-size:15px;font-weight:700;color:#1a1a2e;line-height:1.3;">${safeName}</p>
            ${safeRole ? `<p style="margin:3px 0 0 0;font-family:${FONT};font-size:13px;color:#6b7280;line-height:1.4;">${safeRole}</p>` : ''}
            <p style="margin:6px 0 0 0;font-family:${FONT};font-size:11px;font-weight:700;color:#F5A623;letter-spacing:1px;text-transform:uppercase;">Recrutaê</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`

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
<body style="margin:0;padding:0;background-color:#f5f5f7;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f5f7;">
  <tr>
    <td style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#1a1a2e;padding:0;height:4px;"></td></tr>
        <tr>
          <td style="padding:36px 40px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-family:${FONT};font-size:15px;line-height:1.75;color:#1a1a2e;">
                  ${htmlBody}
                  ${signatureHtml}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background-color:#f9f9fb;border-top:1px solid #e5e5ea;padding:16px 40px;">
            <p style="margin:0;font-family:${FONT};font-size:11px;color:#9ca3af;line-height:1.5;text-align:center;">
              Você recebeu este email pois seu perfil foi identificado como relevante.<br />
              Para não receber mais emails, responda com "cancelar".
            </p>
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
    const { to, subject, body: emailBody, contactName, recruiterName, recruiterEmail, recruiterRole, replyTo, campaignId, contactEmail, contactId } = body

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

    // Persist sent status server-side (uses admin key → bypasses RLS)
    if (db && contactId) {
      await db.from('client_contacts').update({
        status: 'sent',
        message_id: messageId,
        sent_at: new Date().toISOString(),
      }).eq('id', contactId)
    }

    return NextResponse.json({ success: true, messageId })
  } catch (err) {
    console.error('[clients/send] Error:', err)
    return NextResponse.json({ success: false, error: 'Erro interno ao enviar e-mail.' }, { status: 500 })
  }
}
