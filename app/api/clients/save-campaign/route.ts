import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabase } from '@/lib/supabase'
import { SaveCampaignRequest, SaveCampaignResponse } from '@/lib/clientTypes'

// Use admin client when available (bypasses RLS), fallback to anon
const db = supabaseAdmin ?? supabase

export async function POST(request: NextRequest): Promise<NextResponse<SaveCampaignResponse>> {
  if (!db) {
    return NextResponse.json(
      { success: false, error: 'Supabase não configurado. Verifique NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.' },
      { status: 500 }
    )
  }

  let body: SaveCampaignRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Body inválido.' }, { status: 400 })
  }

  const { campaign, contacts = [], config } = body

  if (!campaign?.id || !campaign?.name) {
    return NextResponse.json({ success: false, error: 'Dados da campanha incompletos.' }, { status: 400 })
  }

  // Upsert campaign (safe to call more than once)
  const { error: campErr } = await db.from('client_campaigns').upsert(
    {
      id: campaign.id,
      name: campaign.name,
      recruiter_name: config.recruiterName,
      recruiter_email: config.recruiterEmail,
      segment: config.segment,
      key_points: config.emailTemplate || null,
      status: campaign.status,
      contact_count: contacts.length,
      sent_count: 0,
      failed_count: 0,
    },
    { onConflict: 'id' }
  )

  if (campErr) {
    console.error('[save-campaign] campaign upsert error:', campErr.message, campErr.details, campErr.hint)
    return NextResponse.json(
      { success: false, error: `Erro ao salvar campanha: ${campErr.message}${campErr.hint ? ' — ' + campErr.hint : ''}` },
      { status: 500 }
    )
  }

  if (!contacts.length) {
    return NextResponse.json({ success: true })
  }

  // Upsert contacts in batches of 50
  const BATCH = 50
  for (let i = 0; i < contacts.length; i += BATCH) {
    const batch = contacts.slice(i, i + BATCH)
    const { error: contsErr } = await db.from('client_contacts').upsert(
      batch.map((c) => ({
        id: c.id,
        campaign_id: campaign.id,
        name: c.fullName,
        first_name: c.firstName,
        email: c.email,
        company: c.company || null,
        position: c.position || null,
        status: c.status,
      })),
      { onConflict: 'id' }
    )

    if (contsErr) {
      console.error('[save-campaign] contacts upsert error:', contsErr.message, contsErr.details)
      return NextResponse.json(
        { success: false, error: `Erro ao salvar contatos (lote ${i / BATCH + 1}): ${contsErr.message}` },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ success: true })
}
