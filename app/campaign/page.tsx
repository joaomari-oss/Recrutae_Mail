'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import { CampaignConfig } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Users,
  Briefcase,
  User,
  Building2,
  Linkedin,
  AlertCircle,
  Link,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function CampaignPage() {
  const router = useRouter()
  const {
    activeCampaignId,
    candidatesByCampaign,
    campaignConfigById,
    setCampaignConfig,
    updateCampaign,
  } = useAppStore()

  const candidates = activeCampaignId ? candidatesByCampaign[activeCampaignId] ?? [] : []
  const existingConfig = activeCampaignId ? campaignConfigById[activeCampaignId] : undefined

  const [form, setForm] = useState<CampaignConfig>({
    role: existingConfig?.role || '',
    jobDescription: existingConfig?.jobDescription || '',
    link: existingConfig?.link || '',
    hiringCompany: existingConfig?.hiringCompany || '',
    recruiterName: existingConfig?.recruiterName || '',
    recruiterCompany: existingConfig?.recruiterCompany || '',
    recruiterLinkedin: existingConfig?.recruiterLinkedin || '',
    aiProvider: existingConfig?.aiProvider || 'openai',
  })

  const [errors, setErrors] = useState<Partial<Record<keyof CampaignConfig, string>>>({})

  useEffect(() => {
    if (!activeCampaignId || candidates.length === 0) {
      router.replace('/')
    }
  }, [activeCampaignId, candidates.length, router])

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof CampaignConfig, string>> = {}
    if (!form.role.trim()) newErrors.role = 'Nome do cargo e obrigatorio.'
    if (!form.hiringCompany.trim()) newErrors.hiringCompany = 'Nome da empresa contratante e obrigatorio.'
    if (!form.jobDescription.trim()) {
      newErrors.jobDescription = 'Descricao da vaga e obrigatoria.'
    } else if (form.jobDescription.trim().length < 50) {
      newErrors.jobDescription = 'Forneca mais detalhes sobre a vaga (minimo 50 caracteres).'
    }
    if (!form.recruiterName.trim()) newErrors.recruiterName = 'Nome do recrutador e obrigatorio.'
    if (!form.recruiterCompany.trim()) newErrors.recruiterCompany = 'Empresa do recrutador e obrigatoria.'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validate() || !activeCampaignId) return
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
    <main className="min-h-[calc(100vh-3.5rem)] bg-background flex flex-col">
      {/* Step indicator */}
      <div className="border-b border-border px-8 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">1</div>
            <span className="text-muted-foreground">Upload</span>
          </div>
          <div className="h-px w-8 bg-border" />
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
            <span className="text-foreground font-medium">Configuracao</span>
          </div>
          <div className="h-px w-8 bg-border" />
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold">3</div>
            <span className="text-muted-foreground">Revisao</span>
          </div>
          <div className="h-px w-8 bg-border" />
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold">4</div>
            <span className="text-muted-foreground">Envio</span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{candidates.length} contatos</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center py-8 px-4">
        <div className="w-full max-w-2xl space-y-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground">Configure a campanha</h1>
            <p className="text-muted-foreground">
              Essas informacoes serao usadas pela IA para personalizar cada email.
            </p>
          </div>

          {/* Job Description */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                Oportunidade / Vaga
              </CardTitle>
              <CardDescription>
                Descreva a vaga com detalhes. Quanto mais informacoes, melhor o email gerado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="role">
                  Nome do cargo <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="role"
                    placeholder="Ex: Engenheiro de Software Senior"
                    value={form.role}
                    onChange={(e) => update('role', e.target.value)}
                    className={cn('pl-9', errors.role && 'border-destructive focus-visible:ring-destructive')}
                  />
                </div>
                {errors.role && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" /> {errors.role}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hiringCompany">
                  Empresa contratante <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="hiringCompany"
                    placeholder="Ex: Start Bank, Nubank, iFood"
                    value={form.hiringCompany}
                    onChange={(e) => update('hiringCompany', e.target.value)}
                    className={cn('pl-9', errors.hiringCompany && 'border-destructive focus-visible:ring-destructive')}
                  />
                </div>
                {errors.hiringCompany && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" /> {errors.hiringCompany}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Nome da empresa que esta contratando (aparecera no email como a empresa da vaga).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="jobDescription">
                  Descricao da vaga <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="jobDescription"
                  placeholder="Ex: A posicao e 100% remota, com foco em desenvolvimento backend com Node.js e TypeScript..."
                  value={form.jobDescription}
                  onChange={(e) => update('jobDescription', e.target.value)}
                  className={cn(
                    'min-h-[140px] resize-none',
                    errors.jobDescription && 'border-destructive focus-visible:ring-destructive'
                  )}
                />
                {errors.jobDescription && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" /> {errors.jobDescription}
                  </p>
                )}
                <p className="text-xs text-muted-foreground text-right">
                  {form.jobDescription.length} caracteres
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="link">
                  Link da vaga <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <div className="relative">
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="link"
                    placeholder="Ex: https://linkedin.com/jobs/view/123456"
                    value={form.link}
                    onChange={(e) => update('link', e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recruiter Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Suas informacoes
              </CardTitle>
              <CardDescription>O recrutador que assina os emails.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="recruiterName">
                    Seu nome <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="recruiterName"
                      placeholder="Ana Silva"
                      value={form.recruiterName}
                      onChange={(e) => update('recruiterName', e.target.value)}
                      className={cn('pl-9', errors.recruiterName && 'border-destructive focus-visible:ring-destructive')}
                    />
                  </div>
                  {errors.recruiterName && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3" /> {errors.recruiterName}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recruiterCompany">
                    Sua empresa <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="recruiterCompany"
                      placeholder="TechCorp"
                      value={form.recruiterCompany}
                      onChange={(e) => update('recruiterCompany', e.target.value)}
                      className={cn('pl-9', errors.recruiterCompany && 'border-destructive focus-visible:ring-destructive')}
                    />
                  </div>
                  {errors.recruiterCompany && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3" /> {errors.recruiterCompany}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="recruiterLinkedin">
                  Seu LinkedIn <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <div className="relative">
                  <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="recruiterLinkedin"
                    placeholder="https://linkedin.com/in/anasilva"
                    value={form.recruiterLinkedin}
                    onChange={(e) => update('recruiterLinkedin', e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => router.push('/')} className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <Button onClick={handleSubmit} className="flex-1 h-11 font-semibold text-base">
              <Sparkles className="mr-2 h-4 w-4" />
              Gerar Emails com IA
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </main>
  )
}
