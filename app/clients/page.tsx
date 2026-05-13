'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { useClientStore } from '@/store/clientStore'
import { ClientContact } from '@/lib/clientTypes'
import {
  Upload,
  FileText,
  AlertCircle,
  Building2,
  ArrowRight,
  CheckCircle2,
  Plus,
  Trash2,
  UserPlus,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import Papa from 'papaparse'

function parseClientCSV(file: File): Promise<ClientContact[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[]
        if (!rows.length) { reject(new Error('CSV vazio ou sem dados.')); return }

        const contacts: ClientContact[] = rows.map((row, idx) => {
          const firstName = row['First Name'] || row['first_name'] || row['Nome'] || row['name'] || ''
          const lastName = row['Last Name'] || row['last_name'] || row['Sobrenome'] || ''
          const fullName = `${firstName} ${lastName}`.trim() || row['Full Name'] || row['full_name'] || firstName
          const email = row['Email'] || row['email'] || row['E-mail'] || ''
          const company = row['Company'] || row['company'] || row['Empresa'] || row['Account Name'] || ''
          const position = row['Title'] || row['title'] || row['Cargo'] || row['Job Title'] || ''

          return {
            id: `contact-${idx}-${Date.now()}`,
            firstName,
            lastName,
            fullName: fullName || email.split('@')[0],
            email,
            company,
            position,
            status: 'pending' as const,
            generatedSubject: '',
            generatedBody: '',
            editedSubject: '',
            editedBody: '',
            sendAttempts: 0,
          }
        }).filter((c) => c.email && c.email.includes('@'))

        if (!contacts.length) { reject(new Error('Nenhum contato com e-mail válido encontrado.')); return }
        resolve(contacts)
      },
      error: (err) => reject(new Error(`Erro ao parsear CSV: ${err.message}`)),
    })
  })
}

type ManualContact = {
  id: string
  firstName: string
  email: string
  company: string
  position: string
}

const emptyManual = (): ManualContact => ({
  id: crypto.randomUUID(),
  firstName: '',
  email: '',
  company: '',
  position: '',
})

export default function ClientsPage() {
  const router = useRouter()
  const { setActiveCampaign } = useClientStore()

  const [mode, setMode] = useState<'manual' | 'csv'>('csv')
  const [csvContacts, setCsvContacts] = useState<ClientContact[]>([])
  const [csvFileName, setCsvFileName] = useState<string | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [csvLoading, setCsvLoading] = useState(false)
  const [showAllTable, setShowAllTable] = useState(false)

  const [manualContacts, setManualContacts] = useState<ManualContact[]>([emptyManual()])

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setCsvLoading(true)
    setCsvError(null)
    setCsvContacts([])
    setCsvFileName(file.name)
    try {
      const contacts = await parseClientCSV(file)
      setCsvContacts(contacts)
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Erro ao processar CSV.')
      setCsvFileName(null)
    } finally {
      setCsvLoading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.csv'], 'text/plain': ['.csv'] },
    multiple: false,
    disabled: csvLoading,
  })

  const updateManual = (id: string, field: keyof ManualContact, value: string) => {
    setManualContacts((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))
  }

  const addManualRow = () => setManualContacts((prev) => [...prev, emptyManual()])
  const removeManualRow = (id: string) => {
    setManualContacts((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev))
  }

  const validManualContacts = manualContacts.filter(
    (c) => c.email.trim() && c.email.includes('@') && c.firstName.trim()
  )

  const handleContinue = () => {
    const contacts: ClientContact[] =
      mode === 'csv'
        ? csvContacts
        : validManualContacts.map((c) => ({
            id: `contact-${c.id}`,
            firstName: c.firstName,
            lastName: '',
            fullName: c.firstName,
            email: c.email.trim(),
            company: c.company.trim(),
            position: c.position.trim(),
            status: 'pending' as const,
            generatedSubject: '',
            generatedBody: '',
            editedSubject: '',
            editedBody: '',
            sendAttempts: 0,
          }))

    if (!contacts.length) {
      toast.error('Adicione pelo menos um contato com nome e e-mail válidos.')
      return
    }

    // Save contacts to sessionStorage to pass to compose page
    sessionStorage.setItem('client-pending-contacts', JSON.stringify(contacts))
    router.push('/clients/compose')
  }

  const hasContacts = mode === 'csv' ? csvContacts.length > 0 : validManualContacts.length > 0
  const contactCount = mode === 'csv' ? csvContacts.length : validManualContacts.length

  return (
    <main className="min-h-full bg-brand-dark px-6 py-10 relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-brand-coral/4 blur-[120px]" />
      </div>

      <div className="relative max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-1 animate-fade-up">
          <h1 className="text-3xl font-display font-bold text-brand-white">
            Contatos para prospecção
          </h1>
          <p className="text-brand-muted text-sm">
            Adicione os contatos que receberão os e-mails comerciais
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 p-1 bg-brand-charcoal rounded-xl border border-white/5 animate-fade-up stagger-1" style={{ animationFillMode: 'forwards' }}>
          {(['csv', 'manual'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                mode === m
                  ? 'bg-brand-coral text-white shadow-sm'
                  : 'text-brand-muted hover:text-brand-white'
              )}
            >
              {m === 'csv' ? <FileText className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {m === 'csv' ? 'Importar CSV' : 'Adicionar manualmente'}
            </button>
          ))}
        </div>

        {/* CSV Mode */}
        {mode === 'csv' && (
          <div className="space-y-5 animate-fade-up" style={{ animationFillMode: 'forwards' }}>
            <div
              {...getRootProps()}
              className={cn(
                'relative rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-300',
                isDragActive ? 'border-brand-coral bg-brand-coral/5 scale-[1.02]'
                  : csvContacts.length ? 'border-brand-success/40 bg-brand-success/5'
                  : 'border-white/10 hover:border-brand-coral/40 hover:bg-white/2',
                csvLoading && 'opacity-60 cursor-wait pointer-events-none'
              )}
            >
              <input {...getInputProps()} />
              {csvLoading ? (
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-full border-2 border-brand-coral border-t-transparent animate-spin mx-auto" />
                  <p className="text-brand-muted text-sm">Processando…</p>
                </div>
              ) : csvContacts.length ? (
                <div className="space-y-2">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-brand-success" />
                  <p className="font-semibold text-brand-white">{csvFileName}</p>
                  <p className="text-brand-muted text-sm">{csvContacts.length} contatos carregados · Clique para substituir</p>
                </div>
              ) : isDragActive ? (
                <div className="space-y-2">
                  <Upload className="mx-auto h-10 w-10 text-brand-coral animate-bounce-subtle" />
                  <p className="text-brand-coral font-semibold">Solte o arquivo aqui…</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <FileText className="h-7 w-7 text-brand-muted" />
                  </div>
                  <div>
                    <p className="text-brand-white font-semibold">Arraste seu CSV de contatos</p>
                    <p className="text-brand-muted text-sm mt-1">ou <span className="text-brand-coral underline underline-offset-2">clique para selecionar</span></p>
                  </div>
                  <p className="text-xs text-brand-muted/60">Colunas: First Name, Email, Company, Title</p>
                </div>
              )}
            </div>

            {csvError && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-error/10 border border-brand-error/20">
                <AlertCircle className="h-5 w-5 text-brand-error flex-shrink-0 mt-0.5" />
                <p className="text-sm text-brand-muted">{csvError}</p>
              </div>
            )}

            {csvContacts.length > 0 && (
              <div className="rounded-xl border border-white/5 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-brand-charcoal">
                      {['Nome', 'Empresa', 'Cargo', 'Email'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-brand-muted uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {(showAllTable ? csvContacts : csvContacts.slice(0, 8)).map((c, i) => (
                      <tr key={c.id} className="hover:bg-white/2 transition-colors animate-fade-up opacity-0" style={{ animationDelay: `${i * 25}ms`, animationFillMode: 'forwards' }}>
                        <td className="px-4 py-3 font-medium text-brand-white">{c.fullName || '—'}</td>
                        <td className="px-4 py-3 text-brand-muted">{c.company || '—'}</td>
                        <td className="px-4 py-3 text-brand-muted">{c.position || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-brand-muted">{c.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvContacts.length > 8 && (
                  <div className="px-4 py-3 text-center border-t border-white/5 bg-brand-charcoal/50">
                    <button onClick={() => setShowAllTable(!showAllTable)} className="flex items-center gap-1.5 mx-auto text-xs text-brand-coral hover:text-brand-orange transition-colors">
                      {showAllTable ? (<>Mostrar menos <ChevronUp className="h-3 w-3" /></>) : (<>Ver todos os {csvContacts.length} <ChevronDown className="h-3 w-3" /></>)}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Manual Mode */}
        {mode === 'manual' && (
          <div className="space-y-3 animate-fade-up" style={{ animationFillMode: 'forwards' }}>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto overflow-x-hidden pr-1">
              {manualContacts.map((contact, i) => (
                <div
                  key={contact.id}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 p-3 bg-brand-charcoal rounded-xl border border-white/5 animate-fade-up opacity-0"
                  style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'forwards' }}
                >
                  <input
                    placeholder="Nome *"
                    value={contact.firstName}
                    onChange={(e) => updateManual(contact.id, 'firstName', e.target.value)}
                    className="px-3 py-2 rounded-lg bg-brand-dark border border-white/8 text-sm text-brand-white placeholder:text-brand-muted/40 outline-none focus:border-brand-coral/40 transition-colors"
                  />
                  <input
                    placeholder="E-mail *"
                    type="email"
                    value={contact.email}
                    onChange={(e) => updateManual(contact.id, 'email', e.target.value)}
                    className="px-3 py-2 rounded-lg bg-brand-dark border border-white/8 text-sm text-brand-white placeholder:text-brand-muted/40 outline-none focus:border-brand-coral/40 transition-colors"
                  />
                  <input
                    placeholder="Empresa"
                    value={contact.company}
                    onChange={(e) => updateManual(contact.id, 'company', e.target.value)}
                    className="px-3 py-2 rounded-lg bg-brand-dark border border-white/8 text-sm text-brand-white placeholder:text-brand-muted/40 outline-none focus:border-brand-coral/40 transition-colors"
                  />
                  <input
                    placeholder="Cargo"
                    value={contact.position}
                    onChange={(e) => updateManual(contact.id, 'position', e.target.value)}
                    className="px-3 py-2 rounded-lg bg-brand-dark border border-white/8 text-sm text-brand-white placeholder:text-brand-muted/40 outline-none focus:border-brand-coral/40 transition-colors"
                  />
                  <button
                    onClick={() => removeManualRow(contact.id)}
                    disabled={manualContacts.length === 1}
                    className="p-2 rounded-lg text-brand-muted hover:text-brand-error hover:bg-brand-error/10 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addManualRow}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-white/10 hover:border-brand-coral/30 text-brand-muted hover:text-brand-coral transition-all duration-200 text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              Adicionar contato
            </button>

            {validManualContacts.length > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-brand-success/10 border border-brand-success/20">
                <CheckCircle2 className="h-4 w-4 text-brand-success flex-shrink-0" />
                <p className="text-sm text-brand-success font-medium">
                  {validManualContacts.length} contato{validManualContacts.length > 1 ? 's' : ''} válido{validManualContacts.length > 1 ? 's' : ''} pronto{validManualContacts.length > 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Summary bar */}
        {hasContacts && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-brand-charcoal border border-white/5 animate-fade-up" style={{ animationFillMode: 'forwards' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand-coral/10 border border-brand-coral/20 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-brand-coral" />
              </div>
              <p className="text-sm font-semibold text-brand-white">
                {contactCount} contato{contactCount > 1 ? 's' : ''} selecionado{contactCount > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleContinue}
          disabled={!hasContacts}
          className="btn-coral w-full flex items-center justify-center gap-3 py-4 text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none animate-fade-up stagger-2"
          style={{ animationFillMode: 'forwards' }}
        >
          Configurar e-mail
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </main>
  )
}
