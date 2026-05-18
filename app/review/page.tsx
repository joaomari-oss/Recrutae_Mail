'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import { Candidate } from '@/lib/types'
import { CandidateCard } from '@/components/ui/CandidateCard'
import { EmailEditor } from '@/components/ui/EmailEditor'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CheckCheck,
  Mail,
  Sparkles,
  Send,
  ArrowRight,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'
import { toast } from 'sonner'

export default function ReviewPage() {
  const router = useRouter()
  const {
    activeCampaignId,
    candidatesByCampaign,
    campaignConfigById,
    setCampaignConfig,
    updateCandidate,
    approveAll,
    updateCampaign,
  } = useAppStore()

  const campaignId = activeCampaignId
  const candidates = campaignId ? candidatesByCampaign[campaignId] ?? [] : []
  const campaignConfig = campaignId ? campaignConfigById[campaignId] : undefined

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showQuotaDialog, setShowQuotaDialog] = useState(false)
  const generatingRef = useRef(false)
  const abortGenerationRef = useRef(false)
  const confettiFiredRef = useRef(false)
  const quotaPauseResolveRef = useRef<((continueWithAlt: boolean) => void) | null>(null)

  useEffect(() => {
    if (!campaignId || candidates.length === 0) { router.replace('/'); return }
    if (!campaignConfig) { router.replace('/campaign'); return }
    const first = candidates.find((c) => c.status !== 'sent')
    if (first) setSelectedId(first.id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* Generate all pending */
  useEffect(() => {
    if (!campaignConfig || !campaignId || generatingRef.current) return
    const pending = candidates.filter((c) => c.status === 'pending')
    if (pending.length === 0) return

    generatingRef.current = true
    abortGenerationRef.current = false
    updateCampaign(campaignId, { status: 'generating' })

    const generateAll = async () => {
      let currentProvider = campaignConfig.aiProvider || 'openai'

      for (const candidate of pending) {
        if (abortGenerationRef.current) break
        updateCandidate(campaignId, candidate.id, { status: 'generating' })
        try {
          const res = await apiFetch('/api/generate', {
            method: 'POST',
            body: JSON.stringify({
              candidate,
              role: campaignConfig.role,
              jobDescription: campaignConfig.jobDescription,
              link: campaignConfig.link,
              hiringCompany: campaignConfig.hiringCompany,
              recruiterName: campaignConfig.recruiterName,
              recruiterCompany: campaignConfig.recruiterCompany,
              recruiterRole: campaignConfig.recruiterRole,
              aiProvider: currentProvider,
              subjectTemplate: campaignConfig.subjectTemplate,
            }),
          })
          const data = await res.json()

          if (data.quotaExceeded) {
            const altProvider = currentProvider === 'openai' ? 'groq' : 'openai'
            updateCandidate(campaignId, candidate.id, { status: 'pending' })
            const continueWithAlt = await new Promise<boolean>((resolve) => {
              quotaPauseResolveRef.current = resolve
              setShowQuotaDialog(true)
            })
            if (continueWithAlt) {
              currentProvider = altProvider
              if (campaignId) setCampaignConfig(campaignId, { ...campaignConfig, aiProvider: altProvider })
              toast.success(`Alternando para ${altProvider === 'groq' ? 'Groq' : 'OpenAI'}. Continuando…`)
              updateCandidate(campaignId, candidate.id, { status: 'generating' })
              try {
                const retryRes = await apiFetch('/api/generate', {
                  method: 'POST',
                  body: JSON.stringify({
                    candidate,
                    role: campaignConfig.role,
                    jobDescription: campaignConfig.jobDescription,
                    link: campaignConfig.link,
                    hiringCompany: campaignConfig.hiringCompany,
                    recruiterName: campaignConfig.recruiterName,
                    recruiterCompany: campaignConfig.recruiterCompany,
                    recruiterRole: campaignConfig.recruiterRole,
                    aiProvider: altProvider,
                    subjectTemplate: campaignConfig.subjectTemplate,
                  }),
                })
                const retryData = await retryRes.json()
                if (!retryRes.ok || retryData.error) {
                  updateCandidate(campaignId, candidate.id, { status: 'failed', errorMessage: retryData.error || 'Erro ao gerar com modelo alternativo.' })
                } else {
                  updateCandidate(campaignId, candidate.id, { status: 'ready', generatedSubject: retryData.subject, generatedBody: retryData.body, editedSubject: retryData.subject, editedBody: retryData.body })
                }
              } catch {
                updateCandidate(campaignId, candidate.id, { status: 'failed', errorMessage: 'Falha de conexão.' })
              }
              continue
            } else {
              abortGenerationRef.current = true
              break
            }
          }

          if (!res.ok || data.error) {
            updateCandidate(campaignId, candidate.id, { status: 'failed', errorMessage: data.error || 'Erro ao gerar email.' })
          } else {
            updateCandidate(campaignId, candidate.id, { status: 'ready', generatedSubject: data.subject, generatedBody: data.body, editedSubject: data.subject, editedBody: data.body })
          }
        } catch {
          updateCandidate(campaignId, candidate.id, { status: 'failed', errorMessage: 'Falha de conexão com a API.' })
        }
      }

      generatingRef.current = false
      if (abortGenerationRef.current) {
        const current = useAppStore.getState().candidatesByCampaign[campaignId] ?? []
        current.forEach((c) => {
          if (c.status === 'generating') updateCandidate(campaignId, c.id, { status: 'pending' })
        })
        updateCampaign(campaignId, { status: 'ready' })
        toast.info('Geração cancelada.')
      } else {
        updateCampaign(campaignId, { status: 'ready' })
      }
    }
    generateAll()
  }, [campaignConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Confetti when all approved */
  useEffect(() => {
    const total = candidates.length
    if (total === 0) return
    const doneCount = candidates.filter((c) => c.status === 'approved' || c.status === 'sent').length
    if (doneCount === total && !confettiFiredRef.current) {
      confettiFiredRef.current = true
      import('canvas-confetti').then(({ default: confetti }) => {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#F26A4F', '#F4845F', '#FAFAF8'] })
        setTimeout(() => confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 } }), 300)
      })
      toast.success('Todos os emails aprovados! Hora de enviar.', { description: 'Confetti merecido 🎉' })
    }
  }, [candidates])

  /* Keyboard shortcuts */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'a' || e.key === 'A') handleApprove()
      else if (e.key === 'r' || e.key === 'R') handleRegenerate()
      else if (e.key === 'ArrowRight') handleNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  const selectedCandidate = candidates.find((c) => c.id === selectedId) || null

  const navigateNext = useCallback(() => {
    if (!selectedId) return
    const idx = candidates.findIndex((c) => c.id === selectedId)
    const next = candidates.slice(idx + 1).find((c) => c.status !== 'sent')
    if (next) setSelectedId(next.id)
  }, [candidates, selectedId])

  const handleApprove = useCallback(() => {
    if (!selectedCandidate || !campaignId) return
    if (selectedCandidate.status === 'ready' || selectedCandidate.status === 'failed') {
      updateCandidate(campaignId, selectedCandidate.id, { status: 'approved' })
    } else if (selectedCandidate.status !== 'approved') return
    setTimeout(navigateNext, 150)
  }, [selectedCandidate, campaignId, updateCandidate, navigateNext])

  const handleRegenerate = useCallback(() => {
    if (!selectedCandidate || !campaignConfig || !campaignId) return
    updateCandidate(campaignId, selectedCandidate.id, { status: 'generating', errorMessage: undefined })
    apiFetch('/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        candidate: selectedCandidate,
        role: campaignConfig.role,
        jobDescription: campaignConfig.jobDescription,
        link: campaignConfig.link,
        hiringCompany: campaignConfig.hiringCompany,
        recruiterName: campaignConfig.recruiterName,
        recruiterCompany: campaignConfig.recruiterCompany,
        recruiterRole: campaignConfig.recruiterRole,
        aiProvider: campaignConfig.aiProvider,
        subjectTemplate: campaignConfig.subjectTemplate,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          updateCandidate(campaignId, selectedCandidate.id, { status: 'failed', errorMessage: data.error })
        } else {
          updateCandidate(campaignId, selectedCandidate.id, { status: 'ready', generatedSubject: data.subject, generatedBody: data.body, editedSubject: data.subject, editedBody: data.body })
          toast.success('Email regenerado com sucesso.')
        }
      })
      .catch(() => {
        updateCandidate(campaignId, selectedCandidate.id, { status: 'failed', errorMessage: 'Falha de conexão.' })
      })
  }, [selectedCandidate, campaignConfig, campaignId, updateCandidate])

  const handleNext = useCallback(() => { navigateNext() }, [navigateNext])

  const handleRegenerateFailed = () => {
    if (!campaignConfig || !campaignId) return
    const failed = candidates.filter((c) => c.status === 'failed')
    if (failed.length === 0) { toast.info('Nenhum email com falha para regenerar.'); return }
    failed.forEach((candidate) => {
      updateCandidate(campaignId, candidate.id, { status: 'generating', errorMessage: undefined })
    })
    const regenerateAll = async () => {
      for (const candidate of failed) {
        try {
          const res = await apiFetch('/api/generate', {
            method: 'POST',
            body: JSON.stringify({
              candidate,
              role: campaignConfig.role,
              jobDescription: campaignConfig.jobDescription,
              link: campaignConfig.link,
              hiringCompany: campaignConfig.hiringCompany,
              recruiterName: campaignConfig.recruiterName,
              recruiterCompany: campaignConfig.recruiterCompany,
              recruiterRole: campaignConfig.recruiterRole,
              aiProvider: campaignConfig.aiProvider,
              subjectTemplate: campaignConfig.subjectTemplate,
            }),
          })
          const data = await res.json()
          if (!res.ok || data.error) {
            updateCandidate(campaignId, candidate.id, { status: 'failed', errorMessage: data.error })
          } else {
            updateCandidate(campaignId, candidate.id, { status: 'ready', generatedSubject: data.subject, generatedBody: data.body, editedSubject: data.subject, editedBody: data.body })
          }
        } catch {
          updateCandidate(campaignId, candidate.id, { status: 'failed', errorMessage: 'Falha de conexão.' })
        }
      }
      toast.success(`${failed.length} email(s) regenerado(s).`)
    }
    regenerateAll()
    toast.info(`Regenerando ${failed.length} email(s) com falha…`)
  }

  /* Stats */
  const total          = candidates.length
  const approvedCount  = candidates.filter((c) => c.status === 'approved' || c.status === 'sent').length
  const readyCount     = candidates.filter((c) => c.status === 'ready').length
  const generatingCount = candidates.filter((c) => c.status === 'generating').length
  const failedCount    = candidates.filter((c) => c.status === 'failed').length
  const progressPct    = total > 0 ? Math.round((approvedCount / total) * 100) : 0
  const generatedPct   = total > 0 ? Math.round(((total - candidates.filter((c) => c.status === 'pending' || c.status === 'generating').length) / total) * 100) : 0
  const canProceed     = approvedCount > 0

  if (candidates.length === 0) return null

  return (
    <div className="flex h-screen overflow-hidden bg-brand-dark">
      {/* ── Left panel: candidate list (35%) ── */}
      <div className="w-[35%] min-w-[280px] max-w-[380px] flex-shrink-0 flex flex-col border-r border-white/5 bg-brand-charcoal/30">
        {/* Header */}
        <div className="p-4 border-b border-white/5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-coral/10 border border-brand-coral/20 flex items-center justify-center">
              <Mail className="w-3.5 h-3.5 text-brand-coral" />
            </div>
            <span className="font-display font-semibold text-brand-white">Revisão</span>
            <span className="ml-auto text-xs text-brand-muted font-mono">
              {candidates.findIndex((c) => c.id === selectedId) + 1}/{total}
            </span>
          </div>

          {/* Generation progress */}
          {generatedPct < 100 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-brand-muted">
                  <Sparkles className="h-3 w-3 text-brand-coral" />
                  Gerando com IA…
                </span>
                <span className="text-brand-muted font-mono">{generatedPct}%</span>
              </div>
              <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-coral to-brand-orange rounded-full transition-all duration-500"
                  style={{ width: `${generatedPct}%` }}
                />
              </div>
              <button
                onClick={() => { abortGenerationRef.current = true; toast.info('Cancelando…') }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-brand-error hover:bg-brand-error/10 border border-brand-error/20 transition-all"
              >
                <XCircle className="h-3 w-3" /> Cancelar geração
              </button>
            </div>
          )}

          {/* Approval progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-brand-muted">
              <span>Aprovados</span>
              <span className="font-mono font-medium text-brand-white">{approvedCount}/{total}</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-success/70 to-brand-success rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Mini stats */}
          <div className="flex gap-2 flex-wrap">
            {readyCount > 0 && (
              <span className="text-xs bg-brand-warning/10 text-brand-warning border border-brand-warning/20 px-2 py-0.5 rounded-full">
                {readyCount} pronto{readyCount !== 1 ? 's' : ''}
              </span>
            )}
            {generatingCount > 0 && (
              <span className="text-xs bg-brand-coral/10 text-brand-coral border border-brand-coral/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> {generatingCount} gerando
              </span>
            )}
            {failedCount > 0 && (
              <span className="text-xs bg-brand-error/10 text-brand-error border border-brand-error/20 px-2 py-0.5 rounded-full">
                {failedCount} falha{failedCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Candidate list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {candidates.map((c, i) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              isSelected={selectedId === c.id}
              index={i}
              onClick={() => setSelectedId(c.id)}
            />
          ))}
        </div>

        {/* Footer actions */}
        <div className="p-3 border-t border-white/5 space-y-2">
          <button
            onClick={() => { if (campaignId) { approveAll(campaignId); toast.success('Todos os emails prontos foram aprovados.') } }}
            disabled={readyCount === 0}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-white/10 text-xs text-brand-muted hover:text-brand-white hover:border-white/20 hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Aprovar todos prontos
          </button>

          {failedCount > 0 && (
            <button
              onClick={handleRegenerateFailed}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-brand-error/20 text-xs text-brand-error hover:bg-brand-error/10 transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Regenerar falhas ({failedCount})
            </button>
          )}

          <div className="border-t border-white/5 pt-2">
            <button
              onClick={() => router.push('/sending')}
              disabled={!canProceed}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all',
                canProceed
                  ? 'btn-coral'
                  : 'bg-white/5 text-brand-muted cursor-not-allowed'
              )}
            >
              <Send className="h-4 w-4" />
              Enviar {approvedCount > 0 && `${approvedCount} `}aprovado{approvedCount !== 1 ? 's' : ''}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Right panel: email editor (65%) ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Keyboard hints bar */}
        <div className="px-5 py-2.5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-brand-muted">
            {[
              { key: 'A', label: 'aprovar' },
              { key: 'R', label: 'regenerar' },
              { key: '→', label: 'próximo' },
            ].map(({ key, label }) => (
              <span key={key} className="flex items-center gap-1.5">
                <kbd className="bg-white/8 border border-white/10 px-1.5 py-0.5 rounded text-[10px] font-mono text-brand-white">
                  {key}
                </kbd>
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          {selectedCandidate && campaignId ? (
            <EmailEditor
              key={selectedCandidate.id}
              candidate={selectedCandidate}
              campaignId={campaignId}
              onApprove={handleApprove}
              onRegenerate={handleRegenerate}
              onNext={handleNext}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-brand-muted gap-4">
              <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <Mail className="h-8 w-8 opacity-30" />
              </div>
              <p className="text-sm">Selecione um candidato para revisar o email</p>
            </div>
          )}
        </div>
      </div>

      {/* Quota dialog */}
      <Dialog open={showQuotaDialog} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md bg-brand-charcoal border-white/10"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-brand-white">
              <AlertTriangle className="h-5 w-5 text-brand-warning" />
              Limite de tokens atingido
            </DialogTitle>
            <DialogDescription className="text-brand-muted">
              A IA atual atingiu o limite de uso. Deseja continuar com outro modelo de linguagem?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <button
              onClick={() => { setShowQuotaDialog(false); quotaPauseResolveRef.current?.(false) }}
              className="flex-1 py-2.5 rounded-lg border border-white/10 text-sm text-brand-muted hover:text-brand-white hover:bg-white/5 transition-all"
            >
              Parar campanha
            </button>
            <button
              onClick={() => { setShowQuotaDialog(false); quotaPauseResolveRef.current?.(true) }}
              className="btn-coral flex-1 py-2.5 text-sm font-semibold"
            >
              Continuar com alternativa
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
