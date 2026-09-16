import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabase } from '@/lib/supabase'
import { OutreachError, saveRosCampaign } from '@/lib/outreach/repository'
import type { RosCampaign, RosCampaignConfig, RosContact } from '@/lib/rosTypes'

function validPayload(value: unknown): value is { campaign: RosCampaign; config: RosCampaignConfig; contacts: RosContact[] } {
  if (!value || typeof value !== 'object') return false
  const { campaign, config, contacts } = value as Record<string, any>
  if (!campaign || typeof campaign.id !== 'string' || !campaign.id.trim() ||
      typeof campaign.name !== 'string' || !campaign.name.trim() ||
      (campaign.campaignKind !== undefined && campaign.campaignKind !== 'ros') ||
      !['draft', 'generating', 'ready', 'sending', 'completed'].includes(campaign.status)) return false
  if (!config || !['recruiterName', 'recruiterRole', 'recruiterEmail', 'replyTo', 'recruiterLinkedin',
    'recruiterWhatsapp', 'subjectTemplate', 'emailTemplate'].every(key => typeof config[key] === 'string') ||
    typeof config.varySubject !== 'boolean' || ![5, 6, 7, 8].includes(config.variationPercent)) return false
  if (!Array.isArray(contacts)) return false
  const ids = new Set<string>()
  return contacts.every(contact => {
    if (!contact || !['id', 'firstName', 'lastName', 'fullName', 'email', 'company', 'position',
      'generatedSubject', 'generatedBody', 'editedSubject', 'editedBody'].every(key => typeof contact[key] === 'string') ||
      !contact.id.trim() || ids.has(contact.id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) ||
      !['pending', 'generating', 'ready', 'approved', 'sending', 'sent', 'failed'].includes(contact.status)) return false
    ids.add(contact.id)
    return true
  })
}

export async function POST(request: NextRequest) {
  const db = supabaseAdmin ?? supabase
  if (!db) return NextResponse.json({ success: false, error: 'Supabase não configurado.' }, { status: 503 })
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: 'Body inválido.' }, { status: 400 })
  }
  if (!validPayload(body)) return NextResponse.json({ success: false, error: 'Dados da campanha ROS inválidos.' }, { status: 400 })
  try {
    await saveRosCampaign(db, body.campaign, body.config, body.contacts)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Erro ao salvar campanha.' },
      { status: error instanceof OutreachError ? error.status : 500 })
  }
}
