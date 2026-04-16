'use client'

import { useState } from 'react'
import { useAppStore } from '@/store'
import { SentEmail } from '@/lib/types'
import {
  Mail,
  CheckCircle2,
  XCircle,
  Eye,
  Send,
  BarChart3,
  Building2,
  RefreshCw,
  X,
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'
import { toast } from 'sonner'

type Filter = 'all' | 'sent' | 'failed'

export default function EmailsPage() {
  const { sentEmails, setSentEmails } = useAppStore()
  const [filter, setFilter]         = useState<Filter>('all')
  const [viewingEmail, setViewingEmail] = useState<SentEmail | null>(null)
  const [recovering, setRecovering] = useState(false)

  const handleRecover = async () => {
    setRecovering(true)
    try {
      const res  = await apiFetch('/api/recover')
      const data = await res.json()
      if (!res.ok || data.error) { toast.error(data.error || 'Erro ao recuperar emails.'); return }
      if (data.emails?.length > 0) { setSentEmails(data.emails); toast.success(`${data.emails.length} emails recuperados.`) }
      else toast.info('Nenhum email encontrado no Resend.')
    } catch { toast.error('Falha ao conectar com o servidor.')
    } finally { setRecovering(false) }
  }

  const sent     = sentEmails.filter((e) => e.status === 'sent')
  const failed   = sentEmails.filter((e) => e.status === 'failed')
  const filtered = filter === 'all' ? sentEmails : filter === 'sent' ? sent : failed

  const successRate    = sentEmails.length > 0 ? Math.round((sent.length / sentEmails.length) * 100) : 0
  const uniqueCompanies = new Set(sent.map((e) => e.company).filter(Boolean)).size

  const stats = [
    { label: 'Total emails',   value: sentEmails.length,    icon: <Send className="h-5 w-5 text-brand-coral" />,    bg: 'bg-brand-coral/8 border-brand-coral/20' },
    { label: 'Enviados',       value: sent.length,          icon: <CheckCircle2 className="h-5 w-5 text-brand-success" />, bg: 'bg-brand-success/8 border-brand-success/20' },
    { label: 'Taxa de sucesso', value: `${successRate}%`,  icon: <BarChart3 className="h-5 w-5 text-brand-warning" />, bg: 'bg-brand-warning/8 border-brand-warning/20' },
    { label: 'Empresas',       value: uniqueCompanies,      icon: <Building2 className="h-5 w-5 text-brand-muted" />,  bg: 'bg-white/5 border-white/8' },
  ]

  const filterTabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all',    label: 'Todos',    count: sentEmails.length },
    { key: 'sent',   label: 'Enviados', count: sent.length },
    { key: 'failed', label: 'Falhas',   count: failed.length },
  ]

  return (
    <div className="min-h-screen bg-brand-dark">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-up" style={{ animationFillMode: 'forwards' }}>
          <div>
            <h1 className="text-3xl font-display font-bold text-brand-white">Histórico de Emails</h1>
            <p className="text-brand-muted text-sm mt-1">Todos os emails enviados em todas as campanhas</p>
          </div>
          <button
            onClick={handleRecover}
            disabled={recovering}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/10 text-brand-muted hover:text-brand-white hover:border-white/20 hover:bg-white/5 transition-all text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', recovering && 'animate-spin')} />
            {recovering ? 'Recuperando…' : 'Sincronizar com Resend'}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 animate-fade-up stagger-1" style={{ animationFillMode: 'forwards' }}>
          {stats.map(({ label, value, icon, bg }) => (
            <div key={label} className={cn('rounded-xl border p-5 flex items-center gap-4', bg)}>
              <div className="flex-shrink-0">{icon}</div>
              <div>
                <p className="text-2xl font-display font-bold text-brand-white">{value}</p>
                <p className="text-xs text-brand-muted mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-white/8 overflow-hidden animate-fade-up stagger-2" style={{ animationFillMode: 'forwards' }}>
          {/* Filter tabs */}
          <div className="flex items-center gap-1 p-3 border-b border-white/5 bg-brand-charcoal">
            {filterTabs.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  filter === key
                    ? 'bg-brand-coral/10 text-brand-white border border-brand-coral/20'
                    : 'text-brand-muted hover:text-brand-white hover:bg-white/5'
                )}
              >
                {key === 'sent'   && <CheckCircle2 className="h-3.5 w-3.5 text-brand-success" />}
                {key === 'failed' && <XCircle className="h-3.5 w-3.5 text-brand-error" />}
                {label}
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full',
                  filter === key ? 'bg-brand-coral/20 text-brand-coral' : 'bg-white/5 text-brand-muted'
                )}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="py-20 text-center text-brand-muted">
              <Mail className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Nenhum email aqui</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-brand-charcoal/50">
                  {['Nome', 'Empresa', 'Email', 'Assunto', 'Campanha', 'Enviado em', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-brand-muted uppercase tracking-widest">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((e, i) => (
                  <tr
                    key={e.id}
                    onClick={() => setViewingEmail(e)}
                    className={cn(
                      'hover:bg-white/2 transition-colors cursor-pointer animate-fade-up opacity-0',
                      e.status === 'failed' && 'bg-brand-error/3'
                    )}
                    style={{ animationDelay: `${i * 20}ms`, animationFillMode: 'forwards' }}
                  >
                    <td className="px-4 py-3 font-medium text-brand-white">{e.candidateName}</td>
                    <td className="px-4 py-3 text-brand-muted">{e.company || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-brand-muted">{e.email}</td>
                    <td className="px-4 py-3 text-brand-muted max-w-[180px] truncate">{e.subject}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-white/5 border border-white/8 px-2 py-0.5 rounded-full text-brand-muted">
                        {e.campaignName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-muted font-mono">{formatDate(e.sentAt)}</td>
                    <td className="px-4 py-3">
                      {e.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-success/10 text-brand-success border border-brand-success/20">
                          <CheckCircle2 className="h-3 w-3" /> Enviado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-error/10 text-brand-error border border-brand-error/20">
                          <XCircle className="h-3 w-3" /> Falhou
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(ev) => { ev.stopPropagation(); setViewingEmail(e) }}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-brand-muted hover:text-brand-white transition-all"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Email modal */}
      {viewingEmail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setViewingEmail(null)}
        >
          <div
            className="bg-brand-charcoal border border-white/10 rounded-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col shadow-[0_24px_80px_rgba(0,0,0,0.6)] animate-fade-up"
            onClick={(e) => e.stopPropagation()}
            style={{ animationFillMode: 'forwards' }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div>
                <h2 className="font-display font-semibold text-brand-white flex items-center gap-2">
                  <Mail className="h-4 w-4 text-brand-coral" />
                  Email para {viewingEmail.candidateName}
                </h2>
                <p className="text-xs text-brand-muted font-mono mt-0.5">
                  {viewingEmail.email} · {viewingEmail.campaignName}
                </p>
              </div>
              <button
                onClick={() => setViewingEmail(null)}
                className="p-2 rounded-lg hover:bg-white/5 text-brand-muted hover:text-brand-white transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-medium text-brand-muted uppercase tracking-widest">Assunto</p>
                <div className="bg-brand-dark rounded-lg px-4 py-3 text-sm font-medium text-brand-white border border-white/5">
                  {viewingEmail.subject}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-brand-muted uppercase tracking-widest">Corpo</p>
                <div className="bg-brand-dark rounded-lg px-4 py-4 email-body text-brand-white whitespace-pre-wrap border border-white/5">
                  {viewingEmail.body}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-brand-muted">
                <span>Enviado em: {formatDate(viewingEmail.sentAt)}</span>
                {viewingEmail.status === 'sent' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-success/10 text-brand-success border border-brand-success/20">
                    <CheckCircle2 className="h-3 w-3" /> Enviado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-error/10 text-brand-error border border-brand-error/20">
                    <XCircle className="h-3 w-3" /> Falhou
                  </span>
                )}
              </div>
              {viewingEmail.errorMessage && (
                <div className="bg-brand-error/10 border border-brand-error/20 rounded-lg p-3">
                  <p className="text-xs text-brand-error">{viewingEmail.errorMessage}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
