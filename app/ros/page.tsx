'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { AlertCircle, ArrowRight, CheckCircle2, Download, FileText, Upload, Users } from 'lucide-react'
import { toast } from 'sonner'
import { finalizeRosContacts, findRosContactIssues, isCompleteRosContact, parseRosContactsFile } from '@/lib/ros/contacts'
import { normalizeContactEmail } from '@/lib/contactParsing'
import { exportToCSV } from '@/lib/utils'
import type { RejectedContactRow } from '@/lib/contactParsing'
import type { RosContact } from '@/lib/rosTypes'
import { RosContactTable } from '@/components/ros/RosContactTable'
import { RosManualContactForm } from '@/components/ros/RosManualContactForm'

export const PENDING_CONTACTS_KEY = 'ros-pending-contacts'

const REJECTION_LABELS: Record<RejectedContactRow['reason'], string> = {
  missing_email: 'Sem e-mail',
  invalid_email: 'E-mail inválido',
  duplicate: 'E-mail repetido',
}

// O react-dropzone aceita se o MIME OU a extensão baterem; o Windows costuma
// reportar MIME vazio ou genérico, por isso as extensões se repetem.
const ACCEPTED_FILES = {
  'text/csv': ['.csv'],
  'application/csv': ['.csv'],
  'text/x-csv': ['.csv'],
  'text/plain': ['.csv'],
  'application/vnd.ms-excel': ['.csv', '.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
  'application/vnd.ms-excel.sheet.binary.macroEnabled.12': ['.xlsb'],
  'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
  'application/octet-stream': ['.csv', '.xlsx', '.xlsm', '.xlsb', '.xls', '.ods'],
}

function readStoredContacts(): RosContact[] {
  try {
    const raw = sessionStorage.getItem(PENDING_CONTACTS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isCompleteRosContact)
  } catch {
    return []
  }
}

export default function RosContactsPage() {
  const router = useRouter()
  const [contacts, setContacts] = useState<RosContact[]>([])
  const [rejected, setRejected] = useState<RejectedContactRow[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Voltar da composição não pode custar a lista já montada.
  useEffect(() => { setContacts(readStoredContacts()) }, [])

  const issues = useMemo(() => findRosContactIssues(contacts), [contacts])
  const hasIssues = Object.keys(issues).length > 0

  const existingEmails = useMemo(
    () => new Set(contacts.map((contact) => normalizeContactEmail(contact.email))),
    [contacts],
  )

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setLoading(true)
    setFileError(null)
    setRejected([])
    setFileName(file.name)
    try {
      const result = await parseRosContactsFile(file)
      // Fora do updater de estado: React reavalia updaters (e o StrictMode os
      // duplica), então efeitos ali dentro disparariam mais de uma vez.
      const seen = new Set(contacts.map((contact) => normalizeContactEmail(contact.email)))
      const fresh: RosContact[] = []
      const repeated: RejectedContactRow[] = []
      result.contacts.forEach((contact, index) => {
        const email = normalizeContactEmail(contact.email)
        if (seen.has(email)) {
          // Repetido em relação ao que já está na tela, não dentro do arquivo.
          repeated.push({ rowNumber: index + 1, reason: 'duplicate', values: [contact.fullName, contact.email] })
          return
        }
        seen.add(email)
        fresh.push(contact)
      })

      setRejected([...result.rejected, ...repeated])
      if (fresh.length) setContacts((current) => [...current, ...fresh])
      else if (!result.rejected.length && !repeated.length) {
        setFileError('Nenhum contato foi encontrado. Confira se existe uma coluna de e-mail com endereços válidos.')
      }
    } catch (cause) {
      setFileError(cause instanceof Error ? cause.message : 'Erro ao processar o arquivo.')
      setFileName(null)
    } finally {
      setLoading(false)
    }
  }, [contacts])

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    const name = rejections[0]?.file?.name ?? 'arquivo'
    setFileError(`"${name}" não é um formato aceito. Envie .csv, .xlsx, .xls, .xlsm, .xlsb ou .ods.`)
    setFileName(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, onDropRejected, accept: ACCEPTED_FILES, multiple: false, disabled: loading,
  })

  const addManual = (contact: RosContact) => setContacts((current) => [...current, contact])

  const updateContact = (id: string, updates: Partial<RosContact>) =>
    setContacts((current) => current.map((contact) => (contact.id === id ? { ...contact, ...updates } : contact)))

  const removeContact = (id: string) =>
    setContacts((current) => current.filter((contact) => contact.id !== id))

  const downloadSummary = () => {
    exportToCSV([
      ...contacts.map((contact) => ({
        situacao: 'aceito', linha: '', nome: contact.fullName, email: contact.email,
        empresa: contact.company, cargo: contact.position, motivo: '', valores: '',
      })),
      ...rejected.map((row) => ({
        situacao: 'rejeitado', linha: String(row.rowNumber), nome: row.values[0] ?? '',
        email: row.values[1] ?? '', empresa: '', cargo: '',
        motivo: REJECTION_LABELS[row.reason], valores: row.values.join(' | '),
      })),
    ], `contatos-ros-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const rejectionSummary = useMemo(() => {
    const counters = new Map<RejectedContactRow['reason'], number>()
    rejected.forEach((row) => counters.set(row.reason, (counters.get(row.reason) ?? 0) + 1))
    return Array.from(counters.entries())
  }, [rejected])

  const goToCompose = () => {
    if (!contacts.length || hasIssues) return
    try {
      sessionStorage.setItem(PENDING_CONTACTS_KEY, JSON.stringify(finalizeRosContacts(contacts)))
    } catch {
      toast.error('Não foi possível guardar os contatos nesta aba. Libere espaço e tente de novo.')
      return
    }
    router.push('/ros/compose')
  }

  return (
    <main className="min-h-full bg-brand-dark px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-1 animate-fade-up" style={{ animationFillMode: 'forwards' }}>
          <h1 className="font-ros text-3xl font-semibold text-brand-white">Contatos da divulgação</h1>
          <p className="text-sm text-brand-muted">
            Importe uma planilha ou cadastre manualmente quem vai receber a divulgação do Recrutaê | OS.
          </p>
        </header>

        <section aria-label="Importar arquivo" className="space-y-4">
          <div
            {...getRootProps()}
            className={`relative cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-all duration-300 ${
              isDragActive ? 'border-brand-coral bg-brand-coral/5'
                : contacts.length ? 'border-brand-success/40 bg-brand-success/5'
                  : 'border-white/10 hover:border-brand-coral/40 hover:bg-white/2'
            } ${loading ? 'pointer-events-none cursor-wait opacity-60' : ''}`}
          >
            <input {...getInputProps()} />
            {loading ? (
              <div className="space-y-3">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-brand-coral border-t-transparent" />
                <p className="text-sm text-brand-muted">Processando…</p>
              </div>
            ) : fileName ? (
              <div className="space-y-2">
                <CheckCircle2 className="mx-auto h-10 w-10 text-brand-success" />
                <p className="font-semibold text-brand-white">{fileName}</p>
                <p className="text-sm text-brand-muted">Clique para somar outro arquivo à lista</p>
              </div>
            ) : isDragActive ? (
              <div className="space-y-2">
                <Upload className="mx-auto h-10 w-10 animate-bounce-subtle text-brand-coral" />
                <p className="font-semibold text-brand-coral">Solte o arquivo aqui…</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                  <FileText className="h-7 w-7 text-brand-muted" />
                </div>
                <div>
                  <p className="font-semibold text-brand-white">Arraste a planilha de contatos</p>
                  <p className="mt-1 text-sm text-brand-muted">
                    ou <span className="text-brand-coral underline underline-offset-2">clique para selecionar</span>
                  </p>
                </div>
                <p className="font-mono text-[11px] text-brand-muted/60">
                  .csv .xlsx .xls .xlsm .xlsb .ods — nome, e-mail, empresa e cargo em qualquer ordem
                </p>
              </div>
            )}
          </div>

          {fileError && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-brand-error/20 bg-brand-error/10 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-error" />
              <p className="text-sm text-brand-muted">{fileError}</p>
            </div>
          )}

          {rejectionSummary.length > 0 && (
            <div aria-live="polite" className="space-y-2 rounded-xl border border-brand-warning/20 bg-brand-warning/5 p-4">
              <p className="text-sm font-semibold text-brand-white">
                {rejected.length} linha{rejected.length > 1 ? 's' : ''} fora da campanha
              </p>
              <ul className="space-y-1">
                {rejectionSummary.map(([reason, total]) => (
                  <li key={reason} className="font-mono text-xs text-brand-muted">
                    {REJECTION_LABELS[reason]}: {total}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-label="Cadastro manual" className="space-y-3 rounded-xl border border-white/8 bg-brand-charcoal p-5">
          <h2 className="font-ros text-base font-semibold text-brand-white">Adicionar manualmente</h2>
          <RosManualContactForm existingEmails={existingEmails} onAdd={addManual} />
        </section>

        <section aria-label="Contatos selecionados" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-coral/20 bg-brand-coral/10">
                <Users className="h-4 w-4 text-brand-coral" />
              </span>
              <p aria-live="polite" className="text-sm font-semibold text-brand-white">
                {contacts.length} contato{contacts.length === 1 ? '' : 's'} na campanha
              </p>
            </div>
            {(contacts.length > 0 || rejected.length > 0) && (
              <button
                type="button"
                onClick={downloadSummary}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-brand-muted transition-colors hover:border-brand-coral/40 hover:text-brand-white"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar resumo (CSV)
              </button>
            )}
          </div>

          <RosContactTable contacts={contacts} issues={issues} onUpdate={updateContact} onRemove={removeContact} />

          {hasIssues && (
            <p role="alert" className="text-sm text-brand-error">
              Corrija {Object.keys(issues).length} contato{Object.keys(issues).length > 1 ? 's' : ''} antes de continuar.
            </p>
          )}
        </section>

        <button
          type="button"
          onClick={goToCompose}
          disabled={!contacts.length || hasIssues}
          className="btn-coral flex w-full items-center justify-center gap-3 py-4 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:transform-none"
        >
          Continuar para a mensagem
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </main>
  )
}
