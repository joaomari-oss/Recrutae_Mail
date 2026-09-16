'use client'

import { useRef } from 'react'
import { X } from 'lucide-react'
import type { RosContact } from '@/lib/rosTypes'

export type RosContactTableProps = {
  contacts: RosContact[]
  /** Problemas por id de contato — derivados da lista, nunca guardados aqui. */
  issues: Record<string, string>
  onUpdate: (id: string, updates: Partial<RosContact>) => void
  onRemove: (id: string) => void
}

const columns = ['Nome', 'E-mail', 'Empresa', 'Cargo'] as const

export function RosContactTable({ contacts, issues, onUpdate, onRemove }: RosContactTableProps) {
  // Remover uma linha jogaria o foco no body; ele vai para o botão seguinte.
  const removeButtons = useRef(new Map<string, HTMLButtonElement>())

  const remove = (id: string, index: number) => {
    const next = contacts[index + 1] ?? contacts[index - 1]
    onRemove(id)
    removeButtons.current.delete(id)
    if (next) requestAnimationFrame(() => removeButtons.current.get(next.id)?.focus())
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
            const issue = issues[contact.id]
            const issueId = `ros-contato-${contact.id}-erro`
            return (
              <tr key={contact.id} className="align-top transition-colors hover:bg-white/2">
                <td className="px-2 py-2">
                  <input
                    aria-label={`Nome do contato ${position}`}
                    value={contact.fullName}
                    // Sem trim aqui: ele apagaria o espaço no meio de "Ana Souza".
                    onChange={(event) => onUpdate(contact.id, { fullName: event.target.value })}
                    className="w-full rounded-lg border border-white/8 bg-brand-dark px-2.5 py-1.5 text-sm text-brand-white outline-none focus:border-brand-coral/60"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label={`E-mail do contato ${position}`}
                    aria-invalid={issue ? true : undefined}
                    aria-describedby={issue ? issueId : undefined}
                    value={contact.email}
                    onChange={(event) => onUpdate(contact.id, { email: event.target.value })}
                    className={`w-full rounded-lg border bg-brand-dark px-2.5 py-1.5 font-mono text-xs text-brand-white outline-none ${
                      issue ? 'border-brand-error/70' : 'border-white/8 focus:border-brand-coral/60'
                    }`}
                  />
                  {issue && (
                    <p id={issueId} role="alert" className="mt-1 text-[11px] text-brand-error">
                      {issue}
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
                    ref={(node) => { if (node) removeButtons.current.set(contact.id, node) }}
                    aria-label={`Remover contato ${position}`}
                    onClick={() => remove(contact.id, index)}
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
