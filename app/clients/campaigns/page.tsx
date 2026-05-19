'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClientStore } from '@/store/clientStore'
import { loadCampaignsFromSupabase, DbCampaignRow } from '@/lib/supabaseOps'
import { isSupabaseConfigured } from '@/lib/supabase'
import { Building2, Plus, Trash2, ChevronRight, Users, Database, HardDrive, RefreshCw, Eye, MousePointerClick } from 'lucide-react'
import { cn } from '@/lib/utils'

const statusLabel: Record<string, string> = {
  draft: 'Rascunho', generating: 'Gerando', ready: 'Pronto',
  sending: 'Enviando', completed: 'Concluído',
}
const statusColor: Record<string, string> = {
  draft: 'text-brand-muted bg-brand-muted/10 border-brand-muted/20',
  generating: 'text-brand-warning bg-brand-warning/10 border-brand-warning/20',
  ready: 'text-brand-warning bg-brand-warning/10 border-brand-warning/20',
  sending: 'text-brand-coral bg-brand-coral/10 border-brand-coral/20',
  completed: 'text-brand-success bg-brand-success/10 border-brand-success/20',
}

type CampaignRow = {
  id: string; name: string; segment: string; status: string
  recruiter_email?: string; recruiter_name?: string
  contact_count: number; sent_count: number; failed_count: number
  created_at: string; source: 'supabase' | 'local'
}

export default function ClientCampaignsPage() {
  const router = useRouter()
  const { campaigns: localCampaigns, deleteCampaign, setActiveCampaign } = useClientStore()
  const [rows, setRows] = useState<CampaignRow[]>([])
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState<'supabase' | 'local'>('local')
  const [eventStats, setEventStats] = useState<Map<string, { opened: number; clicked: number }>>(new Map())

  const fetchEventStats = async (campaignIds: string[]) => {
    const ids = campaignIds.filter(Boolean)
    if (!ids.length) return
    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/clients/events?campaignId=${id}`).then((r) => r.ok ? r.json() : null))
    )
    const map = new Map<string, { opened: number; clicked: number }>()
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value) {
        map.set(ids[idx], { opened: r.value.totalOpened ?? 0, clicked: r.value.totalClicked ?? 0 })
      }
    })
    setEventStats(map)
  }

  const loadData = async () => {
    setLoading(true)
    if (isSupabaseConfigured()) {
      const data = await loadCampaignsFromSupabase()
      setSource('supabase')
      const mapped = data.map((d: DbCampaignRow) => ({
        id: d.id, name: d.name, segment: d.segment, status: d.status,
        recruiter_email: d.recruiter_email, recruiter_name: d.recruiter_name,
        contact_count: d.contact_count, sent_count: d.sent_count, failed_count: d.failed_count,
        created_at: d.created_at, source: 'supabase' as const,
      }))
      setRows(mapped)
      setLoading(false)
      fetchEventStats(mapped.map((r) => r.id))
      return
    }
    // Fallback to localStorage (Supabase not configured)
    setSource('local')
    const mapped = localCampaigns.map((c) => ({
      id: c.id, name: c.name, segment: c.segment, status: c.status,
      contact_count: c.totalContacts, sent_count: c.sentCount, failed_count: c.failedCount,
      created_at: c.createdAt, source: 'local' as const,
    }))
    setRows(mapped)
    setLoading(false)
    fetchEventStats(mapped.map((r) => r.id))
  }

  useEffect(() => { loadData() }, [])

  const handleOpen = (id: string) => {
    setActiveCampaign(id)
    router.push('/clients/sent')
  }

  return (
    <main className="min-h-full bg-brand-dark px-6 py-10">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between animate-fade-up">
          <div>
            <h1 className="text-3xl font-display font-bold text-brand-white">Campanhas de Clientes</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-brand-muted text-sm">{rows.length} campanha{rows.length !== 1 ? 's' : ''}</p>
              <span className={cn(
                'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border',
                source === 'supabase'
                  ? 'text-brand-success border-brand-success/20 bg-brand-success/8'
                  : 'text-brand-muted border-white/10 bg-white/4'
              )}>
                {source === 'supabase'
                  ? <><Database className="h-2.5 w-2.5" /> Supabase</>
                  : <><HardDrive className="h-2.5 w-2.5" /> Local</>}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2.5 rounded-xl border border-white/8 text-brand-muted hover:text-brand-white hover:bg-white/5 transition-colors"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
            <button
              onClick={() => router.push('/clients')}
              className="btn-coral flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              Nova campanha
            </button>
          </div>
        </div>

        {/* Supabase not configured warning */}
        {!isSupabaseConfigured() && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-warning/8 border border-brand-warning/20 animate-fade-up stagger-1" style={{ animationFillMode: 'forwards' }}>
            <Database className="h-5 w-5 text-brand-warning flex-shrink-0 mt-0.5" />
            <div className="text-sm text-brand-muted leading-relaxed">
              <span className="text-brand-warning font-semibold">Supabase não configurado.</span>{' '}
              Os dados estão salvos apenas localmente neste navegador. Configure as variáveis{' '}
              <code className="bg-white/8 px-1 rounded text-xs">NEXT_PUBLIC_SUPABASE_URL</code> e{' '}
              <code className="bg-white/8 px-1 rounded text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{' '}
              no <code className="bg-white/8 px-1 rounded text-xs">.env.local</code> para persistência cross-device.
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 animate-fade-up stagger-1" style={{ animationFillMode: 'forwards' }}>
            <div className="w-16 h-16 rounded-2xl bg-brand-charcoal border border-white/5 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-brand-muted/30" />
            </div>
            <div className="text-center">
              <p className="text-brand-white font-semibold">Nenhuma campanha ainda</p>
              <p className="text-brand-muted text-sm mt-1">Crie sua primeira campanha de prospecção B2B</p>
            </div>
            <button onClick={() => router.push('/clients')} className="btn-coral px-6 py-2.5 text-sm font-semibold">
              Começar agora
            </button>
          </div>
        )}

        {/* Campaigns list */}
        {rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((campaign, i) => {
              const ev = eventStats.get(campaign.id)
              return (
              <div
                key={campaign.id}
                className="group flex items-center gap-4 p-5 rounded-2xl bg-brand-charcoal border border-white/[0.06] hover:border-brand-coral/20 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-300 animate-fade-up opacity-0"
                style={{ animationDelay: `${i * 45}ms`, animationFillMode: 'forwards' }}
              >
                <div className="w-11 h-11 rounded-xl bg-brand-coral/10 border border-brand-coral/[0.15] flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-5 w-5 text-brand-coral" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-brand-white">{campaign.name}</h3>
                    <span className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                      statusColor[campaign.status] ?? statusColor.draft
                    )}>
                      {statusLabel[campaign.status] ?? campaign.status}
                    </span>
                  </div>
                  <p className="text-xs text-brand-muted mt-0.5 truncate">{campaign.segment}</p>
                  {campaign.recruiter_name && (
                    <p className="text-xs text-brand-muted/60 mt-0.5 truncate">{campaign.recruiter_name} · {campaign.recruiter_email}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-brand-muted/60 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />{campaign.contact_count} contatos
                    </span>
                    {campaign.sent_count > 0 && (
                      <span className="text-brand-success font-medium">{campaign.sent_count} enviados</span>
                    )}
                    {campaign.failed_count > 0 && (
                      <span className="text-brand-error">{campaign.failed_count} falhas</span>
                    )}
                    {ev && ev.opened > 0 && (
                      <span className="flex items-center gap-1 text-brand-coral font-medium">
                        <Eye className="h-3 w-3" />{ev.opened} abriram
                      </span>
                    )}
                    {ev && ev.clicked > 0 && (
                      <span className="flex items-center gap-1 text-brand-warning font-medium">
                        <MousePointerClick className="h-3 w-3" />{ev.clicked} clicaram
                      </span>
                    )}
                    <span>{new Date(campaign.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {campaign.source === 'local' && (
                    <button
                      onClick={() => { if (confirm('Excluir esta campanha?')) { deleteCampaign(campaign.id); loadData() } }}
                      className="p-2 rounded-lg text-brand-muted hover:text-brand-error hover:bg-brand-error/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleOpen(campaign.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-brand-white text-xs font-medium transition-colors border border-white/8"
                  >
                    Ver resultados
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
