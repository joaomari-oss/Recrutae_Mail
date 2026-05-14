import { supabase } from './supabase'
import { ClientContact, ClientCampaign, ClientCampaignConfig } from './clientTypes'

// ── Create a full campaign with all contacts ──────────────────────────────────
export async function saveCampaignToSupabase(
  campaign: ClientCampaign,
  contacts: ClientContact[],
  config: ClientCampaignConfig
): Promise<void> {
  if (!supabase) return

  const { error: campErr } = await supabase.from('client_campaigns').insert({
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
  })

  if (campErr) {
    console.error('[supabase] Error saving campaign:', campErr.message)
    return
  }

  if (!contacts.length) return

  const { error: contsErr } = await supabase.from('client_contacts').insert(
    contacts.map((c) => ({
      id: c.id,
      campaign_id: campaign.id,
      name: c.fullName,
      first_name: c.firstName,
      email: c.email,
      company: c.company || null,
      position: c.position || null,
      status: c.status,
    }))
  )

  if (contsErr) {
    console.error('[supabase] Error saving contacts:', contsErr.message)
  }
}

// ── Update a single contact ───────────────────────────────────────────────────
export async function updateContactInSupabase(
  contactId: string,
  updates: {
    status?: string
    generated_subject?: string
    generated_body?: string
    edited_subject?: string
    edited_body?: string
    message_id?: string
    error_message?: string
    sent_at?: string
  }
): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('client_contacts')
    .update(updates)
    .eq('id', contactId)
  if (error) console.error('[supabase] updateContact:', error.message)
}

// ── Update campaign status/counts ─────────────────────────────────────────────
export async function updateCampaignInSupabase(
  campaignId: string,
  updates: {
    status?: string
    sent_count?: number
    failed_count?: number
    contact_count?: number
  }
): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('client_campaigns')
    .update(updates)
    .eq('id', campaignId)
  if (error) console.error('[supabase] updateCampaign:', error.message)
}

// ── Load all campaigns (for history page) ────────────────────────────────────
export async function loadCampaignsFromSupabase(): Promise<DbCampaignRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('client_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[supabase] loadCampaigns:', error.message)
    return []
  }
  return data ?? []
}

// ── Load contacts for a campaign ─────────────────────────────────────────────
export async function loadContactsFromSupabase(campaignId: string): Promise<DbContactRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('client_contacts')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[supabase] loadContacts:', error.message)
    return []
  }
  return data ?? []
}

export type DbCampaignRow = {
  id: string
  name: string
  recruiter_name: string
  recruiter_email: string
  segment: string
  key_points: string | null
  status: string
  contact_count: number
  sent_count: number
  failed_count: number
  created_at: string
  updated_at: string
}

export type DbContactRow = {
  id: string
  campaign_id: string
  name: string | null
  first_name: string | null
  email: string
  company: string | null
  position: string | null
  status: string
  generated_subject: string | null
  generated_body: string | null
  edited_subject: string | null
  edited_body: string | null
  message_id: string | null
  error_message: string | null
  sent_at: string | null
}
