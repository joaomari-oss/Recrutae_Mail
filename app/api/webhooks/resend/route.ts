import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { normalizeSuppressionEmail } from '@/lib/outreach/unsubscribe'
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

function hasMatchingSecret(provided: string | null, expected: string): boolean {
  if (!provided) return false
  const providedBytes = new TextEncoder().encode(provided)
  const expectedBytes = new TextEncoder().encode(expected)
  if (providedBytes.byteLength !== expectedBytes.byteLength) return false
  return timingSafeEqual(providedBytes, expectedBytes)
}

function recipientFrom(to: unknown): string | null {
  const candidate = Array.isArray(to) ? to[0] : typeof to === 'string' ? to : null
  if (typeof candidate !== 'string') return null
  try {
    return normalizeSuppressionEmail(candidate)
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  // The secret is deliberately mandatory: accepting an unsigned webhook would
  // let third parties globally suppress addresses or forge engagement events.
  const secret = req.nextUrl.searchParams.get('secret')
  const expectedSecret = process.env.RESEND_WEBHOOK_SECRET
  if (!expectedSecret) {
    return NextResponse.json({ error: 'Webhook temporariamente indisponível.' }, { status: 503 })
  }
  if (!hasMatchingSecret(secret, expectedSecret)) {
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
  const recipientEmail = recipientFrom(to)
  const eventType      = EVENT_TYPE_MAP[payload.type] ?? payload.type

  if (!email_id) {
    return NextResponse.json({ error: 'Missing email_id' }, { status: 400 })
  }

  if (!supabaseAdmin) {
    console.error('[webhook] supabaseAdmin not configured; returning retryable failure:', email_id)
    return NextResponse.json({ error: 'Webhook temporariamente indisponível.' }, { status: 503 })
  }

  if ((eventType === 'bounced' || eventType === 'complained') && !recipientEmail) {
    return NextResponse.json({ error: 'Missing valid recipient email' }, { status: 400 })
  }

  if (eventType === 'bounced' || eventType === 'complained') {
    const { error: suppressionError } = await supabaseAdmin.from('email_suppressions').upsert({
      email: recipientEmail!,
      reason: eventType === 'bounced' ? 'bounce' : 'complaint',
      source: 'resend_webhook',
      message_id: email_id,
    }, { onConflict: 'email' })

    if (suppressionError) {
      console.error('[webhook] Failed to store email suppression:', suppressionError.message)
      return NextResponse.json({ error: 'Suppression persistence failed' }, { status: 503 })
    }
  }

  // Resend retries deliveries when a 2xx response is lost. Avoid counting a
  // retried event twice while keeping the response successful and idempotent.
  const { data: existingEvent, error: existingEventError } = await supabaseAdmin.from('email_events')
    .select('id').eq('message_id', email_id).eq('event_type', eventType).maybeSingle()

  if (existingEventError) {
    console.error('[webhook] Failed to check existing email event:', existingEventError.message)
    return NextResponse.json({ error: 'Event lookup failed' }, { status: 503 })
  }

  if (existingEvent) return NextResponse.json({ ok: true, replay: true })

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
