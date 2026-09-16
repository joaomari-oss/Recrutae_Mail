'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRosStore } from '@/store/rosStore'
import { isCompleteRosContact, PENDING_CONTACTS_KEY } from '@/lib/ros/contacts'
import { hasUnsafeLink } from '@/lib/outreach/richText'
import { DEFAULT_ROS_SENDER, isRosSenderEmail, ROS_SENDER_DOMAIN } from '@/lib/ros/senders'
import { renderEmailTemplate } from '@/lib/templateRender'
import type { RosCampaign, RosCampaignConfig, RosContact } from '@/lib/rosTypes'
import { RosBodyEditor } from '@/components/ros/RosBodyEditor'
import { RosEmailPreview } from '@/components/ros/RosEmailPreview'

const DEFAULT_FROM_EMAIL = DEFAULT_ROS_SENDER
const CUSTOM = '__outro__'

type Form = {
  name: string
  subjectTemplate: string
  emailTemplate: string
  recruiterName: string
  recruiterRole: string
  recruiterEmail: string
  replyTo: string
  recruiterLinkedin: string
  recruiterWhatsapp: string
  varySubject: boolean
  variationPercent: 5 | 6 | 7 | 8
}

const emptyForm: Form = {
  name: '', subjectTemplate: '', emailTemplate: '', recruiterName: '', recruiterRole: '',
  recruiterEmail: DEFAULT_FROM_EMAIL, replyTo: DEFAULT_FROM_EMAIL, recruiterLinkedin: '',
  recruiterWhatsapp: '', varySubject: false, variationPercent: 6,
}

function readPendingContacts(): RosContact[] {
  try {
    const raw = sessionStorage.getItem(PENDING_CONTACTS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isCompleteRosContact) : []
  } catch {
    return []
  }
}

function validate(form: Form): Partial<Record<keyof Form, string>> {
  const errors: Partial<Record<keyof Form, string>> = {}
  if (!form.name.trim()) errors.name = 'Dê um nome à campanha.'
  if (!form.subjectTemplate.trim()) errors.subjectTemplate = 'O assunto é obrigatório.'
  if (!form.emailTemplate.trim()) errors.emailTemplate = 'A mensagem é obrigatória.'
  else if (hasUnsafeLink(form.emailTemplate)) errors.emailTemplate = 'Há link com endereço não permitido.'
  if (!form.recruiterName.trim()) errors.recruiterName = 'Informe quem assina o e-mail.'
  if (!isRosSenderEmail(form.recruiterEmail)) {
    errors.recruiterEmail = `O remetente deve usar o domínio @${ROS_SENDER_DOMAIN}.`
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.replyTo.trim())) {
    errors.replyTo = 'Informe um e-mail válido para resposta.'
  }
  const linkedin = form.recruiterLinkedin.trim()
  if (linkedin && !/^https:\/\//i.test(linkedin)) {
    errors.recruiterLinkedin = 'O endereço do LinkedIn precisa começar com https://.'
  }
  return errors
}

export default function RosComposePage() {
  const router = useRouter()
  const createCampaign = useRosStore((state) => state.createCampaign)

  const [contacts, setContacts] = useState<RosContact[]>([])
  const [form, setForm] = useState<Form>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // O remetente real vem do servidor; até lá o padrão evita campo vazio. É um
  // ref porque o efeito do preflight roda uma vez só e leria um valor velho.
  const senderTouched = useRef(false)
  // O id da campanha é cunhado uma única vez: numa nova tentativa depois de
  // falha, trocar de id faria os contatos pertencerem a outra campanha e o
  // servidor recusaria o lote para sempre.
  const campaignIdRef = useRef<string | null>(null)
  const [senderOptions, setSenderOptions] = useState<string[]>([DEFAULT_FROM_EMAIL])
  const [senderMode, setSenderMode] = useState<string>(DEFAULT_FROM_EMAIL)
  const [replyMode, setReplyMode] = useState<string>('same')

  useEffect(() => { setContacts(readPendingContacts()) }, [])

  useEffect(() => {
    let active = true
    fetch('/api/ros/preflight')
      .then((response) => response.json())
      .then((result: { fromEmail?: string; senderOptions?: string[] }) => {
        if (!active) return
        if (result?.senderOptions?.length) setSenderOptions(result.senderOptions)
        if (!result?.fromEmail || senderTouched.current) return
        setSenderMode(result.fromEmail)
        setForm((current) => ({
          ...current,
          recruiterEmail: result.fromEmail as string,
          replyTo: current.replyTo === DEFAULT_FROM_EMAIL ? (result.fromEmail as string) : current.replyTo,
        }))
      })
      .catch(() => { /* o padrão já está na tela; o preflight bloqueia o envio depois */ })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "Mesmo e-mail de envio" segue o remetente mesmo quando ele muda por um
  // caminho que não passa pelo seletor, como a resposta do preflight.
  useEffect(() => {
    if (replyMode !== 'same') return
    setForm((current) => (current.replyTo === current.recruiterEmail
      ? current
      : { ...current, replyTo: current.recruiterEmail }))
  }, [replyMode, form.recruiterEmail])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setSaveError(null)
  }

  const previewContact = contacts[0]
  const preview = useMemo(() => renderEmailTemplate(
    form.subjectTemplate,
    form.emailTemplate || 'Escreva a mensagem para ver a prévia.',
    previewContact ?? { firstName: 'Ana', fullName: 'Ana Souza', company: 'Acme', position: 'Head de RH' },
  ), [form.subjectTemplate, form.emailTemplate, previewContact])

  const submit = async () => {
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length) return
    if (!contacts.length) {
      toast.error('Nenhum contato encontrado. Volte e importe a lista.')
      return
    }

    setSaving(true)
    setSaveError(null)
    const config: RosCampaignConfig = {
      recruiterName: form.recruiterName.trim(),
      recruiterRole: form.recruiterRole.trim(),
      recruiterEmail: form.recruiterEmail.trim(),
      replyTo: form.replyTo.trim(),
      recruiterLinkedin: form.recruiterLinkedin.trim(),
      recruiterWhatsapp: form.recruiterWhatsapp.replace(/\D/g, ''),
      subjectTemplate: form.subjectTemplate.trim(),
      emailTemplate: form.emailTemplate,
      varySubject: form.varySubject,
      variationPercent: form.variationPercent,
    }

    const campaignId = campaignIdRef.current ?? createCampaign(form.name.trim(), contacts, config)
    campaignIdRef.current = campaignId
    if (useRosStore.getState().activeCampaignId !== campaignId) {
      useRosStore.getState().setActiveCampaign(campaignId)
    }
    const campaign: RosCampaign = {
      id: campaignId, name: form.name.trim(), createdAt: new Date().toISOString(),
      campaignKind: 'ros', status: 'draft', totalContacts: contacts.length,
      approvedCount: 0, sentCount: 0, failedCount: 0,
    }

    try {
      const response = await fetch('/api/ros/save-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign, config, contacts }),
      })
      const result: { success?: boolean; error?: string } = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Não foi possível salvar a campanha.')
      }
      // A sessão só é limpa depois da gravação durável — é ela que garante a
      // idempotência do envio; perder os contatos antes disso apagaria o lote.
      sessionStorage.removeItem(PENDING_CONTACTS_KEY)
      router.push('/ros/review')
    } catch (cause) {
      // A campanha local permanece: o POST pode ter gravado antes de a resposta
      // falhar, e repetir com o mesmo id é a única retentativa que o servidor
      // aceita — `saveRosCampaign` é idempotente por id de campanha.
      const message = cause instanceof Error ? cause.message : 'Não foi possível salvar a campanha.'
      toast.error(message)
      setSaveError(`${message} Os contatos continuam aqui — tente salvar novamente.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-full bg-brand-dark px-6 py-10">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <header className="space-y-1">
            <h1 className="font-ros text-3xl font-semibold text-brand-white">Mensagem da campanha</h1>
            <p className="text-sm text-brand-muted">
              {contacts.length} contato{contacts.length === 1 ? '' : 's'} receberão esta divulgação.
            </p>
          </header>

          <Field label="Nome da campanha" error={errors.name}>
            {(id) => (
              <input id={id} value={form.name} onChange={(e) => set('name', e.target.value)}
                placeholder="Divulgação ROS — setembro" className={inputClass} />
            )}
          </Field>

          <Field label="Assunto" error={errors.subjectTemplate}>
            {(id) => (
              <input id={id} value={form.subjectTemplate} onChange={(e) => set('subjectTemplate', e.target.value)}
                placeholder="Uma novidade para a {{empresa}}" className={inputClass} />
            )}
          </Field>

          <div className="space-y-1">
            <RosBodyEditor
              label="Mensagem"
              value={form.emailTemplate}
              onChange={(value) => set('emailTemplate', value)}
              placeholder={'Olá, {{nome}}!\n\nConheça o **Recrutaê OS**…\n\n[Clique aqui](https://recrutae.com.br/os)'}
            />
            {errors.emailTemplate && <p role="alert" className="text-sm text-brand-error">{errors.emailTemplate}</p>}
          </div>

          <fieldset className="space-y-4 rounded-xl border border-white/8 bg-brand-charcoal p-5">
            <legend className="px-1 font-ros text-sm font-semibold text-brand-white">Assinatura</legend>

            <Field label="Nome do remetente" error={errors.recruiterName}>
              {(id) => (
                <input id={id} value={form.recruiterName} onChange={(e) => set('recruiterName', e.target.value)}
                  placeholder="João Mari" className={inputClass} />
              )}
            </Field>

            <Field label="Cargo">
              {(id) => (
                <input id={id} value={form.recruiterRole} onChange={(e) => set('recruiterRole', e.target.value)}
                  placeholder="Comercial" className={inputClass} />
              )}
            </Field>

            <Field label="E-mail de envio" error={errors.recruiterEmail} errorId="ros-erro-remetente">
              {(id) => (
                <div className="space-y-2">
                  <select
                    id={id}
                    value={senderMode}
                    aria-invalid={errors.recruiterEmail ? true : undefined}
                    aria-describedby={errors.recruiterEmail ? 'ros-erro-remetente' : undefined}
                    onChange={(e) => {
                      senderTouched.current = true
                      setSenderMode(e.target.value)
                      // "Outro" esvazia o campo para o operador digitar o endereço.
                      set('recruiterEmail', e.target.value === CUSTOM ? '' : e.target.value)
                    }}
                    className={`${inputClass} font-mono text-xs`}
                  >
                    {senderOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    <option value={CUSTOM}>Outro endereço @{ROS_SENDER_DOMAIN}…</option>
                  </select>
                  {senderMode === CUSTOM && (
                    <input
                      type="email"
                      aria-label="Outro e-mail de envio"
                      placeholder={`nome@${ROS_SENDER_DOMAIN}`}
                      value={form.recruiterEmail}
                      onChange={(e) => { senderTouched.current = true; set('recruiterEmail', e.target.value) }}
                      className={`${inputClass} font-mono text-xs`}
                    />
                  )}
                </div>
              )}
            </Field>

            <Field label="Responder para" error={errors.replyTo} errorId="ros-erro-resposta">
              {(id) => (
                <div className="space-y-2">
                  <select
                    id={id}
                    value={replyMode}
                    aria-invalid={errors.replyTo ? true : undefined}
                    aria-describedby={errors.replyTo ? 'ros-erro-resposta' : undefined}
                    onChange={(e) => {
                      setReplyMode(e.target.value)
                      if (e.target.value === CUSTOM) set('replyTo', '')
                      else if (e.target.value !== 'same') set('replyTo', e.target.value)
                    }}
                    className={`${inputClass} font-mono text-xs`}
                  >
                    <option value="same">Mesmo e-mail de envio</option>
                    {senderOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    <option value={CUSTOM}>Outro endereço…</option>
                  </select>
                  {replyMode === CUSTOM && (
                    <input
                      type="email"
                      aria-label="Outro e-mail para respostas"
                      placeholder="respostas@exemplo.com"
                      value={form.replyTo}
                      onChange={(e) => set('replyTo', e.target.value)}
                      className={`${inputClass} font-mono text-xs`}
                    />
                  )}
                  <p className="text-xs text-brand-muted/70">
                    As respostas dos contatos chegam neste endereço.
                  </p>
                </div>
              )}
            </Field>

            <Field label="LinkedIn" error={errors.recruiterLinkedin}>
              {(id) => (
                <input id={id} value={form.recruiterLinkedin} onChange={(e) => set('recruiterLinkedin', e.target.value)}
                  placeholder="https://linkedin.com/in/…" className={`${inputClass} font-mono text-xs`} />
              )}
            </Field>

            <Field label="WhatsApp">
              {(id) => (
                <input id={id} inputMode="numeric" value={form.recruiterWhatsapp}
                  onChange={(e) => set('recruiterWhatsapp', e.target.value.replace(/\D/g, ''))}
                  placeholder="5511999999999" className={`${inputClass} font-mono text-xs`} />
              )}
            </Field>

            <p className="font-mono text-[11px] uppercase tracking-widest text-brand-coral">Recrutaê | OS</p>
          </fieldset>

          <fieldset className="space-y-4 rounded-xl border border-white/8 bg-brand-charcoal p-5">
            <legend className="px-1 font-ros text-sm font-semibold text-brand-white">Personalização</legend>

            <label className="flex items-center gap-3 text-sm text-brand-white">
              <input type="checkbox" checked={form.varySubject} onChange={(e) => set('varySubject', e.target.checked)}
                className="h-4 w-4 accent-brand-coral" />
              Variar assunto
            </label>

            <Field label="Variação por contato">
              {(id) => (
                <select id={id} value={form.variationPercent}
                  onChange={(e) => set('variationPercent', Number(e.target.value) as Form['variationPercent'])}
                  className={inputClass}>
                  {[5, 6, 7, 8].map((percent) => (
                    <option key={percent} value={percent}>{percent}% das palavras</option>
                  ))}
                </select>
              )}
            </Field>

            <p className="text-xs text-brand-muted/70">
              A variação é leve e serve só para personalizar. Entrega depende de autenticação
              do domínio, reputação e higiene da lista.
            </p>
          </fieldset>

          {saveError && (
            <div role="alert" className="rounded-xl border border-brand-error/20 bg-brand-error/10 p-4 text-sm text-brand-white">
              {saveError}
            </div>
          )}

          <button type="button" onClick={submit} disabled={saving}
            className="btn-coral flex w-full items-center justify-center gap-3 py-4 text-base font-semibold disabled:cursor-wait disabled:opacity-60">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Revisar e-mails
            {!saving && <ArrowRight className="h-5 w-5" />}
          </button>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-8 lg:self-start">
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand-muted">
            Prévia — assunto: {preview.subject || '(sem assunto)'}
          </p>
          <RosEmailPreview
            body={preview.body}
            recruiterName={form.recruiterName}
            recruiterRole={form.recruiterRole}
            recruiterLinkedin={form.recruiterLinkedin}
            recruiterWhatsapp={form.recruiterWhatsapp}
          />
        </aside>
      </div>
    </main>
  )
}

const inputClass = 'w-full rounded-lg border border-white/10 bg-brand-dark px-3 py-2 text-sm text-brand-white outline-none transition-colors placeholder:text-brand-muted/40 focus:border-brand-coral/60'

function Field({ label, error, errorId, children }: {
  label: string
  error?: string
  /** Id fixo quando o campo precisa referenciar a mensagem por `aria-describedby`. */
  errorId?: string
  children: (id: string) => React.ReactNode
}) {
  const id = `ros-campo-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-mono text-[10px] uppercase tracking-widest text-brand-muted">
        {label}
      </label>
      {children(id)}
      {error && <p id={errorId} role="alert" className="text-sm text-brand-error">{error}</p>}
    </div>
  )
}
