import type { Candidate } from './types'

/**
 * Núcleo puro de parsing de contatos — recebe linhas cruas (string[][]) vindas de
 * CSV (papaparse) ou de planilha (xlsx) e devolve Candidate[].
 *
 * Fica separado de utils.ts para não depender de File/FileReader e poder ser testado
 * isoladamente em Node.
 */

/** Valores que planilhas usam como "vazio" e que não devem virar dado real. */
const PLACEHOLDERS = new Set([
  '-', '--', '---', 'n/a', 'na', 'n.a.', 'null', 'none', 'nenhum', 'nenhuma',
  'sem empresa', 'não informado', 'nao informado', 'não informada', 'nao informada',
  'desconhecido', 'desconhecida', '?', '.',
])

function cell(value: unknown): string {
  return String(value ?? '').trim()
}

/** Normaliza um valor opcional: placeholders viram string vazia. */
function clean(value: string): string {
  return PLACEHOLDERS.has(value.toLowerCase()) ? '' : value
}

/** Chaves de cabeçalho que representam empresa — nunca podem virar nome da pessoa. */
const COMPANY_HINTS = ['company', 'empresa', 'organiz', 'account', 'employer', 'cliente']

/**
 * Busca case-insensitive por coluna. Faz duas passadas:
 * 1) igualdade exata do cabeçalho normalizado
 * 2) cabeçalho que *contém* o alias (para "Email Address", "Nome do Contato", etc.)
 */
function pick(
  row: Record<string, string>,
  aliases: string[],
  opts: { excludeCompanyColumns?: boolean } = {}
): string {
  const keys = Object.keys(row)
  const allowed = opts.excludeCompanyColumns
    ? keys.filter((k) => !COMPANY_HINTS.some((h) => k.toLowerCase().includes(h)))
    : keys

  for (const alias of aliases) {
    const target = alias.toLowerCase().trim()
    const found = allowed.find((k) => k.toLowerCase().trim() === target)
    if (found && clean(cell(row[found]))) return clean(cell(row[found]))
  }
  for (const alias of aliases) {
    const target = alias.toLowerCase().trim()
    const found = allowed.find((k) => k.toLowerCase().trim().includes(target))
    if (found && clean(cell(row[found]))) return clean(cell(row[found]))
  }
  return ''
}

const EMAIL_PERSONAL = ['personal email', 'personal e-mail', 'personal_email', 'email pessoal', 'e-mail pessoal', 'email 2', 'secondary email']
const EMAIL_PRIMARY = ['email', 'e-mail', 'e_mail', 'email address', 'endereco de email', 'endereço de e-mail', 'work email', 'corporate email', 'business email', 'mail', 'contato']
const FIRST_NAME = ['first name', 'first_name', 'firstname', 'primeiro nome', 'first']
const LAST_NAME = ['last name', 'last_name', 'lastname', 'sobrenome', 'ultimo nome', 'último nome', 'last']
const FULL_NAME = ['full name', 'full_name', 'fullname', 'nome completo', 'contact name', 'nome do contato', 'nome', 'name', 'candidato', 'candidate']
const TITLE = ['title', 'job title', 'cargo', 'position', 'posicao', 'posição', 'role', 'funcao', 'função', 'ocupacao', 'ocupação']
const COMPANY = ['company', 'company name', 'empresa', 'organization', 'organização', 'account name', 'employer', 'empresa atual']
const LINKEDIN = ['person linkedin url', 'linkedin url', 'linkedin', 'linkedin_url', 'perfil linkedin']

function looksLikeEmail(value: string): boolean {
  return value.includes('@') && value.includes('.')
}

/** "joao.paulo_silva@x.com" -> "Joao Paulo Silva" — usado quando não há coluna de nome. */
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || ''
  return local
    .split(/[._\-+0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim()
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.split(/\s+/).filter(Boolean)
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') }
}

/**
 * Converte linhas cruas em Candidate[].
 *
 * Detecta automaticamente:
 *  - Coluna de e-mail (a que mais contém "@" — funciona mesmo com cabeçalho inesperado)
 *  - Presença de cabeçalho (se a célula de e-mail da 1ª linha não parece e-mail)
 *  - Mapeamento por nome de coluna (PT-BR e EN) ou, sem cabeçalho, por posição
 *
 * Regras: e-mail pessoal tem prioridade sobre corporativo, placeholders ("-", "N/A")
 * viram vazio, linhas sem e-mail válido são descartadas e e-mails repetidos são deduplicados.
 */
export function rowsToCandidates(allRows: unknown[][]): Candidate[] {
  const rows = (allRows || [])
    .map((r) => (Array.isArray(r) ? r.map(cell) : []))
    .filter((r) => r.some((v) => v !== ''))

  if (!rows.length) return []

  // Qual coluna concentra os e-mails?
  const maxCols = Math.max(...rows.map((r) => r.length))
  const emailScores = new Array(maxCols).fill(0)
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (looksLikeEmail(row[i])) emailScores[i]++
    }
  }
  const emailColIdx = emailScores.indexOf(Math.max(...emailScores))
  if (!emailScores.length || emailScores[emailColIdx] === 0) return []

  // Se a célula de e-mail da primeira linha não é um e-mail, ela é cabeçalho.
  const hasHeader = !looksLikeEmail(rows[0][emailColIdx] ?? '')
  const headers = hasHeader ? rows[0] : []
  const dataRows = hasHeader ? rows.slice(1) : rows

  const candidates: Candidate[] = []

  for (const row of dataRows) {
    let email = ''
    let firstName = ''
    let lastName = ''
    let fullName = ''
    let title = ''
    let company = ''
    let linkedinUrl = ''

    if (hasHeader) {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => {
        const key = h || `col_${i}`
        obj[key] = row[i] ?? ''
      })

      const personal = pick(obj, EMAIL_PERSONAL)
      const primary = pick(obj, EMAIL_PRIMARY)
      email = looksLikeEmail(personal) ? personal : primary
      // Cabeçalho fora do padrão: cai para a coluna que concentra os e-mails.
      if (!looksLikeEmail(email)) email = row[emailColIdx] ?? ''

      firstName = pick(obj, FIRST_NAME, { excludeCompanyColumns: true })
      lastName = pick(obj, LAST_NAME, { excludeCompanyColumns: true })
      fullName = `${firstName} ${lastName}`.trim() || pick(obj, FULL_NAME, { excludeCompanyColumns: true })
      title = pick(obj, TITLE)
      company = pick(obj, COMPANY)
      linkedinUrl = pick(obj, LINKEDIN)
    } else {
      email = row[emailColIdx] ?? ''
      const nameIdx = emailColIdx > 0 ? emailColIdx - 1 : row.findIndex((_, i) => i !== emailColIdx)
      fullName = nameIdx >= 0 ? clean(row[nameIdx] ?? '') : ''
      const rest = row
        .map((v, i) => ({ v: clean(v), i }))
        .filter(({ v, i }) => i !== emailColIdx && i !== nameIdx && v)
      company = rest[0]?.v || ''
      title = rest[1]?.v || ''
    }

    if (!looksLikeEmail(email)) continue

    // Sem coluna de nome: deriva do próprio e-mail para a saudação nunca ficar vazia.
    if (!fullName) fullName = nameFromEmail(email)
    if (!firstName) {
      const split = splitName(fullName)
      firstName = split.firstName
      lastName = lastName || split.lastName
    }

    candidates.push({
      id: `candidate-${crypto.randomUUID()}`,
      firstName,
      lastName,
      fullName,
      title,
      company,
      email,
      linkedinUrl,
      status: 'pending',
      generatedSubject: '',
      generatedBody: '',
      editedSubject: '',
      editedBody: '',
      sendAttempts: 0,
    })
  }

  // Deduplica por e-mail (case-insensitive), mantendo a primeira ocorrência.
  const seen = new Set<string>()
  return candidates.filter((c) => {
    const key = c.email.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
