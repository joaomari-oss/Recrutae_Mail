import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { SendEmailRequest } from '@/lib/types'

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL

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

  const resend = new Resend(apiKey)

  let body: SendEmailRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Corpo da requisição inválido.' },
      { status: 400 }
    )
  }

  const { to, subject, body: emailBody, candidateName, recruiterName } = body

  if (!to || !subject || !emailBody) {
    return NextResponse.json(
      { success: false, error: 'Campos obrigatórios ausentes: to, subject, body.' },
      { status: 400 }
    )
  }

  const senderName = recruiterName?.trim()
    ? `${recruiterName.trim()} - Recrutae Talent`
    : 'Recrutae Talent'
  const from = `${senderName} <${fromEmail}>`

  // Convert line breaks to simple HTML - keep it minimal like a personal email
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
    })

    if (error) {
      console.error('[/api/send] Resend error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, messageId: data?.id })
  } catch (err) {
    console.error('[/api/send] Unexpected error:', err)
    const message = err instanceof Error ? err.message : 'Erro desconhecido ao enviar email.'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
