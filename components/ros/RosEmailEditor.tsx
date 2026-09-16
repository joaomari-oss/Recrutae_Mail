'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import type { RosCampaignConfig, RosContact } from '@/lib/rosTypes'
import { RosBodyEditor } from '@/components/ros/RosBodyEditor'
import { RosEmailPreview } from '@/components/ros/RosEmailPreview'

export type RosGenerationInfo = {
  usedProvider?: string
  didFallback?: boolean
  templateEnforced?: boolean
  aiUnavailable?: boolean
  notice?: string
}

export type RosEmailEditorProps = {
  contact: RosContact
  config: RosCampaignConfig
  onSave: (id: string, updates: Partial<RosContact>) => void
  onApprove: (id: string) => void
  onRegenerate: (id: string) => void
  onSkip?: () => void
  generation?: RosGenerationInfo
}

const SAVE_DELAY_MS = 500

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
}

export function RosEmailEditor({
  contact, config, onSave, onApprove, onRegenerate, onSkip, generation,
}: RosEmailEditorProps) {
  const [subject, setSubject] = useState(contact.editedSubject || contact.generatedSubject)
  const [body, setBody] = useState(contact.editedBody || contact.generatedBody)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  // Trocar de contato — ou receber o texto recém-gerado — recarrega o editor.
  useEffect(() => {
    dirty.current = false
    setSubject(contact.editedSubject || contact.generatedSubject)
    setBody(contact.editedBody || contact.generatedBody)
  }, [contact.id, contact.generatedSubject, contact.generatedBody, contact.editedSubject, contact.editedBody])

  // Auto-save com atraso: digitar não pode gravar a cada tecla.
  useEffect(() => {
    if (!dirty.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      onSave(contact.id, { editedSubject: subject, editedBody: body })
    }, SAVE_DELAY_MS)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, body, contact.id])

  const generating = contact.status === 'generating'
  const canApprove = !generating && !!subject.trim() && !!body.trim()

  const approve = () => {
    if (!canApprove) return
    // Grava o texto atual antes de aprovar; o atraso do auto-save pode não ter vencido.
    if (saveTimer.current) clearTimeout(saveTimer.current)
    onSave(contact.id, { editedSubject: subject, editedBody: body })
    onApprove(contact.id)
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'a') { event.preventDefault(); approve() }
      else if (key === 'r') { event.preventDefault(); onRegenerate(contact.id) }
      else if (event.key === 'ArrowRight') { event.preventDefault(); onSkip?.() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const notice = generation?.templateEnforced || generation?.usedProvider === 'template'
    ? 'A IA não entregou uma variação fiel: este e-mail usa o texto-base preenchido. Edite à vontade antes de aprovar.'
    : generation?.didFallback
      ? 'O provedor principal falhou e a variação veio do provedor reserva.'
      : generation?.notice ?? null

  return (
    <section aria-label={`E-mail para ${contact.fullName || contact.email}`} className="flex h-full flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-ros text-lg font-semibold text-brand-white">
            {contact.fullName || contact.email}
          </h2>
          <p className="truncate font-mono text-xs text-brand-muted">
            {contact.email}{contact.company ? ` · ${contact.company}` : ''}
          </p>
        </div>
        {generation?.usedProvider && (
          <span className="rounded-md border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-brand-muted">
            {generation.usedProvider}
          </span>
        )}
      </header>

      {notice && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-brand-warning/25 bg-brand-warning/10 p-3 text-xs text-brand-white">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-warning" />
          {notice}
        </p>
      )}

      {contact.status === 'failed' && contact.errorMessage && (
        <p role="alert" className="rounded-lg border border-brand-error/25 bg-brand-error/10 p-3 text-xs text-brand-white">
          {contact.errorMessage}
        </p>
      )}

      {generating ? (
        <div className="flex flex-1 items-center justify-center gap-3 rounded-xl border border-white/8 bg-brand-charcoal p-10">
          <Loader2 className="h-5 w-5 animate-spin text-brand-coral" />
          <p className="text-sm text-brand-muted">Gerando o e-mail…</p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <label htmlFor={`ros-assunto-${contact.id}`} className="block font-mono text-[10px] uppercase tracking-widest text-brand-muted">
              Assunto
            </label>
            <input
              id={`ros-assunto-${contact.id}`}
              value={subject}
              onChange={(event) => { dirty.current = true; setSubject(event.target.value) }}
              className="w-full rounded-lg border border-white/10 bg-brand-dark px-3 py-2 text-sm text-brand-white outline-none focus:border-brand-coral/60"
            />
          </div>

          <RosBodyEditor
            label="Corpo do e-mail"
            value={body}
            rows={10}
            onChange={(value) => { dirty.current = true; setBody(value) }}
            hint="Use **negrito** e [Clique aqui](https://…). O que estiver aqui é exatamente o que será enviado."
          />

          <RosEmailPreview
            title="Prévia com assinatura"
            body={body}
            recruiterName={config.recruiterName}
            recruiterRole={config.recruiterRole}
            recruiterLinkedin={config.recruiterLinkedin}
            recruiterWhatsapp={config.recruiterWhatsapp}
          />
        </>
      )}

      <footer className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={approve} disabled={!canApprove}
          className="btn-coral inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:transform-none">
          <Check className="h-4 w-4" />
          Aprovar
        </button>
        <button type="button" onClick={() => onRegenerate(contact.id)} disabled={generating}
          className="inline-flex items-center gap-2 rounded-lg border border-white/12 px-4 py-2.5 text-sm font-medium text-brand-muted transition-colors hover:border-brand-coral/40 hover:text-brand-white disabled:opacity-40">
          <RefreshCw className="h-4 w-4" />
          Regenerar
        </button>
        {onSkip && (
          <button type="button" onClick={onSkip}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-muted transition-colors hover:text-brand-white">
            Pular
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-brand-muted/60">
          [A] aprovar · [R] regenerar · [→] pular
        </span>
      </footer>
    </section>
  )
}
