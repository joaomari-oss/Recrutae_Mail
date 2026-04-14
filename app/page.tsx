'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { useAppStore } from '@/store'
import { parseCSVFile } from '@/lib/utils'
import { Candidate } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, FileText, AlertCircle, Users, ArrowRight, CheckCircle2, Mail, ChevronDown, ChevronUp } from 'lucide-react'
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
    accept: { 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.csv'], 'text/plain': ['.csv'], 'application/csv': ['.csv'], 'text/x-csv': ['.csv'], 'application/octet-stream': ['.csv'] },
    multiple: false,
    disabled: isLoading,
  })

  const handleContinue = () => {
    if (!campaignName.trim()) { toast.error('De um nome para a campanha.'); return }
    createCampaign(campaignName.trim(), parsedCandidates)
    router.push('/campaign')
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Nova Campanha</h1>
          <p className="text-muted-foreground">Faca upload do CSV exportado do Apollo.io para comecar sua campanha de outreach.</p>
        </div>

        <div {...getRootProps()} className={cn('border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200', isDragActive ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/50 hover:bg-muted/30', isLoading && 'opacity-50 cursor-wait pointer-events-none', parsedCandidates.length > 0 && !isDragActive && 'border-emerald-500/50 bg-emerald-500/5')}>
          <input {...getInputProps()} />
          {isLoading ? (
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
              <p className="text-muted-foreground">Processando arquivo...</p>
            </div>
          ) : parsedCandidates.length > 0 ? (
            <div className="space-y-3">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <div>
                <p className="text-lg font-medium text-foreground">{fileName}</p>
                <p className="text-muted-foreground mt-1">Clique ou arraste para substituir</p>
              </div>
            </div>
          ) : isDragActive ? (
            <div className="space-y-3">
              <Upload className="mx-auto h-12 w-12 text-primary animate-bounce" />
              <p className="text-primary font-medium text-lg">Solte o arquivo aqui...</p>
            </div>
          ) : (
            <div className="space-y-3">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <div>
                <p className="text-lg font-medium text-foreground">Arraste seu CSV do Apollo.io</p>
                <p className="text-muted-foreground mt-1">ou <span className="text-primary underline cursor-pointer">clique para selecionar</span></p>
              </div>
              <p className="text-xs text-muted-foreground">Apenas arquivos .csv</p>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-3 text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Erro ao processar o arquivo</p>
              <p className="text-sm mt-1 opacity-90">{error}</p>
            </div>
          </div>
        )}

        {parsedCandidates.length > 0 && (
          <div className="space-y-4 animate-fade-in">
            <div className="space-y-2">
              <Label htmlFor="campaignName" className="text-sm font-medium">Nome da campanha <span className="text-destructive">*</span></Label>
              <Input id="campaignName" placeholder="Ex: Desenvolvedores Backend - Abril 2026" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} className="h-11" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-foreground">
                <Users className="h-5 w-5 text-primary" />
                <span className="font-semibold text-lg">{parsedCandidates.length} contatos encontrados</span>
              </div>
              <span className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">{fileName}</span>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-foreground">Emails que serao enviados ({parsedCandidates.length})</span>
                </div>
                <button onClick={() => setShowAllEmails(!showAllEmails)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                  {showAllEmails ? (<>Mostrar menos <ChevronUp className="h-3 w-3" /></>) : (<>Ver todos <ChevronDown className="h-3 w-3" /></>)}
                </button>
              </div>
              <div className={cn('flex flex-wrap gap-2 overflow-hidden transition-all', !showAllEmails && 'max-h-24')}>
                {parsedCandidates.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 bg-background border border-border rounded-full px-3 py-1 text-xs text-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    <span className="font-medium">{c.fullName || c.email.split('@')[0]}</span>
                    <span className="text-muted-foreground font-mono">{c.email}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/50"><th className="text-left p-3 text-muted-foreground font-medium">Nome</th><th className="text-left p-3 text-muted-foreground font-medium">Cargo</th><th className="text-left p-3 text-muted-foreground font-medium">Empresa</th><th className="text-left p-3 text-muted-foreground font-medium">Email</th></tr></thead>
                <tbody>
                  {parsedCandidates.slice(0, 10).map((c) => (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="p-3 text-foreground font-medium">{c.fullName || '\u2014'}</td>
                      <td className="p-3 text-muted-foreground">{c.title || '\u2014'}</td>
                      <td className="p-3 text-muted-foreground">{c.company || '\u2014'}</td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">{c.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedCandidates.length > 10 && (<div className="p-3 text-center text-xs text-muted-foreground border-t border-border bg-muted/30">Exibindo 10 de {parsedCandidates.length} contatos</div>)}
            </div>
            <Button onClick={handleContinue} className="w-full h-12 text-base font-semibold" size="lg" disabled={!campaignName.trim()}>Continuar para Configuracao<ArrowRight className="ml-2 h-5 w-5" /></Button>
          </div>
        )}

        {parsedCandidates.length === 0 && !error && (
          <div className="text-center space-y-1">
            <p className="text-xs text-muted-foreground">Colunas necessarias: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">First Name</code>, <code className="bg-muted px-1.5 py-0.5 rounded text-xs">Last Name</code>, <code className="bg-muted px-1.5 py-0.5 rounded text-xs">Email</code>, <code className="bg-muted px-1.5 py-0.5 rounded text-xs">Title</code>, <code className="bg-muted px-1.5 py-0.5 rounded text-xs">Company</code></p>
          </div>
        )}
      </div>
    </main>
  )
}
