import { NextRequest, NextResponse } from 'next/server'
import { personalizeRosEmail } from '@/lib/ros/generate'
import type { GenerateRosEmailRequest } from '@/lib/rosTypes'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabase } from '@/lib/supabase'

const db = supabaseAdmin ?? supabase

function hasValidId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

async function persistGenerated(
  campaignId: unknown,
  contactId: unknown,
  subject: string,
  body: string
): Promise<void> {
  if (!db || !hasValidId(campaignId) || !hasValidId(contactId)) return

  await db.from('client_contacts').update({
    status: 'ready',
    generated_subject: subject,
    generated_body: body,
    edited_subject: subject,
    edited_body: body,
  }).eq('id', contactId).eq('campaign_id', campaignId)
}

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
  await persistGenerated(payload.campaignId, payload.contact.id, result.subject, result.body)
  return NextResponse.json(result)
}
