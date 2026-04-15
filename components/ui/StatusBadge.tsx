import { Check, AlertCircle, Clock, Loader2, Send, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CandidateStatus } from '@/lib/types'

const STATUS_CONFIG: Record<
  CandidateStatus,
  { label: string; icon?: React.ReactNode; classes: string; pulse?: boolean }
> = {
  pending: {
    label:   'Pendente',
    icon:    <Clock className="h-3 w-3" />,
    classes: 'bg-white/5 text-brand-muted border-white/10',
  },
  generating: {
    label:   'Gerando…',
    icon:    <Loader2 className="h-3 w-3 animate-spin" />,
    classes: 'bg-brand-coral/10 text-brand-coral border-brand-coral/20',
    pulse:   true,
  },
  ready: {
    label:   'Pronto',
    classes: 'bg-brand-warning/10 text-brand-warning border-brand-warning/20',
  },
  approved: {
    label:   'Aprovado',
    icon:    <Check className="h-3 w-3" />,
    classes: 'bg-brand-success/10 text-brand-success border-brand-success/20',
  },
  sending: {
    label:   'Enviando…',
    icon:    <Send className="h-3 w-3" />,
    classes: 'bg-brand-coral/10 text-brand-coral border-brand-coral/20',
    pulse:   true,
  },
  sent: {
    label:   'Enviado',
    icon:    <CheckCheck className="h-3 w-3" />,
    classes: 'bg-brand-success/10 text-brand-success border-brand-success/20',
  },
  failed: {
    label:   'Falhou',
    icon:    <AlertCircle className="h-3 w-3" />,
    classes: 'bg-brand-error/10 text-brand-error border-brand-error/20',
  },
}

interface StatusBadgeProps {
  status: CandidateStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, icon, classes, pulse } = STATUS_CONFIG[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium',
        classes,
        pulse && 'animate-pulse',
        className
      )}
    >
      {icon}
      {label}
    </span>
  )
}
