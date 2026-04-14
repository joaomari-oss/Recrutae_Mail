'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import { Candidate } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
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
  const campaign = campaigns.find((c) => c.id === campaignId)
  const config = campaignId ? campaignConfigById[campaignId] : undefined

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
  const alreadySent = candidates.filter((c) => c.status === 'sent').length

  useEffect(() => {
    if (!campaignId || candidates.length === 0) {
      router.replace('/')
    }
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

    let sent = alreadySent
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
            to: candidate.email,
            subject: candidate.editedSubject || candidate.generatedSubject,
            body: candidate.editedBody || candidate.generatedBody,
            candidateName: candidate.fullName,
            recruiterName: config?.recruiterName,
          }),
        })

        const data = await res.json()

        if (!res.ok || !data.success) {
          updateCandidate(campaignId, candidate.id, {
            status: 'failed',
            errorMessage: data.error || 'Erro ao enviar.',
          })
          addSentEmail({
            id: `sent-${Date.now()}-${candidate.id}`,
            campaignId,
            campaignName: campaign?.name || '',
            candidateName: candidate.fullName,
            company: candidate.company,
            email: candidate.email,
            subject: candidate.editedSubject || candidate.generatedSubject,
            body: candidate.editedBody || candidate.generatedBody,
            status: 'failed',
            errorMessage: data.error || 'Erro ao enviar.',
            sentAt: new Date().toISOString(),
          })
          failed++
          setFailedCount(failed)
        } else {
          const sentAt = new Date().toISOString()
          updateCandidate(campaignId, candidate.id, { status: 'sent', sentAt })
          addSentEmail({
            id: `sent-${Date.now()}-${candidate.id}`,
            campaignId,
            campaignName: campaign?.name || '',
            candidateName: candidate.fullName,
            company: candidate.company,
            email: candidate.email,
            subject: candidate.editedSubject || candidate.generatedSubject,
            body: candidate.editedBody || candidate.generatedBody,
            status: 'sent',
            sentAt,
          })
          sent++
          setSentCount(sent)
        }
      } catch {
        updateCandidate(campaignId, candidate.id, {
          status: 'failed',
          errorMessage: 'Falha de conexao com o servidor.',
        })
        addSentEmail({
          id: `sent-${Date.now()}-${candidate.id}`,
          campaignId,
          campaignName: campaign?.name || '',
          candidateName: candidate.fullName,
          company: candidate.company,
          email: candidate.email,
          subject: candidate.editedSubject || candidate.generatedSubject,
          body: candidate.editedBody || candidate.generatedBody,
          status: 'failed',
          errorMessage: 'Falha de conexao com o servidor.',
          sentAt: new Date().toISOString(),
        })
        failed++
        setFailedCount(failed)
      }

      if (!abortRef.current) await delay(500)
    }

    setCurrentSending(null)
    setIsSending(false)
    setIsDone(true)
    updateCampaign(campaignId, { status: 'completed' })

    const totalSent = candidates.filter((c) => c.status === 'sent').length
    const totalFailed = candidates.filter((c) => c.status === 'failed').length

    if (totalFailed === 0) {
      toast.success(`${totalSent} email(s) enviado(s) com sucesso!`)
    } else {
      toast.warning(`${totalSent} enviado(s), ${totalFailed} falharam.`)
    }
  }

  const progressPct = totalToSend > 0 ? Math.min(100, Math.round((sentCount / totalToSend) * 100)) : 0

  if (!campaignId || candidates.length === 0) return null

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background flex flex-col">
      {isSending && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-8 py-2 flex items-center justify-center gap-2 text-amber-500 text-sm font-medium">
          <AlertTriangle className="h-4 w-4" />
          Envio em andamento — nao feche a pagina
        </div>
      )}

      <div className="flex-1 flex flex-col items-center py-8 px-4">
        <div className="w-full max-w-2xl space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-foreground">Enviar emails</h1>
              {isDone && (
                <Badge variant="success" className="text-sm px-3 py-1">
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Concluido
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-muted/50 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-foreground">{pendingApproved.length + alreadySent}</p>
                <p className="text-xs text-muted-foreground mt-1">Total aprovados</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-emerald-400">{candidates.filter((c) => c.status === 'sent').length}</p>
                <p className="text-xs text-muted-foreground mt-1">Enviados</p>
              </div>
              <div className="bg-destructive/10 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-destructive">{candidates.filter((c) => c.status === 'failed').length}</p>
                <p className="text-xs text-muted-foreground mt-1">Falharam</p>
              </div>
            </div>

            {isSending && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando sequencialmente...
                  </span>
                  <span className="font-medium text-foreground">{sentCount}/{totalToSend}</span>
                </div>
                <Progress value={progressPct} className="h-2.5" />
              </div>
            )}
          </div>

          {!isDone && (
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => router.push('/review')} disabled={isSending} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar para revisao
              </Button>
              <Button
                className="flex-1 h-11 font-semibold text-base gap-2"
                onClick={handleSendAll}
                disabled={isSending || pendingApproved.length === 0}
              >
                {isSending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Enviando {sentCount + failedCount + 1} de {totalToSend}...</>
                ) : (
                  <><Send className="h-4 w-4" /> Enviar {pendingApproved.length} email{pendingApproved.length !== 1 ? 's' : ''}</>
                )}
              </Button>
            </div>
          )}

          {isDone && (
            <div className="flex gap-3">
              <Button variant="outline" className="gap-2" onClick={() => router.push('/emails')}>
                Ver todos os emails enviados
              </Button>
              <Button className="flex-1 h-11 font-semibold" onClick={() => router.push('/campaigns')}>
                Ver campanhas <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {approvedCandidates.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <h2 className="font-semibold text-sm text-foreground">
                  Emails desta campanha ({approvedCandidates.length})
                </h2>
              </div>
              <ScrollArea className="max-h-96">
                <div className="divide-y divide-border">
                  {approvedCandidates.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        'flex items-center justify-between px-4 py-3 transition-colors',
                        currentSending === c.id && 'bg-primary/5',
                        c.status === 'sent' && 'opacity-70'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {c.status === 'sent' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                        ) : c.status === 'failed' ? (
                          <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                        ) : c.status === 'sending' ? (
                          <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-foreground">{c.fullName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{c.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {c.status === 'failed' && c.errorMessage && (
                          <span className="text-xs text-destructive max-w-[180px] truncate">{c.errorMessage}</span>
                        )}
                        {c.status === 'sent' && c.sentAt && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(c.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        <Badge
                          variant={
                            c.status === 'sent' ? 'success' :
                            c.status === 'failed' ? 'destructive' :
                            c.status === 'sending' ? 'info' : 'warning'
                          }
                          className="text-xs"
                        >
                          {getStatusLabel(c.status)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
