import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import Papa from 'papaparse'
import { Candidate } from './types'
import { rowsToCandidates } from './contactParsing'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extensões de planilha aceitas no upload de candidatos. */
const EXCEL_EXTENSIONS = /\.(xlsx|xlsm|xlsb|xls|ods)$/i

export function isExcelFile(file: File): boolean {
  return EXCEL_EXTENSIONS.test(file.name)
}

function readRawRowsFromCSV(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        resolve((results.data as unknown[][]).map((r) => (r as unknown[]).map((v) => String(v ?? ''))))
      },
      error: (error) => reject(new Error(`Erro ao processar CSV: ${error.message}`)),
    })
  })
}

function readRawRowsFromExcel(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    reader.onload = async (e) => {
      try {
        // Import dinâmico: mantém o xlsx fora do bundle das páginas que só usam cn().
        const XLSX = await import('xlsx')
        const workbook = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        if (!sheetName) {
          reject(new Error('A planilha não contém nenhuma aba.'))
          return
        }
        const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName], {
          header: 1,
          defval: '',
          blankrows: false,
        })
        resolve(rows.map((r) => (Array.isArray(r) ? r.map((v) => String(v ?? '')) : [])))
      } catch (err) {
        reject(new Error(`Erro ao ler a planilha: ${err instanceof Error ? err.message : 'formato não suportado'}`))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Lê um arquivo de contatos (.csv, .xlsx, .xls, .ods) e devolve os candidatos.
 * Aceita tanto exportações do Apollo.io/Octopus CRM quanto planilhas simples
 * no formato Nome | E-mail | Empresa | Cargo.
 */
export async function parseContactsFile(file: File): Promise<Candidate[]> {
  const rawRows = isExcelFile(file)
    ? await readRawRowsFromExcel(file)
    : await readRawRowsFromCSV(file)

  if (!rawRows.length) {
    throw new Error('Arquivo vazio — nenhuma linha encontrada.')
  }

  const candidates = rowsToCandidates(rawRows)

  if (candidates.length === 0) {
    const firstRow = rawRows[0]?.filter(Boolean).join(', ') || '(linha vazia)'
    throw new Error(
      `Nenhum e-mail válido encontrado. Verifique se existe uma coluna de e-mail. Primeira linha lida: ${firstRow}`
    )
  }

  return candidates
}

/**
 * @deprecated Use parseContactsFile — aceita CSV e planilhas (.xlsx/.xls/.ods).
 * Mantido como alias para não quebrar imports existentes.
 */
export function parseCSVFile(file: File): Promise<Candidate[]> {
  return parseContactsFile(file)
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function exportToCSV(data: Record<string, string>[], filename: string) {
  const csv = Papa.unparse(data)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Wraps fetch with an AbortController-based timeout.
 * Throws an Error with message 'Timeout' if the request exceeds `timeoutMs`.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 30_000
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Timeout: servidor não respondeu a tempo.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export function getStatusLabel(status: Candidate['status']): string {
  const labels: Record<Candidate['status'], string> = {
    pending: 'Pendente',
    generating: 'Gerando...',
    ready: 'Pronto',
    approved: 'Aprovado',
    sending: 'Enviando...',
    sent: 'Enviado',
    failed: 'Falhou',
  }
  return labels[status]
}
