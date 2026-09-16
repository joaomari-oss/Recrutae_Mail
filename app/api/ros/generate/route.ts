import { NextRequest, NextResponse } from 'next/server'
import { personalizeRosEmail } from '@/lib/ros/generate'
import type { GenerateRosEmailRequest } from '@/lib/rosTypes'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabase } from '@/lib/supabase'
import { persistRosGeneratedEmail } from '@/lib/outreach/repository'

const db = supabaseAdmin ?? supabase

export async function POST(request: NextRequest) {
  let payload: GenerateRosEmailRequest
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  if (!payload?.contact || typeof payload.emailTemplate !== 'string' || typeof payload.subjectTemplate !== 'string') {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
  }

  const result = await personalizeRosEmail(payload)
  await persistRosGeneratedEmail(db, payload.campaignId, payload.contact.id, result.subject, result.body)
  return NextResponse.json(result)
}
