import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  claimRosContact,
  getOrCreateRosSendAttempt,
  getRosContactEmail,
  isEmailSuppressed,
  markContactFailed,
  markContactSent,
} from '@/lib/outreach/repository'
import { createUnsubscribeToken } from '@/lib/outreach/unsubscribe'
import { sendRosEmail } from '@/lib/ros/send'
import type { SendRosEmailRequest } from '@/lib/rosTypes'

const DEFAULT_FROM_EMAIL = 'contato@recrutae.com.br'

function isRequiredString(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim()
}

function isValidRequest(value: unknown): value is SendRosEmailRequest {
  if (!value || typeof value !== 'object') return false
  const body = value as Record<string, unknown>
  return ['campaignId', 'contactId', 'to', 'subject', 'body', 'recruiterName', 'recruiterRole',
    'recruiterEmail', 'replyTo', 'recruiterLinkedin', 'recruiterWhatsapp']
    .every(key => typeof body[key] === 'string') &&
    ['campaignId', 'contactId', 'to', 'subject', 'body'].every(key => isRequiredString(body[key]))
}

function isRecrutaeEmail(value: string): boolean {
  return /^[^\s@]+@recrutae\.com\.br$/i.test(value.trim())
}

function isHttpsUrl(value: string | undefined): value is string {
  if (!value) return false
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

export async function POST(request: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !supabaseAdmin) {
    return NextResponse.json({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY é obrigatória para envio ROS.' }, { status: 503 })
  }
  const db = supabaseAdmin
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ success: false, error: 'RESEND_API_KEY não configurada.' }, { status: 503 })
  }
  const appBaseUrl = process.env.APP_BASE_URL
  const unsubscribeSecret = process.env.UNSUBSCRIBE_SIGNING_SECRET
  if (!isHttpsUrl(appBaseUrl) || !unsubscribeSecret || new TextEncoder().encode(unsubscribeSecret).byteLength < 32) {
    return NextResponse.json({ success: false, error: 'Descadastro HTTPS não configurado.' }, { status: 503 })
  }

  const fromEmail = process.env.ROS_FROM_EMAIL ?? DEFAULT_FROM_EMAIL
  if (!isRecrutaeEmail(fromEmail)) {
    return NextResponse.json({ success: false, error: 'O remetente ROS deve ser @recrutae.com.br.' }, { status: 400 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: 'Body inválido.' }, { status: 400 })
  }
  if (!isValidRequest(body)) {
    return NextResponse.json({ success: false, error: 'Dados de envio ROS inválidos.' }, { status: 400 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const result = await sendRosEmail({ ...body, recruiterEmail: fromEmail }, {
    isSuppressed: email => isEmailSuppressed(db, email),
    getExpectedRecipient: (campaignId, contactId) => getRosContactEmail(db, campaignId, contactId),
    claimContact: (campaignId, contactId) => claimRosContact(db, campaignId, contactId),
    send: ({ reply_to, ...payload }, options) => resend.emails.send(
      { ...payload, replyTo: reply_to },
      options,
    ),
    markSent: (contactId, messageId) => markContactSent(db, contactId, messageId),
    markFailed: (contactId, message) => markContactFailed(db, contactId, message),
    preparePayload: async (campaignId, contactId, payload, idempotencyKey) => {
      const attempt = await getOrCreateRosSendAttempt(
        db,
        campaignId,
        contactId,
        JSON.stringify(payload),
        idempotencyKey,
      )
      return { payload: JSON.parse(attempt.payload), idempotencyKey: attempt.idempotencyKey }
    },
    createToken: input => createUnsubscribeToken(input, unsubscribeSecret),
    appBaseUrl,
    logoUrl: new URL('/ros/recrutae-ros.png', appBaseUrl).toString(),
  })

  if (result.success) return NextResponse.json(result)
  const status = result.invalidRecipient ? 400
    : result.unavailable ? 503
      : result.suppressed || result.claimed === false || result.recipientMismatch ? 409 : 502
  return NextResponse.json(result, { status })
}
