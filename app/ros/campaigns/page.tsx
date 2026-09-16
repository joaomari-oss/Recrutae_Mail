'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2, Plus, RefreshCw, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useRosStore } from '@/store/rosStore'
import { reconcileSendingContacts, type RosServerContactStatus } from '@/lib/ros/sendQueue'
import type { RosContact } from '@/lib/rosTypes'

type RosCampaignRow = {
  id: string
  name: string
  status: string
  totalContacts: number
  sentCount: number
  failedCount: number
  createdAt: string
  recruiterName: string
  recruiterEmail: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho', generating: 'Gerando', ready: 'Pronto', sending: 'Enviando', completed: 'Concluído',
}

export default function RosCampaignsPage() {
  const router = useRouter()
  const localCampaigns = useRosStore((state) => state.campaigns)
  const contactsByCampaign = useRosStore((state) => state.contactsByCampaign)
  const setActiveCampaign = useRosStore((state) => state.setActiveCampaign)
  const deleteLocalCampaign = useRosStore((state) => state.deleteCampaign)
  const updateContact = useRosStore((state) => state.updateContact)

  const [rows, setRows] = useState<RosCampaignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // A rota filtra por campaign_kind = 'ros', então campanhas de Clientes
      // nunca aparecem aqui — nem o contrário.
      const response = await fetch('/api/ros/campaigns')
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error ?? 'Não foi possível carregar as campanhas.')
      setRows(result.campaigns ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as campanhas.')
      setRows(localCampaigns.map((campaign) => ({
        id: campaign.id, name: campaign.name, status: campaign.status,
        totalContacts: campaign.totalContacts, sentCount: campaign.sentCount,
        failedCount: campaign.failedCount, createdAt: campaign.createdAt,
        recruiterName: '', recruiterEmail: '',
      })))
    } finally {
      setLoading(false)
    }
  }, [localCampaigns])

  useEffect(() => { void load() }, [load])

  const reopen = async (id: string) => {
    const contacts: RosContact[] = contactsByCampaign[id] ?? []
    if (!contacts.length) {
      toast.error('Esta campanha não está mais nesta aba. Os resultados continuam no histórico.')
      return
    }

    // O servidor decide antes de qualquer coisa. Rebaixar um contato que está
    // `sending` sem confirmar seria o caminho mais curto para enviar duas vezes.
    let serverContacts: RosServerContactStatus[] | null = null
    try {
      const response = await fetch(`/api/ros/campaigns?campaignId=${encodeURIComponent(id)}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error ?? 'Não foi possível consultar a campanha.')
      serverContacts = result.contacts ?? []
    } catch (cause) {
      toast.error(cause instanceof Error
        ? `${cause.message} Reabrir agora poderia reenviar e-mails.`
        : 'Não foi possível confirmar a situação no servidor.')
      return
    }

    reconcileSendingContacts(contacts, serverContacts ?? []).forEach(({ id: contactId, updates }) => {
      updateContact(id, contactId, updates)
    })

    const byId = new Map((serverContacts ?? []).map((row) => [row.id, row.status]))
    const latest = useRosStore.getState().contactsByCampaign[id] ?? []
    latest.forEach((contact) => {
      // `sent` é terminal e `sending` sem resposta continua bloqueado.
      if (contact.status === 'sent' || contact.status === 'sending') return
      if (byId.get(contact.id) === 'sent' || byId.get(contact.id) === 'sending') return
      // Volta para `ready`, não `pending`: `pending` mandaria a revisão gerar de
      // novo por cima do texto que o recrutador editou.
      const hasContent = (contact.editedSubject || contact.generatedSubject).trim()
        && (contact.editedBody || contact.generatedBody).trim()
      updateContact(id, contact.id, {
        status: hasContent ? 'ready' : 'pending',
        errorMessage: undefined,
      })
    })

    setActiveCampaign(id)
    router.push('/ros/review')
  }

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Excluir a campanha "${name}" e todos os seus contatos? Esta ação não pode ser desfeita.`)) return
    try {
      const response = await fetch(`/api/ros/campaigns?campaignId=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok || !result?.success) throw new Error(result?.error ?? 'Não foi possível excluir.')
      deleteLocalCampaign(id)
      setRows((current) => current.filter((row) => row.id !== id))
      toast.success('Campanha excluída.')
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir.')
    }
  }

  return (
    <main className="min-h-full bg-brand-dark px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="font-ros text-3xl font-semibold text-brand-white">Campanhas ROS</h1>
            <p className="text-sm text-brand-muted">Somente divulgações do Recrutaê | OS.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/12 px-3 py-2 text-xs font-medium text-brand-muted transition-colors hover:border-brand-coral/40 hover:text-brand-white">
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar
            </button>
            <button type="button" onClick={() => router.push('/ros')}
              className="btn-coral inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold">
              <Plus className="h-3.5 w-3.5" />
              Nova campanha
            </button>
          </div>
        </header>

        {error && (
          <p role="alert" className="rounded-xl border border-brand-warning/25 bg-brand-warning/10 p-4 text-sm text-brand-white">
            {error} Mostrando o que está guardado nesta aba.
          </p>
        )}

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-brand-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : !rows.length ? (
          <p className="rounded-xl border border-white/8 bg-brand-charcoal p-8 text-center text-sm text-brand-muted">
            Nenhuma campanha de divulgação ainda.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-white/8 bg-brand-charcoal p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-ros text-base font-semibold text-brand-white">{row.name}</p>
                  <p className="font-mono text-[11px] text-brand-muted">
                    {new Date(row.createdAt).toLocaleDateString('pt-BR')} · {STATUS_LABELS[row.status] ?? row.status}
                    {row.recruiterEmail ? ` · ${row.recruiterEmail}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-4 font-mono text-[11px] text-brand-muted">
                  <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{row.totalContacts}</span>
                  <span className="text-brand-success">{row.sentCount} enviados</span>
                  {row.failedCount > 0 && <span className="text-brand-error">{row.failedCount} falhas</span>}
                </div>

                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => void reopen(row.id)}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-brand-muted transition-colors hover:text-brand-coral">
                    Reabrir
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => void remove(row.id, row.name)}
                    aria-label={`Excluir campanha ${row.name}`}
                    className="rounded-lg p-2 text-brand-muted transition-colors hover:bg-brand-error/10 hover:text-brand-error">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
