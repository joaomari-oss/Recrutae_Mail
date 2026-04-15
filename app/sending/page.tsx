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
} from 'lucide-react'
import { cn, delay, getStatusLabel } from '@/lib/utils'
import { toast } from 'sonner'

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
  } = useAppStore()

  const campaignId = activeCampaignId
  const candidates = campaignId ? candidatesByCampaign[campaignId] ?? [] : []
  const campaign   = campaigns.find((c) => c.id === campaignId)
  const config     = campaignId ? campaignConfigById[campaignId] : undefined

  const [isSending, setIsSending] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [currentSending, setCurrentSending] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [totalToSend, setTotalToSend] = useState(0)
  const abortRef = useRef(false)

  const approvedCandidates = candidates.filter(
    (c) => c.status === 'approved' || c.status === 'sent' || c.status === 'sending' || c.status === 'failed'
  )
  const pendingApproved = candidates.filter((c) => c.status === 'approved')
  const alreadySent     = candidates.filter((c) => c.status === 'sent').length

  useEffect(() => {
    if (!campaignId || candidates.length === 0) router.replace('/')
  }, [campaignId, candidates.length, router])

  useEffect(() => {
    if (!isSending) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isSending])

  const handleSendAll = async () => {
    if (!campaignId) return
    const toSend = candidates.filter((c) => c.status === 'approved')
    if (toSend.length === 0) { toast.error('Nenhum email aprovado para enviar.'); return }

    const fixedTotal = toSend.length
    setTotalToSend(fixedTotal)
    setSentCount(0)
    setFailedCount(0)
    setIsSending(true)
    abortRef.current = false
    updateCampaign(campaignId, { status: 'sending' })

    let sent   = alreadySent
    let failed = failedCount

    for (const candidate of toSend) {
      if (abortRef.current) break
      setCurrentSending(candidate.id)
      updateCandidate(campaignId, candidate.id, { status: 'sending' })

      try {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to:            candidate.email,
            subject:       candidate.editedSubject || candidate.generatedSubject,
            body:          candidate.editedBody || candidate.generatedBody,
            candidateName: candidate.fullName,
            recruiterName: config?.recruiterName,
          }),
        })
        const data = await res.json()

        if (!res.ok || !data.success) {
          updateCandidate(campaignId, candidate.id, { status: 'failed', errorMessage: data.error || 'Erro ao enviar.' })
          addSentEmail({
            id: `sent-${Date.now()}-${candidate.id}`,
            campaignId, campaignName: campaign?.name || '',
            candidateName: candidate.fullName, company: candidate.company,
            email: candidate.email, subject: candidate.editedSubject || candidate.generatedSubject,
            body: candidate.editedBody || candidate.generatedBody,
            status: 'failed', errorMessage: data.error || 'Erro ao enviar.',
            sentAt: new Date().toISOString(),
          })
          failed++; setFailedCount(failed)
        } else {
          const sentAt = new Date().toISOString()
          updateCandidate(campaignId, candidate.id, { status: 'sent', sentAt })
          addSentEmail({
            id: `sent-${Date.now()}-${candidate.id}`,
            campaignId, campaignName: campaign?.name || '',
            candidateName: candidate.fullName, company: candidate.company,
            email: candidate.email, subject: candidate.editedSubject || candidate.generatedSubject,
            body: candidate.editedBody || candidate.generatedBody,
            status: 'sent', sentAt,
          })
          sent++; setSentCount(sent)
        }
      } catch {
        updateCandidate(campaignId, candidate.id, { status: 'failed', errorMessage: 'Falha de conexão.' })
        addSentEmail({
          id: `sent-${Date.now()}-${candidate.id}`,
          campaignId, campaignName: campaign?.name || '',
          candidateName: candidate.fullName, company: candidate.company,
          email: candidate.email, subject: candidate.editedSubject || candidate.generatedSubject,
          body: candidate.editedBody || candidate.generatedBody,
          status: 'failed', errorMessage: 'Falha de conexão.',
          sentAt: new Date().toISOString(),
        })
        failed++; setFailedCount(failed)
      }

      if (!abortRef.current) await delay(500)
    }

    setCurrentSending(null)
    setIsSending(false)
    setIsDone(true)
    updateCampaign(campaignId, { status: 'completed' })

    const totalSent   = candidates.filter((c) => c.status === 'sent').length
    const totalFailed = candidates.filter((c) => c.status === 'failed').length

    if (totalFailed === 0) {
      toast.success(`${totalSent} email(s) enviado(s) com sucesso!`)
    } else {
      toast.warning(`${totalSent} enviado(s), ${totalFailed} falharam.`)
    }
  }

  const progressPct = totalToSend > 0 ? Math.min(100, Math.round(((sentCount + failedCount) / totalToSend) * 100)) : 0
  const totalSentNow  = candidates.filter((c) => c.status === 'sent').length
  const totalFailedNow = candidates.filter((c) => c.status === 'failed').length

  if (!campaignId || candidates.length === 0) return null

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
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
              { label: 'Aprovados', value: pendingApproved.length + alreadySent, color: 'text-brand-white', bg: 'bg-white/5 border-white/8' },
              { label: 'Enviados',  value: totalSentNow,  color: 'text-brand-success', bg: 'bg-brand-success/5 border-brand-success/15' },
              { label: 'Falhas',    value: totalFailedNow, color: 'text-brand-error',   bg: 'bg-brand-error/5 border-brand-error/15' },
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
                disabled={isSending || pendingApproved.length === 0}
                className="btn-coral flex-1 flex items-center justify-center gap-2 py-3 text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
              >
                {isSending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Enviando {sentCount + failedCount + 1} de {totalToSend}…</>
                ) : (
                  <><Send className="h-4 w-4" /> Enviar {pendingApproved.length} email{pendingApproved.length !== 1 ? 's' : ''}</>
                )}
              </button>
            </div>
          ) : (
            <div className="flex gap-3 animate-fade-up stagger-2" style={{ animationFillMode: 'forwards' }}>
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
