import { rowsToRosContactsDetailed, isValidContactEmail, normalizeContactEmail } from '../contactParsing'
import { readContactRows } from '../utils'
import type { RosContact } from '../rosTypes'

export type ManualRosContactInput = Pick<RosContact, 'fullName' | 'email' | 'company' | 'position'>

/**
 * Lê CSV ou planilha com a mesma camada de leitura usada pelos uploads existentes,
 * mantendo as rejeições para que a interface possa explicá-las ao usuário.
 */
export async function parseRosContactsFile(file: File) {
  return rowsToRosContactsDetailed(await readContactRows(file))
}

/** Cria um contato avulso com as mesmas regras de e-mail do upload em lote. */
export function createManualRosContact(input: ManualRosContactInput, seenEmails: Set<string>): RosContact {
  const email = normalizeContactEmail(input.email)
  if (!email) throw new Error('E-mail obrigatório')
  if (!isValidContactEmail(email)) throw new Error('E-mail inválido')
  const normalizedSeenEmails = new Set(Array.from(seenEmails, normalizeContactEmail))
  if (normalizedSeenEmails.has(email)) throw new Error('E-mail duplicado')

  seenEmails.add(email)
  const fullName = input.fullName.trim() || nameFromEmail(email)
  const [firstName = '', ...lastNameParts] = fullName.split(/\s+/).filter(Boolean)

  return {
    id: crypto.randomUUID(),
    firstName,
    lastName: lastNameParts.join(' '),
    fullName,
    email,
    company: input.company.trim(),
    position: input.position.trim(),
    status: 'pending',
    generatedSubject: '',
    generatedBody: '',
    editedSubject: '',
    editedBody: '',
    sendAttempts: 0,
  }
}

function nameFromEmail(email: string): string {
  return email.split('@')[0]
    .split(/[._\-+0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Problemas por contato, derivados da lista inteira.
 *
 * Fica fora da tabela de propósito: o botão de continuar precisa da mesma
 * verdade, e um erro guardado dentro do componente envelhece quando a linha
 * culpada é removida.
 */
export function findRosContactIssues(contacts: RosContact[]): Record<string, string> {
  const issues: Record<string, string> = {}
  const seen = new Map<string, string>()

  for (const contact of contacts) {
    const email = normalizeContactEmail(contact.email)
    if (!email) {
      issues[contact.id] = 'E-mail obrigatório'
      continue
    }
    if (!isValidContactEmail(email)) {
      issues[contact.id] = 'E-mail inválido'
      continue
    }
    if (seen.has(email)) {
      issues[contact.id] = 'E-mail duplicado'
      continue
    }
    seen.set(email, contact.id)
  }

  return issues
}

/**
 * Normaliza o que ficou livre durante a edição — e-mail em minúsculas, nome
 * sem espaços sobrando e primeiro/último nome derivados dele.
 */
export function finalizeRosContacts(contacts: RosContact[]): RosContact[] {
  return contacts.map((contact) => {
    const fullName = contact.fullName.trim() || nameFromEmail(normalizeContactEmail(contact.email))
    const [firstName = '', ...rest] = fullName.split(/\s+/).filter(Boolean)
    return {
      ...contact,
      email: normalizeContactEmail(contact.email),
      fullName,
      firstName,
      lastName: rest.join(' '),
      company: contact.company.trim(),
      position: contact.position.trim(),
    }
  })
}

const REQUIRED_TEXT_FIELDS = [
  'id', 'firstName', 'lastName', 'fullName', 'email', 'company', 'position',
  'generatedSubject', 'generatedBody', 'editedSubject', 'editedBody',
] as const

const CONTACT_STATUSES = ['pending', 'generating', 'ready', 'approved', 'sending', 'sent', 'failed']

/**
 * A lista viaja pelo sessionStorage e depois é validada campo a campo pela API.
 * Uma linha incompleta viraria input não controlado aqui e 400 lá — descarta.
 */
export function isCompleteRosContact(value: unknown): value is RosContact {
  if (!value || typeof value !== 'object') return false
  const contact = value as Record<string, unknown>
  return REQUIRED_TEXT_FIELDS.every((field) => typeof contact[field] === 'string')
    && !!(contact.id as string).trim()
    && typeof contact.status === 'string'
    && CONTACT_STATUSES.includes(contact.status)
    && typeof contact.sendAttempts === 'number'
    // Mesmo formato que a API exige: uma linha torta aqui reprovaria o lote inteiro.
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((contact.email as string).trim())
}
