'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useClientStore } from '@/store/clientStore'
import { ClientContact } from '@/lib/clientTypes'
import {
  CheckCircle2,
  RefreshCw,
  ChevronRight,
  ArrowRight,
  Loader2,
  AlertCircle,
  Check,
  SkipForward,
  Users,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { updateContactInSupabase } from '@/lib/supabaseOps'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

function ContactCard({
  contact,
  isSelected,
  index,
  onClick,
}: {
  contact: ClientContact
  isSelected: boolean
  index: number
  onClick: () => void
}) {
  const initials = (contact.firstName?.[0] ?? contact.fullName?.[0] ?? '?').toUpperCase() +
    (contact.fullName?.split(' ')[1]?.[0] ?? '').toUpperCase()

  const statusColor = {
    pending: 'text-brand-muted bg-brand-muted/10',
    generating: 'text-brand-warning bg-brand-warning/10',
    ready: 'text-brand-warning bg-brand-warning/10',
    approved: 'text-brand-success bg-brand-success/10',
    sending: 'text-brand-coral bg-brand-coral/10',
    sent: 'text-brand-success bg-brand-success/10',
    failed: 'text-brand-error bg-brand-error/10',
  }[contact.status]

  const statusLabel = {
    pending: 'Aguardando',
    generating: 'Gerando…',
    ready: 'Pronto',
    approved: 'Aprovado',
    sending: 'Enviando',
    sent: 'Enviado',
    failed: 'Falhou',
  }[contact.status]

  return (
    <button
      onClick={onClick}
      className={cn(
        'group w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-200 animate-fade-up opacity-0',
        isSelected
          ? 'bg-brand-coral/8 border-brand-coral/30'
          : 'bg-brand-charcoal border-white/5 hover:border-brand-coral/20 hover:bg-white/2'
      )}
      style={{ animationDelay: `${index * 30}ms`, animationFillMode: 'forwards' }}
    >
      {isSelected && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-brand-coral rounded-r-full" />}
      <div className="w-9 h-9 rounded-lg bg-brand-coral/20 flex items-center justify-center text-xs font-bold text-brand-coral flex-shrink-0">
        {initials || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-brand-white truncate">{contact.fullName || contact.email}</p>
        <p className="text-xs text-brand-muted truncate">{[contact.position, contact.company].filter(Boolean).join(' · ')}</p>
      </div>
      <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0', statusColor)}>
        {statusLabel}
        {contact.status === 'generating' && <Loader2 className="inline ml-1 h-2.5 w-2.5 animate-spin" />}
      </span>
    </button>
  )
}

export default function ClientsReviewPage() {
  const router = useRouter()
  const { getActiveContacts, getActiveConfig, getActiveCampaign, updateContact, approveAll, updateCampaign, activeCampaignId } = useClientStore()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [localSubject, setLocalSubject] = useState('')
  const [localBody, setLocalBody] = useState('')
  const [aiProvider, setAiProvider] = useState<'openai' | 'groq'>('openai')
  const [isRegenerating, setIsRegenerating] = useState(false)

  const generatingRef = useRef(false)
  const abortRef = useRef(false)

  const contacts = getActiveContacts()
  const config = getActiveConfig()
  const campaign = getActiveCampaign()

  const selected = contacts.find((c) => c.id === selectedId) ?? null

  // Auto-select first
  useEffect(() => {
    if (!selectedId && contacts.length > 0) setSelectedId(contacts[0].id)
  }, [contacts.length])

  // Sync editor when selected changes
  useEffect(() => {
    if (!selected) return
    if (selected.status === 'generating') return
    setLocalSubject(selected.editedSubject || selected.generatedSubject)
    setLocalBody(selected.editedBody || selected.generatedBody)
  }, [selectedId, selected?.status])

  // Auto-save with debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveEdits = useCallback((subject: string, body: string) => {
    if (!selectedId || !activeCampaignId) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateContact(activeCampaignId, selectedId, { editedSubject: subject, editedBody: body })
    }, 500)
  }, [selectedId, activeCampaignId, updateContact])

  // Auto-generate pending
  useEffect(() => {
    if (!config || !activeCampaignId) return
    if (generatingRef.current) return
    const pending = contacts.filter((c) => c.status === 'pending')
    if (!pending.length) return

    generatingRef.current = true
    abortRef.current = false

    ;(async () => {
      for (let i = 0; i < pending.length; i++) {
        if (abortRef.current) break
        const contact = pending[i]
        updateContact(activeCampaignId, contact.id, { status: 'generating' })
        try {
          const res = await fetch('/api/clients/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contact,
              recruiterName: config.recruiterName,
              recruiterEmail: config.recruiterEmail,
              recruiterRole: config.recruiterRole,
              segment: config.segment,
              emailTemplate: config.emailTemplate,
              subjectTemplate: config.subjectTemplate,
              aiProvider,
              variationSeed: i + Math.floor(Date.now() / 1000),
            }),
          })
          if (res.status === 429) {
            toast.error('Quota OpenAI atingida. Tente com Groq.')
            updateContact(activeCampaignId, contact.id, { status: 'failed', errorMessage: 'Quota excedida' })
            break
          }
          const data = await res.json()
          if (!res.ok || data.error) throw new Error(data.error ?? 'Erro na geração')
          updateContact(activeCampaignId, contact.id, {
            status: 'ready',
            generatedSubject: data.subject,
            generatedBody: data.body,
            editedSubject: data.subject,
            editedBody: data.body,
          })
          updateContactInSupabase(contact.id, {
            status: 'ready',
            generated_subject: data.subject,
            generated_body: data.body,
            edited_subject: data.subject,
            edited_body: data.body,
          }).catch(console.error)
        } catch (err) {
          updateContact(activeCampaignId, contact.id, {
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Erro desconhecido',
          })
          updateContactInSupabase(contact.id, { status: 'failed', error_message: err instanceof Error ? err.message : 'Erro' }).catch(console.error)
        }
        if (i < pending.length - 1) await delay(400)
      }
      generatingRef.current = false
      updateCampaign(activeCampaignId, { status: 'ready' })
    })()

    return () => { abortRef.current = true }
  }, [config?.segment, activeCampaignId])

  const handleRegenerate = async () => {
    if (!selected || !config || !activeCampaignId) return
    setIsRegenerating(true)
    updateContact(activeCampaignId, selected.id, { status: 'generating' })
    try {
      const res = await fetch('/api/clients/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: selected,
          recruiterName: config.recruiterName,
          recruiterEmail: config.recruiterEmail,
          recruiterRole: config.recruiterRole,
          segment: config.segment,
          emailTemplate: config.emailTemplate,
          subjectTemplate: config.subjectTemplate,
          aiProvider,
          variationSeed: Math.floor(Math.random() * 10000),
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro')
      updateContact(activeCampaignId, selected.id, {
        status: 'ready',
        generatedSubject: data.subject,
        generatedBody: data.body,
        editedSubject: data.subject,
        editedBody: data.body,
      })
      setLocalSubject(data.subject)
      setLocalBody(data.body)
      toast.success('E-mail regenerado.')
    } catch {
      updateContact(activeCampaignId, selected.id, { status: 'failed' })
      toast.error('Erro ao regenerar.')
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleApprove = () => {
    if (!selected || !activeCampaignId) return
    updateContact(activeCampaignId, selected.id, {
      status: 'approved',
      editedSubject: localSubject,
      editedBody: localBody,
    })
    const next = contacts.find((c, i) => i > contacts.findIndex((x) => x.id === selected.id) && c.id !== selected.id)
    if (next) setSelectedId(next.id)
  }

  const handleSkip = () => {
    const idx = contacts.findIndex((c) => c.id === selectedId)
    const next = contacts[idx + 1]
    if (next) setSelectedId(next.id)
  }

  if (!config || !campaign) {
    return (
      <main className="min-h-full bg-brand-dark flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="mx-auto h-10 w-10 text-brand-error" />
          <p className="text-brand-muted">Nenhuma campanha ativa.</p>
          <button onClick={() => router.push('/clients')} className="btn-coral px-6 py-2 text-sm">Voltar</button>
        </div>
      </main>
    )
  }

  const totalReady = contacts.filter((c) => ['ready', 'approved', 'sent'].includes(c.status)).length
  const totalApproved = contacts.filter((c) => c.status === 'approved').length
  const allApproved = contacts.length > 0 && contacts.every((c) => ['approved', 'sent', 'failed'].includes(c.status))

  return (
    <main className="flex h-full bg-brand-dark overflow-hidden">
      {/* Left panel */}
      <div className="w-[340px] flex-shrink-0 flex flex-col border-r border-white/5 overflow-hidden">
        <div className="p-5 border-b border-white/5 space-y-4">
          <div>
            <h2 className="font-display font-bold text-brand-white text-lg">{campaign.name}</h2>
            <p className="text-xs text-brand-muted mt-0.5">{config.segment}</p>
          </div>

          {/* Progress bars */}
          <div className="space-y-2.5">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-brand-muted">
                <span>Gerados</span>
                <span>{totalReady}/{contacts.length}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-coral to-brand-orange transition-all duration-500" style={{ width: `${contacts.length ? (totalReady / contacts.length) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-brand-muted">
                <span>Aprovados</span>
                <span>{totalApproved}/{contacts.length}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-brand-success transition-all duration-500" style={{ width: `${contacts.length ? (totalApproved / contacts.length) * 100 : 0}%` }} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => approveAll(activeCampaignId!)}
              disabled={totalReady === 0}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-brand-success/10 border border-brand-success/20 text-brand-success hover:bg-brand-success/20 transition-colors text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Zap className="h-3.5 w-3.5" />
              Aprovar todos
            </button>
            <button
              onClick={() => router.push('/clients/sending')}
              disabled={totalApproved === 0}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg btn-coral text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
            >
              Enviar
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {contacts.map((c, i) => (
            <ContactCard
              key={c.id}
              contact={c}
              isSelected={c.id === selectedId}
              index={i}
              onClick={() => setSelectedId(c.id)}
            />
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="p-6 border-b border-white/5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-semibold text-brand-white truncate">{selected.fullName}</h3>
                <p className="text-xs text-brand-muted">{[selected.position, selected.company].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as 'openai' | 'groq')}
                  className="text-xs bg-brand-charcoal border border-white/10 text-brand-muted rounded-lg px-2 py-1.5 outline-none"
                >
                  <option value="openai">OpenAI</option>
                  <option value="groq">Groq</option>
                </select>
                <button
                  onClick={handleRegenerate}
                  disabled={isRegenerating || selected.status === 'generating'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-brand-coral/30 text-brand-muted hover:text-brand-white text-xs transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', (isRegenerating || selected.status === 'generating') && 'animate-spin')} />
                  Regenerar
                </button>
                <button onClick={handleSkip} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-brand-muted hover:text-brand-white text-xs transition-colors">
                  <SkipForward className="h-3.5 w-3.5" />
                  Pular
                </button>
                <button
                  onClick={handleApprove}
                  disabled={!['ready', 'failed'].includes(selected.status) && selected.status !== 'approved'}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg btn-coral text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                >
                  <Check className="h-3.5 w-3.5" />
                  {selected.status === 'approved' ? 'Aprovado' : 'Aprovar'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {selected.status === 'generating' ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="w-12 h-12 rounded-full border-2 border-brand-coral border-t-transparent animate-spin" />
                  <p className="text-brand-muted text-sm">Gerando e-mail personalizado…</p>
                </div>
              ) : selected.status === 'failed' ? (
                <div className="flex flex-col items-center justify-center gap-3 py-8">
                  <AlertCircle className="h-10 w-10 text-brand-error" />
                  <p className="text-sm text-brand-muted">{selected.errorMessage || 'Erro na geração.'}</p>
                  <button onClick={handleRegenerate} className="btn-coral px-5 py-2 text-sm flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" /> Tentar novamente
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-brand-muted uppercase tracking-wider">Assunto</label>
                    <input
                      value={localSubject}
                      onChange={(e) => { setLocalSubject(e.target.value); saveEdits(e.target.value, localBody) }}
                      className="w-full px-4 py-3 bg-brand-charcoal border border-white/8 rounded-xl text-sm font-medium text-brand-white outline-none focus:border-brand-coral/40 transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-brand-muted uppercase tracking-wider">Corpo do e-mail</label>
                    <textarea
                      value={localBody}
                      onChange={(e) => { setLocalBody(e.target.value); saveEdits(localSubject, e.target.value) }}
                      rows={14}
                      className="w-full px-4 py-3 bg-brand-charcoal border border-white/8 rounded-xl text-sm text-brand-white outline-none focus:border-brand-coral/40 transition-colors resize-none email-body leading-relaxed"
                    />
                  </div>

                  {/* Signature preview */}
                  <div className="rounded-xl border border-white/8 bg-white px-5 py-4">
                    <div className="border-t border-gray-200 pt-4 mt-1 flex items-center gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/logorecrutae.webp" alt="Recrutaê" width={80} style={{ display: 'block', flexShrink: 0 }} />
                      <div style={{ borderLeft: '3px solid #F5A623', paddingLeft: '14px' }}>
                        <p style={{ margin: 0, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '14px', fontWeight: 700, color: '#1a1a2e', lineHeight: 1.3 }}>{config.recruiterName}</p>
                        {config.recruiterRole && <p style={{ margin: '3px 0 0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '12px', color: '#6b7280', lineHeight: 1.4 }}>{config.recruiterRole}</p>}
                        <p style={{ margin: '5px 0 0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '10px', fontWeight: 700, color: '#F5A623', letterSpacing: '1px', textTransform: 'uppercase' }}>Recrutaê</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-brand-muted/50">
                    <span>[A] Aprovar</span>
                    <span>·</span>
                    <span>[R] Regenerar</span>
                    <span>·</span>
                    <span>[→] Próximo</span>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-brand-muted text-sm">Selecione um contato para revisar o e-mail.</p>
          </div>
        )}
      </div>
    </main>
  )
}
