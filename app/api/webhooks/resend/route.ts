import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * Resend webhook handler — receives email events (email.opened, email.clicked, etc.)
 *
 * Setup in Resend dashboard:
 *   Webhook URL: https://yourdomain.com/api/webhooks/resend?secret=<RESEND_WEBHOOK_SECRET>
 *   Events to subscribe: email.opened, email.clicked, email.bounced, email.complained
 *
 * Env vars required:
 *   RESEND_WEBHOOK_SECRET — random string; set the same in Resend dashboard URL param
 */

const TRACKED_EVENTS = new Set([
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  'email.delivered',
])

const EVENT_TYPE_MAP: Record<string, string> = {
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivered': 'delivered',
}

export async function POST(req: NextRequest) {
  // Security: verify secret token passed as query param
  const secret = req.nextUrl.searchParams.get('secret')
  const expectedSecret = process.env.RESEND_WEBHOOK_SECRET
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: {
    type: string
    data?: {
      email_id?: string
      to?: string[]
      tags?: Record<string, string>
    }
  }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!TRACKED_EVENTS.has(payload.type)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { email_id, to, tags } = payload.data ?? {}
  const campaignId     = tags?.campaign_id ?? null
  const contactId      = tags?.contact_id ?? null
  const recipientEmail = Array.isArray(to) && to.length > 0 ? to[0] : null
  const eventType      = EVENT_TYPE_MAP[payload.type] ?? payload.type

  if (!email_id) {
    return NextResponse.json({ error: 'Missing email_id' }, { status: 400 })
  }

  if (!supabaseAdmin) {
    console.warn('[webhook] supabaseAdmin not configured, event dropped:', email_id)
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabaseAdmin.from('email_events').insert({
    message_id:      email_id,
    campaign_id:     campaignId,
    contact_id:      contactId,
    recipient_email: recipientEmail,
    event_type:      eventType,
  })

  if (error) {
    console.error('[webhook] Failed to store email event:', error.message)
    return NextResponse.json({ ok: false, error: error.message })
  }

  return NextResponse.json({ ok: true })
}
