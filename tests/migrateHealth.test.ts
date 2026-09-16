// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const selects = vi.hoisted(() => ({ byTable: new Map<string, string>() }))

vi.mock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: () => true }))

vi.mock('@/lib/supabaseAdmin', () => ({
  isAdminConfigured: () => true,
  supabaseAdmin: {
    from(table: string) {
      return {
        select(columns: string) {
          selects.byTable.set(table, columns)
          return { limit: async () => ({ error: null }) }
        },
        insert: async () => ({ error: { message: 'probe bloqueado de propósito' } }),
      }
    },
  },
}))

describe('diagnóstico de /api/migrate', () => {
  beforeEach(() => {
    selects.byTable.clear()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  })

  it('verifica delivery_id, que sustenta a idempotência do webhook', async () => {
    const { GET } = await import('@/app/api/migrate/route')

    await GET()

    expect(selects.byTable.get('email_events')).toContain('delivery_id')
  })

  it('verifica as tabelas privadas de supressão e de tentativas de envio', async () => {
    const { GET } = await import('@/app/api/migrate/route')

    await GET()

    expect(selects.byTable.has('email_suppressions')).toBe(true)
    expect(selects.byTable.has('ros_send_attempts')).toBe(true)
    expect(selects.byTable.get('client_campaigns')).toContain('campaign_kind')
  })
})
