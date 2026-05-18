import { supabase } from './supabase'
import { ClientContact, ClientCampaign, ClientCampaignConfig } from './clientTypes'
import { Candidate, Campaign, CampaignConfig, CampaignStatus, CandidateStatus } from './types'

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

// ── Save campaign + all contacts when campaign config is submitted ────────────
export async function saveCampaignAndContacts(
  campaignId: string,
  campaignName: string,
  candidates: Candidate[],
  config: CampaignConfig
): Promise<void> {
  if (!supabase) return

  const { error: campErr } = await supabase.from('client_campaigns').upsert(
    {
      id: campaignId,
      name: campaignName,
      recruiter_name: config.recruiterName,
      recruiter_email: config.replyTo || '',
      segment: config.recruiterCompany || config.hiringCompany || '',
      key_points: config.jobDescription || null,
      status: 'generating',
      contact_count: candidates.length,
      sent_count: 0,
      failed_count: 0,
    },
    { onConflict: 'id' }
  )
  if (campErr) {
    console.error('[supabase] save campaign:', campErr.message)
    return
  }

  if (!candidates.length) return

  const { error: contErr } = await supabase.from('client_contacts').upsert(
    candidates.map((c) => ({
      id: c.id,
      campaign_id: campaignId,
      name: c.fullName,
      first_name: c.firstName,
      email: c.email,
      company: c.company || null,
      position: c.title || null,
      status: c.status,
    })),
    { onConflict: 'id' }
  )
  if (contErr) console.error('[supabase] save contacts:', contErr.message)
}

// ── Load all campaigns + contacts from Supabase for cross-device sync ─────────
export async function syncAllFromSupabase(): Promise<{
  campaigns: Campaign[]
  candidatesByCampaign: Record<string, Candidate[]>
  configMap: Record<string, Partial<CampaignConfig>>
}> {
  if (!supabase) return { campaigns: [], candidatesByCampaign: {}, configMap: {} }

  const { data: campRows, error: campErr } = await supabase
    .from('client_campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  if (campErr || !campRows?.length) return { campaigns: [], candidatesByCampaign: {}, configMap: {} }

  const campaigns: Campaign[] = campRows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    status: (row.status ?? 'completed') as CampaignStatus,
    totalCandidates: row.contact_count ?? 0,
    approvedCount: 0,
    sentCount: row.sent_count ?? 0,
    failedCount: row.failed_count ?? 0,
  }))

  const configMap: Record<string, Partial<CampaignConfig>> = {}
  for (const row of campRows) {
    configMap[row.id] = {
      recruiterName: row.recruiter_name ?? '',
      replyTo: row.recruiter_email ?? '',
      recruiterCompany: row.segment ?? '',
      jobDescription: row.key_points ?? '',
    }
  }

  // Load contacts in parallel (one query per campaign)
  const contactResults = await Promise.all(
    campRows.map((row) =>
      supabase!
        .from('client_contacts')
        .select('*')
        .eq('campaign_id', row.id)
    )
  )

  const candidatesByCampaign: Record<string, Candidate[]> = {}
  for (let i = 0; i < campRows.length; i++) {
    const { data, error } = contactResults[i]
    if (error || !data) continue
    candidatesByCampaign[campRows[i].id] = data.map((c) => ({
      id: c.id,
      firstName: c.first_name ?? '',
      lastName: '',
      fullName: c.name ?? c.email,
      title: c.position ?? '',
      company: c.company ?? '',
      email: c.email,
      linkedinUrl: '',
      status: (c.status ?? 'sent') as CandidateStatus,
      generatedSubject: c.generated_subject ?? '',
      generatedBody: c.generated_body ?? '',
      editedSubject: c.edited_subject ?? '',
      editedBody: c.edited_body ?? '',
      sentAt: c.sent_at ?? undefined,
      errorMessage: c.error_message ?? undefined,
      resendMessageId: c.message_id ?? undefined,
      sendAttempts: 0,
    }))
  }

  return { campaigns, candidatesByCampaign, configMap }
}

// ── Upsert campaign + contact after a send attempt (current app types) ────────
export async function upsertCandidateSent(
  campaignId: string,
  candidate: Candidate,
  campaign: Campaign | null | undefined,
  config: CampaignConfig | null | undefined,
  status: 'sent' | 'failed',
  messageId?: string,
  errorMessage?: string
): Promise<void> {
  if (!supabase) return

  const { error: campErr } = await supabase.from('client_campaigns').upsert(
    {
      id: campaignId,
      name: campaign?.name || 'Campanha',
      recruiter_name: config?.recruiterName || 'Recrutador',
      recruiter_email: config?.replyTo || '',
      segment: config?.recruiterCompany || config?.hiringCompany || 'Recrutaê',
      key_points: config?.jobDescription || null,
      status: campaign?.status || 'completed',
      contact_count: campaign?.totalCandidates || 0,
      sent_count: campaign?.sentCount || 0,
      failed_count: campaign?.failedCount || 0,
    },
    { onConflict: 'id' }
  )
  if (campErr) console.error('[supabase] upsert campaign:', campErr.message)

  const { error: contErr } = await supabase.from('client_contacts').upsert(
    {
      id: candidate.id,
      campaign_id: campaignId,
      name: candidate.fullName,
      first_name: candidate.firstName,
      email: candidate.email,
      company: candidate.company || null,
      position: candidate.title || null,
      status,
      generated_subject: candidate.generatedSubject || null,
      generated_body: candidate.generatedBody || null,
      edited_subject: candidate.editedSubject || null,
      edited_body: candidate.editedBody || null,
      message_id: messageId || null,
      error_message: errorMessage || null,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    },
    { onConflict: 'id' }
  )
  if (contErr) console.error('[supabase] upsert contact:', contErr.message)
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
