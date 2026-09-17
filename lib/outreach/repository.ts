import type { SupabaseClient } from '@supabase/supabase-js'
import type { RosCampaign, RosCampaignConfig, RosContact } from '@/lib/rosTypes'

export const sendableStatuses = ['approved', 'failed'] as const
type CampaignInput = Pick<RosCampaign, 'id' | 'name' | 'status' | 'totalContacts'>

// Campaign saves can arrive from multiple browser tabs. Status is monotonic:
// a later lifecycle state may be persisted, but a stale draft cannot reopen a
// campaign that is generating, ready, sending or completed.
const campaignStatusRank: Record<RosCampaign['status'], number> = {
  draft: 0,
  generating: 1,
  ready: 2,
  sending: 3,
  completed: 4,
}

function canPersistCampaignStatus(current: unknown, next: RosCampaign['status']): boolean {
  if (typeof current !== 'string' || !(current in campaignStatusRank)) return false
  return campaignStatusRank[next] >= campaignStatusRank[current as RosCampaign['status']]
}

function statusesNotAheadOf(next: RosCampaign['status']): RosCampaign['status'][] {
  return (Object.keys(campaignStatusRank) as RosCampaign['status'][])
    .filter(status => campaignStatusRank[status] <= campaignStatusRank[next])
}

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
    if (canPersistCampaignStatus(existing.data.status, campaign.status)) {
      // The status predicate is the concurrency guard. Even if the SELECT
      // above observed draft, this update cannot overwrite a later state.
      const { data, error } = await db.from('client_campaigns').update(row)
        .eq('id', campaign.id).eq('campaign_kind', 'ros')
        .in('status', statusesNotAheadOf(campaign.status)).select('id')
      check(error)
      if (data?.length !== 1) {
        // A concurrent writer advanced status. Preserve non-status edits while
        // intentionally leaving the terminal/in-progress state untouched.
        const staleRow = { ...row }
        delete staleRow.status
        const { error: staleError } = await db.from('client_campaigns').update(staleRow)
          .eq('id', campaign.id).eq('campaign_kind', 'ros')
        check(staleError)
      }
    } else {
      const staleRow = { ...row }
      delete staleRow.status
      const { error } = await db.from('client_campaigns').update(staleRow)
        .eq('id', campaign.id).eq('campaign_kind', 'ros')
      check(error)
    }
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
  if (data?.length === 1) return true

  // A retry can resume an uncertain post-send state only after the exact
  // payload has been durably prepared. Inside Resend's idempotency window the
  // replay is deduped; past it the attempt is renewed instead of replayed.
  const { data: existing, error: existingError } = await db.from('client_contacts')
    .select('id, status').eq('id', contactId).eq('campaign_id', campaignId).maybeSingle()
  check(existingError)
  if (existing?.status !== 'sending') return false

  const { data: attempt, error: attemptError } = await db.from('ros_send_attempts')
    .select('contact_id').eq('campaign_id', campaignId).eq('contact_id', contactId).maybeSingle()
  check(attemptError)
  return !!attempt
}

export type RosSendAttempt = { payload: string; idempotencyKey: string }

function mapRosSendAttempt(row: Record<string, unknown> | null): RosSendAttempt | null {
  if (!row || typeof row.payload !== 'string' || !row.payload ||
    typeof row.idempotency_key !== 'string' || !row.idempotency_key) return null
  return { payload: row.payload, idempotencyKey: row.idempotency_key }
}

export async function getRosContactEmail(
  db: SupabaseClient,
  campaignId: string,
  contactId: string,
): Promise<string> {
  await requireRosCampaign(db, campaignId)
  const { data, error } = await db.from('client_contacts').select('email')
    .eq('id', contactId).eq('campaign_id', campaignId).maybeSingle()
  check(error)
  if (!data || typeof data.email !== 'string') throw new OutreachError('Contato não encontrado.', 404)
  return data.email
}

/**
 * Janela de idempotência do Resend. Depois dela a chave não agrupa mais nada,
 * então congelar o payload deixa de proteger contra duplicata e passa a
 * garantir que o texto velho seja reenviado.
 */
const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000

function isAttemptExpired(createdAt: unknown): boolean {
  if (typeof createdAt !== 'string') return false
  const created = Date.parse(createdAt)
  return Number.isFinite(created) && Date.now() - created > ATTEMPT_RETENTION_MS
}

export async function getOrCreateRosSendAttempt(
  db: SupabaseClient,
  campaignId: string,
  contactId: string,
  payload: string,
  idempotencyKey: string,
): Promise<RosSendAttempt> {
  await requireRosCampaign(db, campaignId)
  const { data: contact, error } = await db.from('client_contacts').select('id, status')
    .eq('id', contactId).eq('campaign_id', campaignId).maybeSingle()
  check(error)
  if (!contact) throw new OutreachError('Contato não encontrado.', 404)
  if (contact.status !== 'sending') throw new OutreachError('O contato não está reservado para envio.', 409)

  const { data: existing, error: existingError } = await db.from('ros_send_attempts')
    .select('payload, idempotency_key, created_at').eq('campaign_id', campaignId).eq('contact_id', contactId).maybeSingle()
  check(existingError)
  const existingAttempt = mapRosSendAttempt(existing as Record<string, unknown> | null)
  if (existingAttempt && !isAttemptExpired((existing as Record<string, unknown> | null)?.created_at)) {
    return existingAttempt
  }

  if (existingAttempt) {
    // Fora da janela de retenção do Resend a chave antiga já não agrupa nada:
    // repetir aqueles bytes enviaria de novo o texto velho e contaria como um
    // e-mail novo. A tentativa é renovada com o conteúdo atual e chave própria.
    const renewedKey = `${idempotencyKey}/r${Date.now()}`
    const { data: renewed, error: renewError } = await db.from('ros_send_attempts')
      .update({ payload, idempotency_key: renewedKey, updated_at: new Date().toISOString() })
      .eq('campaign_id', campaignId).eq('contact_id', contactId)
      .select('payload, idempotency_key')
    check(renewError)
    const renewedAttempt = mapRosSendAttempt((renewed?.[0] ?? null) as Record<string, unknown> | null)
    if (renewedAttempt) return renewedAttempt
  }

  const { data: stored, error: storeError } = await db.from('ros_send_attempts').upsert({
    campaign_id: campaignId,
    contact_id: contactId,
    payload,
    idempotency_key: idempotencyKey,
  }, { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true }).select('payload, idempotency_key')
  check(storeError)
  const storedAttempt = mapRosSendAttempt((stored?.[0] ?? null) as Record<string, unknown> | null)
  if (storedAttempt) return storedAttempt

  // ON CONFLICT DO NOTHING is the compare-and-set: a concurrent writer can
  // win, but its original serialized bytes and key are always canonical.
  const { data: raced, error: racedError } = await db.from('ros_send_attempts')
    .select('payload, idempotency_key').eq('campaign_id', campaignId).eq('contact_id', contactId).maybeSingle()
  check(racedError)
  const racedAttempt = mapRosSendAttempt(raced as Record<string, unknown> | null)
  if (racedAttempt) return racedAttempt
  throw new OutreachError('Não foi possível persistir o payload idempotente.', 503)
}

export async function persistRosGeneratedEmail(
  db: SupabaseClient | null,
  campaignId: unknown,
  contactId: unknown,
  subject: string,
  body: string,
): Promise<boolean> {
  if (!db || typeof campaignId !== 'string' || !campaignId.trim() || typeof contactId !== 'string' || !contactId.trim()) {
    return false
  }
  if (!await getRosCampaign(db, campaignId)) return false
  const { data, error } = await db.from('client_contacts').update({
    status: 'ready',
    generated_subject: subject,
    generated_body: body,
    edited_subject: subject,
    edited_body: body,
  }).eq('id', contactId).eq('campaign_id', campaignId)
    .in('status', ['pending', 'generating', 'ready']).select('id')
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

type RosContactEventSummary = {
  contactId: string
  delivered: boolean
  opened: boolean
  clicked: boolean
  openedAt?: string
  clickedAt?: string
}

export async function getRosEvents(db: SupabaseClient, campaignId: string) {
  await requireRosCampaign(db, campaignId)
  const contactMap = new Map<string, RosContactEventSummary>()

  // PostgREST applies a row cap. Paginate with a deterministic tie-breaker so
  // events sharing a timestamp are neither skipped nor double-counted.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('email_events').select('id, contact_id, event_type, received_at')
      .eq('campaign_id', campaignId).in('event_type', ['delivered', 'opened', 'clicked'])
      .order('received_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 999)
    check(error)
    for (const row of data ?? []) {
      if (!row.contact_id) continue
      const entry: RosContactEventSummary = contactMap.get(row.contact_id) ?? {
        contactId: row.contact_id, delivered: false, opened: false, clicked: false,
      }
      if (row.event_type === 'delivered') entry.delivered = true
      if (row.event_type === 'opened' && !entry.opened) { entry.opened = true; entry.openedAt = row.received_at }
      if (row.event_type === 'clicked' && !entry.clicked) { entry.clicked = true; entry.clickedAt = row.received_at }
      contactMap.set(row.contact_id, entry)
    }
    if ((data?.length ?? 0) < 1000) break
  }
  const contacts = Array.from(contactMap.values())
  return {
    campaignId,
    totalDelivered: contacts.filter(c => c.delivered).length,
    totalOpened: contacts.filter(c => c.opened).length,
    totalClicked: contacts.filter(c => c.clicked).length,
    contacts,
  }
}

/**
 * Campanhas ROS para o histórico.
 *
 * Só colunas de resumo: nada de corpo de e-mail, payload de envio ou chave
 * idempotente — esses ficam na tabela privada criada na tarefa 8.
 */
export async function listRosCampaigns(db: SupabaseClient) {
  const { data, error } = await db.from('client_campaigns')
    .select('id, name, status, contact_count, sent_count, failed_count, created_at, recruiter_name, recruiter_email')
    .eq('campaign_kind', 'ros')
    .order('created_at', { ascending: false })
    .limit(200)
  check(error)
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string) ?? '',
    status: (row.status as string) ?? 'draft',
    totalContacts: Number(row.contact_count ?? 0),
    sentCount: Number(row.sent_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    createdAt: (row.created_at as string) ?? '',
    recruiterName: (row.recruiter_name as string) ?? '',
    recruiterEmail: (row.recruiter_email as string) ?? '',
  }))
}

/** Situação de cada contato, para reconciliar a aba com o servidor. */
export async function listRosCampaignContactStatuses(db: SupabaseClient, campaignId: string) {
  await requireRosCampaign(db, campaignId)
  const rows: Array<{ id: string; status: string; sentAt?: string; messageId?: string; errorMessage?: string }> = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('client_contacts')
      .select('id, status, sent_at, message_id, error_message')
      .eq('campaign_id', campaignId).order('id').range(offset, offset + 999)
    check(error)
    for (const row of data ?? []) {
      rows.push({
        id: row.id as string,
        status: (row.status as string) ?? 'pending',
        sentAt: (row.sent_at as string) ?? undefined,
        messageId: (row.message_id as string) ?? undefined,
        errorMessage: (row.error_message as string) ?? undefined,
      })
    }
    if ((data?.length ?? 0) < 1000) break
  }
  return rows
}

/** Remove a campanha ROS e seus contatos. Nunca toca em campanhas de Clientes. */
export async function deleteRosCampaign(db: SupabaseClient, campaignId: string) {
  await requireRosCampaign(db, campaignId)
  const { error: contactsError } = await db.from('client_contacts').delete().eq('campaign_id', campaignId)
  check(contactsError)
  const { error } = await db.from('client_campaigns').delete()
    .eq('id', campaignId).eq('campaign_kind', 'ros')
  check(error)
}

/** Clientes e ROS dividem a tabela; toda leitura de Clientes passa por aqui. */
export const clientCampaignKindFilter = { column: 'campaign_kind', value: 'clients' } as const

export type ClientCampaignConfigInput = {
  recruiterName?: string
  recruiterEmail?: string
  segment?: string
  emailTemplate?: string
}

/**
 * Linha de campanha de Clientes com o discriminador explicito. Linhas antigas
 * ja chegam como `clients` pelo default da migracao, entao o filtro por tipo
 * nao esconde historico.
 */
export function mapClientCampaignRow(
  campaign: { id: string; name: string; status: string; totalContacts: number },
  config: ClientCampaignConfigInput,
): Record<string, unknown> {
  return {
    id: campaign.id,
    name: campaign.name,
    campaign_kind: 'clients',
    recruiter_name: config.recruiterName ?? '',
    recruiter_email: config.recruiterEmail ?? '',
    segment: config.segment ?? '',
    key_points: config.emailTemplate || null,
    status: campaign.status,
    contact_count: campaign.totalContacts,
    sent_count: 0,
    failed_count: 0,
  }
}

/** Situações de onde um contato ainda pode ser aprovado para envio. */
export const approvableStatuses = ['ready', 'failed', 'approved'] as const

export type RosApprovalResult = {
  approved: string[]
  /** Ids que o banco recusou — normalmente já enviados, ou de outra campanha. */
  rejected: string[]
}

/**
 * Grava a aprovação do recrutador no banco.
 *
 * Sem isto a aprovação existia só na aba, e `claimRosContact` recusava todo
 * envio porque o banco ainda dizia `ready` — a campanha inteira falhava com
 * "Contato não disponível para envio". `sent` continua terminal: quem já
 * recebeu não volta para a fila.
 */
export async function approveRosContacts(
  db: SupabaseClient,
  campaignId: string,
  contactIds: string[],
): Promise<RosApprovalResult> {
  await requireRosCampaign(db, campaignId)
  if (!contactIds.length) return { approved: [], rejected: [] }

  const approved: string[] = []
  // Em lotes: a lista de ids vai na URL do PostgREST e uma campanha grande
  // estouraria o limite de tamanho da requisição.
  for (let offset = 0; offset < contactIds.length; offset += 100) {
    const slice = contactIds.slice(offset, offset + 100)
    const { data, error } = await db.from('client_contacts')
      .update({ status: 'approved', error_message: null })
      .eq('campaign_id', campaignId)
      .in('id', slice)
      .in('status', [...approvableStatuses])
      .select('id')
    check(error)
    for (const row of data ?? []) approved.push(row.id as string)
  }

  const accepted = new Set(approved)
  return { approved, rejected: contactIds.filter((id) => !accepted.has(id)) }
}
