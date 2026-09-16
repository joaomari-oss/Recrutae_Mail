import type { SupabaseClient } from '@supabase/supabase-js'
import type { RosCampaign, RosCampaignConfig, RosContact } from '@/lib/rosTypes'

export const sendableStatuses = ['approved', 'failed'] as const
type CampaignInput = Pick<RosCampaign, 'id' | 'name' | 'status' | 'totalContacts'>

export class OutreachError extends Error {
  constructor(message: string, public readonly status = 500) { super(message) }
}

function check(error: { message: string } | null) {
  if (error) throw new OutreachError(error.message)
}

export function mapRosCampaignRow(campaign: CampaignInput, config: RosCampaignConfig): Record<string, unknown> {
  return {
    id: campaign.id, name: campaign.name, campaign_kind: 'ros', status: campaign.status,
    contact_count: campaign.totalContacts, recruiter_name: config.recruiterName,
    recruiter_role: config.recruiterRole, recruiter_email: config.recruiterEmail,
    reply_to: config.replyTo, recruiter_linkedin: config.recruiterLinkedin,
    recruiter_whatsapp: config.recruiterWhatsapp, subject_template: config.subjectTemplate,
    key_points: config.emailTemplate, vary_subject: config.varySubject, variation_percent: config.variationPercent,
  }
}

export async function getRosCampaign(db: SupabaseClient, campaignId: string) {
  const { data, error } = await db.from('client_campaigns').select('*')
    .eq('id', campaignId).eq('campaign_kind', 'ros').maybeSingle()
  check(error)
  return data
}

async function requireRosCampaign(db: SupabaseClient, campaignId: string) {
  const campaign = await getRosCampaign(db, campaignId)
  if (!campaign) throw new OutreachError('Campanha ROS não encontrada.', 404)
  return campaign
}

function mapContact(contact: RosContact, campaignId: string) {
  return {
    id: contact.id, campaign_id: campaignId, name: contact.fullName, first_name: contact.firstName,
    email: contact.email.trim().toLowerCase(), company: contact.company, position: contact.position,
    status: contact.status, generated_subject: contact.generatedSubject, generated_body: contact.generatedBody,
    edited_subject: contact.editedSubject, edited_body: contact.editedBody,
    message_id: contact.resendMessageId ?? null, sent_at: contact.sentAt ?? null,
    error_message: contact.errorMessage ?? null,
  }
}

export async function saveRosCampaign(db: SupabaseClient, campaign: CampaignInput, config: RosCampaignConfig, contacts: RosContact[]) {
  // Check the global ID before writing: an upsert must never convert a Clients campaign to ROS.
  const existing = await db.from('client_campaigns').select('id, campaign_kind, status').eq('id', campaign.id).maybeSingle()
  check(existing.error)
  if (existing.data && existing.data.campaign_kind !== 'ros') {
    throw new OutreachError('Este ID pertence a uma campanha de outro tipo.', 409)
  }

  const existingContacts = new Map<string, { campaign_id: string; status: string }>()
  for (let i = 0; i < contacts.length; i += 50) {
    const { data, error } = await db.from('client_contacts').select('id, campaign_id, status')
      .in('id', contacts.slice(i, i + 50).map(c => c.id))
    check(error)
    for (const row of data ?? []) {
      if (row.campaign_id !== campaign.id) throw new OutreachError('Contato pertence a outra campanha.', 409)
      existingContacts.set(row.id, row)
    }
  }

  const row = mapRosCampaignRow({ ...campaign, totalContacts: contacts.length }, config)
  if (existing.data) {
    // Saving a draft from another tab cannot reopen an in-progress/completed campaign.
    delete row.status
    const { error } = await db.from('client_campaigns').update(row)
      .eq('id', campaign.id).eq('campaign_kind', 'ros')
    check(error)
  } else {
    // Insert intentionally rejects concurrent ID conflicts instead of overwriting their kind.
    const { error } = await db.from('client_campaigns').insert(row)
    check(error)
  }

  for (let i = 0; i < contacts.length; i += 50) {
    const batch = contacts.slice(i, i + 50)
    const { error } = await db.from('client_contacts').upsert(
      batch.map(c => mapContact(c, campaign.id)), { onConflict: 'id', ignoreDuplicates: true },
    )
    check(error)
    for (const contact of batch) {
      const saved = existingContacts.get(contact.id)
      if (!saved || saved.status === 'sent' || saved.status === 'sending') continue
      const { error: updateError } = await db.from('client_contacts').update(mapContact(contact, campaign.id))
        .eq('id', contact.id).eq('campaign_id', campaign.id)
        .in('status', ['pending', 'generating', 'ready', 'approved', 'failed'])
      check(updateError)
    }
  }
}

export async function claimRosContact(db: SupabaseClient, campaignId: string, contactId: string): Promise<boolean> {
  if (!await getRosCampaign(db, campaignId)) return false
  const { data, error } = await db.from('client_contacts').update({ status: 'sending', error_message: null })
    .eq('id', contactId).eq('campaign_id', campaignId).in('status', [...sendableStatuses]).select('id')
  check(error)
  return data?.length === 1
}

async function contactCampaign(db: SupabaseClient, contactId: string): Promise<string> {
  const { data, error } = await db.from('client_contacts').select('campaign_id').eq('id', contactId).maybeSingle()
  check(error)
  if (!data) throw new OutreachError('Contato não encontrado.', 404)
  await requireRosCampaign(db, data.campaign_id)
  return data.campaign_id
}

export async function markContactSent(db: SupabaseClient, contactId: string, messageId: string): Promise<void> {
  const campaignId = await contactCampaign(db, contactId)
  const { data, error } = await db.from('client_contacts').update({
    status: 'sent', message_id: messageId, sent_at: new Date().toISOString(), error_message: null,
  }).eq('id', contactId).eq('campaign_id', campaignId).eq('status', 'sending').select('id')
  check(error)
  if (data?.length !== 1) throw new OutreachError('O contato não estava reservado para envio.', 409)
}

export async function markContactFailed(db: SupabaseClient, contactId: string, message: string): Promise<void> {
  const campaignId = await contactCampaign(db, contactId)
  const { error } = await db.from('client_contacts').update({ status: 'failed', error_message: message })
    .eq('id', contactId).eq('campaign_id', campaignId).eq('status', 'sending')
  check(error)
}

export async function isEmailSuppressed(db: SupabaseClient, email: string): Promise<boolean> {
  const { data, error } = await db.from('email_suppressions').select('email')
    .eq('email', email.trim().toLowerCase()).maybeSingle()
  check(error)
  return !!data
}

export async function finalizeRosCampaign(db: SupabaseClient, campaignId: string) {
  await requireRosCampaign(db, campaignId)
  // Paginate to avoid truncating campaigns at PostgREST's default row limit.
  let sentCount = 0
  let failedCount = 0
  let hasSending = false
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('client_contacts').select('status').eq('campaign_id', campaignId)
      .order('id').range(offset, offset + 999)
    check(error)
    sentCount += (data ?? []).filter(c => c.status === 'sent').length
    failedCount += (data ?? []).filter(c => c.status === 'failed').length
    hasSending ||= (data ?? []).some(c => c.status === 'sending')
    if ((data?.length ?? 0) < 1000) break
  }
  const { error: updateError } = await db.from('client_campaigns').update({
    status: hasSending ? 'sending' : 'completed', sent_count: sentCount, failed_count: failedCount,
  }).eq('id', campaignId).eq('campaign_kind', 'ros')
  check(updateError)
  return { sentCount, failedCount }
}

export async function getRosEvents(db: SupabaseClient, campaignId: string) {
  await requireRosCampaign(db, campaignId)
  const { data, error } = await db.from('email_events').select('contact_id, event_type, received_at')
    .eq('campaign_id', campaignId).in('event_type', ['opened', 'clicked']).order('received_at', { ascending: true })
  check(error)
  const contactMap = new Map<string, { contactId: string; opened: boolean; clicked: boolean; openedAt?: string; clickedAt?: string }>()
  for (const row of data ?? []) {
    if (!row.contact_id) continue
    const entry = contactMap.get(row.contact_id) ?? { contactId: row.contact_id, opened: false, clicked: false }
    if (row.event_type === 'opened' && !entry.opened) { entry.opened = true; entry.openedAt = row.received_at }
    if (row.event_type === 'clicked' && !entry.clicked) { entry.clicked = true; entry.clickedAt = row.received_at }
    contactMap.set(row.contact_id, entry)
  }
  const contacts = Array.from(contactMap.values())
  return { campaignId, totalOpened: contacts.filter(c => c.opened).length, totalClicked: contacts.filter(c => c.clicked).length, contacts }
}
