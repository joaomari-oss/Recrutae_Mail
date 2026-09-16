'use client'

import { useId, useRef } from 'react'
import { Bold, Link2 } from 'lucide-react'
import { hasUnsafeLink } from '@/lib/outreach/richText'

export type RosBodyEditorProps = {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  hint?: string
}

/**
 * Editor do corpo com a marcação mínima que o e-mail entende: negrito e link
 * nomeado. Os botões operam sobre a seleção e devolvem o cursor ao texto, para
 * que escrever continue sendo digitar.
 */
export function RosBodyEditor({ label, value, onChange, rows = 12, placeholder, hint }: RosBodyEditorProps) {
  const id = useId()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const unsafeLink = hasUnsafeLink(value)

  const wrapSelection = (before: string, after: string, fallback: string) => {
    const field = textarea.current
    if (!field) return
    // Lê do próprio campo: dois cliques seguidos com `onChange` atrasado
    // calculariam a partir de um texto velho e perderiam a primeira inserção.
    const current = field.value
    const start = field.selectionStart
    const end = field.selectionEnd
    const selected = current.slice(start, end) || fallback
    const next = current.slice(0, start) + before + selected + after + current.slice(end)
    onChange(next)
    // O React reescreve o valor; o cursor precisa ser reposicionado depois.
    requestAnimationFrame(() => {
      field.focus()
      field.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="font-mono text-[10px] uppercase tracking-widest text-brand-muted">
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => wrapSelection('**', '**', 'texto em negrito')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-brand-muted transition-colors hover:border-brand-coral/40 hover:text-brand-white"
          >
            <Bold className="h-3.5 w-3.5" />
            Negrito
          </button>
          <button
            type="button"
            onClick={() => wrapSelection('[', '](https://recrutae.com.br/os)', 'Clique aqui')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-brand-muted transition-colors hover:border-brand-coral/40 hover:text-brand-white"
          >
            <Link2 className="h-3.5 w-3.5" />
            Link
          </button>
        </div>
      </div>

      <textarea
        id={id}
        ref={textarea}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-lg border border-white/10 bg-brand-dark px-3 py-2.5 text-sm leading-relaxed text-brand-white outline-none transition-colors placeholder:text-brand-muted/40 focus:border-brand-coral/60"
      />

      <p className="text-xs text-brand-muted/70">
        {hint ?? 'Use **negrito** e [Clique aqui](https://…) para um link. Marcadores como {{nome}} e {{empresa}} são preenchidos por contato.'}
      </p>

      {unsafeLink && (
        <p role="alert" className="text-xs text-brand-error">
          Há link com endereço não permitido. Use apenas endereços que comecem com https:// ou http://.
        </p>
      )}
    </div>
  )
}
