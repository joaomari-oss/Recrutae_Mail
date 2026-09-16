// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { runRosPreflight } from '@/lib/ros/preflight'

const validEnv = {
  RESEND_API_KEY: 're_test',
  ROS_FROM_EMAIL: 'contato@recrutae.com.br',
  APP_BASE_URL: 'https://mail.recrutae.com.br',
  UNSUBSCRIBE_SIGNING_SECRET: 'x'.repeat(32),
  RESEND_WEBHOOK_SECRET: 'whsec_test',
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
}

function dependencies(env: Record<string, string | undefined> = validEnv) {
  return {
    env,
    listDomains: vi.fn().mockResolvedValue([
      { name: 'recrutae.com.br', status: 'verified' },
    ]),
    resolveTxt: vi.fn().mockResolvedValue([['v=DMARC1; p=none']]),
  }
}

describe('runRosPreflight', () => {
  it('bloqueia quando a URL pública de descadastro não é HTTPS', async () => {
    const deps = dependencies({ ...validEnv, APP_BASE_URL: 'http://mail.recrutae.com.br' })

    const result = await runRosPreflight(deps)

    expect(result.canSend).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({ key: 'appUrl', status: 'error' }))
  })

  it('bloqueia sem SUPABASE_SERVICE_ROLE_KEY mesmo quando a URL e o domínio estão válidos', async () => {
    const deps = dependencies({ ...validEnv, SUPABASE_SERVICE_ROLE_KEY: undefined })

    const result = await runRosPreflight(deps)

    expect(result.canSend).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({ key: 'database', status: 'error' }))
  })

  it('não usa a chave anônima como substituta da service role', async () => {
    const deps = dependencies({
      ...validEnv,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-test',
    })

    const result = await runRosPreflight(deps)

    expect(result.canSend).toBe(false)
    expect(result.checks.find(check => check.key === 'database')?.status).toBe('error')
  })

  it('bloqueia remetente fora do domínio Recrutaê sem consultar um domínio diferente', async () => {
    const deps = dependencies({ ...validEnv, ROS_FROM_EMAIL: 'contato@example.com' })

    const result = await runRosPreflight(deps)

    expect(result.canSend).toBe(false)
    expect(result.fromEmail).toBe('contato@example.com')
    expect(result.checks).toContainEqual(expect.objectContaining({ key: 'domain', status: 'error' }))
    expect(deps.resolveTxt).not.toHaveBeenCalled()
  })

  it('permite envio com todos os bloqueadores válidos e trata DMARC/webhook como avisos', async () => {
    const deps = dependencies({ ...validEnv, RESEND_WEBHOOK_SECRET: undefined })
    deps.resolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'))

    const result = await runRosPreflight(deps)

    expect(result.canSend).toBe(true)
    expect(result.fromEmail).toBe('contato@recrutae.com.br')
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'dmarc', status: 'warning' }),
      expect.objectContaining({ key: 'webhook', status: 'warning' }),
      expect.objectContaining({ key: 'database', status: 'ok' }),
    ]))
    expect(deps.resolveTxt).toHaveBeenCalledWith('_dmarc.recrutae.com.br')
  })

  it('usa o remetente padrão quando ROS_FROM_EMAIL não foi definido', async () => {
    const deps = dependencies({ ...validEnv, ROS_FROM_EMAIL: undefined })

    const result = await runRosPreflight(deps)

    expect(result.canSend).toBe(true)
    expect(result.fromEmail).toBe('contato@recrutae.com.br')
  })
})
