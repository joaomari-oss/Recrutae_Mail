'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import { Candidate } from '@/lib/types'
import {
  Mail,
  Download,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  Building2,
  Send,
  BarChart3,
  ArrowRight,
  X,
} from 'lucide-react'
import { cn, formatDate, exportToCSV } from '@/lib/utils'

type Filter = 'all' | 'sent' | 'failed'

export default function SentPage() {
  const router = useRouter()
  const { activeCampaignId, candidatesByCampaign, retryFailedCandidates } = useAppStore()

  const campaignId = activeCampaignId
  const candidates = campaignId ? candidatesByCampaign[campaignId] ?? [] : []

  const [filter, setFilter] = useState<Filter>('all')
  const [viewingEmail, setViewingEmail] = useState<Candidate | null>(null)

  const sent   = candidates.filter((c) => c.status === 'sent')
  const failed = candidates.filter((c) => c.status === 'failed')
  const all    = candidates.filter((c) => ['sent', 'failed', 'approved'].includes(c.status))
  const filtered = filter === 'all' ? all : filter === 'sent' ? sent : failed

  const successRate    = all.length > 0 ? Math.round((sent.length / all.length) * 100) : 0
  const uniqueCompanies = new Set(sent.map((c) => c.company).filter(Boolean)).size

  const handleExport = () => {
    const data = filtered.map((c) => ({
      Nome:       c.fullName,
      Email:      c.email,
      Cargo:      c.title,
      Empresa:    c.company,
      Status:     c.status === 'sent' ? 'Enviado' : c.status === 'failed' ? 'Falhou' : 'Aprovado',
      'Enviado em': c.sentAt ? formatDate(c.sentAt) : '',
      Assunto:    c.editedSubject || c.generatedSubject,
      Erro:       c.errorMessage || '',
    }))
    exportToCSV(data, `recrutae-campanha-${new Date().toISOString().split('T')[0]}.csv`)
  }

  const stats = [
    { label: 'Emails enviados', value: sent.length,      icon: <Send className="h-5 w-5 text-brand-coral" />,    bg: 'bg-brand-coral/8 border-brand-coral/20' },
    { label: 'Taxa de sucesso', value: `${successRate}%`, icon: <BarChart3 className="h-5 w-5 text-brand-success" />, bg: 'bg-brand-success/8 border-brand-success/20' },
    { label: 'Empresas atingidas', value: uniqueCompanies, icon: <Building2 className="h-5 w-5 text-brand-warning" />, bg: 'bg-brand-warning/8 border-brand-warning/20' },
    { label: 'Falhas',          value: failed.length,   icon: <XCircle className="h-5 w-5 text-brand-error" />,   bg: 'bg-brand-error/8 border-brand-error/20' },
  ]

  const filterTabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all',    label: 'Todos',    count: all.length },
    { key: 'sent',   label: 'Enviados', count: sent.length },
    { key: 'failed', label: 'Falhas',   count: failed.length },
  ]

  return (
    <div className="min-h-screen bg-brand-dark">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-up" style={{ animationFillMode: 'forwards' }}>
          <div>
            <h1 className="text-3xl font-display font-bold text-brand-white">Resultados</h1>
            <p className="text-brand-muted text-sm mt-1">Resumo desta campanha</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/10 text-brand-muted hover:text-brand-white hover:border-white/20 hover:bg-white/5 transition-all text-sm font-medium"
            >
              <Download className="h-4 w-4" /> Exportar CSV
            </button>
            <button
              onClick={() => router.push('/')}
              className="btn-coral flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
            >
              Nova campanha <ArrowRight className="h-4 w-4" />
            </button>
          </div>
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

        {/* Table card */}
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
              <p className="text-sm">Nenhum registro encontrado</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-brand-charcoal/50">
                  {['Candidato', 'Empresa', 'Email', 'Status', 'Enviado em', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-brand-muted uppercase tracking-widest">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((c, i) => (
                  <tr
                    key={c.id}
                    className={cn(
                      'hover:bg-white/2 transition-colors animate-fade-up opacity-0',
                      c.status === 'failed' && 'bg-brand-error/3'
                    )}
                    style={{ animationDelay: `${i * 20}ms`, animationFillMode: 'forwards' }}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-brand-white">{c.fullName}</p>
                      <p className="text-xs text-brand-muted mt-0.5">{c.title}</p>
                    </td>
                    <td className="px-4 py-3 text-brand-muted">{c.company || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-brand-muted">{c.email}</td>
                    <td className="px-4 py-3">
                      {c.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-success/10 text-brand-success border border-brand-success/20">
                          <CheckCircle2 className="h-3 w-3" /> Enviado
                        </span>
                      ) : c.status === 'failed' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-error/10 text-brand-error border border-brand-error/20">
                          <XCircle className="h-3 w-3" /> Falhou
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-warning/10 text-brand-warning border border-brand-warning/20">
                          Aprovado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-muted font-mono">
                      {c.sentAt ? formatDate(c.sentAt) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {(c.editedBody || c.generatedBody) && (
                        <button
                          onClick={() => setViewingEmail(c)}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-brand-muted hover:text-brand-white transition-all"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Failed alert */}
        {failed.length > 0 && campaignId && (
          <div className="rounded-xl border border-brand-error/20 bg-brand-error/5 p-4 flex items-center justify-between animate-fade-up stagger-3" style={{ animationFillMode: 'forwards' }}>
            <div>
              <p className="text-sm font-semibold text-brand-white">
                {failed.length} email{failed.length > 1 ? 's' : ''} falharam no envio
              </p>
              <p className="text-xs text-brand-muted mt-0.5">Reenvie os falhos ou volte à revisão para editar.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/review')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-brand-muted hover:text-brand-white hover:bg-white/5 text-sm font-medium transition-all"
              >
                Revisão
              </button>
              <button
                onClick={() => {
                  retryFailedCandidates(campaignId)
                  router.push('/sending')
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-error/20 bg-brand-error/10 text-brand-error hover:bg-brand-error/20 text-sm font-semibold transition-all"
              >
                <RefreshCw className="h-4 w-4" /> Reenviar {failed.length} falho{failed.length > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Email detail modal */}
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
                  Email para {viewingEmail.fullName}
                </h2>
                <p className="text-xs text-brand-muted font-mono mt-0.5">{viewingEmail.email}</p>
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
                  {viewingEmail.editedSubject || viewingEmail.generatedSubject}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-brand-muted uppercase tracking-widest">Corpo</p>
                <div className="bg-brand-dark rounded-lg px-4 py-4 email-body text-brand-white whitespace-pre-wrap border border-white/5">
                  {viewingEmail.editedBody || viewingEmail.generatedBody}
                </div>
              </div>
              {viewingEmail.sentAt && (
                <p className="text-xs text-brand-muted">Enviado em: {formatDate(viewingEmail.sentAt)}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
