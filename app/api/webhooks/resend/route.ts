import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Resend webhook handler — receives email events (email.opened, email.clicked, etc.)
 *
 * Setup in Resend dashboard:
 *   Webhook URL: https://yourdomain.com/api/webhooks/resend?secret=<RESEND_WEBHOOK_SECRET>
 *   Events to subscribe: email.opened
 *
 * Env vars required:
 *   RESEND_WEBHOOK_SECRET — any random string you choose; set the same in Resend dashboard URL
 *   NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 */
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

  // Only handle open events (ignore delivers, bounces, etc. for now)
  if (payload.type !== 'email.opened') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { email_id, to, tags } = payload.data ?? {}
  const campaignId     = tags?.campaign_id ?? null
  const recipientEmail = Array.isArray(to) && to.length > 0 ? to[0] : null

  if (!email_id) {
    return NextResponse.json({ error: 'Missing email_id' }, { status: 400 })
  }

  // Write to Supabase
  const supabaseUrl        = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    // Supabase not configured — silently accept the webhook
    console.warn('[webhook] Supabase not configured, event dropped:', email_id)
    return NextResponse.json({ ok: true })
  }

  const sb = createClient(supabaseUrl, supabaseServiceKey)

  const { error } = await sb.from('email_events').insert({
    message_id:      email_id,
    campaign_id:     campaignId,
    recipient_email: recipientEmail,
    event_type:      'opened',
  })

  if (error) {
    console.error('[webhook] Failed to store email event:', error.message)
    // Still return 200 so Resend doesn't retry
    return NextResponse.json({ ok: false, error: error.message })
  }

  return NextResponse.json({ ok: true })
}
