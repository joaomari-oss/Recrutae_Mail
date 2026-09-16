'use client'

import { useId, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { createManualRosContact } from '@/lib/ros/contacts'
import type { RosContact } from '@/lib/rosTypes'

export type RosManualContactFormProps = {
  /** E-mails já presentes na campanha — a deduplicação é a mesma do upload. */
  existingEmails: Set<string>
  onAdd: (contact: RosContact) => void
}

const fields = [
  { key: 'email', label: 'E-mail', type: 'email', placeholder: 'contato@empresa.com.br', required: true },
  { key: 'fullName', label: 'Nome', type: 'text', placeholder: 'Ana Souza', required: false },
  { key: 'company', label: 'Empresa', type: 'text', placeholder: 'Acme', required: false },
  { key: 'position', label: 'Cargo', type: 'text', placeholder: 'Head de RH', required: false },
] as const

type FieldKey = (typeof fields)[number]['key']

const emptyDraft: Record<FieldKey, string> = { email: '', fullName: '', company: '', position: '' }

export function RosManualContactForm({ existingEmails, onAdd }: RosManualContactFormProps) {
  const baseId = useId()
  const errorId = `${baseId}-erro`
  const [draft, setDraft] = useState(emptyDraft)
  const [error, setError] = useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    try {
      // A cópia evita que o validador compartilhado mute o conjunto do chamador.
      const contact = createManualRosContact(draft, new Set(existingEmails))
      setError(null)
      setDraft(emptyDraft)
      onAdd(contact)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar o contato.')
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((field) => {
          const inputId = `${baseId}-${field.key}`
          const isEmail = field.key === 'email'
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-brand-muted">
                {/* O marcador fica fora do label para não entrar no nome acessível. */}
                <label htmlFor={inputId}>{field.label}</label>
                {field.required && <span aria-hidden>*</span>}
              </span>
              <input
                id={inputId}
                type={field.type}
                value={draft[field.key]}
                placeholder={field.placeholder}
                required={field.required}
                aria-required={field.required || undefined}
                aria-invalid={isEmail && error ? true : undefined}
                aria-describedby={isEmail && error ? errorId : undefined}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                  if (isEmail && error) setError(null)
                }}
                className="rounded-lg border border-white/10 bg-brand-dark px-3 py-2 text-sm text-brand-white outline-none transition-colors placeholder:text-brand-muted/40 focus:border-brand-coral/60"
              />
            </div>
          )
        })}
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-sm text-brand-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="btn-coral flex w-full items-center justify-center gap-2 py-2.5 text-sm font-semibold sm:w-auto sm:px-5"
      >
        <UserPlus className="h-4 w-4" />
        Adicionar contato
      </button>

      <p className="text-xs text-brand-muted/70">
        Só o e-mail é obrigatório. Sem nome, usamos a parte local do endereço apenas para exibição.
      </p>
    </form>
  )
}
