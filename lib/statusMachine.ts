import { CandidateStatus } from '@/lib/types'

/**
 * Defines which transitions are valid for each candidate status.
 * A candidate in 'sent' is a terminal state — it NEVER changes.
 */
const VALID_TRANSITIONS: Record<CandidateStatus, CandidateStatus[]> = {
  pending:    ['generating', 'failed'],
  generating: ['ready', 'failed'],
  ready:      ['approved', 'pending'],    // pending = regenerate
  approved:   ['sending', 'ready'],       // ready = unapprove
  sending:    ['sent', 'failed'],
  sent:       [],                          // terminal — NEVER reverts
  failed:     ['pending', 'approved'],    // retry or direct approve
}

export function canTransition(from: CandidateStatus, to: CandidateStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}
