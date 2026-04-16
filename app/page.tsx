'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { useAppStore } from '@/store'
import { parseCSVFile } from '@/lib/utils'
import { Candidate } from '@/lib/types'
import Image from 'next/image'
import {
  Upload,
  FileText,
  AlertCircle,
  Users,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export default function UploadPage() {
  const router = useRouter()
  const { createCampaign } = useAppStore()
  const [parsedCandidates, setParsedCandidates] = useState<Candidate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [showAllEmails, setShowAllEmails] = useState(false)
  const [campaignName, setCampaignName] = useState('')

  const campaignNameRef = useRef(campaignName)
  useEffect(() => { campaignNameRef.current = campaignName }, [campaignName])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return
    setIsLoading(true)
    setError(null)
    setParsedCandidates([])
    setFileName(file.name)
    try {
      const candidates = await parseCSVFile(file)
      setParsedCandidates(candidates)
      const suggested = file.name.replace(/\.csv$/i, '').replace(/[_-]/g, ' ')
      if (!campaignNameRef.current) setCampaignName(suggested)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido ao processar o arquivo.')
      setFileName(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
      'text/plain': ['.csv'],
      'application/csv': ['.csv'],
      'text/x-csv': ['.csv'],
      'application/octet-stream': ['.csv'],
    },
    multiple: false,
    disabled: isLoading,
  })

  const handleContinue = () => {
    if (!campaignName.trim()) { toast.error('Dê um nome para a campanha.'); return }
    createCampaign(campaignName.trim(), parsedCandidates)
    router.push('/campaign')
  }

  const hasData = parsedCandidates.length > 0

  return (
    <main className="min-h-screen bg-brand-dark flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
      {/* Subtle background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-coral/5 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] rounded-full bg-brand-coral/3 blur-[80px]" />
      </div>

      <div className="relative w-full max-w-xl space-y-8">
        {/* Logo */}
        <div className="flex justify-center animate-fade-up">
          <div className="w-20 h-20 rounded-2xl bg-brand-charcoal border border-white/10 shadow-lg flex items-center justify-center">
            <Image
              src="/recrutae.webp"
              alt="Recrutaê"
              width={52}
              height={52}
              className="object-contain"
              priority
            />
          </div>
        </div>

        {/* Heading */}
        <div className="text-center space-y-2 animate-fade-up stagger-1" style={{ animationFillMode: 'forwards' }}>
          <h1 className="text-4xl font-display font-bold text-brand-white tracking-tight">
            Nova Campanha
          </h1>
          <p className="text-brand-muted text-base">
            Importe candidatos do Apollo.io ou Octopus CRM e envie emails personalizados aos candidatos com IA
          </p>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={cn(
            'relative rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-300 animate-fade-up stagger-2',
            isDragActive
              ? 'border-brand-coral bg-brand-coral/5 scale-[1.02]'
              : hasData
              ? 'border-brand-success/40 bg-brand-success/5'
              : 'border-white/10 hover:border-brand-coral/40 hover:bg-white/2',
            isLoading && 'opacity-60 cursor-wait pointer-events-none'
          )}
          style={{ animationFillMode: 'forwards' }}
        >
          <input {...getInputProps()} />

          {isLoading ? (
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-full border-2 border-brand-coral border-t-transparent animate-spin mx-auto" />
              <p className="text-brand-muted text-sm">Processando arquivo…</p>
            </div>
          ) : hasData ? (
            <div className="space-y-3">
              <CheckCircle2 className="mx-auto h-12 w-12 text-brand-success" />
              <div>
                <p className="text-base font-semibold text-brand-white">{fileName}</p>
                <p className="text-brand-muted text-sm mt-1">
                  {parsedCandidates.length} contatos carregados · Clique para substituir
                </p>
              </div>
            </div>
          ) : isDragActive ? (
            <div className="space-y-3">
              <Upload className="mx-auto h-12 w-12 text-brand-coral animate-bounce-subtle" />
              <p className="text-brand-coral font-semibold text-lg">Solte o arquivo aqui…</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mx-auto w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                <FileText className="h-8 w-8 text-brand-muted" />
              </div>
              <div>
                <p className="text-brand-white font-semibold text-base">
                  Arraste seu CSV do Apollo.io ou Octopus CRM
                </p>
                <p className="text-brand-muted text-sm mt-1">
                  ou{' '}
                  <span className="text-brand-coral underline underline-offset-2 cursor-pointer">
                    clique para selecionar
                  </span>
                </p>
              </div>
              <p className="text-xs text-brand-muted/60">Apenas arquivos .csv</p>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-error/10 border border-brand-error/20 animate-fade-up">
            <AlertCircle className="h-5 w-5 text-brand-error flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-brand-error">Erro ao processar</p>
              <p className="text-sm text-brand-muted mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Post-upload section */}
        {hasData && (
          <div className="space-y-5 animate-fade-up" style={{ animationFillMode: 'forwards' }}>
            {/* Campaign name */}
            <div className="space-y-2">
              <label htmlFor="campaignName" className="block text-sm font-medium text-brand-muted">
                Nome da campanha <span className="text-brand-coral">*</span>
              </label>
              <input
                id="campaignName"
                type="text"
                placeholder="Ex: Desenvolvedores Backend — Abril 2026"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className={cn(
                  'w-full px-4 py-3 rounded-lg border text-sm font-medium text-brand-white',
                  'bg-brand-charcoal border-white/10 focus:border-brand-coral/50',
                  'outline-none transition-colors placeholder:text-brand-muted/40'
                )}
              />
            </div>

            {/* Candidate count */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-brand-charcoal border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-coral/10 border border-brand-coral/20 flex items-center justify-center">
                  <Users className="h-4 w-4 text-brand-coral" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-brand-white">
                    {parsedCandidates.length} contatos encontrados
                  </p>
                  <p className="text-xs text-brand-muted">{fileName}</p>
                </div>
              </div>
              <button
                onClick={() => setShowAllEmails(!showAllEmails)}
                className="flex items-center gap-1 text-xs text-brand-coral hover:text-brand-orange transition-colors"
              >
                {showAllEmails ? (<>Menos <ChevronUp className="h-3 w-3" /></>) : (<>Ver todos <ChevronDown className="h-3 w-3" /></>)}
              </button>
            </div>

            {/* Email chips */}
            {showAllEmails && (
              <div className="p-4 rounded-xl bg-brand-charcoal border border-white/5 animate-fade-up">
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {parsedCandidates.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1 bg-brand-dark border border-white/8 rounded-full px-2.5 py-1 text-xs text-brand-muted"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-success flex-shrink-0" />
                      <span className="font-medium text-brand-white">{c.fullName || c.email.split('@')[0]}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Preview table */}
            <div className="rounded-xl border border-white/5 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brand-charcoal">
                    {['Nome', 'Cargo', 'Empresa', 'Email'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-brand-muted uppercase tracking-widest">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {parsedCandidates.slice(0, 8).map((c, i) => (
                    <tr
                      key={c.id}
                      className="hover:bg-white/2 transition-colors animate-fade-up opacity-0"
                      style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'forwards' }}
                    >
                      <td className="px-4 py-3 font-medium text-brand-white">{c.fullName || '—'}</td>
                      <td className="px-4 py-3 text-brand-muted">{c.title || '—'}</td>
                      <td className="px-4 py-3 text-brand-muted">{c.company || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-brand-muted">{c.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedCandidates.length > 8 && (
                <div className="px-4 py-3 text-center text-xs text-brand-muted border-t border-white/5 bg-brand-charcoal/50">
                  Mostrando 8 de {parsedCandidates.length} contatos
                </div>
              )}
            </div>

            {/* CTA */}
            <button
              onClick={handleContinue}
              disabled={!campaignName.trim()}
              className="btn-coral w-full flex items-center justify-center gap-3 py-4 text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
            >
              Continuar para configuração
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Helper hint */}
        {!hasData && !error && (
          <p className="text-center text-xs text-brand-muted/60 animate-fade-up stagger-3" style={{ animationFillMode: 'forwards' }}>
            Colunas necessárias:{' '}
            {['First Name', 'Last Name', 'Email', 'Title', 'Company'].map((c, i) => (
              <span key={c}>
                <code className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-xs">{c}</code>
                {i < 4 ? ', ' : ''}
              </span>
            ))}
          </p>
        )}
      </div>
    </main>
  )
}
