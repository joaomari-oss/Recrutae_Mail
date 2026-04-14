import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import Papa from 'papaparse'
import { Candidate } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseCSVFile(file: File): Promise<Candidate[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Record<string, string>[]

        if (!data || data.length === 0) {
          reject(new Error('Nenhum dado encontrado no CSV.'))
          return
        }

        const firstRow = data[0]
        const keys = Object.keys(firstRow).map((k) => k.toLowerCase().trim())
        const hasEmail = keys.some(
          (k) => k === 'email' || k === 'e-mail' || k === 'email address'
        )

        if (!hasEmail) {
          reject(
            new Error(
              'CSV inválido: coluna "Email" não encontrada. Verifique se o arquivo foi exportado corretamente do Apollo.io.'
            )
          )
          return
        }

        const getField = (row: Record<string, string>, ...variants: string[]) => {
          for (const variant of variants) {
            const key = Object.keys(row).find(
              (k) => k.toLowerCase().trim() === variant.toLowerCase()
            )
            if (key && row[key]) return row[key].trim()
          }
          return ''
        }

        const candidates: Candidate[] = data
          .filter((row) => {
            const email = getField(row, 'email', 'e-mail', 'email address')
            return email && email.includes('@')
          })
          .map((row, index) => {
            const firstName = getField(row, 'first name', 'firstname', 'first_name')
            const lastName = getField(row, 'last name', 'lastname', 'last_name')
            const email = getField(row, 'email', 'e-mail', 'email address')
            const title = getField(row, 'title', 'job title', 'cargo', 'position')
            const company = getField(
              row,
              'company',
              'company name',
              'empresa',
              'organization'
            )
            const linkedinUrl = getField(
              row,
              'person linkedin url',
              'linkedin url',
              'linkedin',
              'linkedin_url'
            )

            return {
              id: `candidate-${Date.now()}-${index}`,
              firstName,
              lastName,
              fullName: `${firstName} ${lastName}`.trim() || email.split('@')[0],
              title,
              company,
              email,
              linkedinUrl,
              status: 'pending',
              generatedSubject: '',
              generatedBody: '',
              editedSubject: '',
              editedBody: '',
            }
          })

        if (candidates.length === 0) {
          reject(new Error('Nenhum contato com email válido encontrado no CSV.'))
          return
        }

        resolve(candidates)
      },
      error: (error) => {
        reject(new Error(`Erro ao processar CSV: ${error.message}`))
      },
    })
  })
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
