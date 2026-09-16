'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, MailCheck, MousePointerClick, RefreshCw, Eye, ShieldBan, XCircle } from 'lucide-react'
import { useRosStore } from '@/store/rosStore'
import { exportToCSV } from '@/lib/utils'
import { getRosSendQueue, SUPPRESSED_MESSAGE } from '@/lib/ros/sendQueue'
import type { RosContact } from '@/lib/rosTypes'

type EventTotals = { totalDelivered: number; totalOpened: number; totalClicked: number }

export default function RosSentPage() {
  const router = useRouter()
  const activeCampaignId = useRosStore((state) => state.activeCampaignId)
  const campaigns = useRosStore((state) => state.campaigns)
  const contactsByCampaign = useRosStore((state) => state.contactsByCampaign)

  const contacts: RosContact[] = activeCampaignId ? contactsByCampaign[activeCampaignId] ?? [] : []
  const campaign = campaigns.find((item) => item.id === activeCampaignId) ?? null
  const [events, setEvents] = useState<EventTotals | null>(null)

  useEffect(() => {
    if (!activeCampaignId) return
    let active = true
    fetch(`/api/ros/events?campaignId=${encodeURIComponent(activeCampaignId)}`)
      .then(async (response) => {
        if (!response.ok) return
        const result: EventTotals = await response.json()
        if (active) setEvents(result)
      })
      .catch(() => { /* os eventos chegam por webhook; a tela funciona sem eles */ })
    return () => { active = false }
  }, [activeCampaignId])

  const totals = useMemo(() => {
    const suppressed = contacts.filter((c) => c.status === 'failed' && c.errorMessage === SUPPRESSED_MESSAGE)
    return {
      sent: contacts.filter((c) => c.status === 'sent').length,
      failed: contacts.filter((c) => c.status === 'failed').length - suppressed.length,
      suppressed: suppressed.length,
    }
  }, [contacts])

  const retryable = getRosSendQueue(contacts).length

  const exportResults = () => {
    exportToCSV(contacts.map((contact) => ({
      nome: contact.fullName, email: contact.email, empresa: contact.company,
      cargo: contact.position, situacao: contact.status,
      enviado_em: contact.sentAt ?? '', mensagem: contact.errorMessage ?? '',
      tentativas: String(contact.sendAttempts),
    })), `resultados-ros-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  if (!activeCampaignId) {
    return (
      <main className="min-h-full bg-brand-dark px-6 py-10">
        <div className="mx-auto max-w-xl space-y-4 text-center">
          <h1 className="font-ros text-2xl font-semibold text-brand-white">Nenhuma campanha ativa</h1>
          <button type="button" onClick={() => router.push('/ros/campaigns')} className="btn-coral px-5 py-2.5 text-sm font-semibold">
            Ver campanhas
          </button>
        </div>
      </main>
    )
  }

  const cards = [
    { label: 'Enviados', value: totals.sent, icon: MailCheck, tone: 'text-brand-success' },
    { label: 'Falharam', value: totals.failed, icon: XCircle, tone: 'text-brand-error' },
    { label: 'Suprimidos', value: totals.suppressed, icon: ShieldBan, tone: 'text-brand-warning' },
    { label: 'Entregues', value: events?.totalDelivered ?? 0, icon: MailCheck, tone: 'text-brand-coral' },
    { label: 'Abertos', value: events?.totalOpened ?? 0, icon: Eye, tone: 'text-brand-coral' },
    { label: 'Clicados', value: events?.totalClicked ?? 0, icon: MousePointerClick, tone: 'text-brand-coral' },
  ]

  return (
    <main className="min-h-full bg-brand-dark px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-7">
        <header className="space-y-1">
          <h1 className="font-ros text-3xl font-semibold text-brand-white">
            {campaign?.name ?? 'Resultados da campanha'}
          </h1>
          <p className="text-sm text-brand-muted">{contacts.length} contatos nesta divulgação.</p>
        </header>

        <section aria-label="Resumo" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {cards.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-xl border border-white/8 bg-brand-charcoal p-4">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${tone}`} />
                <span className="font-mono text-[10px] uppercase tracking-widest text-brand-muted">{label}</span>
              </div>
              <p className="mt-2 font-mono text-2xl font-bold text-brand-white">{value}</p>
            </div>
          ))}
        </section>

        <p className="text-xs text-brand-muted/70">
          Entregues, abertos e clicados vêm dos eventos do Resend e podem demorar alguns
          minutos. Abertura depende do cliente de e-mail carregar imagens.
        </p>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={exportResults}
            className="inline-flex items-center gap-2 rounded-lg border border-white/12 px-4 py-2.5 text-sm font-medium text-brand-muted transition-colors hover:border-brand-coral/40 hover:text-brand-white">
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
          {retryable > 0 && (
            <button type="button" onClick={() => router.push('/ros/sending')}
              className="btn-coral inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
              <RefreshCw className="h-4 w-4" />
              Reenviar {retryable} que falharam
            </button>
          )}
        </div>

        <section aria-label="Contatos" className="overflow-x-auto rounded-xl border border-white/8">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-brand-charcoal">
                {['Contato', 'E-mail', 'Situação', 'Observação'].map((column) => (
                  <th key={column} scope="col" className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-brand-muted">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td className="px-4 py-2.5 text-brand-white">{contact.fullName || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-brand-muted">{contact.email}</td>
                  <td className={`px-4 py-2.5 font-mono text-xs ${
                    contact.status === 'sent' ? 'text-brand-success'
                      : contact.status === 'failed' ? 'text-brand-error' : 'text-brand-muted'
                  }`}>
                    {contact.status}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-brand-muted">{contact.errorMessage ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  )
}
