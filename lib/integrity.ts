'use client'

import { useAppStore } from '@/store'

/**
 * Validates the integrity of the Zustand store data.
 * Logs any inconsistencies to the console.
 * Call this on app initialization to detect corrupted localStorage state.
 */
export function validateStoreIntegrity(): string[] {
  const state = useAppStore.getState()
  const issues: string[] = []

  for (const campaign of state.campaigns) {
    if (!state.candidatesByCampaign[campaign.id]) {
      issues.push(`Campanha ${campaign.id} não tem candidatos no store`)
    }

    const candidates = state.candidatesByCampaign[campaign.id] ?? []
    const actualSent = candidates.filter((c) => c.status === 'sent').length
    if (campaign.sentCount !== actualSent) {
      issues.push(
        `Campanha ${campaign.id}: sentCount=${campaign.sentCount} diverge do real=${actualSent}`
      )
    }

    const sendingCount = candidates.filter((c) => c.status === 'sending').length
    if (sendingCount > 0 && campaign.status !== 'sending') {
      issues.push(
        `Campanha ${campaign.id}: ${sendingCount} candidato(s) em 'sending' mas campanha não está em 'sending'`
      )
    }
  }

  if (issues.length > 0) {
    console.warn('[integrity] Problemas encontrados no store:', issues)
  }

  return issues
}

/**
 * Removes completed campaigns older than `maxAgeDays` days to free localStorage space.
 */
export function cleanupOldCampaigns(maxAgeDays = 90): number {
  const state = useAppStore.getState()
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000

  const toDelete = state.campaigns.filter(
    (c) =>
      new Date(c.createdAt).getTime() < cutoff &&
      c.status === 'completed'
  )

  toDelete.forEach((c) => state.deleteCampaign(c.id))
  return toDelete.length
}

/**
 * Resets candidates stuck in 'sending' status back to 'approved'.
 * Uses the store's dedicated resetStuckCandidates action which bypasses the state machine.
 * Useful when a previous sending session crashed without cleaning up.
 */
export function resetStuckSendingCandidates(campaignId: string): number {
  const state = useAppStore.getState()
  return state.resetStuckCandidates(campaignId)
}
