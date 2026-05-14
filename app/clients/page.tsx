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
import * as XLSX from 'xlsx'

/** Case-insensitive column lookup — finds first key that matches any of the given patterns */
function col(row: Record<string, string>, ...patterns: string[]): string {
  const keys = Object.keys(row)
  for (const pat of patterns) {
    const normalPat = pat.toLowerCase().trim()
    const found = keys.find((k) => k.toLowerCase().trim() === normalPat)
    if (found && row[found]) return row[found].toString().trim()
  }
  for (const pat of patterns) {
    const normalPat = pat.toLowerCase().trim()
    const found = keys.find((k) => k.toLowerCase().trim().includes(normalPat))
    if (found && row[found]) return row[found].toString().trim()
  }
  return ''
}

/**
 * Parses a 2D array of strings (raw rows) into ClientContact[].
 * Automatically detects:
 *  - Header row present → uses col() to map by name (case-insensitive)
 *  - No header row      → positional mapping: finds email column by @, name before it, rest = company/title
 */
function parseRawRows(allRows: string[][]): ClientContact[] {
  if (!allRows.length) return []

  // Find which column most often contains an email address
  const maxCols = Math.max(...allRows.map((r) => r.length))
  const emailScores = Array(maxCols).fill(0)
  for (const row of allRows) {
    for (let i = 0; i < row.length; i++) {
      const v = String(row[i] ?? '').trim()
      if (v.includes('@') && v.includes('.')) emailScores[i]++
    }
  }
  const emailColIdx = emailScores.indexOf(Math.max(...emailScores))
  if (emailScores[emailColIdx] === 0) return []

  // Is first row a header? Its email-column cell won't look like an email
  const hasHeader = !String(allRows[0][emailColIdx] ?? '').trim().includes('@')

  const headers = hasHeader ? allRows[0].map((h) => String(h ?? '').trim()) : []
  const dataRows = hasHeader ? allRows.slice(1) : allRows

  return dataRows
    .map((row, idx) => {
      let email = '', fullName = '', firstName = '', lastName = '', company = '', position = ''

      if (hasHeader) {
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => { obj[h] = String(row[i] ?? '').trim() })
        email     = col(obj, 'Email', 'E-mail', 'email', 'e_mail', 'Work Email', 'Corporate Email', 'Business Email')
        firstName = col(obj, 'First Name', 'first_name', 'firstname', 'Nome', 'first', 'name')
        lastName  = col(obj, 'Last Name',  'last_name',  'lastname',  'Sobrenome', 'last')
        fullName  = `${firstName} ${lastName}`.trim()
          || col(obj, 'Full Name', 'full_name', 'fullname', 'Nome Completo', 'Contact Name', 'Name')
        company   = col(obj, 'Company', 'company', 'Empresa', 'Account Name', 'Organization', 'employer')
        position  = col(obj, 'Title', 'title', 'Cargo', 'Job Title', 'Position', 'Role', 'ocupacao')
      } else {
        // Positional: email at emailColIdx
        email = String(row[emailColIdx] ?? '').trim()
        // Name: column immediately before email, or first non-email column
        const nameIdx = emailColIdx > 0 ? emailColIdx - 1 : row.findIndex((_, i) => i !== emailColIdx)
        fullName  = nameIdx >= 0 ? String(row[nameIdx] ?? '').trim() : ''
        firstName = fullName.split(' ')[0] || ''
        lastName  = fullName.split(' ').slice(1).join(' ')
        // Remaining columns (not email, not name) → company, then position
        const rest = row
          .map((v, i) => ({ v: String(v ?? '').trim(), i }))
          .filter(({ v, i }) => i !== emailColIdx && i !== nameIdx && v)
        company  = rest[0]?.v || ''
        position = rest[1]?.v || ''
      }

      return {
        id: `contact-${idx}-${Date.now()}`,
        firstName,
        lastName,
        fullName: fullName || email.split('@')[0],
        email,
        company,
        position,
        status: 'pending' as const,
        generatedSubject: '', generatedBody: '',
        editedSubject: '', editedBody: '',
        sendAttempts: 0,
      }
    })
    .filter((c) => c.email && c.email.includes('@'))
}

function parseClientCSV(file: File): Promise<ClientContact[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const rawRows = (results.data as unknown[][]).map((r) => (r as unknown[]).map((v) => String(v ?? '')))
        if (!rawRows.length) { reject(new Error('CSV vazio ou sem dados.')); return }
        const contacts = parseRawRows(rawRows)
        if (!contacts.length) {
          reject(new Error(`Nenhum e-mail válido encontrado. Primeira linha: ${rawRows[0]?.join(', ') || '(vazia)'}`))
          return
        }
        resolve(contacts)
      },
      error: (err) => reject(new Error(`Erro ao parsear CSV: ${err.message}`)),
    })
  })
}

function parseClientExcel(file: File): Promise<ClientContact[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        if (!sheetName) { reject(new Error('Planilha vazia.')); return }
        const rawRows: string[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' })
        if (!rawRows.length) { reject(new Error('Nenhuma linha encontrada na planilha.')); return }
        const contacts = parseRawRows(rawRows)
        if (!contacts.length) {
          reject(new Error(`Nenhum e-mail válido encontrado. Primeira linha: ${rawRows[0]?.join(', ') || '(vazia)'}`))
          return
        }
        resolve(contacts)
      } catch (err) {
        reject(new Error(`Erro ao ler planilha: ${err instanceof Error ? err.message : 'desconhecido'}`))
      }
    }
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'))
    reader.readAsArrayBuffer(file)
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<ClientContact>>({})

  const startEdit = (c: ClientContact) => { setEditingId(c.id); setEditDraft({ fullName: c.fullName, email: c.email, company: c.company, position: c.position }) }
  const cancelEdit = () => { setEditingId(null); setEditDraft({}) }
  const saveEdit = (id: string) => {
    setCsvContacts((prev) => prev.map((c) => {
      if (c.id !== id) return c
      const name = (editDraft.fullName ?? c.fullName).trim()
      return { ...c, fullName: name, firstName: name.split(' ')[0] || '', lastName: name.split(' ').slice(1).join(' '), email: (editDraft.email ?? c.email).trim(), company: (editDraft.company ?? c.company).trim(), position: (editDraft.position ?? c.position).trim() }
    }))
    cancelEdit()
  }
  const removeCsvContact = (id: string) => setCsvContacts((prev) => prev.filter((c) => c.id !== id))

  const [manualContacts, setManualContacts] = useState<ManualContact[]>([emptyManual()])

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setCsvLoading(true)
    setCsvError(null)
    setCsvContacts([])
    setCsvFileName(file.name)
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name)
      const contacts = isExcel ? await parseClientExcel(file) : await parseClientCSV(file)
      setCsvContacts(contacts)
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Erro ao processar arquivo.')
      setCsvFileName(null)
    } finally {
      setCsvLoading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv', '.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.csv'],
    },
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
              {m === 'csv' ? 'Importar CSV / Excel' : 'Adicionar manualmente'}
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
                    <p className="text-brand-white font-semibold">Arraste seu arquivo de contatos</p>
                    <p className="text-brand-muted text-sm mt-1">ou <span className="text-brand-coral underline underline-offset-2">clique para selecionar</span></p>
                  </div>
                  <p className="text-xs text-brand-muted/60">Formatos aceitos: .csv, .xlsx, .xls &nbsp;|&nbsp; Colunas: First Name, Email, Company, Title</p>
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
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col className="w-[22%]" />
                    <col className="w-[18%]" />
                    <col className="w-[22%]" />
                    <col className="w-[28%]" />
                    <col className="w-[10%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-brand-charcoal">
                      {['Nome', 'Empresa', 'Cargo', 'E-mail', ''].map((h, i) => (
                        <th key={i} className="text-left px-4 py-3 text-xs font-medium text-brand-muted uppercase tracking-widest truncate">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {(showAllTable ? csvContacts : csvContacts.slice(0, 8)).map((c, i) => {
                      const isEditing = editingId === c.id
                      return (
                        <tr key={c.id} className={cn('transition-colors animate-fade-up opacity-0', isEditing ? 'bg-brand-charcoal/60' : 'hover:bg-white/2')} style={{ animationDelay: `${i * 25}ms`, animationFillMode: 'forwards' }}>
                          {isEditing ? (
                            <>
                              <td className="px-2 py-2">
                                <input autoFocus value={editDraft.fullName ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, fullName: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg bg-brand-dark border border-brand-coral/40 text-sm text-brand-white outline-none" />
                              </td>
                              <td className="px-2 py-2">
                                <input value={editDraft.company ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, company: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg bg-brand-dark border border-white/10 text-sm text-brand-white outline-none" />
                              </td>
                              <td className="px-2 py-2">
                                <input value={editDraft.position ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, position: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg bg-brand-dark border border-white/10 text-sm text-brand-white outline-none" />
                              </td>
                              <td className="px-2 py-2">
                                <input value={editDraft.email ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg bg-brand-dark border border-white/10 text-sm font-mono text-brand-white outline-none" />
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex gap-1">
                                  <button onClick={() => saveEdit(c.id)} className="px-2 py-1 rounded text-xs font-medium bg-brand-coral text-white hover:bg-brand-orange transition-colors">Salvar</button>
                                  <button onClick={cancelEdit} className="px-2 py-1 rounded text-xs text-brand-muted hover:text-brand-white transition-colors">Cancelar</button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 font-medium text-brand-white truncate" title={c.fullName}>{c.fullName || '—'}</td>
                              <td className="px-4 py-3 text-brand-muted truncate" title={c.company}>{c.company || '—'}</td>
                              <td className="px-4 py-3 text-brand-muted truncate" title={c.position}>{c.position || '—'}</td>
                              <td className="px-4 py-3 font-mono text-xs text-brand-muted truncate" title={c.email}>{c.email}</td>
                              <td className="px-3 py-3">
                                <div className="flex gap-1 justify-end">
                                  <button onClick={() => startEdit(c)} title="Editar" className="p-1.5 rounded-lg text-brand-muted hover:text-brand-coral hover:bg-brand-coral/10 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                  <button onClick={() => removeCsvContact(c.id)} title="Remover" className="p-1.5 rounded-lg text-brand-muted hover:text-brand-error hover:bg-brand-error/10 transition-colors">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
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
