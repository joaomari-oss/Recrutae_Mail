'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import { Candidate } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Mail,
  Download,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  Building2,
  Send,
  BarChart3,
  ArrowRight,
} from 'lucide-react'
import { cn, formatDate, exportToCSV } from '@/lib/utils'

export default function SentPage() {
  const router = useRouter()
  const { activeCampaignId, candidatesByCampaign } = useAppStore()

  const campaignId = activeCampaignId
  const candidates = campaignId ? candidatesByCampaign[campaignId] ?? [] : []

  const [filter, setFilter] = useState<'all' | 'sent' | 'failed'>('all')
  const [viewingEmail, setViewingEmail] = useState<Candidate | null>(null)

  const sent = candidates.filter((c) => c.status === 'sent')
  const failed = candidates.filter((c) => c.status === 'failed')
  const all = candidates.filter((c) => c.status === 'sent' || c.status === 'failed' || c.status === 'approved')
  const filtered = filter === 'all' ? all : filter === 'sent' ? sent : failed

  const successRate = all.length > 0 ? Math.round((sent.length / all.length) * 100) : 0
  const uniqueCompanies = new Set(sent.map((c) => c.company).filter(Boolean)).size

  const handleExport = () => {
    const data = filtered.map((c) => ({
      Nome: c.fullName,
      Email: c.email,
      Cargo: c.title,
      Empresa: c.company,
      Status: c.status === 'sent' ? 'Enviado' : c.status === 'failed' ? 'Falhou' : 'Aprovado',
      'Enviado em': c.sentAt ? formatDate(c.sentAt) : '',
      Assunto: c.editedSubject || c.generatedSubject,
      Erro: c.errorMessage || '',
    }))
    exportToCSV(data, `recrutae-campanha-${new Date().toISOString().split('T')[0]}.csv`)
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background flex flex-col">
      <div className="flex-1 p-8 space-y-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Resultados da campanha</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
            <Button size="sm" onClick={() => router.push('/')} className="gap-2">
              Nova campanha <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{sent.length}</p>
                <p className="text-xs text-muted-foreground">Emails enviados</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{successRate}%</p>
                <p className="text-xs text-muted-foreground">Taxa de sucesso</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{uniqueCompanies}</p>
                <p className="text-xs text-muted-foreground">Empresas atingidas</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{failed.length}</p>
                <p className="text-xs text-muted-foreground">Falhas</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <TabsList>
                <TabsTrigger value="all" className="gap-1.5">
                  Todos <span className="text-xs opacity-60">({all.length})</span>
                </TabsTrigger>
                <TabsTrigger value="sent" className="gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  Enviados <span className="text-xs opacity-60">({sent.length})</span>
                </TabsTrigger>
                <TabsTrigger value="failed" className="gap-1.5">
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  Falhas <span className="text-xs opacity-60">({failed.length})</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Mail className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p>Nenhum registro encontrado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidato</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enviado em</TableHead>
                  <TableHead className="w-[80px]">Ver</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className={cn(c.status === 'failed' && 'bg-destructive/5')}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground text-sm">{c.fullName}</p>
                        <p className="text-xs text-muted-foreground">{c.title}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.company || '—'}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.email}</TableCell>
                    <TableCell>
                      {c.status === 'sent' ? (
                        <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Enviado</Badge>
                      ) : c.status === 'failed' ? (
                        <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Falhou</Badge>
                      ) : (
                        <Badge variant="warning">Aprovado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.sentAt ? formatDate(c.sentAt) : '—'}</TableCell>
                    <TableCell>
                      {(c.editedBody || c.generatedBody) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingEmail(c)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {failed.length > 0 && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground text-sm">
                {failed.length} email{failed.length > 1 ? 's' : ''} falharam no envio
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Volte para revisao para regenerar ou corrigir.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/review')}
              className="gap-2 border-destructive/30 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <RefreshCw className="h-4 w-4" /> Voltar para revisao
            </Button>
          </div>
        )}
      </div>

      <Dialog open={!!viewingEmail} onOpenChange={(open) => !open && setViewingEmail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Email para {viewingEmail?.fullName}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">{viewingEmail?.email}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pt-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assunto</p>
              <div className="bg-muted/50 rounded-lg px-4 py-3 text-sm font-medium">
                {viewingEmail?.editedSubject || viewingEmail?.generatedSubject}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Corpo</p>
              <div className="bg-muted/50 rounded-lg px-4 py-4 text-sm whitespace-pre-wrap leading-relaxed font-mono">
                {viewingEmail?.editedBody || viewingEmail?.generatedBody}
              </div>
            </div>
            {viewingEmail?.sentAt && (
              <p className="text-xs text-muted-foreground">Enviado em: {formatDate(viewingEmail.sentAt)}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
