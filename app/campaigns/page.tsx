'use client'

import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  FolderOpen,
  Plus,
  Send,
  CheckCircle2,
  BarChart3,
  Users,
  Clock,
  ArrowRight,
  Trash2,
  RotateCcw,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { CampaignStatus } from '@/lib/types'

const statusConfig: Record<CampaignStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'muted' }> = {
  draft: { label: 'Rascunho', variant: 'muted' },
  generating: { label: 'Gerando', variant: 'info' },
  ready: { label: 'Pronto', variant: 'warning' },
  sending: { label: 'Enviando', variant: 'info' },
  completed: { label: 'Concluido', variant: 'success' },
}

export default function CampaignsPage() {
  const router = useRouter()
  const { campaigns, sentEmails, setActiveCampaign, deleteCampaign, reopenCampaign } = useAppStore()

  const totalCampaigns = campaigns.length
  const totalSentEmails = sentEmails.filter((e) => e.status === 'sent').length
  const totalFailed = sentEmails.filter((e) => e.status === 'failed').length
  const successRate = totalSentEmails + totalFailed > 0
    ? Math.round((totalSentEmails / (totalSentEmails + totalFailed)) * 100)
    : 0

  const handleOpenCampaign = (id: string, status: CampaignStatus) => {
    setActiveCampaign(id)
    if (status === 'draft') router.push('/campaign')
    else if (status === 'generating' || status === 'ready') router.push('/review')
    else if (status === 'sending') router.push('/sending')
    else router.push('/sent')
  }

  const handleDeleteCampaign = (id: string, name: string) => {
    if (confirm(`Tem certeza que deseja excluir a campanha "${name}"? Esta acao nao pode ser desfeita.`)) {
      deleteCampaign(id)
    }
  }

  const handleReopenCampaign = (id: string, name: string) => {
    if (confirm(`Reabrir a campanha "${name}"? Candidatos nao enviados voltarao para geracao.`)) {
      reopenCampaign(id)
      setActiveCampaign(id)
      router.push('/review')
    }
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="max-w-5xl mx-auto p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Campanhas</h1>
            <p className="text-muted-foreground text-sm mt-1">Gerencie todas as suas campanhas de outreach</p>
          </div>
          <Button onClick={() => router.push('/')} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Campanha
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FolderOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalCampaigns}</p>
                <p className="text-xs text-muted-foreground">Total campanhas</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalSentEmails}</p>
                <p className="text-xs text-muted-foreground">Emails enviados</p>
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
        </div>

        {/* Table */}
        {campaigns.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-16 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-foreground">Nenhuma campanha ainda</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Crie sua primeira campanha importando um CSV do Apollo.io
            </p>
            <Button onClick={() => router.push('/')} className="gap-2">
              <Plus className="h-4 w-4" /> Criar campanha
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome da campanha</TableHead>
                  <TableHead>Data de criacao</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Candidatos</TableHead>
                  <TableHead className="text-center">Aprovados</TableHead>
                  <TableHead className="text-center">Enviados</TableHead>
                  <TableHead className="w-[120px]">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const { label, variant } = statusConfig[c.status]
                  return (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <button
                          className="font-medium text-foreground text-sm hover:text-primary transition-colors text-left"
                          onClick={() => handleOpenCampaign(c.id, c.status)}
                        >
                          {c.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(c.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant}>{label}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          {c.totalCandidates}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-foreground font-medium">{c.approvedCount}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-emerald-400 font-medium">{c.sentCount || 0}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {(c.status === 'completed' || c.status === 'sending' || c.status === 'ready') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                              onClick={() => handleReopenCampaign(c.id, c.name)}
                            >
                              <RotateCcw className="h-3 w-3" /> Reabrir
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => handleOpenCampaign(c.id, c.status)}
                          >
                            Abrir <ArrowRight className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteCampaign(c.id, c.name)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </main>
  )
}
