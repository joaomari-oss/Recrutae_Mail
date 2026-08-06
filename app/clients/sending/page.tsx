'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClientStore } from '@/store/clientStore'
// Note: useClientStore.getState() used below for final counts after async loop
import { Loader2, CheckCircle2, XCircle, Send, ArrowRight, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function ClientsSendingPage() {
  const router = useRouter()
  const { getActiveContacts, getActiveConfig, getActiveCampaign, updateContact, updateCampaign, activeCampaignId } = useClientStore()

  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const [currentName, setCurrentName] = useState('')
  const sendingRef = useRef(false)

  const contacts = getActiveContacts()
  const config = getActiveConfig()
  const campaign = getActiveCampaign()

  const approved = contacts.filter((c) => c.status === 'approved')
  const sent = contacts.filter((c) => c.status === 'sent')
  const failed = contacts.filter((c) => c.status === 'failed')
  const progress = contacts.length > 0
    ? Math.round(((sent.length + failed.length) / contacts.filter((c) => ['approved', 'sent', 'failed'].includes(c.status)).length) * 100)
    : 0

  const handleSend = async () => {
    if (sendingRef.current || !config || !activeCampaignId) return
    sendingRef.current = true
    setStarted(true)

    const toSend = contacts.filter((c) => c.status === 'approved')
    updateCampaign(activeCampaignId, { status: 'sending' })

    for (const contact of toSend) {
      setCurrentName(contact.fullName || contact.email)
      updateContact(activeCampaignId, contact.id, { status: 'sending' })
      try {
        const res = await fetch('/api/clients/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: contact.email,
            subject: contact.editedSubject || contact.generatedSubject,
            body: contact.editedBody || contact.generatedBody,
            contactName: contact.fullName,
            recruiterName: config.recruiterName,
            recruiterEmail: config.recruiterEmail,
            recruiterRole: config.recruiterRole,
            replyTo: config.replyTo,
            campaignId: activeCampaignId,
            contactEmail: contact.email,
            contactId: contact.id,
          }),
        })
        const data = await res.json()
        if (!res.ok || !data.success) throw new Error(data.error ?? 'Erro no envio')
        const sentAt = new Date().toISOString()
        updateContact(activeCampaignId, contact.id, {
          status: 'sent',
          resendMessageId: data.messageId,
          sentAt,
        })
      } catch (err) {
        updateContact(activeCampaignId, contact.id, {
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Erro desconhecido',
        })
      }
      await delay(1500)
    }

    const finalContacts = useClientStore.getState().contactsByCampaign[activeCampaignId] ?? []
    const sentCount = finalContacts.filter((c) => c.status === 'sent').length
    const failedCount = finalContacts.filter((c) => c.status === 'failed').length
    // Finalize campaign server-side (uses admin key → bypasses RLS)
    fetch('/api/clients/finalize-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: activeCampaignId, sentCount, failedCount }),
    }).catch(console.error)
    updateCampaign(activeCampaignId, { status: 'completed' })
    setDone(true)
    sendingRef.current = false
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

  return (
    <main className="min-h-full bg-brand-dark flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-coral/4 blur-[140px]" />
      </div>

      <div className="relative w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center space-y-2 animate-fade-up">
          <h1 className="text-3xl font-display font-bold text-brand-white">{campaign.name}</h1>
          {config.segment && <p className="text-brand-muted text-sm">{config.segment}</p>}
        </div>

        {/* Status card */}
        <div className="bg-brand-charcoal rounded-2xl border border-white/5 p-6 space-y-5 animate-fade-up stagger-1" style={{ animationFillMode: 'forwards' }}>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Aprovados', value: approved.length + sent.length + failed.length, color: 'text-brand-white' },
              { label: 'Enviados', value: sent.length, color: 'text-brand-success' },
              { label: 'Falhas', value: failed.length, color: 'text-brand-error' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center p-3 bg-brand-dark rounded-xl border border-white/5">
                <p className={cn('text-2xl font-bold font-mono', color)}>{value}</p>
                <p className="text-xs text-brand-muted mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Progress */}
          {started && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-brand-muted">
                <span>{done ? 'Concluído' : `Enviando para ${currentName}…`}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-coral to-brand-orange transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Contact status list */}
          {started && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {contacts.filter((c) => ['approved', 'sending', 'sent', 'failed'].includes(c.status)).map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-brand-dark/50">
                  {c.status === 'sent' && <CheckCircle2 className="h-4 w-4 text-brand-success flex-shrink-0" />}
                  {c.status === 'failed' && <XCircle className="h-4 w-4 text-brand-error flex-shrink-0" />}
                  {c.status === 'sending' && <Loader2 className="h-4 w-4 text-brand-coral animate-spin flex-shrink-0" />}
                  {c.status === 'approved' && <div className="h-4 w-4 rounded-full border border-white/20 flex-shrink-0" />}
                  <span className="text-sm text-brand-white truncate flex-1">{c.fullName || c.email}</span>
                  <span className="text-xs text-brand-muted">{c.company}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CTA */}
        {!started && (
          <button
            onClick={handleSend}
            className="btn-coral w-full flex items-center justify-center gap-3 py-4 text-base font-semibold animate-fade-up stagger-2"
            style={{ animationFillMode: 'forwards' }}
          >
            <Send className="h-5 w-5" />
            Enviar {approved.length} e-mail{approved.length !== 1 ? 's' : ''}
          </button>
        )}

        {done && (
          <div className="space-y-3 animate-fade-up" style={{ animationFillMode: 'forwards' }}>
            <div className="flex items-center justify-center gap-2 text-brand-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">Disparos concluídos!</span>
            </div>
            <button
              onClick={() => router.push('/clients/sent')}
              className="btn-coral w-full flex items-center justify-center gap-3 py-4 text-base font-semibold"
            >
              Ver resultados
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {started && !done && (
          <div className="flex items-center justify-center gap-2 text-brand-muted text-sm animate-fade-up">
            <Loader2 className="h-4 w-4 animate-spin" />
            Não feche esta janela durante o envio
          </div>
        )}
      </div>
    </main>
  )
}
