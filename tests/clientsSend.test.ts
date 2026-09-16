// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  send: vi.fn(),
  isSuppressed: vi.fn(),
  update: vi.fn(),
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: state.send }
  },
}))

vi.mock('@/lib/outreach/repository', () => ({ isEmailSuppressed: state.isSuppressed }))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: { from: () => ({ update: () => ({ eq: state.update }) }) },
}))

vi.mock('@/lib/supabase', () => ({ supabase: null }))

const validBody = {
  to: 'ana@example.com',
  subject: 'Assunto',
  body: 'Corpo do e-mail',
  contactName: 'Ana',
  recruiterName: 'João',
  recruiterEmail: 'joao@recrutae.com.br',
  recruiterRole: 'Comercial',
  replyTo: 'joao@recrutae.com.br',
  campaignId: 'camp-1',
  contactId: 'contact-1',
  contactEmail: 'ana@example.com',
}

function request(body: Record<string, unknown>) {
  return new NextRequest('https://mail.example.com/api/clients/send', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('envio de Clientes', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test'
    state.isSuppressed.mockResolvedValue(false)
    state.update.mockResolvedValue({ error: null })
    state.send.mockResolvedValue({ data: { id: 'msg-1' }, error: null })
  })

  afterEach(() => { vi.resetModules() })

  it('bloqueia endereço suprimido antes de chamar o Resend', async () => {
    state.isSuppressed.mockResolvedValue(true)
    const { POST } = await import('@/app/api/clients/send/route')

    const response = await POST(request({ ...validBody, contactEmail: 'suprimido@example.com', to: 'suprimido@example.com' }))

    expect(response.status).toBe(409)
    expect(state.send).not.toHaveBeenCalled()
  })

  it('bloqueia o envio quando a consulta de supressão falha', async () => {
    state.isSuppressed.mockRejectedValue(new Error('banco fora do ar'))
    const { POST } = await import('@/app/api/clients/send/route')

    const response = await POST(request({ ...validBody, contactEmail: 'x@example.com', to: 'x@example.com' }))

    expect(response.status).toBe(503)
    expect(state.send).not.toHaveBeenCalled()
  })

  it('usa a chave idempotente do próprio namespace e o campo replyTo do SDK 4', async () => {
    const { POST } = await import('@/app/api/clients/send/route')

    const response = await POST(request({ ...validBody, campaignId: 'camp-2', contactId: 'contact-2' }))

    expect(response.status).toBe(200)
    const [payload, options] = state.send.mock.calls[0]
    expect(options).toEqual({ idempotencyKey: 'clients/camp-2/contact-2' })
    expect(payload.replyTo).toBe('joao@recrutae.com.br')
    expect(payload).not.toHaveProperty('reply_to')
    expect(payload.from).toBe('João <joao@recrutae.com.br>')
  })

  it('mantém a recusa de remetente fora do domínio', async () => {
    const { POST } = await import('@/app/api/clients/send/route')

    const response = await POST(request({ ...validBody, recruiterEmail: 'joao@gmail.com' }))

    expect(response.status).toBe(400)
    expect(state.send).not.toHaveBeenCalled()
  })
})
