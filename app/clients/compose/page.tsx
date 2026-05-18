'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useClientStore } from '@/store/clientStore'
import { ClientContact, ClientCampaignConfig, CLIENT_SEGMENTS } from '@/lib/clientTypes'
import { ArrowRight, Mail, Search, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Building2, Reply } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { saveCampaignToSupabase } from '@/lib/supabaseOps'
import { isSupabaseConfigured } from '@/lib/supabase'

export default function ClientsComposePage() {
  const router = useRouter()
  const { createCampaign } = useClientStore()

  const [contacts, setContacts] = useState<ClientContact[]>([])
  const [campaignName, setCampaignName] = useState('')
  const [recruiterName, setRecruiterName] = useState('')
  const [recruiterEmail, setRecruiterEmail] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [replyToMode, setReplyToMode] = useState<'same' | 'custom'>('same')
  const [recruiterRole, setRecruiterRole] = useState('')
  const [recruiterLinkedin, setRecruiterLinkedin] = useState('')
  const [selectedSegment, setSelectedSegment] = useState('')
  const [emailTemplate, setEmailTemplate] = useState('')
  const [subjectTemplate, setSubjectTemplate] = useState('')
  const [segmentSearch, setSegmentSearch] = useState('')
  const [segmentOpen, setSegmentOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const stored = sessionStorage.getItem('client-pending-contacts')
    if (!stored) { router.replace('/clients'); return }
    setContacts(JSON.parse(stored))
  }, [router])

  const emailValid = recruiterEmail.toLowerCase().endsWith('@recrutae.com.br')

  const filteredSegments = CLIENT_SEGMENTS.filter((s) =>
    s.toLowerCase().includes(segmentSearch.toLowerCase())
  )

  const replyToValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!campaignName.trim()) errs.campaignName = 'Nome da campanha obrigatório.'
    if (!recruiterName.trim()) errs.recruiterName = 'Seu nome é obrigatório.'
    if (!recruiterEmail.trim()) errs.recruiterEmail = 'E-mail obrigatório.'
    else if (!emailValid) errs.recruiterEmail = 'E-mail deve ser @recrutae.com.br'
    if (!recruiterRole.trim()) errs.recruiterRole = 'Seu cargo é obrigatório.'
    if (replyToMode === 'custom') {
      if (!replyTo.trim()) errs.replyTo = 'E-mail para respostas é obrigatório.'
      else if (!replyToValid) errs.replyTo = 'Formato de e-mail inválido.'
    }
    if (!selectedSegment) errs.segment = 'Selecione um segmento.'
    if (!emailTemplate.trim()) errs.emailTemplate = 'Escreva o template do e-mail.'
    return errs
  }

  const handleContinue = () => {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    const config: ClientCampaignConfig = {
      recruiterName: recruiterName.trim(),
      recruiterEmail: recruiterEmail.trim().toLowerCase(),
      recruiterRole: recruiterRole.trim(),
      recruiterLinkedin: recruiterLinkedin.trim() || undefined,
      replyTo: replyTo.trim().toLowerCase(),
      segment: selectedSegment,
      emailTemplate: emailTemplate.trim(),
      subjectTemplate: subjectTemplate.trim() || undefined,
    }

    const id = createCampaign(campaignName.trim(), contacts, config)
    sessionStorage.removeItem('client-pending-contacts')

    // Persist to Supabase in background (non-blocking)
    if (isSupabaseConfigured()) {
      const campaign = {
        id,
        name: campaignName.trim(),
        createdAt: new Date().toISOString(),
        status: 'draft' as const,
        segment: config.segment,
        totalContacts: contacts.length,
        approvedCount: 0,
        sentCount: 0,
        failedCount: 0,
      }
      saveCampaignToSupabase(campaign, contacts, config).catch(console.error)
    }

    router.push('/clients/review')
  }

  return (
    <main className="min-h-full bg-brand-dark px-6 py-10 relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-brand-coral/4 blur-[120px]" />
      </div>

      <div className="relative max-w-xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-1 animate-fade-up">
          <h1 className="text-3xl font-display font-bold text-brand-white">
            Configurar e-mail
          </h1>
          <p className="text-brand-muted text-sm">
            {contacts.length} contato{contacts.length !== 1 ? 's' : ''} selecionado{contacts.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="space-y-5 animate-fade-up stagger-1" style={{ animationFillMode: 'forwards' }}>
          {/* Campaign name */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-brand-muted">
              Nome da campanha <span className="text-brand-coral">*</span>
            </label>
            <input
              type="text"
              placeholder="Ex: Prospecção Digital Platforms — Maio 2026"
              value={campaignName}
              onChange={(e) => { setCampaignName(e.target.value); setErrors((p) => ({ ...p, campaignName: '' })) }}
              className={cn(
                'w-full px-4 py-3 rounded-lg border text-sm text-brand-white',
                'bg-brand-charcoal outline-none transition-colors placeholder:text-brand-muted/40',
                errors.campaignName ? 'border-brand-error/50' : 'border-white/10 focus:border-brand-coral/50'
              )}
            />
            {errors.campaignName && <p className="text-xs text-brand-error">{errors.campaignName}</p>}
          </div>

          {/* Recruiter name */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-brand-muted">
              Seu nome (aparece no e-mail) <span className="text-brand-coral">*</span>
            </label>
            <input
              type="text"
              placeholder="Ex: Leandro Mari"
              value={recruiterName}
              onChange={(e) => { setRecruiterName(e.target.value); setErrors((p) => ({ ...p, recruiterName: '' })) }}
              className={cn(
                'w-full px-4 py-3 rounded-lg border text-sm text-brand-white',
                'bg-brand-charcoal outline-none transition-colors placeholder:text-brand-muted/40',
                errors.recruiterName ? 'border-brand-error/50' : 'border-white/10 focus:border-brand-coral/50'
              )}
            />
            {errors.recruiterName && <p className="text-xs text-brand-error">{errors.recruiterName}</p>}
          </div>

          {/* Recruiter email */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-brand-muted">
              Seu e-mail <span className="text-brand-coral">*</span>
              <span className="ml-2 text-xs text-brand-muted/60">(obrigatoriamente @recrutae.com.br)</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-muted/60" />
              <input
                type="email"
                placeholder="seu.nome@recrutae.com.br"
                value={recruiterEmail}
                onChange={(e) => { setRecruiterEmail(e.target.value); setErrors((p) => ({ ...p, recruiterEmail: '' })) }}
                className={cn(
                  'w-full pl-10 pr-10 py-3 rounded-lg border text-sm text-brand-white',
                  'bg-brand-charcoal outline-none transition-colors placeholder:text-brand-muted/40',
                  errors.recruiterEmail ? 'border-brand-error/50'
                    : emailValid && recruiterEmail ? 'border-brand-success/50'
                    : 'border-white/10 focus:border-brand-coral/50'
                )}
              />
              {emailValid && recruiterEmail && (
                <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-success" />
              )}
              {recruiterEmail && !emailValid && (
                <AlertCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-error" />
              )}
            </div>
            {errors.recruiterEmail && <p className="text-xs text-brand-error">{errors.recruiterEmail}</p>}
          </div>

          {/* Recruiter role */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-brand-muted">
              Seu cargo <span className="text-brand-coral">*</span>
            </label>
            <input
              type="text"
              placeholder="Ex: Head of Business, Talent Partner"
              value={recruiterRole}
              onChange={(e) => { setRecruiterRole(e.target.value); setErrors((p) => ({ ...p, recruiterRole: '' })) }}
              className={cn(
                'w-full px-4 py-3 rounded-lg border text-sm text-brand-white',
                'bg-brand-charcoal outline-none transition-colors placeholder:text-brand-muted/40',
                errors.recruiterRole ? 'border-brand-error/50' : 'border-white/10 focus:border-brand-coral/50'
              )}
            />
            {errors.recruiterRole && <p className="text-xs text-brand-error">{errors.recruiterRole}</p>}
          </div>

          {/* Reply-To destination */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-brand-muted">
              Para onde vão as respostas? <span className="text-brand-coral">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setReplyToMode('same'); setReplyTo(''); setErrors((p) => ({ ...p, replyTo: '' })) }}
                className={cn(
                  'flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm transition-colors text-left',
                  replyToMode === 'same'
                    ? 'bg-brand-coral/10 border-brand-coral/50 text-brand-white'
                    : 'bg-brand-charcoal border-white/10 text-brand-muted hover:border-white/20 hover:text-brand-white'
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
                    : 'bg-brand-charcoal border-white/10 text-brand-muted hover:border-white/20 hover:text-brand-white'
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
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-muted/60" />
                <input
                  type="email"
                  placeholder="seu.email@pessoal.com"
                  value={replyTo}
                  onChange={(e) => { setReplyTo(e.target.value); setErrors((p) => ({ ...p, replyTo: '' })) }}
                  className={cn(
                    'w-full pl-10 pr-10 py-3 rounded-lg border text-sm text-brand-white',
                    'bg-brand-charcoal outline-none transition-colors placeholder:text-brand-muted/40',
                    errors.replyTo ? 'border-brand-error/50'
                      : replyToValid && replyTo ? 'border-brand-success/50'
                      : 'border-white/10 focus:border-brand-coral/50'
                  )}
                />
                {replyToValid && replyTo && (
                  <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-success" />
                )}
                {replyTo && !replyToValid && (
                  <AlertCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-error" />
                )}
              </div>
            )}
            {errors.replyTo && <p className="text-xs text-brand-error">{errors.replyTo}</p>}
            {replyToMode === 'custom' && !errors.replyTo && replyToValid && replyTo && (
              <p className="text-xs text-brand-success">As respostas dos clientes chegarão neste e-mail.</p>
            )}
          </div>

          {/* Segment */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-brand-muted">
              Segmento das empresas <span className="text-brand-coral">*</span>
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setSegmentOpen(!segmentOpen)}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors',
                  'bg-brand-charcoal outline-none',
                  errors.segment ? 'border-brand-error/50'
                    : segmentOpen ? 'border-brand-coral/50'
                    : 'border-white/10 hover:border-brand-coral/30',
                  selectedSegment ? 'text-brand-white' : 'text-brand-muted/60'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-4 w-4 text-brand-muted/60 flex-shrink-0" />
                  <span className="truncate">{selectedSegment || 'Selecione o segmento…'}</span>
                </div>
                {segmentOpen ? <ChevronUp className="h-4 w-4 text-brand-muted/60 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-brand-muted/60 flex-shrink-0" />}
              </button>

              {segmentOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-brand-charcoal border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-fade-in">
                  <div className="p-2 border-b border-white/5">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-muted/60" />
                      <input
                        type="text"
                        placeholder="Buscar segmento…"
                        value={segmentSearch}
                        onChange={(e) => setSegmentSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-brand-dark border border-white/8 rounded-lg text-sm text-brand-white placeholder:text-brand-muted/40 outline-none focus:border-brand-coral/30 transition-colors"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto max-h-56 p-1.5">
                    {filteredSegments.length === 0 ? (
                      <p className="text-center text-xs text-brand-muted py-4">Nenhum segmento encontrado.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-0.5">
                        {filteredSegments.map((seg) => (
                          <button
                            key={seg}
                            type="button"
                            onClick={() => {
                              setSelectedSegment(seg)
                              setSegmentOpen(false)
                              setSegmentSearch('')
                              setErrors((p) => ({ ...p, segment: '' }))
                            }}
                            className={cn(
                              'w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors',
                              selectedSegment === seg
                                ? 'bg-brand-coral/15 text-brand-coral font-medium'
                                : 'text-brand-muted hover:text-brand-white hover:bg-white/5'
                            )}
                          >
                            {seg}
                            {selectedSegment === seg && <CheckCircle2 className="inline ml-2 h-3.5 w-3.5" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {errors.segment && <p className="text-xs text-brand-error">{errors.segment}</p>}
          </div>

          {/* Email template */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-brand-muted">
              Template do e-mail <span className="text-brand-coral">*</span>
            </label>
            <p className="text-xs text-brand-muted/60 leading-relaxed">
              Escreva o e-mail completo que você quer enviar. A IA vai personalizar o nome, empresa e cargo de cada contato, e fazer variações sutis para evitar spam. Use <code className="bg-white/5 px-1 rounded">{'{{PRIMEIRO_NOME}}'}</code>, <code className="bg-white/5 px-1 rounded">{'{{EMPRESA}}'}</code> e <code className="bg-white/5 px-1 rounded">{'{{CARGO}}'}</code> como marcadores opcionais.
            </p>
            <textarea
              rows={12}
              placeholder={`Olá, {{PRIMEIRO_NOME}}!\n\nEstou entrando em contato pois acredito que a Recrutaê pode ser uma parceira estratégica para a {{EMPRESA}}.\n\nSomos uma empresa de recrutamento digital especializada em processos de analista a gerência. Entregamos short-list com os melhores candidatos em até 5 dias úteis, com avaliação técnica, comportamental e de fit cultural.\n\nTeria 30 minutos nessa semana para uma conversa rápida?\n\nAbraços,\nLeandro Mari\nHead of Business`}
              value={emailTemplate}
              onChange={(e) => { setEmailTemplate(e.target.value); setErrors((p) => ({ ...p, emailTemplate: '' })) }}
              className={cn(
                'w-full px-4 py-3 rounded-lg border text-sm text-brand-white resize-none font-mono',
                'bg-brand-charcoal outline-none transition-colors placeholder:text-brand-muted/30 leading-relaxed',
                errors.emailTemplate ? 'border-brand-error/50' : 'border-white/10 focus:border-brand-coral/50'
              )}
            />
            {errors.emailTemplate && <p className="text-xs text-brand-error">{errors.emailTemplate}</p>}
            {emailTemplate.trim() && (
              <p className="text-xs text-brand-muted/50">{emailTemplate.trim().split(/\s+/).length} palavras</p>
            )}
          </div>

          {/* Subject template */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-brand-muted">
              Assunto dos e-mails
              <span className="ml-2 text-xs text-brand-muted/50">(opcional)</span>
            </label>
            <p className="text-xs text-brand-muted/60 leading-relaxed">
              Define o assunto base. A IA faz uma variação mínima por contato para evitar filtros de spam.
            </p>
            <input
              type="text"
              placeholder="Ex: Recrutaê — uma conversa rápida sobre a {{EMPRESA}}"
              value={subjectTemplate}
              onChange={(e) => setSubjectTemplate(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-white/10 focus:border-brand-coral/50 text-sm text-brand-white bg-brand-charcoal outline-none transition-colors placeholder:text-brand-muted/40"
            />
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-charcoal border border-white/5">
            <Mail className="h-5 w-5 text-brand-coral flex-shrink-0 mt-0.5" />
            <div className="text-sm text-brand-muted leading-relaxed">
                Os e-mails são enviados <strong className="text-brand-white">do seu @recrutae.com.br</strong>. As respostas chegarão no <strong className="text-brand-white">destino escolhido acima</strong>. Cada e-mail é único — gerado individualmente pela IA.
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleContinue}
          className="btn-coral w-full flex items-center justify-center gap-3 py-4 text-base font-semibold animate-fade-up stagger-2"
          style={{ animationFillMode: 'forwards' }}
        >
          Gerar e-mails com IA
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </main>
  )
}
