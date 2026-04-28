import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Candidate, Campaign, CampaignConfig, SentEmail } from '@/lib/types'
import { canTransition } from '@/lib/statusMachine'

interface AppStore {
  campaigns: Campaign[]
  activeCampaignId: string | null
  candidatesByCampaign: Record<string, Candidate[]>
  campaignConfigById: Record<string, CampaignConfig>
  sentEmails: SentEmail[]

  // Campaign
  createCampaign: (name: string, candidates: Candidate[]) => string
  updateCampaign: (id: string, updates: Partial<Campaign>) => void
  setActiveCampaign: (id: string | null) => void

  // Candidates
  updateCandidate: (campaignId: string, candidateId: string, updates: Partial<Candidate>) => void
  approveAll: (campaignId: string) => void

  // Config
  setCampaignConfig: (campaignId: string, config: CampaignConfig) => void

  // Sent emails
  addSentEmail: (email: SentEmail) => void
  setSentEmails: (emails: SentEmail[]) => void

  // Helpers
  deleteCampaign: (id: string) => void
  reopenCampaign: (id: string) => void
  /**
   * Force-resets candidates stuck in 'sending' back to 'approved'.
   * Bypasses the state machine — only for recovery after a crashed session.
   */
  resetStuckCandidates: (campaignId: string) => number
  /** Resets all 'failed' candidates back to 'approved' so they can be resent. */
  retryFailedCandidates: (campaignId: string) => number
  getActiveCandidates: () => Candidate[]
  getActiveConfig: () => CampaignConfig | null
  getActiveCampaign: () => Campaign | null
}

/**
 * localStorage wrapper that catches QuotaExceededError so it never crashes the app.
 * On quota overflow it tries an emergency trim (strip bodies from sent data) and retries.
 * If the retry still fails the write is silently dropped — the in-memory Zustand state
 * remains correct for the current session; only persistence to disk is lost.
 */
const safeStorage = () => {
  if (typeof window === 'undefined') {
    return {
      getItem: (_name: string): string | null => null,
      setItem: (_name: string, _value: string): void => {},
      removeItem: (_name: string): void => {},
    }
  }

  return {
    getItem: (name: string): string | null => {
      try {
        return localStorage.getItem(name)
      } catch {
        return null
      }
    },

    setItem: (name: string, value: string): void => {
      try {
        localStorage.setItem(name, value)
      } catch (e) {
        const isQuota =
          e instanceof DOMException &&
          (e.name === 'QuotaExceededError' ||
            e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
            e.code === 22)

        if (!isQuota) return // unexpected error — drop silently

        // Emergency trim: strip bodies from the payload and retry once
        try {
          const parsed: { state?: Record<string, unknown> } = JSON.parse(value)
          if (parsed?.state) {
            // Keep only last 50 sentEmails and strip their bodies
            const se = parsed.state.sentEmails as Array<Record<string, unknown>> | undefined
            if (Array.isArray(se)) {
              parsed.state.sentEmails = se
                .slice(0, 50)
                .map((e) => ({ ...e, body: '' }))
            }

            // Strip generated/edited bodies from every sent or failed candidate
            const byC = parsed.state.candidatesByCampaign as
              | Record<string, Array<Record<string, unknown>>>
              | undefined
            if (byC) {
              for (const cid of Object.keys(byC)) {
                byC[cid] = byC[cid].map((c) =>
                  c.status === 'sent' || c.status === 'failed'
                    ? {
                        ...c,
                        generatedBody: '',
                        editedBody: '',
                        generatedSubject: '',
                        editedSubject: '',
                      }
                    : c
                )
              }
            }

            localStorage.setItem(name, JSON.stringify(parsed))
            return
          }
        } catch {
          // Emergency trim failed — fall through to warning
        }

        // Could not persist — in-memory state is still valid for this session
        console.warn(
          '[storage] localStorage quota exceeded — state kept in memory only for this session'
        )
      }
    },

    removeItem: (name: string): void => {
      try {
        localStorage.removeItem(name)
      } catch {
        // ignore
      }
    },
  }
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      campaigns: [],
      activeCampaignId: null,
      candidatesByCampaign: {},
      campaignConfigById: {},
      sentEmails: [],

      createCampaign: (name, candidates) => {
        const id = `campaign-${crypto.randomUUID()}`
        const campaign: Campaign = {
          id,
          name,
          createdAt: new Date().toISOString(),
          status: 'draft',
          totalCandidates: candidates.length,
          approvedCount: 0,
          sentCount: 0,
          failedCount: 0,
        }
        // Ensure all candidates have sendAttempts initialized
        const normalized = candidates.map((c) => ({
          ...c,
          sendAttempts: c.sendAttempts ?? 0,
        }))
        set((state) => ({
          campaigns: [campaign, ...state.campaigns],
          candidatesByCampaign: {
            ...state.candidatesByCampaign,
            [id]: normalized,
          },
          activeCampaignId: id,
        }))
        return id
      },

      updateCampaign: (id, updates) =>
        set((state) => ({
          campaigns: state.campaigns.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      setActiveCampaign: (id) => set({ activeCampaignId: id }),

      updateCandidate: (campaignId, candidateId, updates) =>
        set((state) => {
          const candidates = state.candidatesByCampaign[campaignId] ?? []
          const target = candidates.find((c) => c.id === candidateId)

          if (target && updates.status) {
            // Protect terminal state: 'sent' never reverts
            if (target.status === 'sent' && updates.status !== 'sent') {
              console.warn(
                `[store] Transição bloqueada: candidato ${candidateId} já está em 'sent'`
              )
              return {}
            }

            // Validate transition
            if (!canTransition(target.status, updates.status)) {
              console.warn(
                `[store] Transição inválida: ${target.status} → ${updates.status} para ${candidateId}`
              )
              return {}
            }
          }

          const updated = candidates.map((c) =>
            c.id === candidateId ? { ...c, ...updates } : c
          )
          const approvedCount = updated.filter(
            (c) => c.status === 'approved' || c.status === 'sent'
          ).length
          const sentCount = updated.filter((c) => c.status === 'sent').length
          const failedCount = updated.filter((c) => c.status === 'failed').length
          return {
            candidatesByCampaign: {
              ...state.candidatesByCampaign,
              [campaignId]: updated,
            },
            campaigns: state.campaigns.map((camp) =>
              camp.id === campaignId
                ? { ...camp, approvedCount, sentCount, failedCount }
                : camp
            ),
          }
        }),

      approveAll: (campaignId) =>
        set((state) => {
          const candidates = state.candidatesByCampaign[campaignId] ?? []
          const updated = candidates.map((c) =>
            c.status === 'ready' || c.status === 'failed'
              ? { ...c, status: 'approved' as const }
              : c
          )
          const approvedCount = updated.filter(
            (c) => c.status === 'approved' || c.status === 'sent'
          ).length
          return {
            candidatesByCampaign: {
              ...state.candidatesByCampaign,
              [campaignId]: updated,
            },
            campaigns: state.campaigns.map((camp) =>
              camp.id === campaignId ? { ...camp, approvedCount } : camp
            ),
          }
        }),

      setCampaignConfig: (campaignId, config) =>
        set((state) => ({
          campaignConfigById: {
            ...state.campaignConfigById,
            [campaignId]: config,
          },
        })),

      addSentEmail: (email) =>
        set((state) => ({
          sentEmails: [email, ...state.sentEmails],
        })),

      setSentEmails: (emails) =>
        set((state) => {
          const existingIds = new Set(state.sentEmails.map((e) => e.id))
          const newEmails = emails.filter((e) => !existingIds.has(e.id))
          return { sentEmails: [...newEmails, ...state.sentEmails] }
        }),

      resetStuckCandidates: (campaignId) => {
        let count = 0
        set((state) => {
          const candidates = state.candidatesByCampaign[campaignId] ?? []
          const stuck = candidates.filter((c) => c.status === 'sending')
          if (stuck.length === 0) return {}
          count = stuck.length
          const updated = candidates.map((c) =>
            c.status === 'sending' ? { ...c, status: 'approved' as const } : c
          )
          const approvedCount = updated.filter(
            (c) => c.status === 'approved' || c.status === 'sent'
          ).length
          return {
            candidatesByCampaign: { ...state.candidatesByCampaign, [campaignId]: updated },
            campaigns: state.campaigns.map((camp) =>
              camp.id === campaignId ? { ...camp, approvedCount } : camp
            ),
          }
        })
        return count
      },

      deleteCampaign: (id) =>
        set((state) => {
          const { [id]: _candidates, ...restCandidates } = state.candidatesByCampaign
          const { [id]: _config, ...restConfigs } = state.campaignConfigById
          return {
            campaigns: state.campaigns.filter((c) => c.id !== id),
            candidatesByCampaign: restCandidates,
            campaignConfigById: restConfigs,
            activeCampaignId: state.activeCampaignId === id ? null : state.activeCampaignId,
          }
        }),

      retryFailedCandidates: (campaignId) => {
        let count = 0
        set((state) => {
          const candidates = state.candidatesByCampaign[campaignId] ?? []
          const failed = candidates.filter((c) => c.status === 'failed')
          if (failed.length === 0) return {}
          count = failed.length
          const updated = candidates.map((c) =>
            c.status === 'failed'
              ? { ...c, status: 'approved' as const, errorMessage: undefined, sendAttempts: 0 }
              : c
          )
          const approvedCount = updated.filter(
            (c) => c.status === 'approved' || c.status === 'sent'
          ).length
          const failedCount = 0
          return {
            candidatesByCampaign: { ...state.candidatesByCampaign, [campaignId]: updated },
            campaigns: state.campaigns.map((camp) =>
              camp.id === campaignId
                ? { ...camp, status: 'ready' as const, approvedCount, failedCount }
                : camp
            ),
          }
        })
        return count
      },

      reopenCampaign: (id) =>
        set((state) => {
          const candidates = state.candidatesByCampaign[id] ?? []
          const updated = candidates.map((c) =>
            c.status === 'sent'
              ? c
              : {
                  ...c,
                  status: 'pending' as const,
                  generatedSubject: '',
                  generatedBody: '',
                  editedSubject: '',
                  editedBody: '',
                  errorMessage: undefined,
                  sendAttempts: 0,
                }
          )
          const approvedCount = updated.filter((c) => c.status === 'approved' || c.status === 'sent').length
          const sentCount = updated.filter((c) => c.status === 'sent').length
          const failedCount = 0
          return {
            candidatesByCampaign: {
              ...state.candidatesByCampaign,
              [id]: updated,
            },
            campaigns: state.campaigns.map((camp) =>
              camp.id === id
                ? { ...camp, status: 'generating' as const, approvedCount, sentCount, failedCount }
                : camp
            ),
          }
        }),

      getActiveCandidates: () => {
        const state = useAppStore.getState()
        if (!state.activeCampaignId) return []
        return state.candidatesByCampaign[state.activeCampaignId] ?? []
      },

      getActiveConfig: () => {
        const state = useAppStore.getState()
        if (!state.activeCampaignId) return null
        return state.campaignConfigById[state.activeCampaignId] ?? null
      },

      getActiveCampaign: () => {
        const state = useAppStore.getState()
        if (!state.activeCampaignId) return null
        return state.campaigns.find((c) => c.id === state.activeCampaignId) ?? null
      },
    }),
    {
      name: 'recrutae-v2',
      storage: createJSONStorage(safeStorage),
      /**
       * Reduce what lands in localStorage:
       * - Sent candidates have their email bodies stripped (the same data
       *   already lives in sentEmails, so nothing is truly lost).
       * - sentEmails is capped at 200 entries in storage (full list stays
       *   in memory for the current session; older history is in Resend).
       */
      partialize: (state) => ({
        ...state,
        candidatesByCampaign: Object.fromEntries(
          Object.entries(state.candidatesByCampaign).map(([cId, cands]) => [
            cId,
            cands.map((c) =>
              c.status === 'sent'
                ? {
                    ...c,
                    generatedBody: '',
                    editedBody: '',
                    generatedSubject: '',
                    editedSubject: '',
                  }
                : c
            ),
          ])
        ),
        sentEmails: state.sentEmails.slice(0, 200),
      }),
    }
  )
)

// Cross-tab sync: rehydrate this tab's store when localStorage changes in another tab
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'recrutae-v2') {
      useAppStore.persist.rehydrate()
    }
  })
}
