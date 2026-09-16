import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { SendClientEmailRequest, SendClientEmailResponse } from '@/lib/clientTypes'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getLogoUrl } from '@/lib/getLogoUrl'
import { renderOutreachEmail } from '@/lib/outreach/emailHtml'
import { isEmailSuppressed } from '@/lib/outreach/repository'

// A supressao e server-only: a chave publica nao le a tabela, e uma consulta
// que falha aberta devolveria e-mail a quem se descadastrou.
const db = supabaseAdmin

const resend = new Resend(process.env.RESEND_API_KEY)

// In-memory idempotency registry: campaignId+contactEmail → messageId
const sentRegistry = new Map<string, string>()

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

    // Supressão é global: quem se descadastrou de uma divulgação ROS também
    // não pode receber prospecção de Clientes.
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'SUPABASE_SERVICE_ROLE_KEY é obrigatória para consultar a supressão antes do envio.' },
        { status: 503 },
      )
    }
    {
      try {
        if (await isEmailSuppressed(db, to)) {
          return NextResponse.json(
            { success: false, error: 'Endereço descadastrado ou suprimido — não recebeu o e-mail.' },
            { status: 409 },
          )
        }
      } catch (suppressionError) {
        console.error('[clients/send] suppression check failed:', suppressionError)
        return NextResponse.json(
          { success: false, error: 'Não foi possível verificar a supressão. Envio bloqueado por segurança.' },
          { status: 503 },
        )
      }
    }

    const safeName = sanitizeName(recruiterName || 'Recrutaê')
    const safeRole = (recruiterRole || '').replace(/[<>"']/g, '').trim().slice(0, 100)
    const fromAddress = `${safeName} <${recruiterEmail}>`
    const effectiveReplyTo = replyTo?.trim() || recruiterEmail

    const renderedEmail = renderOutreachEmail({
      body: emailBody,
      recruiterName: safeName,
      recruiterRole: safeRole,
      recruiterLinkedin: '',
      recruiterWhatsapp: '',
      brand: 'clients',
      logoUrl: getLogoUrl(),
    })

    // Mesmo espaço de nomes do ROS, com prefixo próprio: um reenvio dentro da
    // janela de retenção do Resend não vira e-mail duplicado.
    const idempotencyKey = campaignId && contactId ? `clients/${campaignId}/${contactId}` : undefined

    const result = await resend.emails.send({
      from: fromAddress,
      to: [to],
      subject,
      html: renderedEmail.html,
      text: renderedEmail.text,
      // O SDK 4 renomeou o campo; `reply_to` era ignorado em silêncio e as
      // respostas voltavam para o remetente errado.
      replyTo: effectiveReplyTo,
      tags: [
        ...(campaignId ? [{ name: 'campaign_id', value: campaignId }] : []),
        ...(contactId ? [{ name: 'contact_id', value: contactId }] : []),
      ],
      headers: {
        'List-Unsubscribe': `<mailto:${effectiveReplyTo}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': idempotencyKey ?? `${campaignId ?? 'client'}-${contactEmail ?? ''}`,
      },
    }, idempotencyKey ? { idempotencyKey } : undefined)

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
