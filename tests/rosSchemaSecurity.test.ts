// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sources = [
  'supabase-schema.sql',
  'supabase-migration-ros.sql',
  'app/api/migrate/route.ts',
]

function source(path: string): string {
  return readFileSync(path, 'utf8').toLowerCase()
}

describe('schema privado dos payloads ROS', () => {
  it.each(sources)('%s cria a tabela privada com RLS sem policies e revoga papéis públicos', path => {
    const sql = source(path)

    expect(sql).toContain('create table if not exists ros_send_attempts')
    expect(sql).toContain('alter table ros_send_attempts enable row level security')
    expect(sql).toContain('revoke all on table ros_send_attempts from anon, authenticated')
    expect(sql).not.toMatch(/create\s+policy[^;]*\bon\s+ros_send_attempts\b/i)
  })

  it.each(sources)('%s migra o legado e remove send_payload de client_contacts', path => {
    const sql = source(path)

    expect(sql).toContain('insert into ros_send_attempts')
    expect(sql).toMatch(/select\s+campaign_id\s*,\s*id\s*,\s*send_payload/i)
    expect(sql).toContain('alter table client_contacts drop column if exists send_payload')
    expect(sql).not.toContain('alter table client_contacts add column if not exists send_payload')
  })

  it('o schema novo não expõe send_payload na definição de client_contacts', () => {
    for (const path of ['supabase-schema.sql', 'app/api/migrate/route.ts']) {
      const sql = source(path)
      const contactsDefinition = sql.match(/create table if not exists client_contacts\s*\(([\s\S]*?)\n\);/)?.[1]
      expect(contactsDefinition, path).toBeDefined()
      expect(contactsDefinition, path).not.toContain('send_payload')
    }
  })
})
