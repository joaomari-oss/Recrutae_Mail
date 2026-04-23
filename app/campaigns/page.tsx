'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import {
  FolderOpen,
  Plus,
  Send,
  BarChart3,
  Users,
  Clock,
  ArrowRight,
  Trash2,
  RotateCcw,
  Pencil,
  Check,
  X,
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { CampaignStatus } from '@/lib/types'

const STATUS_CONFIG: Record<CampaignStatus, { label: string; classes: string }> = {
  draft:      { label: 'Rascunho', classes: 'bg-white/5 text-brand-muted border-white/10' },
  generating: { label: 'Gerando',  classes: 'bg-brand-coral/10 text-brand-coral border-brand-coral/20' },
  ready:      { label: 'Pronto',   classes: 'bg-brand-warning/10 text-brand-warning border-brand-warning/20' },
  sending:    { label: 'Enviando', classes: 'bg-brand-coral/10 text-brand-coral border-brand-coral/20' },
  completed:  { label: 'Concluído', classes: 'bg-brand-success/10 text-brand-success border-brand-success/20' },
}

export default function CampaignsPage() {
  const router  = useRouter()
  const { campaigns, campaignConfigById, sentEmails, setActiveCampaign, deleteCampaign, reopenCampaign, updateCampaign } = useAppStore()

  const [editingId, setEditingId]     = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = (id: string, name: string) => {
    setEditingId(id)
    setEditingName(name)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const saveEdit = (id: string) => {
    const trimmed = editingName.trim()
    if (trimmed) updateCampaign(id, { name: trimmed })
    setEditingId(null)
  }

  const cancelEdit = () => setEditingId(null)

  const totalSent    = sentEmails.filter((e) => e.status === 'sent').length
  const totalFailed  = sentEmails.filter((e) => e.status === 'failed').length
  const successRate  = totalSent + totalFailed > 0
    ? Math.round((totalSent / (totalSent + totalFailed)) * 100)
    : 0

  const handleOpen = (id: string, status: CampaignStatus) => {
    setActiveCampaign(id)
    if (status === 'draft') router.push('/campaign')
    else if (status === 'generating' || status === 'ready') router.push('/review')
    else if (status === 'sending') router.push('/sending')
    else router.push('/sent')
  }

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Excluir a campanha "${name}"? Esta ação não pode ser desfeita.`)) {
      deleteCampaign(id)
    }
  }

  const handleReopen = (id: string, name: string) => {
    if (confirm(`Reabrir "${name}"? Candidatos não enviados voltarão para geração.`)) {
      reopenCampaign(id)
      setActiveCampaign(id)
      router.push('/review')
    }
  }

  const stats = [
    { label: 'Campanhas',     value: campaigns.length, icon: <FolderOpen className="h-5 w-5 text-brand-coral" />,    bg: 'bg-brand-coral/8 border-brand-coral/20' },
    { label: 'Emails enviados', value: totalSent,      icon: <Send className="h-5 w-5 text-brand-success" />,        bg: 'bg-brand-success/8 border-brand-success/20' },
    { label: 'Taxa de sucesso', value: `${successRate}%`, icon: <BarChart3 className="h-5 w-5 text-brand-warning" />, bg: 'bg-brand-warning/8 border-brand-warning/20' },
  ]

  return (
    <div className="min-h-screen bg-brand-dark">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-up" style={{ animationFillMode: 'forwards' }}>
          <div>
            <h1 className="text-3xl font-display font-bold text-brand-white">Campanhas</h1>
            <p className="text-brand-muted text-sm mt-1">Gerencie todas as suas campanhas de outreach</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="btn-coral flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" /> Nova Campanha
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 animate-fade-up stagger-1" style={{ animationFillMode: 'forwards' }}>
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

        {/* Campaigns list */}
        {campaigns.length === 0 ? (
          <div className="rounded-xl border border-white/8 bg-brand-charcoal p-20 text-center animate-fade-up stagger-2" style={{ animationFillMode: 'forwards' }}>
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="h-8 w-8 text-brand-muted opacity-40" />
            </div>
            <h2 className="text-lg font-display font-semibold text-brand-white">Nenhuma campanha ainda</h2>
            <p className="text-sm text-brand-muted mt-1.5 mb-6">
              Crie sua primeira campanha importando um CSV do Apollo.io
            </p>
            <button
              onClick={() => router.push('/')}
              className="btn-coral inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold"
            >
              <Plus className="h-4 w-4" /> Criar campanha
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-white/8 overflow-hidden animate-fade-up stagger-2" style={{ animationFillMode: 'forwards' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-brand-charcoal">
                  {['Nome', 'Criado em', 'Status', 'Candidatos', 'Aprovados', 'Enviados', 'Ações'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-brand-muted uppercase tracking-widest">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {campaigns.map((c, i) => {
                  const { label, classes } = STATUS_CONFIG[c.status]
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-white/2 transition-colors animate-fade-up opacity-0"
                      style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'forwards' }}
                    >
                      <td className="px-4 py-4 max-w-[260px]">
                        {editingId === c.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              ref={inputRef}
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onBlur={() => saveEdit(c.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEdit(c.id)
                                if (e.key === 'Escape') cancelEdit()
                              }}
                              className="flex-1 min-w-0 bg-brand-dark border border-brand-coral/50 rounded-lg px-2.5 py-1.5 text-sm text-brand-white outline-none"
                            />
                            <button
                              onMouseDown={(e) => { e.preventDefault(); saveEdit(c.id) }}
                              className="p-1 rounded text-brand-success hover:bg-brand-success/10 transition-all"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onMouseDown={(e) => { e.preventDefault(); cancelEdit() }}
                              className="p-1 rounded text-brand-muted hover:bg-white/5 transition-all"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 group">
                            <div className="min-w-0">
                              <button
                                onClick={() => handleOpen(c.id, c.status)}
                                className="font-semibold text-brand-white hover:text-brand-coral transition-colors text-left truncate block max-w-full"
                              >
                                {c.name}
                              </button>
                              {(() => {
                                const cfg = campaignConfigById[c.id]
                                const parts = [cfg?.hiringCompany, cfg?.role].filter(Boolean)
                                return parts.length > 0 ? (
                                  <p className="text-xs text-brand-muted/70 mt-0.5 truncate">
                                    {parts.join(' · ')}
                                  </p>
                                ) : null
                              })()}
                            </div>
                            <button
                              onClick={() => startEdit(c.id, c.name)}
                              className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded hover:bg-white/5 text-brand-muted hover:text-brand-white transition-all mt-0.5"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-brand-muted">
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                          {formatDate(c.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', classes)}>
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="flex items-center gap-1.5 text-brand-muted">
                          <Users className="h-3.5 w-3.5" />
                          {c.totalCandidates}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-medium text-brand-white">{c.approvedCount}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-medium text-brand-success">{c.sentCount || 0}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          {['completed', 'sending', 'ready'].includes(c.status) && (
                            <button
                              onClick={() => handleReopen(c.id, c.name)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-brand-warning hover:bg-brand-warning/10 border border-brand-warning/20 transition-all"
                            >
                              <RotateCcw className="h-3 w-3" /> Reabrir
                            </button>
                          )}
                          <button
                            onClick={() => handleOpen(c.id, c.status)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-brand-muted hover:text-brand-white hover:bg-white/5 transition-all"
                          >
                            Abrir <ArrowRight className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id, c.name)}
                            className="p-1.5 rounded-lg text-brand-muted hover:text-brand-error hover:bg-brand-error/10 transition-all"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
