import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabase } from '@/lib/supabase'
import {
  deleteRosCampaign,
  listRosCampaignContactStatuses,
  listRosCampaigns,
  OutreachError,
} from '@/lib/outreach/repository'

export const dynamic = 'force-dynamic'

function database() {
  return supabaseAdmin ?? supabase
}

function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Erro ao consultar campanhas ROS.' },
    { status: error instanceof OutreachError ? error.status : 500 },
  )
}

export async function GET(request: NextRequest) {
  const db = database()
  if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 })
  const campaignId = request.nextUrl.searchParams.get('campaignId')
  try {
    if (campaignId?.trim()) {
      return NextResponse.json({ contacts: await listRosCampaignContactStatuses(db, campaignId) })
    }
    return NextResponse.json({ campaigns: await listRosCampaigns(db) })
  } catch (error) {
    return failure(error)
  }
}

export async function DELETE(request: NextRequest) {
  const db = database()
  if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 })
  const campaignId = request.nextUrl.searchParams.get('campaignId')
  if (!campaignId?.trim()) return NextResponse.json({ error: 'campaignId obrigatório.' }, { status: 400 })
  try {
    await deleteRosCampaign(db, campaignId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return failure(error)
  }
}
