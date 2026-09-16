// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createUnsubscribeToken, verifyUnsubscribeToken } from '@/lib/outreach/unsubscribe'

const database = vi.hoisted(() => {
  const suppressions = new Map<string, Record<string, unknown>>()
  const events: Record<string, unknown>[] = []

  return {
    suppressions,
    events,
    from(table: string) {
      if (table === 'email_suppressions') {
        return {
          async upsert(row: Record<string, unknown>) {
            suppressions.set(String(row.email), row)
            return { error: null }
          },
        }
      }

      if (table === 'email_events') {
        return {
          select() {
            const filters: Array<[string, unknown]> = []
            const query = {
              eq(key: string, value: unknown) {
                filters.push([key, value])
                return query
              },
              async maybeSingle() {
                const match = events.find((event) => filters.every(([key, value]) => event[key] === value))
                return { data: match ? { id: 'existing-event' } : null, error: null }
              },
            }
            return query
          },
          async insert(row: Record<string, unknown>) {
            events.push(row)
            return { error: null }
          },
        }
      }

      throw new Error(`Tabela inesperada: ${table}`)
    },
  }
})

vi.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: database }))

const { POST: unsubscribePost } = await import('@/app/api/unsubscribe/route')
const { POST: webhookPost } = await import('@/app/api/webhooks/resend/route')

describe('unsubscribe token', () => {
  const secret = '12345678901234567890123456789012'

  it('normaliza email e preserva a finalidade de descadastro', async () => {
    const token = await createUnsubscribeToken({
      email: 'ANA@EXAMPLE.COM',
      campaignId: 'camp-1',
    }, secret)

    await expect(verifyUnsubscribeToken(token, secret)).resolves.toMatchObject({
      email: 'ana@example.com',
      campaignId: 'camp-1',
      purpose: 'unsubscribe',
    })
  })

  it('rejeita uma assinatura feita com segredo diferente', async () => {
    const token = await createUnsubscribeToken({ email: 'ana@example.com', campaignId: 'camp-1' }, secret)

    await expect(verifyUnsubscribeToken(token, 'abcdefghijklmnopqrstuvwxyz123456')).rejects.toThrow()
  })

  it('rejeita segredo curto para não assinar tokens previsíveis', async () => {
    await expect(createUnsubscribeToken({ email: 'ana@example.com', campaignId: 'camp-1' }, 'curto'))
      .rejects.toThrow('pelo menos 32')
  })
})

describe('public unsubscribe endpoint', () => {
  const secret = '12345678901234567890123456789012'

  beforeEach(() => {
    database.suppressions.clear()
    database.events.length = 0
    process.env.UNSUBSCRIBE_SIGNING_SECRET = secret
    process.env.RESEND_WEBHOOK_SECRET = 'webhook-secret-que-nao-vaza'
  })

  it('persiste um único descadastro normalizado quando o mesmo token é reenviado', async () => {
    const token = await createUnsubscribeToken({ email: 'ANA@EXAMPLE.COM', campaignId: 'camp-1' }, secret)
    const url = `https://mail.recrutae.com.br/api/unsubscribe?token=${encodeURIComponent(token)}`

    const first = await unsubscribePost(new NextRequest(url, { method: 'POST' }))
    const retry = await unsubscribePost(new NextRequest(url, { method: 'POST' }))

    expect(first.status).toBe(200)
    expect(retry.status).toBe(200)
    expect(database.suppressions).toEqual(new Map([
      ['ana@example.com', {
        email: 'ana@example.com', reason: 'unsubscribe', source: 'list_unsubscribe', message_id: null,
      }],
    ]))
  })

  it('recusa token adulterado sem criar supressão', async () => {
    const token = await createUnsubscribeToken({ email: 'ana@example.com', campaignId: 'camp-1' }, secret)
    const response = await unsubscribePost(new NextRequest(
      `https://mail.recrutae.com.br/api/unsubscribe?token=${encodeURIComponent(token.slice(0, -1) + 'x')}`,
      { method: 'POST' },
    ))

    expect(response.status).toBe(400)
    expect(database.suppressions.size).toBe(0)
  })
})

describe('Resend webhook', () => {
  beforeEach(() => {
    database.suppressions.clear()
    database.events.length = 0
    process.env.UNSUBSCRIBE_SIGNING_SECRET = '12345678901234567890123456789012'
    process.env.RESEND_WEBHOOK_SECRET = 'webhook-secret-que-nao-vaza'
  })

  it('retorna indisponível quando o segredo do webhook não está configurado', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    const response = await webhookPost(new NextRequest(
      'https://mail.recrutae.com.br/api/webhooks/resend?secret=qualquer',
      { method: 'POST', body: JSON.stringify({ type: 'email.bounced', data: { email_id: 'msg-1', to: ['ana@example.com'] } }) },
    ))

    expect(response.status).toBe(503)
    expect(database.events).toHaveLength(0)
  })

  it('recusa segredo inválido antes de persistir um bounce', async () => {
    const response = await webhookPost(new NextRequest(
      'https://mail.recrutae.com.br/api/webhooks/resend?secret=invalido',
      { method: 'POST', body: JSON.stringify({ type: 'email.bounced', data: { email_id: 'msg-1', to: ['ana@example.com'] } }) },
    ))

    expect(response.status).toBe(401)
    expect(database.events).toHaveLength(0)
    expect(database.suppressions.size).toBe(0)
  })

  it('suprime bounce por e-mail normalizado e preserva seu evento', async () => {
    const response = await webhookPost(new NextRequest(
      'https://mail.recrutae.com.br/api/webhooks/resend?secret=webhook-secret-que-nao-vaza',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'email.bounced',
          data: { email_id: 'msg-1', to: ['ANA@EXAMPLE.COM'], tags: { campaign_id: 'camp-1', contact_id: 'contact-1' } },
        }),
      },
    ))

    expect(response.status).toBe(200)
    expect(database.suppressions.get('ana@example.com')).toMatchObject({
      reason: 'bounce', source: 'resend_webhook', message_id: 'msg-1',
    })
    expect(database.events).toEqual([{
      message_id: 'msg-1', campaign_id: 'camp-1', contact_id: 'contact-1',
      recipient_email: 'ana@example.com', event_type: 'bounced',
    }])
  })

  it('aceita reentrega de bounce sem duplicar o evento rastreado', async () => {
    const url = 'https://mail.recrutae.com.br/api/webhooks/resend?secret=webhook-secret-que-nao-vaza'
    const init = {
      method: 'POST',
      body: JSON.stringify({
        type: 'email.bounced',
        data: { email_id: 'msg-repetida', to: ['ana@example.com'] },
      }),
    }

    const first = await webhookPost(new NextRequest(url, init))
    const replay = await webhookPost(new NextRequest(url, init))

    expect(first.status).toBe(200)
    expect(replay.status).toBe(200)
    expect(database.events).toHaveLength(1)
  })
})
