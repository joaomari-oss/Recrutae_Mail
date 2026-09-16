import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  claimRosContact, finalizeRosCampaign, getOrCreateRosSendAttempt, getRosEvents, isEmailSuppressed,
  mapRosCampaignRow, markContactFailed, markContactSent, persistRosGeneratedEmail, saveRosCampaign, sendableStatuses,
} from '@/lib/outreach/repository'
import type { RosCampaignConfig, RosContact } from '@/lib/rosTypes'

const config: RosCampaignConfig = {
  recruiterName: 'Ana', recruiterRole: 'Comercial', recruiterEmail: 'contato@recrutae.com.br',
  replyTo: 'ana@recrutae.com.br', recruiterLinkedin: 'https://linkedin.com/in/ana',
  recruiterWhatsapp: '5511999999999', subjectTemplate: 'Assunto', emailTemplate: 'Corpo',
  varySubject: false, variationPercent: 6,
}
const campaign = { id: 'camp-1', name: 'ROS', status: 'draft' as const, totalContacts: 1 }
const contact: RosContact = {
  id: 'person-1', firstName: 'João', lastName: 'Silva', fullName: 'João Silva',
  email: 'joao@example.com', company: 'Empresa', position: 'CEO', status: 'approved',
  generatedSubject: 'Oi', generatedBody: 'Texto', editedSubject: '', editedBody: '', sendAttempts: 0,
}

// Keep the real Supabase query builder; replace only the external HTTP boundary.
function database(responses: Array<unknown | { failure: string }>) {
  const requests: Array<{ url: URL; method: string; body: any }> = []
  const db = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: crypto.randomUUID() },
    global: { fetch: async (input, init) => {
      requests.push({ url: new URL(String(input)), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null })
      const result = responses.shift()
      if (result === undefined) throw new Error('Unexpected database request')
      const failure = result && typeof result === 'object' && 'failure' in result
      return new Response(JSON.stringify(failure ? { message: result.failure, code: 'XX000' } : result), {
        status: failure ? 500 : 200, headers: { 'Content-Type': 'application/json' },
      })
    } },
  })
  return { db, requests }
}

describe('persistência ROS', () => {
  it('só permite reserva partindo de approved ou failed', () => {
    expect(sendableStatuses).toEqual(['approved', 'failed'])
  })

  it('mapeia o discriminador e todos os campos da assinatura e mensagem', () => {
    expect(mapRosCampaignRow(campaign, config)).toMatchObject({
      campaign_kind: 'ros', recruiter_name: 'Ana', recruiter_role: 'Comercial',
      recruiter_email: 'contato@recrutae.com.br', reply_to: 'ana@recrutae.com.br',
      recruiter_linkedin: 'https://linkedin.com/in/ana', recruiter_whatsapp: '5511999999999',
      subject_template: 'Assunto', key_points: 'Corpo', vary_subject: false, variation_percent: 6,
    })
  })

  it('reserva somente contato approved/failed pertencente à campanha ROS', async () => {
    const { db, requests } = database([{ id: 'camp-1' }, [{ id: 'person-1' }]])
    expect(await claimRosContact(db, 'camp-1', 'person-1')).toBe(true)
    expect(requests[0].url.searchParams.get('campaign_kind')).toBe('eq.ros')
    expect(requests[1].url.searchParams.get('campaign_id')).toBe('eq.camp-1')
    expect(requests[1].url.searchParams.get('id')).toBe('eq.person-1')
    expect(requests[1].url.searchParams.get('status')).toBe('in.(approved,failed)')
    expect(requests[1].body.status).toBe('sending')
  })

  it('não reserva campanhas de clientes nem informa sucesso quando nenhuma linha foi reservada', async () => {
    const wrongKind = database([null])
    expect(await claimRosContact(wrongKind.db, 'clients-1', 'person-1')).toBe(false)
    expect(wrongKind.requests).toHaveLength(1)
    const alreadySent = database([{ id: 'camp-1' }, [], { id: 'person-1', status: 'sent' }])
    expect(await claimRosContact(alreadySent.db, 'camp-1', 'person-1')).toBe(false)
  })

  it('retoma sending somente quando o payload idempotente já foi persistido', async () => {
    const resumable = database([
      { id: 'camp-1' }, [],
      { id: 'person-1', status: 'sending' },
      { contact_id: 'person-1' },
    ])
    expect(await claimRosContact(resumable.db, 'camp-1', 'person-1')).toBe(true)

    const notPrepared = database([
      { id: 'camp-1' }, [],
      { id: 'person-1', status: 'sending' },
      null,
    ])
    expect(await claimRosContact(notPrepared.db, 'camp-1', 'person-1')).toBe(false)
  })

  it('persiste o payload serializado uma vez e reutiliza exatamente o original', async () => {
    const original = '{"from":"a","headers":{"List-Unsubscribe":"<token-1>"}}'
    const first = database([
      { id: 'camp-1' },
      { id: 'person-1', status: 'sending' },
      null,
      [{ payload: original, idempotency_key: 'ros/camp-1/person-1' }],
    ])
    expect(await getOrCreateRosSendAttempt(
      first.db, 'camp-1', 'person-1', original, 'ros/camp-1/person-1',
    )).toEqual({ payload: original, idempotencyKey: 'ros/camp-1/person-1' })
    const insert = first.requests.find(request => request.method === 'POST')!
    expect(insert.url.pathname).toContain('ros_send_attempts')
    expect(insert.body).toMatchObject({
      campaign_id: 'camp-1', contact_id: 'person-1', payload: original,
      idempotency_key: 'ros/camp-1/person-1',
    })

    const retry = database([
      { id: 'camp-1' },
      { id: 'person-1', status: 'sending' },
      { payload: original, idempotency_key: 'ros/camp-1/person-1' },
    ])
    expect(await getOrCreateRosSendAttempt(
      retry.db, 'camp-1', 'person-1', '{"changed":true}', 'changed-key',
    )).toEqual({ payload: original, idempotencyKey: 'ros/camp-1/person-1' })
    expect(retry.requests.some(request => request.method === 'POST')).toBe(false)
    expect(retry.requests.filter(request => request.url.pathname.includes('client_contacts'))
      .every(request => !request.url.searchParams.get('select')?.includes('send_payload'))).toBe(true)
  })

  it('propaga erros de reserva em vez de continuar o envio', async () => {
    const { db } = database([{ id: 'camp-1' }, { failure: 'database offline' }])
    await expect(claimRosContact(db, 'camp-1', 'person-1')).rejects.toThrow('database offline')
  })

  it('recusa salvar sobre o ID de uma campanha de clientes', async () => {
    const { db, requests } = database([{ id: 'camp-1', campaign_kind: 'clients' }])
    await expect(saveRosCampaign(db, campaign, config, [contact])).rejects.toThrow()
    expect(requests.every(r => r.method === 'GET')).toBe(true)
  })

  it('salva contatos novos em lotes de 50 sem sobrescrever conflitos de ID', async () => {
    const contacts = Array.from({ length: 51 }, (_, i) => ({ ...contact, id: `person-${i}`, email: `p${i}@example.com` }))
    contacts[0] = {
      ...contacts[0],
      status: 'sent',
      resendMessageId: 'resend-1',
      sentAt: '2026-09-15T10:00:00.000Z',
      errorMessage: 'erro antigo',
    }
    const { db, requests } = database([null, [], [], [], [], []])
    await saveRosCampaign(db, { ...campaign, totalContacts: 51 }, config, contacts)
    const batches = requests.filter(r => r.method === 'POST' && r.url.pathname.endsWith('client_contacts'))
    expect(batches.map(r => r.body.length)).toEqual([50, 1])
    expect(batches[0].body[0]).toMatchObject({ campaign_id: 'camp-1', status: 'sent', generated_subject: 'Oi', generated_body: 'Texto' })
    expect(batches[0].body[0]).toMatchObject({
      message_id: 'resend-1', sent_at: '2026-09-15T10:00:00.000Z', error_message: 'erro antigo',
    })
  })

  it('não regride contatos enviados quando o navegador salva dados antigos', async () => {
    const { db, requests } = database([
      { id: 'camp-1', campaign_kind: 'ros', status: 'completed' },
      [{ id: 'person-1', campaign_id: 'camp-1', status: 'sent' }], [], [],
    ])
    await saveRosCampaign(db, campaign, config, [contact])
    expect(requests.filter(r => r.method === 'PATCH' && r.url.pathname.endsWith('client_contacts'))).toHaveLength(0)
    const update = requests.find(r => r.method === 'PATCH')!
    expect(update.url.searchParams.get('campaign_kind')).toBe('eq.ros')
    expect(update.body.status).toBeUndefined()
  })

  it('permite a progressão persistida de campanha de draft para ready', async () => {
    const { db, requests } = database([
      { id: 'camp-1', campaign_kind: 'ros', status: 'draft' }, [], [{ id: 'camp-1' }], [],
    ])
    await saveRosCampaign(db, { ...campaign, status: 'ready' }, config, [contact])
    const update = requests.find(r => r.method === 'PATCH' && r.url.pathname.endsWith('client_campaigns'))!
    expect(update.body.status).toBe('ready')
  })

  it('não permite que leitura stale em draft sobrescreva sending com ready', async () => {
    const { db, requests } = database([
      // The initial lookup sees draft, but another writer advances it before our PATCH.
      { id: 'camp-1', campaign_kind: 'ros', status: 'draft' }, [], [], [], [],
    ])
    await saveRosCampaign(db, { ...campaign, status: 'ready' }, config, [contact])
    const updates = requests.filter(r => r.method === 'PATCH' && r.url.pathname.endsWith('client_campaigns'))
    expect(updates).toHaveLength(2)
    expect(updates[0].body.status).toBe('ready')
    expect(updates[0].url.searchParams.get('status')).toBe('in.(draft,generating,ready)')
    expect(updates[1].body.status).toBeUndefined()
    expect(updates[1].url.searchParams.get('status')).toBeNull()
  })

  it('não regride campanha sending ou completed para draft em salvamento antigo', async () => {
    for (const status of ['sending', 'completed']) {
      const { db, requests } = database([
        { id: 'camp-1', campaign_kind: 'ros', status }, [], [], [],
      ])
      await saveRosCampaign(db, campaign, config, [contact])
      const update = requests.find(r => r.method === 'PATCH' && r.url.pathname.endsWith('client_campaigns'))!
      expect(update.body.status).toBeUndefined()
    }
  })

  it('recusa contatos pertencentes a outra campanha antes de qualquer escrita', async () => {
    const { db, requests } = database([null, [{ id: 'person-1', campaign_id: 'other', status: 'pending' }]])
    await expect(saveRosCampaign(db, campaign, config, [contact])).rejects.toThrow()
    expect(requests.every(r => r.method === 'GET')).toBe(true)
  })

  it('finaliza usando contadores persistidos em vez dos contadores do navegador', async () => {
    const { db, requests } = database([{ id: 'camp-1' }, [{ status: 'sent' }, { status: 'failed' }, { status: 'sent' }], []])
    expect(await finalizeRosCampaign(db, 'camp-1')).toEqual({ sentCount: 2, failedCount: 1 })
    expect(requests[2].body).toMatchObject({ status: 'completed', sent_count: 2, failed_count: 1 })
    expect(requests[2].url.searchParams.get('campaign_kind')).toBe('eq.ros')
  })

  it('conta campanhas com mais de mil contatos e mantém sending enquanto há reservas ativas', async () => {
    const { db, requests } = database([{ id: 'camp-1' }, Array.from({ length: 1000 }, () => ({ status: 'sent' })), [{ status: 'sending' }], []])
    expect(await finalizeRosCampaign(db, 'camp-1')).toEqual({ sentCount: 1000, failedCount: 0 })
    expect(requests[3].body.status).toBe('sending')
  })

  it('consolida eventos únicos de contatos e valida o tipo da campanha', async () => {
    const { db } = database([{ id: 'camp-1' }, [
      { contact_id: 'person-1', event_type: 'opened', received_at: '2026-09-01' },
      { contact_id: 'person-1', event_type: 'opened', received_at: '2026-09-02' },
      { contact_id: 'person-1', event_type: 'clicked', received_at: '2026-09-03' },
    ]])
    expect(await getRosEvents(db, 'camp-1')).toEqual({ campaignId: 'camp-1', totalDelivered: 0, totalOpened: 1, totalClicked: 1,
      contacts: [{ contactId: 'person-1', delivered: false, opened: true, clicked: true, openedAt: '2026-09-01', clickedAt: '2026-09-03' }] })
    await expect(getRosEvents(database([null]).db, 'clients-1')).rejects.toThrow()
  })

  it('pagina eventos com ordenação estável para incluir evento após a primeira página', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `event-${index}`, contact_id: `person-${index}`, event_type: 'opened', received_at: '2026-09-01',
    }))
    const { db, requests } = database([{ id: 'camp-1' }, firstPage, [
      { id: 'event-late', contact_id: 'person-late', event_type: 'clicked', received_at: '2026-09-02' },
    ]])
    const summary = await getRosEvents(db, 'camp-1')
    expect(summary.totalOpened).toBe(1000)
    expect(summary.totalClicked).toBe(1)
    expect(summary.contacts).toContainEqual(expect.objectContaining({ contactId: 'person-late', clicked: true }))
    expect(requests[1].url.searchParams.get('order')).toBe('received_at.asc,id.asc')
    expect(requests[2].url.searchParams.get('offset')).toBe('1000')
  })

  it('persiste geração apenas para campanha ROS e contatos que não estão sent ou sending', async () => {
    const wrongKind = database([null])
    expect(await persistRosGeneratedEmail(wrongKind.db, 'clients-1', 'person-1', 'Assunto', 'Corpo')).toBe(false)
    expect(wrongKind.requests).toHaveLength(1)

    const { db, requests } = database([{ id: 'camp-1' }, [{ id: 'person-1' }]])
    expect(await persistRosGeneratedEmail(db, 'camp-1', 'person-1', 'Assunto', 'Corpo')).toBe(true)
    expect(requests[1].url.searchParams.get('status')).toBe('in.(pending,generating,ready)')
    expect(requests[1].body.status).toBe('ready')

    const terminal = database([{ id: 'camp-1' }, []])
    expect(await persistRosGeneratedEmail(terminal.db, 'camp-1', 'person-1', 'Assunto', 'Corpo')).toBe(false)
    expect(terminal.requests[1].url.searchParams.get('status')).toBe('in.(pending,generating,ready)')
  })

  it('grava resultado somente de contatos ROS em envio e não regride sent para failed', async () => {
    const success = database([{ campaign_id: 'camp-1' }, { id: 'camp-1' }, [{ id: 'person-1' }]])
    await markContactSent(success.db, 'person-1', 'resend-1')
    expect(success.requests[2].body).toMatchObject({ status: 'sent', message_id: 'resend-1', error_message: null })
    expect(success.requests[2].url.searchParams.get('status')).toBe('eq.sending')
    const fail = database([{ campaign_id: 'camp-1' }, { id: 'camp-1' }, []])
    await markContactFailed(fail.db, 'person-1', 'timeout')
    expect(fail.requests[2].url.searchParams.get('status')).toBe('eq.sending')
  })

  it('normaliza e-mail ao consultar supressão e falha fechado em erro de banco', async () => {
    const { db, requests } = database([{ email: 'ana@example.com' }])
    expect(await isEmailSuppressed(db, ' Ana@Example.com ')).toBe(true)
    expect(requests[0].url.searchParams.get('email')).toBe('eq.ana@example.com')
    await expect(isEmailSuppressed(database([{ failure: 'offline' }]).db, 'a@b.com')).rejects.toThrow('offline')
  })
})

describe('isolamento de Clientes', () => {
  it('mapeia campanhas de Clientes com o discriminador explícito', async () => {
    const { mapClientCampaignRow } = await import('@/lib/outreach/repository')
    const config = {
      recruiterName: 'Ana', recruiterEmail: 'ana@recrutae.com.br', segment: 'Tecnologia',
      emailTemplate: 'Corpo',
    }

    expect(mapClientCampaignRow(
      { id: 'c1', name: 'Clientes', status: 'draft', totalContacts: 4 },
      config,
    )).toMatchObject({
      id: 'c1', campaign_kind: 'clients', name: 'Clientes',
      recruiter_email: 'ana@recrutae.com.br', segment: 'Tecnologia', contact_count: 4,
    })
  })

  it('a consulta de Clientes exclui campanhas ROS', async () => {
    const { clientCampaignKindFilter } = await import('@/lib/outreach/repository')
    expect(clientCampaignKindFilter).toEqual({ column: 'campaign_kind', value: 'clients' })
  })

  it('campanha sem configuração não perde o discriminador', async () => {
    const { mapClientCampaignRow } = await import('@/lib/outreach/repository')
    expect(mapClientCampaignRow({ id: 'c2', name: 'Antiga', status: 'completed', totalContacts: 0 }, {}))
      .toMatchObject({ campaign_kind: 'clients', recruiter_name: '', segment: '', key_points: null })
  })
})
