'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import { Candidate } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Check,
  RefreshCw,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCheck,
  Mail,
  Sparkles,
  Send,
  User,
  ArrowRight,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import { cn, getStatusLabel } from '@/lib/utils'
import { toast } from 'sonner'

function StatusBadge({ status }: { status: Candidate['status'] }) {
  const config: Record<
    Candidate['status'],
    { variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'muted'; icon?: React.ReactNode }
  > = {
    pending: { variant: 'muted' },
    generating: { variant: 'info', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    ready: { variant: 'warning' },
    approved: { variant: 'success', icon: <Check className="h-3 w-3" /> },
    sending: { variant: 'info', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    sent: { variant: 'success', icon: <Check className="h-3 w-3" /> },
    failed: { variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
  }
  const { variant, icon } = config[status]
  return (
    <Badge variant={variant} className="flex items-center gap-1 text-xs">
      {icon}
      {getStatusLabel(status)}
    </Badge>
  )
}

function EmailEditor({
  candidate,
  campaignId,
  onApprove,
  onRegenerate,
  onNext,
}: {
  candidate: Candidate
  campaignId: string
  onApprove: () => void
  onRegenerate: () => void
  onNext: () => void
}) {
  const { updateCandidate } = useAppStore()
  const [localSubject, setLocalSubject] = useState(candidate.editedSubject || candidate.generatedSubject)
  const [localBody, setLocalBody] = useState(candidate.editedBody || candidate.generatedBody)
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevStatusRef = useRef(candidate.status)

  // Sync local state when generation completes (generating → ready transition)
  useEffect(() => {
    if (prevStatusRef.current === 'generating' && candidate.status === 'ready') {
      setLocalSubject(candidate.editedSubject || candidate.generatedSubject)
      setLocalBody(candidate.editedBody || candidate.generatedBody)
    }
    prevStatusRef.current = candidate.status
  }, [candidate.status, candidate.generatedSubject, candidate.generatedBody, candidate.editedSubject, candidate.editedBody])

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(() => {
      updateCandidate(campaignId, candidate.id, {
        editedSubject: localSubject,
        editedBody: localBody,
      })
      setSaveState('saved')
    }, 500)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [localSubject, localBody, candidate.id, campaignId, updateCandidate])

  const isGenerating = candidate.status === 'generating'
  const isFailed = candidate.status === 'failed'
  const isApproved = candidate.status === 'approved'

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">{candidate.fullName}</p>
              <p className="text-xs text-muted-foreground">
                {candidate.title}{candidate.title && candidate.company ? ' · ' : ''}{candidate.company}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">{candidate.email}</span>
            <StatusBadge status={candidate.status} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Gerando email personalizado...</p>
          </div>
        ) : isFailed ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">Falha ao gerar email</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {candidate.errorMessage || 'Erro desconhecido'}
              </p>
            </div>
            <Button onClick={onRegenerate} variant="outline" size="sm" className="gap-2">
              <RefreshCw className="h-4 w-4" /> Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assunto</label>
              <Input
                value={localSubject}
                onChange={(e) => setLocalSubject(e.target.value)}
                placeholder="Assunto do email..."
                className="font-medium"
                disabled={isGenerating}
              />
            </div>
            <Separator />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Corpo do email</label>
                <span className={cn(
                  'text-xs transition-colors',
                  saveState === 'saving' ? 'text-amber-500' : 'text-emerald-500'
                )}>
                  {saveState === 'saving' ? 'Salvando...' : 'Salvo'}
                </span>
              </div>
              <Textarea
                value={localBody}
                onChange={(e) => setLocalBody(e.target.value)}
                placeholder="Corpo do email..."
                className="min-h-[320px] resize-none font-mono text-sm leading-relaxed"
                disabled={isGenerating}
              />
            </div>
          </div>
        )}
      </div>

      {!isGenerating && (
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2">
            <Button
              onClick={onApprove}
              disabled={isFailed || isApproved}
              className={cn('flex-1 gap-2', isApproved && 'bg-emerald-600 hover:bg-emerald-700')}
            >
              {isApproved ? (
                <><CheckCheck className="h-4 w-4" /> Aprovado</>
              ) : (
                <><Check className="h-4 w-4" /> Aprovar <span className="opacity-60 text-xs ml-1">[A]</span></>
              )}
            </Button>
            <Button variant="outline" onClick={onRegenerate} disabled={isGenerating} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Regenerar <span className="opacity-60 text-xs">[R]</span>
            </Button>
            <Button variant="ghost" onClick={onNext} className="gap-2">
              Pular <ChevronRight className="h-4 w-4" /> <span className="opacity-60 text-xs">[->]</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

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
    if (!campaignId || candidates.length === 0) {
      router.replace('/')
      return
    }
    if (!campaignConfig) {
      router.replace('/campaign')
      return
    }
    const first = candidates.find((c) => c.status !== 'sent')
    if (first) setSelectedId(first.id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Generate all pending
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
          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              candidate,
              role: campaignConfig.role,
              jobDescription: campaignConfig.jobDescription,
              link: campaignConfig.link,
              hiringCompany: campaignConfig.hiringCompany,
              recruiterName: campaignConfig.recruiterName,
              recruiterCompany: campaignConfig.recruiterCompany,
              recruiterLinkedin: campaignConfig.recruiterLinkedin,
              aiProvider: currentProvider,
            }),
          })
          const data = await res.json()

          // Check for quota exceeded
          if (data.quotaExceeded) {
            const altProvider = currentProvider === 'openai' ? 'groq' : 'openai'
            // Revert this candidate to pending
            updateCandidate(campaignId, candidate.id, { status: 'pending' })

            // Pause and ask user
            const continueWithAlt = await new Promise<boolean>((resolve) => {
              quotaPauseResolveRef.current = resolve
              setShowQuotaDialog(true)
            })

            if (continueWithAlt) {
              // Switch to alternative provider and retry this candidate
              currentProvider = altProvider
              if (campaignId) {
                setCampaignConfig(campaignId, { ...campaignConfig, aiProvider: altProvider })
              }
              const altLabel = altProvider === 'groq' ? 'Groq' : 'OpenAI'
              toast.success(`Alternando para ${altLabel}. Continuando geracao...`)

              // Retry this candidate with alternative provider
              updateCandidate(campaignId, candidate.id, { status: 'generating' })
              try {
                const retryRes = await fetch('/api/generate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    candidate,
                    role: campaignConfig.role,
                    jobDescription: campaignConfig.jobDescription,
                    link: campaignConfig.link,
                    hiringCompany: campaignConfig.hiringCompany,
                    recruiterName: campaignConfig.recruiterName,
                    recruiterCompany: campaignConfig.recruiterCompany,
                    recruiterLinkedin: campaignConfig.recruiterLinkedin,
                    aiProvider: altProvider,
                  }),
                })
                const retryData = await retryRes.json()
                if (!retryRes.ok || retryData.error) {
                  updateCandidate(campaignId, candidate.id, {
                    status: 'failed',
                    errorMessage: retryData.error || 'Erro ao gerar email com modelo alternativo.',
                  })
                } else {
                  updateCandidate(campaignId, candidate.id, {
                    status: 'ready',
                    generatedSubject: retryData.subject,
                    generatedBody: retryData.body,
                    editedSubject: retryData.subject,
                    editedBody: retryData.body,
                  })
                }
              } catch {
                updateCandidate(campaignId, candidate.id, {
                  status: 'failed',
                  errorMessage: 'Falha de conexao com a API.',
                })
              }
              continue
            } else {
              // User chose to stop
              abortGenerationRef.current = true
              break
            }
          }

          if (!res.ok || data.error) {
            updateCandidate(campaignId, candidate.id, {
              status: 'failed',
              errorMessage: data.error || 'Erro ao gerar email.',
            })
          } else {
            updateCandidate(campaignId, candidate.id, {
              status: 'ready',
              generatedSubject: data.subject,
              generatedBody: data.body,
              editedSubject: data.subject,
              editedBody: data.body,
            })
          }
        } catch {
          updateCandidate(campaignId, candidate.id, {
            status: 'failed',
            errorMessage: 'Falha de conexao com a API.',
          })
        }
      }
      generatingRef.current = false
      if (abortGenerationRef.current) {
        // Reset any candidates still stuck in 'generating' back to 'pending'
        const current = useAppStore.getState().candidatesByCampaign[campaignId] ?? []
        current.forEach((c) => {
          if (c.status === 'generating') {
            updateCandidate(campaignId, c.id, { status: 'pending' })
          }
        })
        updateCampaign(campaignId, { status: 'ready' })
        toast.info('Geracao de emails cancelada.')
      } else {
        updateCampaign(campaignId, { status: 'ready' })
      }
    }
    generateAll()
  }, [campaignConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  // Confetti
  useEffect(() => {
    const total = candidates.length
    if (total === 0) return
    const doneCount = candidates.filter((c) => c.status === 'approved' || c.status === 'sent').length
    if (doneCount === total && !confettiFiredRef.current) {
      confettiFiredRef.current = true
      import('canvas-confetti').then(({ default: confetti }) => {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } })
        setTimeout(() => confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 } }), 300)
      })
      toast.success('Todos os emails aprovados!', { description: 'Agora voce pode envia-los.' })
    }
  }, [candidates])

  // Keyboard shortcuts
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
    } else if (selectedCandidate.status !== 'approved') {
      return
    }
    setTimeout(navigateNext, 150)
  }, [selectedCandidate, campaignId, updateCandidate, navigateNext])

  const handleRegenerate = useCallback(() => {
    if (!selectedCandidate || !campaignConfig || !campaignId) return
    updateCandidate(campaignId, selectedCandidate.id, { status: 'generating', errorMessage: undefined })
    fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate: selectedCandidate,
        role: campaignConfig.role,
        jobDescription: campaignConfig.jobDescription,
        link: campaignConfig.link,
        hiringCompany: campaignConfig.hiringCompany,
        recruiterName: campaignConfig.recruiterName,
        recruiterCompany: campaignConfig.recruiterCompany,
        recruiterLinkedin: campaignConfig.recruiterLinkedin,
        aiProvider: campaignConfig.aiProvider,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          updateCandidate(campaignId, selectedCandidate.id, { status: 'failed', errorMessage: data.error })
        } else {
          updateCandidate(campaignId, selectedCandidate.id, {
            status: 'ready',
            generatedSubject: data.subject,
            generatedBody: data.body,
            editedSubject: data.subject,
            editedBody: data.body,
          })
          toast.success('Email regenerado com sucesso.')
        }
      })
      .catch(() => {
        updateCandidate(campaignId, selectedCandidate.id, { status: 'failed', errorMessage: 'Falha de conexao.' })
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
          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              candidate,
              role: campaignConfig.role,
              jobDescription: campaignConfig.jobDescription,
              link: campaignConfig.link,
              hiringCompany: campaignConfig.hiringCompany,
              recruiterName: campaignConfig.recruiterName,
              recruiterCompany: campaignConfig.recruiterCompany,
              recruiterLinkedin: campaignConfig.recruiterLinkedin,
              aiProvider: campaignConfig.aiProvider,
            }),
          })
          const data = await res.json()
          if (!res.ok || data.error) {
            updateCandidate(campaignId, candidate.id, { status: 'failed', errorMessage: data.error })
          } else {
            updateCandidate(campaignId, candidate.id, {
              status: 'ready',
              generatedSubject: data.subject,
              generatedBody: data.body,
              editedSubject: data.subject,
              editedBody: data.body,
            })
          }
        } catch {
          updateCandidate(campaignId, candidate.id, { status: 'failed', errorMessage: 'Falha de conexao.' })
        }
      }
      toast.success(`${failed.length} email(s) regenerado(s).`)
    }
    regenerateAll()
    toast.info(`Regenerando ${failed.length} email(s) com falha...`)
  }

  // Stats
  const total = candidates.length
  const approvedCount = candidates.filter((c) => c.status === 'approved' || c.status === 'sent').length
  const readyCount = candidates.filter((c) => c.status === 'ready').length
  const generatingCount = candidates.filter((c) => c.status === 'generating').length
  const failedCount = candidates.filter((c) => c.status === 'failed').length
  const progressPct = total > 0 ? Math.round((approvedCount / total) * 100) : 0
  const generatedPct = total > 0 ? Math.round(((total - candidates.filter(c => c.status === 'pending' || c.status === 'generating').length) / total) * 100) : 0
  const canProceed = approvedCount > 0

  if (candidates.length === 0) return null

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-background overflow-hidden">
      {/* Left Panel */}
      <div className="w-72 flex-shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Mail className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">Revisao</span>
          </div>

          {generatedPct < 100 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Gerando emails...
                </span>
                <span>{generatedPct}%</span>
              </div>
              <Progress value={generatedPct} className="h-1.5" />
              <Button
                variant="destructive"
                size="sm"
                className="w-full gap-2 text-xs mt-2"
                onClick={() => {
                  abortGenerationRef.current = true
                  toast.info('Cancelando geracoes...')
                }}
              >
                <XCircle className="h-3.5 w-3.5" /> Cancelar todas as geracoes
              </Button>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Aprovados</span>
              <span className="font-medium text-foreground">{approvedCount}/{total}</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>

          <div className="flex gap-2 flex-wrap">
            {readyCount > 0 && (
              <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">{readyCount} prontos</span>
            )}
            {generatingCount > 0 && (
              <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> {generatingCount} gerando
              </span>
            )}
            {failedCount > 0 && (
              <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">{failedCount} falhas</span>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'w-full text-left p-3 rounded-lg transition-colors group',
                  selectedId === c.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium text-sm text-foreground truncate">{c.fullName || c.email}</span>
                  <StatusBadge status={c.status} />
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {c.title}{c.title && c.company ? ' · ' : ''}{c.company}
                </p>
              </button>
            ))}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-xs"
            onClick={() => {
              if (!campaignId) return
              approveAll(campaignId)
              toast.success('Todos os emails prontos foram aprovados.')
            }}
            disabled={readyCount === 0}
          >
            <CheckCheck className="h-3.5 w-3.5" /> Aprovar todos prontos
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-2 text-xs text-destructive hover:text-destructive"
            onClick={handleRegenerateFailed}
            disabled={failedCount === 0}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Regenerar falhas ({failedCount})
          </Button>
          <Separator />
          <Button
            size="sm"
            className="w-full gap-2 text-xs"
            disabled={!canProceed}
            onClick={() => router.push('/sending')}
          >
            <Send className="h-3.5 w-3.5" />
            Enviar {approvedCount} aprovado{approvedCount !== 1 ? 's' : ''}
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="text-xs bg-muted px-2 py-1 rounded">A</span> <span>aprovar</span>
            <span className="mx-2">·</span>
            <span className="text-xs bg-muted px-2 py-1 rounded">R</span> <span>regenerar</span>
            <span className="mx-2">·</span>
            <span className="text-xs bg-muted px-2 py-1 rounded">-&gt;</span> <span>proximo</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {selectedCandidate && (
              <span>{candidates.findIndex((c) => c.id === selectedId) + 1} / {total}</span>
            )}
          </div>
        </div>

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
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <Mail className="h-12 w-12 opacity-20" />
              <p className="text-sm">Selecione um candidato para revisar o email</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showQuotaDialog} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Limite de tokens atingido
            </DialogTitle>
            <DialogDescription>
              A IA atual atingiu o limite. Deseja continuar com outro modelo?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowQuotaDialog(false)
                quotaPauseResolveRef.current?.(false)
              }}
            >
              Nao, parar campanha
            </Button>
            <Button
              onClick={() => {
                setShowQuotaDialog(false)
                quotaPauseResolveRef.current?.(true)
              }}
            >
              Sim, continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
