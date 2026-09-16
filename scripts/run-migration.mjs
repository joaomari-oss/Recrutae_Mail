/**
 * Aplica um arquivo .sql no Postgres do Supabase.
 *
 * A REST com service_role não executa DDL, então a migração precisa de uma
 * conexão direta com permissão de owner. A string fica em SUPABASE_DB_URL
 * (no .env.local, nunca em argumento de linha de comando, para não vazar no
 * histórico do shell nem na lista de processos).
 *
 * Uso: node scripts/run-migration.mjs supabase-migration-ros.sql
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

function readEnvLocal() {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const env = {}
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
    return env
  } catch {
    return {}
  }
}

const file = process.argv[2]
if (!file) {
  console.error('Informe o arquivo SQL. Ex.: node scripts/run-migration.mjs supabase-migration-ros.sql')
  process.exit(1)
}

const env = { ...readEnvLocal(), ...process.env }
const connectionString = env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('SUPABASE_DB_URL não encontrada no .env.local nem no ambiente.')
  process.exit(1)
}

const sql = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  // Uma transação só: a migração é idempotente e um erro no meio não pode
  // deixar o banco em estado parcial.
  await client.query('begin')
  await client.query(sql)
  await client.query('commit')
  console.log(`OK: ${file} aplicado.`)

  const { rows: policies } = await client.query(
    `select tablename, policyname from pg_policies
     where tablename in ('client_campaigns','client_contacts','ros_send_attempts','email_suppressions')
     order by tablename, policyname`,
  )
  console.log('\nPolicies ativas:')
  for (const row of policies) console.log(`  ${row.tablename}: ${row.policyname}`)

  const { rows: fn } = await client.query(
    `select proname, prosecdef from pg_proc where proname = 'is_ros_campaign'`,
  )
  console.log(`\nFuncao is_ros_campaign: ${fn.length ? (fn[0].prosecdef ? 'presente (security definer)' : 'presente SEM security definer') : 'AUSENTE'}`)

  const { rows: cols } = await client.query(
    `select table_name, column_name from information_schema.columns
     where table_schema='public'
       and ((table_name='client_campaigns' and column_name='campaign_kind')
         or (table_name='email_events' and column_name='delivery_id'))
     order by table_name`,
  )
  console.log('\nColunas esperadas:')
  for (const row of cols) console.log(`  ${row.table_name}.${row.column_name}`)

  const { rows: tables } = await client.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_name in ('ros_send_attempts','email_suppressions','email_events')
     order by table_name`,
  )
  console.log('\nTabelas:')
  for (const row of tables) console.log(`  ${row.table_name}`)
} catch (error) {
  try { await client.query('rollback') } catch { /* conexão já pode ter caído */ }
  console.error('FALHA:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
