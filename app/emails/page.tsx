'use client'

import { useState } from 'react'
import { useAppStore } from '@/store'
import { SentEmail } from '@/lib/types'
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
  CheckCircle2,
  XCircle,
  Eye,
  Send,
  BarChart3,
  Building2,
  RefreshCw,
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { toast } from 'sonner'

export default function EmailsPage() {
  const { sentEmails, setSentEmails } = useAppStore()
  const [filter, setFilter] = useState<'all' | 'sent' | 'failed'>('all')
  const [viewingEmail, setViewingEmail] = useState<SentEmail | null>(null)
  const [recovering, setRecovering] = useState(false)

  const handleRecover = async () => {
    setRecovering(true)
    try {
      const res = await fetch('/api/recover')
      const data = await res.json()
      if (!res.ok || data.error) {
        toast.error(data.error || 'Erro ao recuperar emails.')
        return
      }
      if (data.emails && data.emails.length > 0) {
        setSentEmails(data.emails)
        toast.success(`${data.emails.length} emails recuperados do Resend.`)
      } else {
        toast.info('Nenhum email encontrado no Resend.')
      }
    } catch {
      toast.error('Falha ao conectar com o servidor.')
    } finally {
      setRecovering(false)
    }
  }

  const sent = sentEmails.filter((e) => e.status === 'sent')
  const failed = sentEmails.filter((e) => e.status === 'failed')
  const filtered = filter === 'all' ? sentEmails : filter === 'sent' ? sent : failed

  const successRate = sentEmails.length > 0
    ? Math.round((sent.length / sentEmails.length) * 100)
    : 0
  const uniqueCompanies = new Set(sent.map((e) => e.company).filter(Boolean)).size

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="max-w-6xl mx-auto p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Emails Enviados</h1>
            <p className="text-muted-foreground text-sm mt-1">Historico completo de todos os emails enviados em todas as campanhas</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecover}
            disabled={recovering}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', recovering && 'animate-spin')} />
            {recovering ? 'Recuperando...' : 'Recuperar do Resend'}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{sentEmails.length}</p>
                <p className="text-xs text-muted-foreground">Total emails</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{sent.length}</p>
                <p className="text-xs text-muted-foreground">Enviados com sucesso</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{successRate}%</p>
                <p className="text-xs text-muted-foreground">Taxa de sucesso</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{uniqueCompanies}</p>
                <p className="text-xs text-muted-foreground">Empresas atingidas</p>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <TabsList>
                <TabsTrigger value="all" className="gap-1.5">
                  Todos <span className="text-xs opacity-60">({sentEmails.length})</span>
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
              <p>Nenhum email enviado ainda</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Campanha</TableHead>
                  <TableHead>Data de envio</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[60px]">Ver</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow
                    key={e.id}
                    className={cn(
                      'cursor-pointer hover:bg-muted/50',
                      e.status === 'failed' && 'bg-destructive/5'
                    )}
                    onClick={() => setViewingEmail(e)}
                  >
                    <TableCell className="font-medium text-foreground text-sm">{e.candidateName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.company || '—'}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{e.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{e.subject}</TableCell>
                    <TableCell>
                      <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">
                        {e.campaignName}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(e.sentAt)}</TableCell>
                    <TableCell>
                      {e.status === 'sent' ? (
                        <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Enviado</Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Falhou</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(ev) => { ev.stopPropagation(); setViewingEmail(e) }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Email detail modal */}
      <Dialog open={!!viewingEmail} onOpenChange={(open) => !open && setViewingEmail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Email para {viewingEmail?.candidateName}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {viewingEmail?.email} — Campanha: {viewingEmail?.campaignName}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pt-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assunto</p>
              <div className="bg-muted/50 rounded-lg px-4 py-3 text-sm font-medium">
                {viewingEmail?.subject}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Corpo</p>
              <div className="bg-muted/50 rounded-lg px-4 py-4 text-sm whitespace-pre-wrap leading-relaxed font-mono">
                {viewingEmail?.body}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Enviado em: {viewingEmail?.sentAt ? formatDate(viewingEmail.sentAt) : '—'}</span>
              {viewingEmail?.status === 'sent' ? (
                <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Enviado</Badge>
              ) : (
                <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Falhou</Badge>
              )}
            </div>
            {viewingEmail?.errorMessage && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <p className="text-xs text-destructive">{viewingEmail.errorMessage}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
