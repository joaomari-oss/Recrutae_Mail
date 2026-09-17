// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { SignJWT } from 'jose'
import { createUnsubscribeToken, verifyUnsubscribeToken } from '@/lib/outreach/unsubscribe'

const database = vi.hoisted(() => {
  const suppressions = new Map<string, Record<string, unknown>>()
  const events: Record<string, unknown>[] = []

  const state = {
    suppressions,
    events,
    failNextEventInsert: false,
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
            if (state.failNextEventInsert) {
              state.failNextEventInsert = false
              return { error: { message: 'falha transitória de banco' } }
            }
            if (row.delivery_id && events.some((event) => event.delivery_id === row.delivery_id)) {
              return { error: { code: '23505', message: 'duplicate delivery id' } }
            }
            events.push(row)
            return { error: null }
          },
        }
      }

      throw new Error(`Tabela inesperada: ${table}`)
    },
  }

  return state
})

vi.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: database }))

const { POST: unsubscribePost } = await import('@/app/api/unsubscribe/route')
const { POST: webhookPost } = await import('@/app/api/webhooks/resend/route')

/** Adultera a assinatura de verdade, no meio, onde todo bit conta. */
function tamperSignature(token: string): string {
  const parts = token.split('.')
  const signature = parts[2]
  const index = Math.floor(signature.length / 2)
  const current = signature[index]
  const replacement = current === 'A' ? 'B' : 'A'
  parts[2] = signature.slice(0, index) + replacement + signature.slice(index + 1)
  return parts.join('.')
}

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

  it('rejeita token expirado mesmo com assinatura e finalidade válidas', async () => {
    const token = await new SignJWT({ email: 'ana@example.com', campaignId: 'camp-1', purpose: 'unsubscribe' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('recrutae-mail')
      .setAudience('unsubscribe')
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(new TextEncoder().encode(secret))

    await expect(verifyUnsubscribeToken(token, secret)).rejects.toThrow()
  })

  it('rejeita token assinado com finalidade diferente', async () => {
    const token = await new SignJWT({ email: 'ana@example.com', campaignId: 'camp-1', purpose: 'preview' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('recrutae-mail')
      .setAudience('unsubscribe')
      .setIssuedAt()
      .setExpirationTime('180d')
      .sign(new TextEncoder().encode(secret))

    await expect(verifyUnsubscribeToken(token, secret)).rejects.toThrow('inválido')
  })

  it('rejeita token assinado sem expiração', async () => {
    const token = await new SignJWT({ email: 'ana@example.com', campaignId: 'camp-1', purpose: 'unsubscribe' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('recrutae-mail')
      .setAudience('unsubscribe')
      .setIssuedAt()
      .sign(new TextEncoder().encode(secret))

    await expect(verifyUnsubscribeToken(token, secret)).rejects.toThrow('inválido')
  })
})

describe('public unsubscribe endpoint', () => {
  const secret = '12345678901234567890123456789012'

  beforeEach(() => {
    database.suppressions.clear()
    database.events.length = 0
    database.failNextEventInsert = false
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
    // Mexer no último caractere não bastava: ele carrega só 2 bits úteis da
    // assinatura, então trocá-lo pode decodificar nos mesmos bytes e o token
    // continuar válido. O teste falhava de vez em quando por isso.
    const token = await createUnsubscribeToken({ email: 'ana@example.com', campaignId: 'camp-1' }, secret)
    const response = await unsubscribePost(new NextRequest(
      `https://mail.recrutae.com.br/api/unsubscribe?token=${encodeURIComponent(tamperSignature(token))}`,
      { method: 'POST' },
    ))

    expect(response.status).toBe(400)
    expect(database.suppressions.size).toBe(0)
  })

  it('redireciona a confirmação humana para o estado de sucesso sem afetar o one-click', async () => {
    const token = await createUnsubscribeToken({ email: 'ana@example.com', campaignId: 'camp-1' }, secret)
    const response = await unsubscribePost(new NextRequest(
      `https://mail.recrutae.com.br/api/unsubscribe?token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'human_confirmation=1',
      },
    ))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('/unsubscribe?')
    expect(response.headers.get('location')).toContain('status=success')
  })
})

describe('Resend webhook', () => {
  beforeEach(() => {
    database.suppressions.clear()
    database.events.length = 0
    database.failNextEventInsert = false
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
        headers: { 'svix-id': 'delivery-bounce-1' },
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
      message_id: 'msg-1', delivery_id: 'delivery-bounce-1', campaign_id: 'camp-1', contact_id: 'contact-1',
      recipient_email: 'ana@example.com', event_type: 'bounced',
    }])
  })

  it('aceita reentrega com o mesmo identificador de entrega sem duplicar o evento', async () => {
    const url = 'https://mail.recrutae.com.br/api/webhooks/resend?secret=webhook-secret-que-nao-vaza'
    const init = {
      method: 'POST',
      body: JSON.stringify({
        type: 'email.bounced',
        data: { email_id: 'msg-repetida', to: ['ana@example.com'] },
      }),
    }

    const first = await webhookPost(new NextRequest(url, { ...init, headers: { 'svix-id': 'delivery-1' } }))
    const replay = await webhookPost(new NextRequest(url, { ...init, headers: { 'svix-id': 'delivery-1' } }))

    expect(first.status).toBe(200)
    expect(replay.status).toBe(200)
    expect(database.events).toHaveLength(1)
    expect(database.events[0]).toMatchObject({ delivery_id: 'delivery-1' })
  })

  it('preserva duas aberturas legítimas do mesmo e-mail com entregas distintas', async () => {
    const url = 'https://mail.recrutae.com.br/api/webhooks/resend?secret=webhook-secret-que-nao-vaza'
    const body = JSON.stringify({
      type: 'email.opened',
      data: { email_id: 'msg-aberta', to: ['ana@example.com'] },
    })

    const first = await webhookPost(new NextRequest(url, { method: 'POST', headers: { 'svix-id': 'delivery-open-1' }, body }))
    const second = await webhookPost(new NextRequest(url, { method: 'POST', headers: { 'svix-id': 'delivery-open-2' }, body }))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(database.events).toEqual([
      expect.objectContaining({ delivery_id: 'delivery-open-1', event_type: 'opened' }),
      expect.objectContaining({ delivery_id: 'delivery-open-2', event_type: 'opened' }),
    ])
  })

  it('retorna falha recuperável quando gravar evento falha e permite a tentativa posterior', async () => {
    const url = 'https://mail.recrutae.com.br/api/webhooks/resend?secret=webhook-secret-que-nao-vaza'
    const init = {
      method: 'POST',
      headers: { 'svix-id': 'delivery-retry' },
      body: JSON.stringify({ type: 'email.delivered', data: { email_id: 'msg-retry', to: ['ana@example.com'] } }),
    }
    database.failNextEventInsert = true

    const failed = await webhookPost(new NextRequest(url, init))
    const retried = await webhookPost(new NextRequest(url, init))

    expect(failed.status).toBe(503)
    expect(retried.status).toBe(200)
    expect(database.events).toEqual([expect.objectContaining({ delivery_id: 'delivery-retry' })])
  })
})
