import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabase } from '@/lib/supabase'

const db = supabaseAdmin ?? supabase

export async function POST(request: NextRequest) {
  if (!db) {
    return NextResponse.json({ success: false, error: 'Supabase não configurado.' }, { status: 500 })
  }

  let body: { campaignId: string; sentCount: number; failedCount: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Body inválido.' }, { status: 400 })
  }

  const { campaignId, sentCount, failedCount } = body

  if (!campaignId) {
    return NextResponse.json({ success: false, error: 'campaignId obrigatório.' }, { status: 400 })
  }

  const { error } = await db.from('client_campaigns').update({
    status: 'completed',
    sent_count: sentCount,
    failed_count: failedCount,
  }).eq('id', campaignId)

  if (error) {
    console.error('[finalize-campaign] error:', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
