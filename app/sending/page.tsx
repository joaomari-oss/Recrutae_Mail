'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import {
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Clock,
  AlertTriangle,
  Play,
  RefreshCw,
} from 'lucide-react'
import { cn, delay, getStatusLabel } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'
import { getSessionId } from '@/lib/session'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { upsertCandidateSent } from '@/lib/supabaseOps'

const MAX_SEND_ATTEMPTS = 2

async function acquireLock(campaignId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiFetch('/api/campaign-lock', {
      method: 'POST',
      body: JSON.stringify({ campaignId, sessionId: getSessionId(), action: 'acquire' }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Não foi possível adquirir o lock.' }
    }
    return { success: true }
  } catch {
    return { success: false, error: 'Falha de conexão ao adquirir lock.' }
  }
}

async function releaseLock(campaignId: string): Promise<void> {
  try {
    await apiFetch('/api/campaign-lock', {
      method: 'POST',
      body: JSON.stringify({ campaignId, sessionId: getSessionId(), action: 'release' }),
    })
  } catch {
    // Ignore — lock will expire naturally
  }
}

export default function SendingPage() {
  const router = useRouter()
  const {
    activeCampaignId,
    candidatesByCampaign,
    campaignConfigById,
    campaigns,
    updateCandidate,
    updateCampaign,
    addSentEmail,
    resetStuckCandidates,
    retryFailedCandidates,
  } = useAppStore()

  const campaignId = activeCampaignId
  const candidates = campaignId ? candidatesByCampaign[campaignId] ?? [] : []
  const campaign   = campaigns.find((c) => c.id === campaignId)
  const config     = campaignId ? campaignConfigById[campaignId] : undefined

  const [isSending, setIsSending]         = useState(false)
  const [isSubmitting, setIsSubmitting]   = useState(false)
  const [isDone, setIsDone]               = useState(false)
  const [currentSending, setCurrentSending] = useState<string | null>(null)
  const [sentCount, setSentCount]         = useState(0)
  const [failedCount, setFailedCount]     = useState(0)
  const [totalToSend, setTotalToSend]     = useState(0)
  const [showResumeDialog, setShowResumeDialog] = useState(false)
  const abortRef    = useRef(false)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const approvedCandidates = candidates.filter(
    (c) => c.status === 'approved' || c.status === 'sent' || c.status === 'sending' || c.status === 'failed'
  )
  const pendingApproved = candidates.filter((c) => c.status === 'approved')
  const alreadySent     = candidates.filter((c) => c.status === 'sent').length

  // Redirect if no active campaign
  useEffect(() => {
    if (!campaignId || candidates.length === 0) router.replace('/')
  }, [campaignId, candidates.length, router])

  // Detect interrupted sending session on mount
  useEffect(() => {
    if (!campaignId || !campaign) return

    // Reset candidates stuck in 'sending' from a previous crashed session
    const stuckCount = resetStuckCandidates(campaignId)

    // If campaign was in 'sending' state but we just arrived fresh, offer to resume
    if (campaign.status === 'sending') {
      const freshCandidates = useAppStore.getState().candidatesByCampaign[campaignId] ?? []
      const hasApproved = freshCandidates.some((c) => c.status === 'approved') || stuckCount > 0
      if (hasApproved) {
        setShowResumeDialog(true)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before closing tab while sending
  useEffect(() => {
    if (!isSending) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
      // Release lock via keepalive fetch (survives page unload)
      if (campaignId) {
        fetch('/api/campaign-lock', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY ?? '',
          },
          body: JSON.stringify({ campaignId, sessionId: getSessionId(), action: 'release' }),
          keepalive: true,
        }).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isSending, campaignId])

  // Heartbeat to renew lock every 60 seconds
  useEffect(() => {
    if (!isSending || !campaignId) return

    heartbeatRef.current = setInterval(async () => {
      try {
        await apiFetch('/api/campaign-lock', {
          method: 'POST',
          body: JSON.stringify({ campaignId, sessionId: getSessionId(), action: 'heartbeat' }),
        })
      } catch {
        // If heartbeat fails, lock expires naturally — that's acceptable
      }
    }, 60_000)

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [isSending, campaignId])

  const handleSendAll = async () => {
    if (!campaignId || isSubmitting || isSending) return

    const toSend = useAppStore.getState().candidatesByCampaign[campaignId]?.filter(
      (c) => c.status === 'approved'
    ) ?? []

    if (toSend.length === 0) {
      toast.error('Nenhum email aprovado para enviar.')
      return
    }

    setIsSubmitting(true)

    // Acquire server-side lock before starting
    const lockResult = await acquireLock(campaignId)
    if (!lockResult.success) {
      toast.error(lockResult.error || 'Não foi possível iniciar o envio.')
      setIsSubmitting(false)
      return
    }

    const fixedTotal = toSend.length
    setTotalToSend(fixedTotal)
    setSentCount(0)
    setFailedCount(0)
    setIsSending(true)
    setIsSubmitting(false)
    setShowResumeDialog(false)
    abortRef.current = false
    updateCampaign(campaignId, { status: 'sending' })

    let sent   = alreadySent
    let failed = 0

    for (const candidate of toSend) {
      if (abortRef.current) break

      // Read fresh state to avoid stale closure
      const freshState = useAppStore.getState()
      const fresh = freshState.candidatesByCampaign[campaignId]?.find((c) => c.id === candidate.id)

      // Skip if already sent (from another tab or retry)
      if (!fresh || fresh.status === 'sent') continue

      // Skip if too many attempts
      if ((fresh.sendAttempts ?? 0) >= MAX_SEND_ATTEMPTS) {
        updateCandidate(campaignId, candidate.id, {
          status: 'failed',
          errorMessage: `Máximo de ${MAX_SEND_ATTEMPTS} tentativas atingido.`,
        })
        failed++
        setFailedCount(failed)
        continue
      }

      setCurrentSending(candidate.id)
      updateCandidate(campaignId, candidate.id, {
        status: 'sending',
        sendAttempts: (fresh.sendAttempts ?? 0) + 1,
      })

      try {
        // Retry up to 3 times on 429 (rate limit) with exponential backoff
        let res: Response | null = null
        let data: any = null
        for (let attempt = 0; attempt < 3; attempt++) {
          res = await apiFetch('/api/send', {
            method: 'POST',
            body: JSON.stringify({
              to:               fresh.email,
              subject:          fresh.editedSubject || fresh.generatedSubject,
              body:             fresh.editedBody || fresh.generatedBody,
              candidateName:    fresh.fullName,
              recruiterName:    config?.recruiterName,
              recruiterRole:    config?.recruiterRole,
              recruiterCompany: config?.recruiterCompany,
              replyTo:          config?.replyTo,
              campaignId,
              candidateEmail:   fresh.email,
            }),
          })
          data = await res.json().catch(() => ({}))
          // Break immediately on non-retriable responses (not 429 rate-limit and not 5xx server errors)
          if (res.status !== 429 && res.status < 500) break
          // Only wait if another retry will follow
          if (attempt < 2) await delay(2000 * Math.pow(2, attempt))
        }

        if (!res || !res.ok || !data?.success) {
          updateCandidate(campaignId, candidate.id, {
            status: 'failed',
            errorMessage: data.error || 'Erro ao enviar.',
          })
          addSentEmail({
            id: crypto.randomUUID(),
            campaignId,
            campaignName: campaign?.name || '',
            candidateName: fresh.fullName,
            company: fresh.company,
            email: fresh.email,
            subject: fresh.editedSubject || fresh.generatedSubject,
            body: fresh.editedBody || fresh.generatedBody,
            status: 'failed',
            errorMessage: data.error || 'Erro ao enviar.',
            sentAt: new Date().toISOString(),
            sentBySessionId: getSessionId(),
          })
          upsertCandidateSent(campaignId, fresh, campaign, config, 'failed', undefined, data.error || 'Erro ao enviar.')
          failed++
          setFailedCount(failed)
        } else {
          const sentAt = new Date().toISOString()
          updateCandidate(campaignId, candidate.id, {
            status: 'sent',
            sentAt,
            resendMessageId: data.messageId,
            sentBySessionId: getSessionId(),
          })
          addSentEmail({
            id: crypto.randomUUID(),
            resendMessageId: data.messageId,
            campaignId,
            campaignName: campaign?.name || '',
            candidateName: fresh.fullName,
            company: fresh.company,
            email: fresh.email,
            subject: fresh.editedSubject || fresh.generatedSubject,
            body: fresh.editedBody || fresh.generatedBody,
            status: 'sent',
            sentAt,
            sentBySessionId: getSessionId(),
          })
          upsertCandidateSent(campaignId, fresh, campaign, config, 'sent', data.messageId)
          sent++
          setSentCount(sent)
        }
      } catch (err) {
        const errorMessage = err instanceof Error && err.message.includes('Timeout')
          ? 'Timeout: servidor não respondeu a tempo.'
          : 'Falha de conexão.'
        updateCandidate(campaignId, candidate.id, { status: 'failed', errorMessage })
        addSentEmail({
          id: crypto.randomUUID(),
          campaignId,
          campaignName: campaign?.name || '',
          candidateName: fresh.fullName,
          company: fresh.company,
          email: fresh.email,
          subject: fresh.editedSubject || fresh.generatedSubject,
          body: fresh.editedBody || fresh.generatedBody,
          status: 'failed',
          errorMessage,
          sentAt: new Date().toISOString(),
          sentBySessionId: getSessionId(),
        })
        upsertCandidateSent(campaignId, fresh, campaign, config, 'failed', undefined, errorMessage)
        failed++
        setFailedCount(failed)
      }

      if (!abortRef.current) await delay(1200)
    }

    // Release lock and clean up heartbeat
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    await releaseLock(campaignId)

    setCurrentSending(null)
    setIsSending(false)
    setIsDone(true)
    updateCampaign(campaignId, { status: 'completed' })

    const finalState = useAppStore.getState()
    const finalCandidates = finalState.candidatesByCampaign[campaignId] ?? []
    const totalSent   = finalCandidates.filter((c) => c.status === 'sent').length
    const totalFailed = finalCandidates.filter((c) => c.status === 'failed').length

    if (totalFailed === 0) {
      toast.success(`${totalSent} email(s) enviado(s) com sucesso!`)
    } else {
      toast.warning(`${totalSent} enviado(s), ${totalFailed} falharam.`)
    }
  }

  const progressPct = totalToSend > 0
    ? Math.min(100, Math.round(((sentCount + failedCount) / totalToSend) * 100))
    : 0
  const totalSentNow   = candidates.filter((c) => c.status === 'sent').length
  const totalFailedNow = candidates.filter((c) => c.status === 'failed').length

  if (!campaignId || candidates.length === 0) return null

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
      {/* Resume dialog */}
      <Dialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Retomar envio?</DialogTitle>
            <DialogDescription>
              Esta campanha foi interrompida antes de concluir. Há emails aprovados aguardando envio.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setShowResumeDialog(false)}
              className="px-4 py-2 rounded-lg border border-white/10 text-brand-muted hover:text-brand-white hover:bg-white/5 transition-all text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleSendAll}
              className="btn-coral px-5 py-2 text-sm font-semibold flex items-center gap-2"
            >
              <Play className="h-4 w-4" /> Retomar envio
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warning banner */}
      {isSending && (
        <div className="bg-brand-warning/10 border-b border-brand-warning/20 px-8 py-2.5 flex items-center justify-center gap-2 text-brand-warning text-xs font-medium animate-fade-in">
          <AlertTriangle className="h-4 w-4" />
          Envio em andamento — não feche esta aba
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg space-y-8">
          {/* Header */}
          <div className="text-center space-y-2 animate-fade-up" style={{ animationFillMode: 'forwards' }}>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-coral/10 border border-brand-coral/20 mb-2">
              {isDone ? (
                <CheckCircle2 className="h-8 w-8 text-brand-success" />
              ) : isSending ? (
                <Loader2 className="h-8 w-8 text-brand-coral animate-spin" />
              ) : (
                <Send className="h-8 w-8 text-brand-coral" />
              )}
            </div>
            <h1 className="text-3xl font-display font-bold text-brand-white">
              {isDone ? 'Envio concluído' : isSending ? 'Enviando emails…' : 'Pronto para enviar'}
            </h1>
            <p className="text-brand-muted text-sm">
              {isDone
                ? `${totalSentNow} enviados · ${totalFailedNow} falharam`
                : isSending
                ? `${sentCount + failedCount} de ${totalToSend} processados`
                : `${pendingApproved.length} emails aprovados aguardando envio`}
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 animate-fade-up stagger-1" style={{ animationFillMode: 'forwards' }}>
            {[
              { label: 'Aprovados', value: pendingApproved.length + alreadySent, color: 'text-brand-white',   bg: 'bg-white/5 border-white/8' },
              { label: 'Enviados',  value: totalSentNow,                          color: 'text-brand-success', bg: 'bg-brand-success/5 border-brand-success/15' },
              { label: 'Falhas',    value: totalFailedNow,                        color: 'text-brand-error',   bg: 'bg-brand-error/5 border-brand-error/15' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={cn('rounded-xl border p-5 text-center', bg)}>
                <p className={cn('text-3xl font-display font-bold', color)}>{value}</p>
                <p className="text-xs text-brand-muted mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {isSending && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex items-center justify-between text-xs text-brand-muted">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-brand-coral" /> Enviando sequencialmente…
                </span>
                <span className="font-mono">{sentCount + failedCount}/{totalToSend}</span>
              </div>
              <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-coral to-brand-orange rounded-full transition-all duration-700"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* CTA buttons */}
          {!isDone ? (
            <div className="flex gap-3 animate-fade-up stagger-2" style={{ animationFillMode: 'forwards' }}>
              <button
                onClick={() => router.push('/review')}
                disabled={isSending}
                className="flex items-center gap-2 px-5 py-3 rounded-lg border border-white/10 text-brand-muted hover:text-brand-white hover:border-white/20 hover:bg-white/5 transition-all text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="h-4 w-4" /> Revisão
              </button>
              <button
                onClick={handleSendAll}
                disabled={isSending || isSubmitting || pendingApproved.length === 0}
                className="btn-coral flex-1 flex items-center justify-center gap-2 py-3 text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
              >
                {isSending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Enviando {sentCount + failedCount + 1} de {totalToSend}…</>
                ) : isSubmitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Aguardando…</>
                ) : (
                  <><Send className="h-4 w-4" /> Enviar {pendingApproved.length} email{pendingApproved.length !== 1 ? 's' : ''}</>
                )}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 animate-fade-up stagger-2" style={{ animationFillMode: 'forwards' }}>
              {totalFailedNow > 0 && campaignId && (
                <button
                  onClick={() => {
                    retryFailedCandidates(campaignId)
                    setIsDone(false)
                    setSentCount(0)
                    setFailedCount(0)
                    setTotalToSend(0)
                    // Let store state flush before starting send loop
                    setTimeout(() => handleSendAll(), 0)
                  }}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-brand-error/30 text-brand-error hover:bg-brand-error/10 transition-all text-sm font-semibold"
                >
                  <RefreshCw className="h-4 w-4" /> Reenviar {totalFailedNow} email{totalFailedNow > 1 ? 's' : ''} falho{totalFailedNow > 1 ? 's' : ''}
                </button>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => router.push('/sent')}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-white/10 text-brand-muted hover:text-brand-white hover:border-white/20 hover:bg-white/5 transition-all text-sm font-medium"
                >
                  Ver resultados
                </button>
                <button
                  onClick={() => router.push('/campaigns')}
                  className="btn-coral flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold"
                >
                  Campanhas <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Live send list */}
          {approvedCandidates.length > 0 && (
            <div className="rounded-xl border border-white/8 overflow-hidden animate-fade-up stagger-3" style={{ animationFillMode: 'forwards' }}>
              <div className="px-4 py-3 border-b border-white/5 bg-brand-charcoal">
                <h2 className="text-xs font-medium text-brand-muted uppercase tracking-widest">
                  Emails desta campanha ({approvedCandidates.length})
                </h2>
              </div>
              <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
                {approvedCandidates.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      'flex items-center justify-between px-4 py-3 transition-colors',
                      currentSending === c.id && 'bg-brand-coral/5'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {c.status === 'sent'    ? <CheckCircle2 className="h-4 w-4 text-brand-success flex-shrink-0" />
                       : c.status === 'failed' ? <XCircle className="h-4 w-4 text-brand-error flex-shrink-0" />
                       : c.status === 'sending' ? <Loader2 className="h-4 w-4 text-brand-coral animate-spin flex-shrink-0" />
                       : <Clock className="h-4 w-4 text-brand-muted flex-shrink-0" />}
                      <div>
                        <p className="text-sm font-medium text-brand-white">{c.fullName}</p>
                        <p className="text-xs text-brand-muted font-mono">{c.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {c.status === 'failed' && c.errorMessage && (
                        <span className="text-xs text-brand-error max-w-[160px] truncate">{c.errorMessage}</span>
                      )}
                      {c.status === 'sent' && c.sentAt && (
                        <span className="text-xs text-brand-muted font-mono">
                          {new Date(c.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full border font-medium',
                        c.status === 'sent'    ? 'bg-brand-success/10 text-brand-success border-brand-success/20'
                        : c.status === 'failed' ? 'bg-brand-error/10 text-brand-error border-brand-error/20'
                        : c.status === 'sending' ? 'bg-brand-coral/10 text-brand-coral border-brand-coral/20'
                        : 'bg-white/5 text-brand-muted border-white/10'
                      )}>
                        {getStatusLabel(c.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
