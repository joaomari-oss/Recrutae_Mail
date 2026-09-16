// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SendRosEmailRequest } from '@/lib/rosTypes'
import { sendRosEmail, type RosSendDependencies } from '@/lib/ros/send'

const routeState = vi.hoisted(() => ({
  admin: {} as object | null,
  send: vi.fn(),
  isSuppressed: vi.fn(),
  claim: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  get supabaseAdmin() { return routeState.admin },
}))

vi.mock('@/lib/outreach/repository', () => ({
  isEmailSuppressed: routeState.isSuppressed,
  claimRosContact: routeState.claim,
  markContactSent: routeState.markSent,
  markContactFailed: routeState.markFailed,
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: routeState.send }
  },
}))

const request: SendRosEmailRequest = {
  campaignId: 'camp-1',
  contactId: 'contact-1',
  to: ' ANA@Example.com ',
  subject: 'Oportunidade ROS',
  body: 'Olá, Ana!',
  recruiterName: 'João',
  recruiterRole: 'Talent Partner',
  recruiterEmail: 'contato@recrutae.com.br',
  replyTo: 'joao@recrutae.com.br',
  recruiterLinkedin: 'https://linkedin.com/in/joao',
  recruiterWhatsapp: 'https://wa.me/5511999999999',
}

function dependencies(overrides: Partial<RosSendDependencies> = {}): RosSendDependencies {
  return {
    isSuppressed: vi.fn().mockResolvedValue(false),
    claimContact: vi.fn().mockResolvedValue(true),
    send: vi.fn().mockResolvedValue({ data: { id: 'resend-1' }, error: null }),
    markSent: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    createToken: vi.fn().mockResolvedValue('signed-token'),
    appBaseUrl: 'https://mail.recrutae.com.br',
    logoUrl: 'https://mail.recrutae.com.br/ros/recrutae-ros.png',
    ...overrides,
  }
}

describe('sendRosEmail', () => {
  it('normaliza e consulta supressão antes de qualquer reserva e nunca chama Resend para suprimido', async () => {
    const order: string[] = []
    const deps = dependencies({
      isSuppressed: vi.fn(async email => { order.push(`suppression:${email}`); return true }),
      claimContact: vi.fn(async () => { order.push('claim'); return true }),
      send: vi.fn(async () => { order.push('send'); return { data: { id: 'unexpected' }, error: null } }),
    })

    const result = await sendRosEmail(request, deps)

    expect(result).toMatchObject({ success: false, suppressed: true })
    expect(order).toEqual(['suppression:ana@example.com'])
    expect(deps.claimContact).not.toHaveBeenCalled()
    expect(deps.createToken).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('interrompe quando a reserva approved|failed é recusada', async () => {
    const deps = dependencies({ claimContact: vi.fn().mockResolvedValue(false) })

    const result = await sendRosEmail(request, deps)

    expect(result).toMatchObject({ success: false, claimed: false })
    expect(deps.claimContact).toHaveBeenCalledWith('camp-1', 'contact-1')
    expect(deps.createToken).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.markFailed).not.toHaveBeenCalled()
  })

  it('envia com descadastro HTTPS, tags, reply_to e chave idempotente estável e persiste sent', async () => {
    const order: string[] = []
    const deps = dependencies({
      isSuppressed: vi.fn(async () => { order.push('suppression'); return false }),
      claimContact: vi.fn(async () => { order.push('claim'); return true }),
      createToken: vi.fn(async () => { order.push('token'); return 'signed token' }),
      send: vi.fn(async () => { order.push('send'); return { data: { id: 'resend-42' }, error: null } }),
      markSent: vi.fn(async () => { order.push('sent') }),
    })

    const result = await sendRosEmail(request, deps)

    expect(result).toEqual({ success: true, messageId: 'resend-42' })
    expect(order).toEqual(['suppression', 'claim', 'token', 'send', 'sent'])
    expect(deps.createToken).toHaveBeenCalledWith({ email: 'ana@example.com', campaignId: 'camp-1' })
    expect(deps.send).toHaveBeenCalledTimes(1)
    expect(deps.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'João - Recrutaê | OS <contato@recrutae.com.br>',
        to: ['ana@example.com'],
        subject: 'Oportunidade ROS',
        reply_to: 'joao@recrutae.com.br',
        tags: [
          { name: 'campaign_id', value: 'camp-1' },
          { name: 'contact_id', value: 'contact-1' },
        ],
        headers: {
          'List-Unsubscribe': '<https://mail.recrutae.com.br/api/unsubscribe?token=signed+token>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
      { idempotencyKey: 'ros/camp-1/contact-1' },
    )
    const payload = vi.mocked(deps.send).mock.calls[0][0]
    expect(payload.html).toContain('api/unsubscribe?token=signed+token')
    expect(payload.text).toContain('https://mail.recrutae.com.br/api/unsubscribe?token=signed+token')
    expect(deps.markSent).toHaveBeenCalledWith('contact-1', 'resend-42')
    expect(deps.markFailed).not.toHaveBeenCalled()
  })

  it('persiste failed quando o Resend devolve erro', async () => {
    const deps = dependencies({
      send: vi.fn().mockResolvedValue({ data: null, error: { message: 'provider unavailable' } }),
    })

    const result = await sendRosEmail(request, deps)

    expect(result).toEqual({ success: false, error: 'provider unavailable' })
    expect(deps.markFailed).toHaveBeenCalledWith('contact-1', 'provider unavailable')
    expect(deps.markSent).not.toHaveBeenCalled()
  })

  it('persiste failed quando o Resend lança uma exceção', async () => {
    const deps = dependencies({ send: vi.fn().mockRejectedValue(new Error('network failure')) })

    const result = await sendRosEmail(request, deps)

    expect(result).toEqual({ success: false, error: 'network failure' })
    expect(deps.markFailed).toHaveBeenCalledWith('contact-1', 'network failure')
  })

  it('não envia se a URL de descadastro não puder ser HTTPS e persiste a falha da reserva', async () => {
    const deps = dependencies({ appBaseUrl: 'http://mail.recrutae.com.br' })

    const result = await sendRosEmail(request, deps)

    expect(result.success).toBe(false)
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.markFailed).toHaveBeenCalledWith('contact-1', expect.stringContaining('HTTPS'))
  })
})

describe('POST /api/ros/send', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    routeState.admin = {}
    routeState.send.mockResolvedValue({ data: { id: 'route-message' }, error: null })
    routeState.isSuppressed.mockResolvedValue(false)
    routeState.claim.mockResolvedValue(true)
    routeState.markSent.mockResolvedValue(undefined)
    routeState.markFailed.mockResolvedValue(undefined)
    process.env.RESEND_API_KEY = 're_test'
    process.env.APP_BASE_URL = 'https://mail.recrutae.com.br'
    process.env.UNSUBSCRIBE_SIGNING_SECRET = 'x'.repeat(32)
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  it('bloqueia sem service role mesmo se um cliente de banco estiver disponível', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test'
    const { POST } = await import('@/app/api/ros/send/route')

    const response = await POST(new NextRequest('https://app.test/api/ros/send', {
      method: 'POST', body: JSON.stringify(request), headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(503)
    expect(routeState.isSuppressed).not.toHaveBeenCalled()
    expect(routeState.send).not.toHaveBeenCalled()
  })

  it('rejeita ROS_FROM_EMAIL fora do domínio Recrutaê', async () => {
    process.env.ROS_FROM_EMAIL = 'contato@example.com'
    const { POST } = await import('@/app/api/ros/send/route')

    const response = await POST(new NextRequest('https://app.test/api/ros/send', {
      method: 'POST', body: JSON.stringify(request), headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(400)
    expect(routeState.send).not.toHaveBeenCalled()
  })

  it('usa contato@recrutae.com.br quando ROS_FROM_EMAIL está ausente', async () => {
    delete process.env.ROS_FROM_EMAIL
    const { POST } = await import('@/app/api/ros/send/route')

    const response = await POST(new NextRequest('https://app.test/api/ros/send', {
      method: 'POST', body: JSON.stringify(request), headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(200)
    expect(routeState.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'João - Recrutaê | OS <contato@recrutae.com.br>',
        replyTo: 'joao@recrutae.com.br',
      }),
      { idempotencyKey: 'ros/camp-1/contact-1' },
    )
  })
})
