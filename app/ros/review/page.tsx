'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useRosStore } from '@/store/rosStore'
import type { RosCampaignConfig, RosContact } from '@/lib/rosTypes'
import { RosEmailEditor, type RosGenerationInfo } from '@/components/ros/RosEmailEditor'
import { networkErrorMessage, readRosApiResponse } from '@/lib/ros/apiResponse'

const STATUS_LABELS: Record<RosContact['status'], string> = {
  pending: 'Na fila', generating: 'Gerando', ready: 'Pronto', approved: 'Aprovado',
  sending: 'Enviando', sent: 'Enviado', failed: 'Falhou',
}

const STATUS_CLASSES: Record<RosContact['status'], string> = {
  pending: 'text-brand-muted border-white/10',
  generating: 'text-brand-warning border-brand-warning/30 animate-pulse',
  ready: 'text-brand-warning border-brand-warning/30',
  approved: 'text-brand-success border-brand-success/30',
  sending: 'text-brand-coral border-brand-coral/30 animate-pulse',
  sent: 'text-brand-success border-brand-success/30',
  failed: 'text-brand-error border-brand-error/30',
}

export default function RosReviewPage() {
  const router = useRouter()
  const activeCampaignId = useRosStore((state) => state.activeCampaignId)
  const contactsByCampaign = useRosStore((state) => state.contactsByCampaign)
  const campaignConfigById = useRosStore((state) => state.campaignConfigById)
  const updateContact = useRosStore((state) => state.updateContact)
  const removeContact = useRosStore((state) => state.removeContact)

  const contacts: RosContact[] = useMemo(
    () => (activeCampaignId ? contactsByCampaign[activeCampaignId] ?? [] : []),
    [activeCampaignId, contactsByCampaign],
  )
  const config: RosCampaignConfig | null = activeCampaignId
    ? campaignConfigById[activeCampaignId] ?? null
    : null

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generationById, setGenerationById] = useState<Record<string, RosGenerationInfo>>({})
  // A fila termina dentro de um `finally`, depois da última atualização de
  // estado: sem este contador o efeito não seria reavaliado e a fila pararia
  // no primeiro contato.
  const [queueTick, setQueueTick] = useState(0)
  const [approving, setApproving] = useState(false)

  // Uma geração por vez, cancelável no unmount — o mesmo padrão de Clientes.
  const running = useRef(false)
  const aborted = useRef(false)
  useEffect(() => {
    // O StrictMode simula uma desmontagem e reusa o mesmo ref: sem reiniciar
    // aqui, tudo abaixo continuaria cancelado durante o desenvolvimento.
    aborted.current = false
    return () => { aborted.current = true }
  }, [])

  const selected = contacts.find((contact) => contact.id === selectedId) ?? contacts[0] ?? null

  useEffect(() => {
    if (!selectedId && contacts.length) setSelectedId(contacts[0].id)
  }, [contacts, selectedId])

  // Sair da tela no meio de uma geração deixaria o contato preso em
  // `generating`, fora da fila e bloqueando o envio para sempre.
  useEffect(() => {
    if (!activeCampaignId) return
    const stranded = (useRosStore.getState().contactsByCampaign[activeCampaignId] ?? [])
      .filter((contact) => contact.status === 'generating')
    stranded.forEach((contact) => updateContact(activeCampaignId, contact.id, { status: 'pending' }))
    // Uma vez, na montagem: depois disso `generating` significa geração em curso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCampaignId])

  const generateFor = useCallback(async (contact: RosContact) => {
    if (!activeCampaignId || !config) return
    updateContact(activeCampaignId, contact.id, { status: 'generating', errorMessage: undefined })
    try {
      const response = await fetch('/api/ros/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: {
            id: contact.id, firstName: contact.firstName, lastName: contact.lastName,
            fullName: contact.fullName, email: contact.email, company: contact.company,
            position: contact.position,
          },
          campaignId: activeCampaignId,
          subjectTemplate: config.subjectTemplate,
          emailTemplate: config.emailTemplate,
          varySubject: config.varySubject,
          variationSeed: Math.floor(Math.random() * 1_000_000),
        }),
      })
      const parsed = await readRosApiResponse<RosGenerationInfo & { subject?: string; body?: string }>(response)
      if (!parsed.ok) throw new Error(parsed.error)
      const result = parsed.data
      if (typeof result.body !== 'string') {
        throw new Error('A geração não retornou um e-mail.')
      }
      if (aborted.current) return
      setGenerationById((current) => ({ ...current, [contact.id]: result }))
      updateContact(activeCampaignId, contact.id, {
        status: 'ready',
        generatedSubject: result.subject ?? '',
        generatedBody: result.body,
        editedSubject: result.subject ?? '',
        editedBody: result.body,
        errorMessage: undefined,
      })
    } catch (cause) {
      if (aborted.current) return
      updateContact(activeCampaignId, contact.id, {
        status: 'failed',
        errorMessage: networkErrorMessage(cause, 'Falha ao gerar o e-mail.'),
      })
    }
  }, [activeCampaignId, config, updateContact])

  // Fila: gera os pendentes um a um e segue mesmo quando um deles falha.
  useEffect(() => {
    if (!activeCampaignId || !config || running.current) return
    const next = contacts.find((contact) => contact.status === 'pending')
    if (!next) return

    running.current = true
    void (async () => {
      try { await generateFor(next) } finally {
        running.current = false
        if (!aborted.current) setQueueTick((tick) => tick + 1)
      }
    })()
  }, [activeCampaignId, config, contacts, generateFor, queueTick])

  const counts = useMemo(() => ({
    total: contacts.length,
    generated: contacts.filter((c) => c.status !== 'pending' && c.status !== 'generating').length,
    approved: contacts.filter((c) => c.status === 'approved' || c.status === 'sent').length,
  }), [contacts])

  const pendingDecision = contacts.filter((c) => c.status !== 'approved' && c.status !== 'sent')
  const canSend = contacts.length > 0 && pendingDecision.length === 0

  /**
   * A aprovação precisa existir no banco, não só nesta aba.
   *
   * O servidor só libera o envio de um contato que esteja `approved` lá; quando
   * a aprovação ficava só aqui, a campanha inteira falhava com "Contato não
   * disponível para envio". Por isso o estado local só muda depois do confirme.
   */
  const persistApproval = useCallback(async (ids: string[]): Promise<string[]> => {
    if (!activeCampaignId || !ids.length) return []
    const response = await fetch('/api/ros/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: activeCampaignId, contactIds: ids }),
    })
    const result = await readRosApiResponse<{ approved?: string[]; rejected?: string[] }>(response)
    if (!result.ok) throw new Error(result.error)
    return result.data.approved ?? []
  }, [activeCampaignId])

  const approve = async (id: string) => {
    if (!activeCampaignId || approving) return
    setApproving(true)
    try {
      const approved = await persistApproval([id])
      if (!approved.includes(id)) {
        toast.error('O servidor não aceitou a aprovação deste contato.')
        return
      }
      updateContact(activeCampaignId, id, { status: 'approved', errorMessage: undefined })
      const index = contacts.findIndex((contact) => contact.id === id)
      const next = contacts.slice(index + 1).find((contact) => contact.status !== 'approved' && contact.status !== 'sent')
      if (next) setSelectedId(next.id)
    } catch (cause) {
      toast.error(networkErrorMessage(cause, 'Não foi possível aprovar.'))
    } finally {
      setApproving(false)
    }
  }

  const approveAllReady = async () => {
    if (!activeCampaignId || approving) return
    // `failed` entra porque uma tentativa recusada pelo servidor volta assim, e
    // o texto continua lá para ser reaprovado.
    const elegiveis = contacts.filter((contact) => {
      const subject = contact.editedSubject || contact.generatedSubject
      const body = contact.editedBody || contact.generatedBody
      // Um contato sem texto não pode ser aprovado em lote: viraria e-mail vazio.
      return (contact.status === 'ready' || contact.status === 'failed')
        && subject.trim() && body.trim()
    })

    if (!elegiveis.length) {
      toast.error('Nenhum e-mail pronto para aprovar em lote.')
      return
    }

    setApproving(true)
    try {
      const approved = await persistApproval(elegiveis.map((contact) => contact.id))
      approved.forEach((id) => updateContact(activeCampaignId, id, { status: 'approved', errorMessage: undefined }))
      const recusados = elegiveis.length - approved.length
      if (recusados > 0) toast.error(`${recusados} contato(s) o servidor não aceitou aprovar.`)
      else toast.success(`${approved.length} e-mail(s) aprovado(s).`)
    } catch (cause) {
      toast.error(networkErrorMessage(cause, 'Não foi possível aprovar em lote.'))
    } finally {
      setApproving(false)
    }
  }

  const discard = (id: string) => {
    if (!activeCampaignId) return
    const index = contacts.findIndex((contact) => contact.id === id)
    const next = contacts[index + 1] ?? contacts[index - 1] ?? null
    // Tira da campanha desta aba: o contato nunca é reivindicado nem enviado.
    removeContact(activeCampaignId, id)
    setSelectedId(next ? next.id : null)
  }

  const skip = () => {
    if (!selected) return
    const index = contacts.findIndex((contact) => contact.id === selected.id)
    const next = contacts[index + 1] ?? contacts[0]
    if (next) setSelectedId(next.id)
  }

  if (!activeCampaignId || !config) {
    return (
      <main className="min-h-full bg-brand-dark px-6 py-10">
        <div className="mx-auto max-w-xl space-y-4 text-center">
          <h1 className="font-ros text-2xl font-semibold text-brand-white">Nenhuma campanha ativa</h1>
          <p className="text-sm text-brand-muted">Monte a lista de contatos e escreva a mensagem para revisar os e-mails.</p>
          <button type="button" onClick={() => router.push('/ros')} className="btn-coral px-5 py-2.5 text-sm font-semibold">
            Ir para contatos
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-full bg-brand-dark px-6 py-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[35%_minmax(0,1fr)]">
        <section aria-label="Contatos da campanha" className="space-y-4">
          <header className="space-y-1">
            <h1 className="font-ros text-2xl font-semibold text-brand-white">Revisão dos e-mails</h1>
            <p aria-live="polite" className="font-mono text-xs text-brand-muted">
              {counts.generated}/{counts.total} gerados · {counts.approved}/{counts.total} aprovados
            </p>
          </header>

          <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
            <div className="h-full bg-brand-coral transition-all duration-300"
              style={{ width: `${counts.total ? (counts.approved / counts.total) * 100 : 0}%` }} />
          </div>

          <button type="button" onClick={() => void approveAllReady()} disabled={approving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/12 px-4 py-2.5 text-sm font-medium text-brand-muted transition-colors hover:border-brand-coral/40 hover:text-brand-white disabled:cursor-wait disabled:opacity-50">
            <CheckCheck className="h-4 w-4" />
            {approving ? 'Aprovando…' : 'Aprovar todos os prontos'}
          </button>

          <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
            {contacts.map((contact) => {
              const isSelected = selected?.id === contact.id
              return (
                <li key={contact.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(contact.id)}
                    aria-current={isSelected || undefined}
                    className={`flex w-full items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-left transition-colors ${
                      isSelected ? 'border-brand-coral bg-brand-coral/10' : 'border-transparent hover:bg-white/4'
                    }`}
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-coral/15 font-mono text-[11px] font-bold text-brand-coral">
                      {(contact.fullName || contact.email).slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-brand-white">{contact.fullName || contact.email}</span>
                      <span className="block truncate font-mono text-[11px] text-brand-muted">{contact.email}</span>
                    </span>
                    <span className={`flex-shrink-0 rounded-md border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${STATUS_CLASSES[contact.status]}`}>
                      {STATUS_LABELS[contact.status]}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <button
            type="button"
            onClick={() => router.push('/ros/sending')}
            disabled={!canSend}
            className="btn-coral flex w-full items-center justify-center gap-3 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:transform-none"
          >
            Enviar campanha
            <ArrowRight className="h-4 w-4" />
          </button>
          {!canSend && contacts.length > 0 && (
            <p className="text-xs text-brand-muted">
              Faltam {pendingDecision.length} e-mail{pendingDecision.length > 1 ? 's' : ''} para aprovar.
            </p>
          )}
        </section>

        <div className="rounded-xl border border-white/8 bg-brand-charcoal p-5">
          {selected ? (
            <RosEmailEditor
              key={selected.id}
              contact={selected}
              config={config}
              generation={generationById[selected.id]}
              onSave={(id, updates) => updateContact(activeCampaignId, id, updates)}
              onApprove={(id) => void approve(id)}
              onRegenerate={(id) => {
                const contact = contacts.find((c) => c.id === id)
                if (contact && !running.current) {
                  running.current = true
                  void generateFor(contact).finally(() => {
                    running.current = false
                    if (!aborted.current) setQueueTick((tick) => tick + 1)
                  })
                }
              }}
              onSkip={skip}
              onDiscard={discard}
            />
          ) : (
            <p className="text-sm text-brand-muted">Nenhum contato nesta campanha.</p>
          )}
        </div>
      </div>
    </main>
  )
}
