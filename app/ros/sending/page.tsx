'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2, Send, TriangleAlert } from 'lucide-react'
import { useRosStore } from '@/store/rosStore'
import {
  getRosSendQueue,
  reconcileSendingContacts,
  SUPPRESSED_MESSAGE,
  type RosServerContactStatus,
} from '@/lib/ros/sendQueue'
import { delay } from '@/lib/utils'
import { networkErrorMessage, readRosApiBody, readRosApiResponse } from '@/lib/ros/apiResponse'
import type { RosContact } from '@/lib/rosTypes'

const SEND_INTERVAL_MS = 750

type PreflightCheck = { key: string; status: 'ok' | 'warning' | 'error'; message: string }
type Preflight = { canSend: boolean; checks: PreflightCheck[]; fromEmail: string }

const CHECK_LABELS: Record<string, string> = {
  apiKey: 'Chave do Resend', domain: 'Domínio verificado', dmarc: 'Registro DMARC',
  appUrl: 'Endereço público HTTPS', unsubscribe: 'Assinatura de descadastro',
  webhook: 'Segredo do webhook', database: 'Banco de dados',
}

export default function RosSendingPage() {
  const router = useRouter()
  const activeCampaignId = useRosStore((state) => state.activeCampaignId)
  const contactsByCampaign = useRosStore((state) => state.contactsByCampaign)
  const campaignConfigById = useRosStore((state) => state.campaignConfigById)
  const updateContact = useRosStore((state) => state.updateContact)
  const updateCampaign = useRosStore((state) => state.updateCampaign)

  const contacts: RosContact[] = activeCampaignId ? contactsByCampaign[activeCampaignId] ?? [] : []
  const config = activeCampaignId ? campaignConfigById[activeCampaignId] ?? null : null

  const [preflight, setPreflight] = useState<Preflight | null>(null)
  const [preflightError, setPreflightError] = useState<string | null>(null)
  const [reconciling, setReconciling] = useState(true)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  const aborted = useRef(false)
  useEffect(() => {
    // O StrictMode simula uma desmontagem e reusa o mesmo ref: sem reiniciar
    // aqui, tudo abaixo continuaria cancelado durante o desenvolvimento.
    aborted.current = false
    return () => { aborted.current = true }
  }, [])

  useEffect(() => {
    fetch('/api/ros/preflight')
      .then(async (response) => {
        // O preflight responde 503 com JSON quando bloqueia: esse corpo é o
        // resultado, não um erro de transporte. Só HTML/parse quebrado vira aviso.
        const result = await readRosApiBody<Preflight>(response)
        if (!aborted.current) setPreflight(result)
      })
      .catch((cause) => {
        if (!aborted.current) setPreflightError(networkErrorMessage(cause, 'Não foi possível consultar a verificação de envio.'))
      })
  }, [])

  // Uma aba fechada no meio do lote deixa contatos em `sending`. Confrontar o
  // servidor antes de liberar o botão evita tanto duplicata quanto contato preso.
  useEffect(() => {
    if (!activeCampaignId) { setReconciling(false); return }
    let active = true
    fetch(`/api/ros/campaigns?campaignId=${encodeURIComponent(activeCampaignId)}`)
      .then(async (response) => {
        const parsed = await readRosApiResponse<{ contacts?: RosServerContactStatus[] }>(response)
        if (!active || !parsed.ok) return
        const serverContacts = parsed.data.contacts
        if (!serverContacts) return
        const current = useRosStore.getState().contactsByCampaign[activeCampaignId] ?? []
        reconcileSendingContacts(current, serverContacts).forEach(({ id, updates }) => {
          updateContact(activeCampaignId, id, updates)
        })
      })
      .catch(() => { /* sem resposta, os contatos presos continuam bloqueados */ })
      .finally(() => { if (active) setReconciling(false) })
    return () => { active = false }
  }, [activeCampaignId, updateContact])

  const run = useCallback(async () => {
    if (!activeCampaignId || !config || sending) return
    const queue = getRosSendQueue(useRosStore.getState().contactsByCampaign[activeCampaignId] ?? [])
    if (!queue.length) return

    setSending(true)
    setProgress({ done: 0, total: queue.length })
    updateCampaign(activeCampaignId, { status: 'sending' })

    for (const [index, contact] of queue.entries()) {
      if (aborted.current) return
      updateContact(activeCampaignId, contact.id, { status: 'sending', errorMessage: undefined })
      try {
        const response = await fetch('/api/ros/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignId: activeCampaignId,
            contactId: contact.id,
            to: contact.email,
            subject: contact.editedSubject || contact.generatedSubject,
            body: contact.editedBody || contact.generatedBody,
            recruiterName: config.recruiterName,
            recruiterRole: config.recruiterRole,
            recruiterEmail: config.recruiterEmail,
            replyTo: config.replyTo,
            recruiterLinkedin: config.recruiterLinkedin,
            recruiterWhatsapp: config.recruiterWhatsapp,
          }),
        })
        const parsed = await readRosApiResponse<{
          success?: boolean
          messageId?: string
          suppressed?: boolean
          error?: string
        }>(response)
        if (aborted.current) return

        if (parsed.ok && parsed.data.success) {
          updateContact(activeCampaignId, contact.id, {
            status: 'sent', sentAt: new Date().toISOString(),
            resendMessageId: parsed.data.messageId, errorMessage: undefined,
            sendAttempts: contact.sendAttempts + 1,
          })
        } else {
          // A rota devolve 409 com JSON quando o endereço está suprimido, e o
          // leitor já transforma HTML de borda em mensagem legível.
          const suppressed = parsed.ok
            ? parsed.data.suppressed === true
            : /suprimid/i.test(parsed.error)
          const message = parsed.ok
            ? parsed.data.error ?? 'Falha no envio.'
            : parsed.error
          // Uma falha não interrompe o lote; o contato fica reenviável.
          updateContact(activeCampaignId, contact.id, {
            status: 'failed',
            errorMessage: suppressed ? SUPPRESSED_MESSAGE : message,
            sendAttempts: contact.sendAttempts + 1,
          })
        }
      } catch {
        if (aborted.current) return
        updateContact(activeCampaignId, contact.id, {
          status: 'failed', errorMessage: 'Falha de rede durante o envio.',
          sendAttempts: contact.sendAttempts + 1,
        })
      }

      setProgress({ done: index + 1, total: queue.length })
      if (index < queue.length - 1) await delay(SEND_INTERVAL_MS)
    }

    // Finaliza mesmo com falhas: o servidor é quem consolida os contadores.
    try {
      await fetch('/api/ros/finalize-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: activeCampaignId }),
      })
    } catch { /* a tela de resultados mostra o que a aba observou */ }

    if (aborted.current) return
    updateCampaign(activeCampaignId, { status: 'completed' })
    setSending(false)
    router.push('/ros/sent')
  }, [activeCampaignId, config, sending, router, updateCampaign, updateContact])

  if (!activeCampaignId || !config) {
    return (
      <main className="min-h-full bg-brand-dark px-6 py-10">
        <div className="mx-auto max-w-xl space-y-4 text-center">
          <h1 className="font-ros text-2xl font-semibold text-brand-white">Nenhuma campanha ativa</h1>
          <button type="button" onClick={() => router.push('/ros')} className="btn-coral px-5 py-2.5 text-sm font-semibold">
            Ir para contatos
          </button>
        </div>
      </main>
    )
  }

  const queue = getRosSendQueue(contacts)
  const stuck = contacts.filter((contact) => contact.status === 'sending').length
  const blocked = !preflight?.canSend || reconciling || sending || !queue.length

  return (
    <main className="min-h-full bg-brand-dark px-6 py-10">
      <div className="mx-auto max-w-2xl space-y-7">
        <header className="space-y-1">
          <h1 className="font-ros text-3xl font-semibold text-brand-white">Envio da campanha</h1>
          <p className="text-sm text-brand-muted">
            {queue.length} e-mail{queue.length === 1 ? '' : 's'} na fila · intervalo de {SEND_INTERVAL_MS} ms entre cada.
          </p>
        </header>

        <section aria-label="Verificação antes do envio" className="space-y-2 rounded-xl border border-white/8 bg-brand-charcoal p-5">
          <h2 className="font-ros text-sm font-semibold text-brand-white">Verificação de configuração</h2>
          {preflightError && <p role="alert" className="text-sm text-brand-error">{preflightError}</p>}
          {!preflight && !preflightError && (
            <p className="flex items-center gap-2 text-sm text-brand-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Consultando…
            </p>
          )}
          <ul className="space-y-1.5">
            {preflight?.checks.map((check) => (
              <li key={check.key} className="flex items-start gap-2 text-xs">
                {check.status === 'ok'
                  ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-success" />
                  : check.status === 'warning'
                    ? <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-warning" />
                    : <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-error" />}
                <span className="text-brand-muted">
                  <span className="text-brand-white">{CHECK_LABELS[check.key] ?? check.key}:</span> {check.message}
                </span>
              </li>
            ))}
          </ul>
          {preflight && (
            <p className="pt-1 font-mono text-[11px] text-brand-muted">
              Remetente: {preflight.fromEmail}
            </p>
          )}
        </section>

        {stuck > 0 && (
          <p role="alert" className="rounded-xl border border-brand-warning/25 bg-brand-warning/10 p-4 text-sm text-brand-white">
            {stuck} contato{stuck > 1 ? 's' : ''} ficaram marcados como enviando e o servidor ainda não
            confirmou o resultado. Eles não entram nesta fila para não duplicar o envio.
          </p>
        )}

        {sending && (
          <section aria-live="polite" className="space-y-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
              <div className="h-full bg-brand-coral transition-all duration-300"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <p className="font-mono text-xs text-brand-muted">{progress.done}/{progress.total} enviados</p>
          </section>
        )}

        <button type="button" onClick={run} disabled={blocked}
          className="btn-coral flex w-full items-center justify-center gap-3 py-4 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:transform-none">
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          {sending ? 'Enviando…' : 'Enviar campanha'}
        </button>

        {!queue.length && !sending && (
          <p className="text-center text-sm text-brand-muted">
            Nenhum e-mail aprovado esperando envio.
          </p>
        )}

        <p className="text-center text-xs text-brand-muted/70">
          Autenticação do domínio, reputação e higiene da lista determinam a entrega.
          Nenhuma configuração garante caixa de entrada.
        </p>
      </div>
    </main>
  )
}
