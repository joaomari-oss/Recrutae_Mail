'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import { CampaignConfig } from '@/lib/types'
import {
  ArrowLeft,
  Sparkles,
  Users,
  Briefcase,
  User,
  Building2,
  Linkedin,
  AlertCircle,
  Link,
  ArrowRight,
  Tag,
  Mail,
  Reply,
} from 'lucide-react'
import { cn } from '@/lib/utils'

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return (
    <p className="flex items-center gap-1.5 text-xs text-brand-error mt-1.5">
      <AlertCircle className="h-3 w-3 flex-shrink-0" /> {msg}
    </p>
  )
}

function FormCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-brand-charcoal p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-coral/10 border border-brand-coral/20 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-brand-white">{title}</h2>
          <p className="text-xs text-brand-muted">{description}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function Field({
  id,
  label,
  required,
  optional,
  icon,
  error,
  children,
  hint,
}: {
  id: string
  label: string
  required?: boolean
  optional?: boolean
  icon?: React.ReactNode
  error?: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-brand-muted">
        {label}
        {required && <span className="text-brand-coral ml-1">*</span>}
        {optional && <span className="text-brand-muted/50 text-xs ml-1">(opcional)</span>}
      </label>
      <div className={cn('relative', icon && 'flex items-center')}>
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted/60 pointer-events-none">
            {icon}
          </div>
        )}
        {children}
      </div>
      <FieldError msg={error} />
      {hint && !error && <p className="text-xs text-brand-muted/60">{hint}</p>}
    </div>
  )
}

const inputCls = (hasError?: boolean, hasIcon?: boolean) =>
  cn(
    'w-full px-4 py-3 rounded-lg border text-sm text-brand-white',
    'bg-brand-dark border-white/10 outline-none transition-colors',
    'placeholder:text-brand-muted/40 focus:border-brand-coral/50',
    hasIcon && 'pl-10',
    hasError && 'border-brand-error/50 focus:border-brand-error/70'
  )

export default function CampaignPage() {
  const router = useRouter()
  const { activeCampaignId, candidatesByCampaign, campaignConfigById, campaigns, setCampaignConfig, updateCampaign } = useAppStore()

  const candidates = activeCampaignId ? candidatesByCampaign[activeCampaignId] ?? [] : []
  const existingConfig = activeCampaignId ? campaignConfigById[activeCampaignId] : undefined
  const currentCampaign = activeCampaignId ? campaigns.find((c) => c.id === activeCampaignId) : undefined

  const [campaignName, setCampaignName] = useState(currentCampaign?.name ?? '')
  const [nameError, setNameError] = useState<string | undefined>()

  const [form, setForm] = useState<CampaignConfig>({
    role:               existingConfig?.role ?? '',
    jobDescription:     existingConfig?.jobDescription ?? '',
    link:               existingConfig?.link ?? '',
    hiringCompany:      existingConfig?.hiringCompany ?? '',
    recruiterName:      existingConfig?.recruiterName ?? '',
    recruiterCompany:   existingConfig?.recruiterCompany ?? '',
    recruiterLinkedin:  existingConfig?.recruiterLinkedin ?? '',
    replyTo:            existingConfig?.replyTo ?? '',
    aiProvider:         existingConfig?.aiProvider ?? 'openai',
  })

  const [errors, setErrors] = useState<Partial<Record<keyof CampaignConfig, string>>>({})
  const [replyToMode, setReplyToMode] = useState<'same' | 'custom'>(
    existingConfig?.replyTo ? 'custom' : 'same'
  )

  useEffect(() => {
    if (!activeCampaignId || candidates.length === 0) router.replace('/')
  }, [activeCampaignId, candidates.length, router])

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const validate = (): boolean => {
    const e: Partial<Record<keyof CampaignConfig, string>> = {}
    const nErr = !campaignName.trim() ? 'Nome da campanha é obrigatório.' : undefined
    setNameError(nErr)
    if (!form.role.trim()) e.role = 'Nome do cargo é obrigatório.'
    if (!form.hiringCompany.trim()) e.hiringCompany = 'Nome da empresa contratante é obrigatório.'
    if (!form.jobDescription.trim()) e.jobDescription = 'Descrição da vaga é obrigatória.'
    else if (form.jobDescription.trim().length < 50) e.jobDescription = 'Forneça mais detalhes (mínimo 50 caracteres).'
    if (!form.recruiterName.trim()) e.recruiterName = 'Seu nome é obrigatório.'
    if (!form.recruiterCompany.trim()) e.recruiterCompany = 'Sua empresa é obrigatória.'
    if (replyToMode === 'custom') {
      if (!form.replyTo.trim()) e.replyTo = 'Email para receber respostas é obrigatório.'
      else if (!EMAIL_REGEX.test(form.replyTo.trim())) e.replyTo = 'Formato de email inválido.'
    }
    setErrors(e)
    return Object.keys(e).length === 0 && !nErr
  }

  const handleSubmit = () => {
    if (!validate() || !activeCampaignId) return
    if (campaignName.trim()) updateCampaign(activeCampaignId, { name: campaignName.trim() })
    setCampaignConfig(activeCampaignId, form)
    updateCampaign(activeCampaignId, { status: 'generating' })
    router.push('/review')
  }

  const update = (field: keyof CampaignConfig, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  if (!activeCampaignId || candidates.length === 0) return null

  return (
    <div className="min-h-screen bg-brand-dark">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-brand-dark/95 backdrop-blur border-b border-white/5 px-8 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Step dots */}
            {[
              { n: 1, label: 'Upload', done: true },
              { n: 2, label: 'Campanha', active: true },
              { n: 3, label: 'Revisão', done: false },
              { n: 4, label: 'Envio', done: false },
            ].map((step, i) => (
              <div key={step.n} className="flex items-center gap-2">
                {i > 0 && <div className={cn('h-px w-6', step.done || step.active ? 'bg-brand-coral/40' : 'bg-white/10')} />}
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                    step.active
                      ? 'bg-brand-coral text-white'
                      : step.done
                      ? 'bg-brand-coral/20 text-brand-coral'
                      : 'bg-white/5 text-brand-muted'
                  )}>
                    {step.n}
                  </div>
                  <span className={cn(
                    'text-xs',
                    step.active ? 'text-brand-white font-medium' : 'text-brand-muted'
                  )}>
                    {step.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-brand-muted">
            <Users className="h-3.5 w-3.5" />
            <span>{candidates.length} contatos</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        <div className="space-y-1 animate-fade-up" style={{ animationFillMode: 'forwards' }}>
          <h1 className="text-3xl font-display font-bold text-brand-white">
            Configure a campanha
          </h1>
          <p className="text-brand-muted">
            A IA vai usar essas informações para personalizar cada email.
          </p>
        </div>

        {/* Section 0: Campaign name */}
        <div className="animate-fade-up stagger-1" style={{ animationFillMode: 'forwards' }}>
          <FormCard
            icon={<Tag className="h-4 w-4 text-brand-coral" />}
            title="Nome da campanha"
            description="Identificação interna da campanha. Pode ser editado depois na tela de campanhas."
          >
            <Field id="campaignName" label="Nome da campanha" required error={nameError}
              icon={<Tag className="h-4 w-4" />}
            >
              <input
                id="campaignName"
                type="text"
                placeholder="Ex: Engenheiros Backend — Q2 2025"
                value={campaignName}
                onChange={(e) => {
                  setCampaignName(e.target.value)
                  if (nameError) setNameError(undefined)
                }}
                className={inputCls(!!nameError, true)}
              />
            </Field>
          </FormCard>
        </div>

        {/* Section 1: Job */}
        <div className="animate-fade-up stagger-2" style={{ animationFillMode: 'forwards' }}>
          <FormCard
            icon={<Briefcase className="h-4 w-4 text-brand-coral" />}
            title="A oportunidade"
            description="Descreva a vaga. Quanto mais detalhes, melhor o email gerado."
          >
            <Field id="role" label="Nome do cargo" required error={errors.role}
              icon={<Briefcase className="h-4 w-4" />}
            >
              <input
                id="role"
                type="text"
                placeholder="Ex: Engenheiro de Software Sênior"
                value={form.role}
                onChange={(e) => update('role', e.target.value)}
                className={inputCls(!!errors.role, true)}
              />
            </Field>

            <Field id="hiringCompany" label="Empresa contratante" required error={errors.hiringCompany}
              icon={<Building2 className="h-4 w-4" />}
              hint="A empresa que está contratando (aparece no email como a empresa da vaga)."
            >
              <input
                id="hiringCompany"
                type="text"
                placeholder="Ex: Nubank, iFood, Banco Inter"
                value={form.hiringCompany}
                onChange={(e) => update('hiringCompany', e.target.value)}
                className={inputCls(!!errors.hiringCompany, true)}
              />
            </Field>

            <div className="space-y-1.5">
              <label htmlFor="jobDescription" className="block text-sm font-medium text-brand-muted">
                Descrição da vaga <span className="text-brand-coral">*</span>
              </label>
              <textarea
                id="jobDescription"
                placeholder="Ex: Posição 100% remota, foco em backend com Node.js e TypeScript. Salário até R$20k, benefícios competitivos, squad autônomo…"
                value={form.jobDescription}
                onChange={(e) => update('jobDescription', e.target.value)}
                rows={6}
                className={cn(
                  inputCls(!!errors.jobDescription),
                  'resize-none leading-relaxed'
                )}
              />
              <div className="flex items-center justify-between">
                <FieldError msg={errors.jobDescription} />
                <span className="text-xs text-brand-muted/60 font-mono ml-auto">
                  {form.jobDescription.length} chars
                </span>
              </div>
            </div>

            <Field id="link" label="Link da vaga" optional icon={<Link className="h-4 w-4" />}>
              <input
                id="link"
                type="text"
                placeholder="https://linkedin.com/jobs/view/123456"
                value={form.link}
                onChange={(e) => update('link', e.target.value)}
                className={inputCls(false, true)}
              />
            </Field>
          </FormCard>
        </div>

        {/* Section 2: Recruiter */}
        <div className="animate-fade-up stagger-3" style={{ animationFillMode: 'forwards' }}>
          <FormCard
            icon={<User className="h-4 w-4 text-brand-coral" />}
            title="Suas informações"
            description="Dados do recrutador que assina os emails."
          >
            <div className="grid grid-cols-2 gap-4">
              <Field id="recruiterName" label="Seu nome" required error={errors.recruiterName}
                icon={<User className="h-4 w-4" />}
              >
                <input
                  id="recruiterName"
                  type="text"
                  placeholder="Ana Silva"
                  value={form.recruiterName}
                  onChange={(e) => update('recruiterName', e.target.value)}
                  className={inputCls(!!errors.recruiterName, true)}
                />
              </Field>

              <Field id="recruiterCompany" label="Sua empresa" required error={errors.recruiterCompany}
                icon={<Building2 className="h-4 w-4" />}
              >
                <input
                  id="recruiterCompany"
                  type="text"
                  placeholder="Recrutaê"
                  value={form.recruiterCompany}
                  onChange={(e) => update('recruiterCompany', e.target.value)}
                  className={inputCls(!!errors.recruiterCompany, true)}
                />
              </Field>
            </div>

            <Field id="recruiterLinkedin" label="Seu LinkedIn" optional icon={<Linkedin className="h-4 w-4" />}>
              <input
                id="recruiterLinkedin"
                type="text"
                placeholder="https://linkedin.com/in/anasilva"
                value={form.recruiterLinkedin}
                onChange={(e) => update('recruiterLinkedin', e.target.value)}
                className={inputCls(false, true)}
              />
            </Field>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-brand-muted">
                Para onde vão as respostas? <span className="text-brand-coral">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setReplyToMode('same'); update('replyTo', '') }}
                  className={cn(
                    'flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm transition-colors text-left',
                    replyToMode === 'same'
                      ? 'bg-brand-coral/10 border-brand-coral/50 text-brand-white'
                      : 'bg-brand-dark border-white/10 text-brand-muted hover:border-white/20 hover:text-brand-white'
                  )}
                >
                  <Reply className="h-4 w-4 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-xs leading-tight">Mesmo e-mail de envio</div>
                    <div className="text-xs text-brand-muted/60 mt-0.5">Responder volta para o remetente</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setReplyToMode('custom')}
                  className={cn(
                    'flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm transition-colors text-left',
                    replyToMode === 'custom'
                      ? 'bg-brand-coral/10 border-brand-coral/50 text-brand-white'
                      : 'bg-brand-dark border-white/10 text-brand-muted hover:border-white/20 hover:text-brand-white'
                  )}
                >
                  <Mail className="h-4 w-4 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-xs leading-tight">E-mail personalizado</div>
                    <div className="text-xs text-brand-muted/60 mt-0.5">Responder vai para outro e-mail</div>
                  </div>
                </button>
              </div>
              {replyToMode === 'custom' && (
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted/60 pointer-events-none">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="replyTo"
                    type="email"
                    placeholder="ana.silva@gmail.com"
                    value={form.replyTo}
                    onChange={(e) => update('replyTo', e.target.value)}
                    className={inputCls(!!errors.replyTo, true)}
                  />
                </div>
              )}
              <FieldError msg={errors.replyTo} />
            </div>
          </FormCard>
        </div>

        {/* Actions */}
        <div className="flex gap-3 animate-fade-up stagger-4" style={{ animationFillMode: 'forwards' }}>
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 px-5 py-3 rounded-lg border border-white/10 text-brand-muted hover:text-brand-white hover:border-white/20 hover:bg-white/5 transition-all text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>

          <button
            onClick={handleSubmit}
            className="btn-coral flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold"
          >
            <Sparkles className="h-4 w-4" />
            Gerar Emails com IA
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
