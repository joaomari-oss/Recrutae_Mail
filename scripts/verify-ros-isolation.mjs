/**
 * Prova, contra o banco real, que a chave pública não enxerga dados ROS.
 *
 * A revisão encontrou uma policy que parecia isolar e não isolava: a
 * subconsulta também passava pela RLS da tabela consultada. Conferir com
 * `set role anon` é a única forma honesta de afirmar que está fechado.
 *
 * Uso: node scripts/verify-ros-isolation.mjs
 */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
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

const env = { ...readEnvLocal(), ...process.env }
if (!env.SUPABASE_DB_URL) {
  console.error('SUPABASE_DB_URL não encontrada no .env.local nem no ambiente.')
  process.exit(1)
}

const client = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
const rosId = `verificacao-ros-${randomUUID()}`
const clientsId = `verificacao-clients-${randomUUID()}`
const rosContactId = `${rosId}-contato`
const clientsContactId = `${clientsId}-contato`
let failures = 0

const check = (label, ok, detail) => {
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

try {
  await client.connect()

  // Semeia uma campanha de cada tipo, com um contato cada.
  for (const [id, kind] of [[rosId, 'ros'], [clientsId, 'clients']]) {
    await client.query(
      `insert into client_campaigns (id, name, recruiter_name, recruiter_email, segment, status, contact_count, sent_count, failed_count, campaign_kind)
       values ($1, 'verificacao', '', '', '', 'draft', 1, 0, 0, $2)`,
      [id, kind],
    )
  }
  await client.query(
    `insert into client_contacts (id, campaign_id, name, first_name, email, status, generated_body, edited_body)
     values ($1, $2, 'Alvo ROS', 'Alvo', 'alvo-ros@example.com', 'pending', 'CORPO SECRETO ROS', 'CORPO SECRETO ROS')`,
    [rosContactId, rosId],
  )
  await client.query(
    `insert into client_contacts (id, campaign_id, name, first_name, email, status, generated_body, edited_body)
     values ($1, $2, 'Alvo Clientes', 'Alvo', 'alvo-clients@example.com', 'pending', 'corpo clientes', 'corpo clientes')`,
    [clientsContactId, clientsId],
  )

  // A partir daqui, tudo como se fosse a chave pública do navegador.
  await client.query('set local role anon')

  const seesRosCampaign = await client.query('select 1 from client_campaigns where id = $1', [rosId])
  check('anon não lê campanha ROS', seesRosCampaign.rowCount === 0, `${seesRosCampaign.rowCount} linha(s)`)

  const seesClientsCampaign = await client.query('select 1 from client_campaigns where id = $1', [clientsId])
  check('anon continua lendo campanha de Clientes', seesClientsCampaign.rowCount === 1, `${seesClientsCampaign.rowCount} linha(s)`)

  const seesRosContact = await client.query('select email, edited_body from client_contacts where id = $1', [rosContactId])
  check('anon não lê contato ROS (e-mail e corpo)', seesRosContact.rowCount === 0, `${seesRosContact.rowCount} linha(s)`)

  const seesClientsContact = await client.query('select 1 from client_contacts where id = $1', [clientsContactId])
  check('anon continua lendo contato de Clientes', seesClientsContact.rowCount === 1, `${seesClientsContact.rowCount} linha(s)`)

  const updated = await client.query(
    `update client_contacts set status = 'approved' where id = $1 returning id`,
    [rosContactId],
  )
  check('anon não altera contato ROS', updated.rowCount === 0, `${updated.rowCount} linha(s)`)

  const deleted = await client.query('delete from client_contacts where id = $1 returning id', [rosContactId])
  check('anon não apaga contato ROS', deleted.rowCount === 0, `${deleted.rowCount} linha(s)`)

  for (const table of ['email_suppressions', 'ros_send_attempts']) {
    try {
      const result = await client.query(`select * from ${table} limit 1`)
      check(`anon não lê ${table}`, false, `leitura permitida, ${result.rowCount} linha(s)`)
    } catch (error) {
      check(`anon não lê ${table}`, true, error.code ? `negado (${error.code})` : 'negado')
    }
  }

  await client.query('reset role')
} catch (error) {
  console.error('ERRO NA VERIFICACAO:', error instanceof Error ? error.message : error)
  failures += 1
} finally {
  try {
    await client.query('reset role')
    await client.query('delete from client_contacts where campaign_id = any($1)', [[rosId, clientsId]])
    await client.query('delete from client_campaigns where id = any($1)', [[rosId, clientsId]])
    console.log('\nDados de verificacao removidos.')
  } catch (error) {
    console.error('Limpeza falhou, remova manualmente:', rosId, clientsId, error.message)
  }
  await client.end().catch(() => {})
}

console.log(failures ? `\n${failures} verificacao(oes) falharam.` : '\nIsolamento ROS confirmado contra o banco real.')
process.exitCode = failures ? 1 : 0
