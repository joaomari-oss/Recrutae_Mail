import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/email-events?since=<ISO date>
 *
 * Returns email open events stored by the Resend webhook handler.
 * Used by the client to poll for new notification badges.
 *
 * If `since` is omitted, returns events from the last 24 hours.
 */
export async function GET(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ events: [] })
  }

  const since = req.nextUrl.searchParams.get('since')
  const cutoff = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('email_events')
    .select('id, message_id, campaign_id, recipient_email, event_type, received_at')
    .eq('event_type', 'opened')
    .gt('received_at', cutoff)
    .order('received_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[email-events] Supabase error:', error.message)
    return NextResponse.json({ events: [] })
  }

  return NextResponse.json({ events: data ?? [] })
}
