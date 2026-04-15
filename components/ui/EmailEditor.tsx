'use client'

import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { Candidate } from '@/lib/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  Check,
  CheckCheck,
  RefreshCw,
  ChevronRight,
  Loader2,
  AlertCircle,
  Linkedin,
  Building2,
  Briefcase,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmailEditorProps {
  candidate: Candidate
  campaignId: string
  onApprove:    () => void
  onRegenerate: () => void
  onNext:       () => void
}

export function EmailEditor({
  candidate,
  campaignId,
  onApprove,
  onRegenerate,
  onNext,
}: EmailEditorProps) {
  const { updateCandidate } = useAppStore()
  const [localSubject, setLocalSubject] = useState(
    candidate.editedSubject || candidate.generatedSubject
  )
  const [localBody, setLocalBody] = useState(
    candidate.editedBody || candidate.generatedBody
  )
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevStatusRef = useRef(candidate.status)

  /* Sync when generation completes */
  useEffect(() => {
    if (prevStatusRef.current === 'generating' && candidate.status === 'ready') {
      setLocalSubject(candidate.editedSubject || candidate.generatedSubject)
      setLocalBody(candidate.editedBody || candidate.generatedBody)
    }
    prevStatusRef.current = candidate.status
  }, [candidate.status, candidate.generatedSubject, candidate.generatedBody, candidate.editedSubject, candidate.editedBody])

  /* Debounced save */
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(() => {
      updateCandidate(campaignId, candidate.id, {
        editedSubject: localSubject,
        editedBody:    localBody,
      })
      setSaveState('saved')
    }, 500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [localSubject, localBody, candidate.id, campaignId, updateCandidate])

  const isGenerating = candidate.status === 'generating'
  const isFailed     = candidate.status === 'failed'
  const isApproved   = candidate.status === 'approved'

  return (
    <div className="flex flex-col h-full">
      {/* Candidate header */}
      <div className="p-5 border-b border-white/5 bg-brand-charcoal/50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-brand-coral/20 border border-brand-coral/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-brand-coral uppercase">
                {(candidate.fullName || candidate.email)
                  .trim()
                  .split(' ')
                  .filter(Boolean)
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')}
              </span>
            </div>

            <div>
              <h3 className="font-semibold text-brand-white text-sm leading-tight">
                {candidate.fullName || candidate.email.split('@')[0]}
              </h3>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {candidate.title && (
                  <span className="flex items-center gap-1 text-xs text-brand-muted">
                    <Briefcase className="h-3 w-3" />
                    {candidate.title}
                  </span>
                )}
                {candidate.company && (
                  <span className="flex items-center gap-1 text-xs text-brand-muted">
                    <Building2 className="h-3 w-3" />
                    {candidate.company}
                  </span>
                )}
                {candidate.linkedinUrl && (
                  <a
                    href={candidate.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-brand-coral hover:text-brand-orange transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Linkedin className="h-3 w-3" />
                    LinkedIn
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-mono text-brand-muted">{candidate.email}</span>
            <StatusBadge status={candidate.status} />
          </div>
        </div>
      </div>

      {/* Editor body */}
      <div className="flex-1 overflow-y-auto">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-brand-muted">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-brand-coral/20 border-t-brand-coral animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-brand-coral/20 animate-pulse" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-brand-white">Gerando email personalizado…</p>
              <p className="text-xs text-brand-muted mt-1">A IA está analisando o perfil</p>
            </div>
            {/* Skeleton preview */}
            <div className="w-full max-w-sm space-y-2 px-8">
              <div className="skeleton h-4 rounded-md w-3/4" />
              <div className="skeleton h-3 rounded-md w-full" />
              <div className="skeleton h-3 rounded-md w-5/6" />
              <div className="skeleton h-3 rounded-md w-4/5" />
            </div>
          </div>
        ) : isFailed ? (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="w-14 h-14 rounded-full bg-brand-error/10 border border-brand-error/20 flex items-center justify-center">
              <AlertCircle className="h-7 w-7 text-brand-error" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-brand-white font-display">Falha ao gerar email</p>
              <p className="text-sm text-brand-muted mt-1.5 max-w-xs">
                {candidate.errorMessage || 'Erro desconhecido. Tente regenerar.'}
              </p>
            </div>
            <button
              onClick={onRegenerate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-coral/30 text-brand-coral hover:bg-brand-coral/10 transition-all text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Subject */}
            <div className="space-y-2">
              <label className="flex items-center justify-between">
                <span className="text-xs font-medium text-brand-muted uppercase tracking-widest">
                  Assunto
                </span>
                <span className={cn(
                  'text-xs transition-colors',
                  saveState === 'saving' ? 'text-brand-warning' : 'text-brand-success'
                )}>
                  {saveState === 'saving' ? 'Salvando…' : '✓ Salvo'}
                </span>
              </label>
              <input
                type="text"
                value={localSubject}
                onChange={(e) => setLocalSubject(e.target.value)}
                placeholder="Assunto do email…"
                disabled={isGenerating}
                className={cn(
                  'w-full px-4 py-3 rounded-lg border text-sm font-medium text-brand-white',
                  'bg-brand-dark border-white/10 focus:border-brand-coral/50 focus:ring-0',
                  'outline-none transition-colors placeholder:text-brand-muted/50',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              />
            </div>

            {/* Divider */}
            <div className="border-t border-white/5" />

            {/* Body */}
            <div className="space-y-2">
              <label className="flex items-center justify-between">
                <span className="text-xs font-medium text-brand-muted uppercase tracking-widest">
                  Corpo do email
                </span>
                <span className="text-xs text-brand-muted font-mono">
                  {localBody.length} chars
                </span>
              </label>
              <textarea
                value={localBody}
                onChange={(e) => setLocalBody(e.target.value)}
                placeholder="Corpo do email…"
                disabled={isGenerating}
                rows={16}
                className={cn(
                  'w-full px-4 py-3 rounded-lg border email-body text-brand-white',
                  'bg-brand-dark border-white/10 focus:border-brand-coral/50 focus:ring-0',
                  'outline-none transition-colors placeholder:text-brand-muted/50',
                  'resize-none leading-relaxed',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              />
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      {!isGenerating && (
        <div className="p-4 border-t border-white/5 bg-brand-charcoal/30">
          <div className="flex items-center gap-2">
            <button
              onClick={onApprove}
              disabled={isFailed || isApproved}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200',
                isApproved
                  ? 'bg-brand-success/20 text-brand-success border border-brand-success/30 cursor-default'
                  : isFailed
                  ? 'bg-white/5 text-brand-muted cursor-not-allowed'
                  : 'btn-coral'
              )}
            >
              {isApproved ? (
                <><CheckCheck className="h-4 w-4" /> Aprovado</>
              ) : (
                <><Check className="h-4 w-4" /> Aprovar <span className="opacity-50 text-xs ml-1 font-mono">[A]</span></>
              )}
            </button>

            <button
              onClick={onRegenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/10 text-brand-muted hover:text-brand-white hover:border-white/20 hover:bg-white/5 text-sm font-medium transition-all duration-200"
            >
              <RefreshCw className="h-4 w-4" />
              Regenerar
              <span className="opacity-50 text-xs font-mono">[R]</span>
            </button>

            <button
              onClick={onNext}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-brand-muted hover:text-brand-white hover:bg-white/5 text-sm font-medium transition-all duration-200"
            >
              Pular
              <ChevronRight className="h-4 w-4" />
              <span className="opacity-50 text-xs font-mono">[→]</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
