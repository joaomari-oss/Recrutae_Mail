import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Candidate, Campaign, CampaignConfig, SentEmail } from '@/lib/types'

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
  getActiveCandidates: () => Candidate[]
  getActiveConfig: () => CampaignConfig | null
  getActiveCampaign: () => Campaign | null
}

const safeStorage = () => {
  if (typeof window !== 'undefined') return localStorage
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
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
        const id = `campaign-${Date.now()}`
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
        set((state) => ({
          campaigns: [campaign, ...state.campaigns],
          candidatesByCampaign: {
            ...state.candidatesByCampaign,
            [id]: candidates,
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
          // Merge: add only emails not already in the store (by id)
          const existingIds = new Set(state.sentEmails.map((e) => e.id))
          const newEmails = emails.filter((e) => !existingIds.has(e.id))
          return { sentEmails: [...newEmails, ...state.sentEmails] }
        }),

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

      reopenCampaign: (id) =>
        set((state) => {
          const candidates = state.candidatesByCampaign[id] ?? []
          // Reset candidates that were NOT sent: pending, generating, ready, approved, failed → back to pending
          // Keep sent candidates untouched
          const updated = candidates.map((c) =>
            c.status === 'sent'
              ? c
              : { ...c, status: 'pending' as const, generatedSubject: '', generatedBody: '', editedSubject: '', editedBody: '', errorMessage: undefined }
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
    }
  )
)
