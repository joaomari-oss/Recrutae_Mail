import { cn } from '@/lib/utils'
import { Candidate } from '@/lib/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Linkedin } from 'lucide-react'

interface CandidateCardProps {
  candidate: Candidate
  isSelected: boolean
  index?: number
  onClick: () => void
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ').filter(Boolean)
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : parts[0]?.[0] ?? '?'
  return (
    <div className="w-8 h-8 rounded-full bg-brand-coral/20 border border-brand-coral/30 flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-bold text-brand-coral uppercase">{initials}</span>
    </div>
  )
}

export function CandidateCard({ candidate, isSelected, index = 0, onClick }: CandidateCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all duration-200 group',
        'animate-fade-up opacity-0',
        isSelected
          ? 'bg-brand-coral/8 border-brand-coral/30 border-l-[3px] border-l-brand-coral'
          : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/10',
      )}
      style={{ animationDelay: `${index * 25}ms`, animationFillMode: 'forwards' }}
    >
      <div className="flex items-center gap-2.5">
        <Initials name={candidate.fullName || candidate.email} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className={cn(
              'text-sm font-medium truncate',
              isSelected ? 'text-brand-white' : 'text-foreground'
            )}>
              {candidate.fullName || candidate.email.split('@')[0]}
            </span>
            {candidate.linkedinUrl && (
              <Linkedin className="h-3 w-3 text-brand-muted flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <p className="text-xs text-brand-muted truncate">
            {[candidate.title, candidate.company].filter(Boolean).join(' · ') || candidate.email}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <StatusBadge status={candidate.status} />
      </div>
    </button>
  )
}
