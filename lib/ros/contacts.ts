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
  if (seenEmails.has(email)) throw new Error('E-mail duplicado')

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
