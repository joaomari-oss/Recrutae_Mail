import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { approveRosContacts, OutreachError } from '@/lib/outreach/repository'

export const dynamic = 'force-dynamic'

const SERVICE_ROLE_REQUIRED =
  'A Divulgação ROS exige SUPABASE_SERVICE_ROLE_KEY: as linhas ROS não são acessíveis pela chave pública.'

export async function POST(request: NextRequest) {
  const db = supabaseAdmin
  if (!db) return NextResponse.json({ success: false, error: SERVICE_ROLE_REQUIRED }, { status: 503 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: 'Body inválido.' }, { status: 400 })
  }

  const payload = body as { campaignId?: unknown; contactIds?: unknown }
  const campaignId = typeof payload?.campaignId === 'string' ? payload.campaignId.trim() : ''
  const contactIds = Array.isArray(payload?.contactIds)
    ? payload.contactIds.filter((id): id is string => typeof id === 'string' && !!id.trim())
    : null

  if (!campaignId) return NextResponse.json({ success: false, error: 'campaignId obrigatório.' }, { status: 400 })
  if (!contactIds || !contactIds.length) {
    return NextResponse.json({ success: false, error: 'contactIds obrigatório.' }, { status: 400 })
  }

  try {
    const result = await approveRosContacts(db, campaignId, contactIds)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro ao aprovar contatos.' },
      { status: error instanceof OutreachError ? error.status : 500 },
    )
  }
}
