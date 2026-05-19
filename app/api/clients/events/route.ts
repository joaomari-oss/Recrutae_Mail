import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type ContactEventSummary = {
  contactId: string
  opened: boolean
  clicked: boolean
  openedAt?: string
  clickedAt?: string
}

export type CampaignEventSummary = {
  campaignId: string
  totalOpened: number
  totalClicked: number
  contacts: ContactEventSummary[]
}

/**
 * GET /api/clients/events?campaignId=<id>
 * Returns email event summary for a campaign — aggregate counts and per-contact status.
 */
export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get('campaignId')

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { data, error } = await supabaseAdmin
    .from('email_events')
    .select('contact_id, event_type, received_at')
    .eq('campaign_id', campaignId)
    .in('event_type', ['opened', 'clicked'])
    .order('received_at', { ascending: true })

  if (error) {
    console.error('[events] Query error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group by contact_id
  const contactMap = new Map<string, ContactEventSummary>()

  for (const row of data ?? []) {
    const cid = row.contact_id as string | null
    if (!cid) continue
    if (!contactMap.has(cid)) {
      contactMap.set(cid, { contactId: cid, opened: false, clicked: false })
    }
    const entry = contactMap.get(cid)!
    if (row.event_type === 'opened' && !entry.opened) {
      entry.opened = true
      entry.openedAt = row.received_at as string
    }
    if (row.event_type === 'clicked' && !entry.clicked) {
      entry.clicked = true
      entry.clickedAt = row.received_at as string
    }
  }

  const contacts = Array.from(contactMap.values())
  const summary: CampaignEventSummary = {
    campaignId,
    totalOpened: contacts.filter((c) => c.opened).length,
    totalClicked: contacts.filter((c) => c.clicked).length,
    contacts,
  }

  return NextResponse.json(summary)
}
