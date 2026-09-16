import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getRosEvents, OutreachError } from '@/lib/outreach/repository'

export async function GET(request: NextRequest) {
  const campaignId = request.nextUrl.searchParams.get('campaignId')
  if (!campaignId?.trim()) return NextResponse.json({ error: 'campaignId obrigatório.' }, { status: 400 })
  const db = supabaseAdmin
  if (!db) return NextResponse.json({ error: 'A Divulgação ROS exige SUPABASE_SERVICE_ROLE_KEY: as linhas ROS não são acessíveis pela chave pública.' }, { status: 503 })
  try {
    return NextResponse.json(await getRosEvents(db, campaignId))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro ao consultar eventos.' },
      { status: error instanceof OutreachError ? error.status : 500 })
  }
}
