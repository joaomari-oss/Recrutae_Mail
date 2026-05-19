'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { useClientStore } from '@/store/clientStore'
import { CheckCircle2, XCircle, Plus, ArrowLeft, Download, Eye, MousePointerClick, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ContactEventSummary } from '@/app/api/clients/events/route'

export default function ClientsSentPage() {
  const router = useRouter()
  const { getActiveContacts, getActiveConfig, getActiveCampaign } = useClientStore()

  const contacts = getActiveContacts()
  const config = getActiveConfig()
  const campaign = getActiveCampaign()

  const [eventMap, setEventMap] = useState<Map<string, ContactEventSummary>>(new Map())
  const [eventsLoading, setEventsLoading] = useState(false)
  const [totalOpened, setTotalOpened] = useState(0)
  const [totalClicked, setTotalClicked] = useState(0)

  const fetchEvents = useCallback(async () => {
    if (!campaign?.id) return
    setEventsLoading(true)
    try {
      const res = await fetch(`/api/clients/events?campaignId=${campaign.id}`)
      if (res.ok) {
        const data = await res.json()
        const map = new Map<string, ContactEventSummary>()
        for (const c of data.contacts ?? []) map.set(c.contactId, c)
        setEventMap(map)
        setTotalOpened(data.totalOpened ?? 0)
        setTotalClicked(data.totalClicked ?? 0)
      }
    } catch {
      // silent — tracking is best-effort
    } finally {
      setEventsLoading(false)
    }
  }, [campaign?.id])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const sent = contacts.filter((c) => c.status === 'sent')
  const failed = contacts.filter((c) => c.status === 'failed')

  const handleExportCSV = () => {
    const rows = [
      ['Nome', 'Email', 'Empresa', 'Cargo', 'Status', 'Enviado em', 'Abriu', 'Clicou'],
      ...contacts.map((c) => {
        const ev = eventMap.get(c.id)
        return [
          c.fullName,
          c.email,
          c.company,
          c.position,
          c.status === 'sent' ? 'Enviado' : 'Falhou',
          c.sentAt ? new Date(c.sentAt).toLocaleString('pt-BR') : '',
          ev?.opened ? 'Sim' : 'Não',
          ev?.clicked ? 'Sim' : 'Não',
        ]
      }),
    ]
    const csv = rows.map((r) => r.map((cell) => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${campaign?.name ?? 'clientes'}-resultados.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!campaign || !config) {
    return (
      <main className="min-h-full bg-brand-dark flex items-center justify-center">
        <button onClick={() => router.push('/clients')} className="btn-coral px-6 py-2 text-sm">Voltar ao início</button>
      </main>
    )
  }

  return (
    <main className="min-h-full bg-brand-dark px-6 py-10 relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-brand-success/4 blur-[120px]" />
      </div>

      <div className="relative max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-1 animate-fade-up">
          <h1 className="text-3xl font-display font-bold text-brand-white">{campaign.name}</h1>
          <p className="text-sm text-brand-muted">{config.segment} · {config.recruiterEmail}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-fade-up stagger-1" style={{ animationFillMode: 'forwards' }}>
          {[
            { label: 'Total enviados', value: sent.length, color: 'text-brand-success', bg: 'bg-brand-success/10 border-brand-success/20' },
            { label: 'Falhas', value: failed.length, color: 'text-brand-error', bg: 'bg-brand-error/10 border-brand-error/20' },
            { label: 'Abriram', value: totalOpened, color: 'text-brand-coral', bg: 'bg-brand-coral/10 border-brand-coral/20' },
            { label: 'Clicaram', value: totalClicked, color: 'text-brand-warning', bg: 'bg-brand-warning/10 border-brand-warning/20' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={cn('p-5 rounded-2xl border text-center', bg)}>
              <p className={cn('text-3xl font-bold font-mono', color)}>{value}</p>
              <p className="text-xs text-brand-muted mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Results table */}
        <div className="rounded-xl border border-white/5 overflow-hidden animate-fade-up stagger-2" style={{ animationFillMode: 'forwards' }}>
          <div className="bg-brand-charcoal px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-white">Resultados por contato</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchEvents}
                disabled={eventsLoading}
                className="flex items-center gap-1 text-xs text-brand-muted hover:text-brand-white transition-colors"
                title="Atualizar status de abertura"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', eventsLoading && 'animate-spin')} />
                Atualizar
              </button>
              <button onClick={handleExportCSV} className="flex items-center gap-1.5 text-xs text-brand-coral hover:text-brand-orange transition-colors">
                <Download className="h-3.5 w-3.5" />
                Exportar CSV
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-charcoal/50">
                {['Envio', 'Nome', 'Empresa', 'E-mail', 'Enviado em', 'Abriu', 'Clicou'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-brand-muted uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {contacts.map((c, i) => {
                const ev = eventMap.get(c.id)
                return (
                  <tr
                    key={c.id}
                    className="hover:bg-white/2 transition-colors animate-fade-up opacity-0"
                    style={{ animationDelay: `${i * 25}ms`, animationFillMode: 'forwards' }}
                  >
                    <td className="px-4 py-3">
                      {c.status === 'sent'
                        ? <CheckCircle2 className="h-4 w-4 text-brand-success" />
                        : <XCircle className="h-4 w-4 text-brand-error" />}
                    </td>
                    <td className="px-4 py-3 font-medium text-brand-white">{c.fullName || '—'}</td>
                    <td className="px-4 py-3 text-brand-muted">{c.company || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-brand-muted">{c.email}</td>
                    <td className="px-4 py-3 text-xs text-brand-muted">
                      {c.sentAt ? new Date(c.sentAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {c.status !== 'sent' ? <span className="text-brand-muted text-xs">—</span>
                        : ev?.opened
                          ? <span title={ev.openedAt ? new Date(ev.openedAt).toLocaleString('pt-BR') : undefined}><Eye className="h-4 w-4 text-brand-coral" /></span>
                          : <Eye className="h-4 w-4 text-brand-muted/30" />}
                    </td>
                    <td className="px-4 py-3">
                      {c.status !== 'sent' ? <span className="text-brand-muted text-xs">—</span>
                        : ev?.clicked
                          ? <span title={ev.clickedAt ? new Date(ev.clickedAt).toLocaleString('pt-BR') : undefined}><MousePointerClick className="h-4 w-4 text-brand-warning" /></span>
                          : <MousePointerClick className="h-4 w-4 text-brand-muted/30" />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div className="flex gap-4 animate-fade-up stagger-3" style={{ animationFillMode: 'forwards' }}>
          <button
            onClick={() => router.push('/clients')}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border border-white/10 hover:border-brand-coral/30 text-brand-muted hover:text-brand-white transition-all text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Nova campanha de clientes
          </button>
          <button
            onClick={() => router.push('/')}
            className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-white/10 hover:border-white/20 text-brand-muted hover:text-brand-white transition-all text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Início
          </button>
        </div>
      </div>
    </main>
  )
}
