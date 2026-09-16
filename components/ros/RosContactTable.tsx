'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { isValidContactEmail, normalizeContactEmail } from '@/lib/contactParsing'
import type { RosContact } from '@/lib/rosTypes'

export type RosContactTableProps = {
  contacts: RosContact[]
  onUpdate: (id: string, updates: Partial<RosContact>) => void
  onRemove: (id: string) => void
}

const columns = ['Nome', 'E-mail', 'Empresa', 'Cargo'] as const

/** Mesma derivação usada pelo cadastro manual, para nome e sobrenome não divergirem. */
function splitName(fullName: string): Pick<RosContact, 'fullName' | 'firstName' | 'lastName'> {
  const trimmed = fullName.trim()
  const [firstName = '', ...rest] = trimmed.split(/\s+/).filter(Boolean)
  return { fullName: trimmed, firstName, lastName: rest.join(' ') }
}

function validateEmail(value: string, id: string, contacts: RosContact[]): string | null {
  const normalized = normalizeContactEmail(value)
  if (!normalized) return 'E-mail obrigatório'
  if (!isValidContactEmail(normalized)) return 'E-mail inválido'
  const taken = contacts.some((c) => c.id !== id && normalizeContactEmail(c.email) === normalized)
  return taken ? 'E-mail duplicado' : null
}

export function RosContactTable({ contacts, onUpdate, onRemove }: RosContactTableProps) {
  // O rascunho permite digitar estados intermediários inválidos sem apagar o
  // e-mail já aceito — só um endereço válido e único chega ao estado da página.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const changeEmail = (contact: RosContact, value: string) => {
    setDrafts((current) => ({ ...current, [contact.id]: value }))
    const failure = validateEmail(value, contact.id, contacts)
    setErrors((current) => {
      const next = { ...current }
      if (failure) next[contact.id] = failure
      else delete next[contact.id]
      return next
    })
    if (!failure) onUpdate(contact.id, { email: normalizeContactEmail(value) })
  }

  const remove = (id: string) => {
    setDrafts(({ [id]: _draft, ...rest }) => rest)
    setErrors(({ [id]: _error, ...rest }) => rest)
    onRemove(id)
  }

  if (!contacts.length) return null

  return (
    <div className="overflow-x-auto rounded-xl border border-white/8">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">Contatos da campanha ROS</caption>
        <thead>
          <tr className="bg-brand-charcoal">
            {columns.map((column) => (
              <th key={column} scope="col" className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-brand-muted">
                {column}
              </th>
            ))}
            <th scope="col" className="px-3 py-2.5 text-right font-mono text-[10px] uppercase tracking-widest text-brand-muted">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {contacts.map((contact, index) => {
            const position = index + 1
            const error = errors[contact.id]
            const errorId = `ros-contato-${contact.id}-erro`
            return (
              <tr key={contact.id} className="align-top transition-colors hover:bg-white/2">
                <td className="px-2 py-2">
                  <input
                    aria-label={`Nome do contato ${position}`}
                    value={contact.fullName}
                    onChange={(event) => onUpdate(contact.id, splitName(event.target.value))}
                    className="w-full rounded-lg border border-white/8 bg-brand-dark px-2.5 py-1.5 text-sm text-brand-white outline-none focus:border-brand-coral/60"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label={`E-mail do contato ${position}`}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    value={drafts[contact.id] ?? contact.email}
                    onChange={(event) => changeEmail(contact, event.target.value)}
                    className={`w-full rounded-lg border bg-brand-dark px-2.5 py-1.5 font-mono text-xs text-brand-white outline-none ${
                      error ? 'border-brand-error/70' : 'border-white/8 focus:border-brand-coral/60'
                    }`}
                  />
                  {error && (
                    <p id={errorId} role="alert" className="mt-1 text-[11px] text-brand-error">
                      {error}
                    </p>
                  )}
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label={`Empresa do contato ${position}`}
                    value={contact.company}
                    onChange={(event) => onUpdate(contact.id, { company: event.target.value })}
                    className="w-full rounded-lg border border-white/8 bg-brand-dark px-2.5 py-1.5 text-sm text-brand-white outline-none focus:border-brand-coral/60"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label={`Cargo do contato ${position}`}
                    value={contact.position}
                    onChange={(event) => onUpdate(contact.id, { position: event.target.value })}
                    className="w-full rounded-lg border border-white/8 bg-brand-dark px-2.5 py-1.5 text-sm text-brand-white outline-none focus:border-brand-coral/60"
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    aria-label={`Remover contato ${position}`}
                    onClick={() => remove(contact.id)}
                    className="rounded-lg p-1.5 text-brand-muted transition-colors hover:bg-brand-error/10 hover:text-brand-error"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
