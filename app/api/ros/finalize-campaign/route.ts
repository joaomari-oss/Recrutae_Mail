import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabase } from '@/lib/supabase'
import { finalizeRosCampaign, OutreachError } from '@/lib/outreach/repository'

export async function POST(request: NextRequest) {
  const db = supabaseAdmin ?? supabase
  if (!db) return NextResponse.json({ success: false, error: 'Supabase não configurado.' }, { status: 503 })
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: 'Body inválido.' }, { status: 400 })
  }
  const campaignId = body && typeof body === 'object' && 'campaignId' in body ? body.campaignId : null
  if (typeof campaignId !== 'string' || !campaignId.trim()) {
    return NextResponse.json({ success: false, error: 'campaignId obrigatório.' }, { status: 400 })
  }
  try {
    const counts = await finalizeRosCampaign(db, campaignId)
    return NextResponse.json({ success: true, ...counts })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Erro ao finalizar campanha.' },
      { status: error instanceof OutreachError ? error.status : 500 })
  }
}
