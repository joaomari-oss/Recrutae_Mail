import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { ClientContact, ClientCampaign, ClientCampaignConfig } from '@/lib/clientTypes'

interface ClientStore {
  campaigns: ClientCampaign[]
  activeCampaignId: string | null
  contactsByCampaign: Record<string, ClientContact[]>
  campaignConfigById: Record<string, ClientCampaignConfig>

  createCampaign: (name: string, contacts: ClientContact[], config: ClientCampaignConfig) => string
  updateCampaign: (id: string, updates: Partial<ClientCampaign>) => void
  setActiveCampaign: (id: string | null) => void
  updateContact: (campaignId: string, contactId: string, updates: Partial<ClientContact>) => void
  approveAll: (campaignId: string) => void
  deleteCampaign: (id: string) => void
  getActiveContacts: () => ClientContact[]
  getActiveConfig: () => ClientCampaignConfig | null
  getActiveCampaign: () => ClientCampaign | null
}

const safeStorage = () => {
  if (typeof window === 'undefined') {
    return {
      getItem: (_: string): string | null => null,
      setItem: (_: string, __: string): void => {},
      removeItem: (_: string): void => {},
    }
  }
  return {
    getItem: (name: string) => {
      try { return localStorage.getItem(name) } catch { return null }
    },
    setItem: (name: string, value: string) => {
      try { localStorage.setItem(name, value) } catch { /* quota */ }
    },
    removeItem: (name: string) => {
      try { localStorage.removeItem(name) } catch { /* ignore */ }
    },
  }
}

export const useClientStore = create<ClientStore>()(
  persist(
    (set) => ({
      campaigns: [],
      activeCampaignId: null,
      contactsByCampaign: {},
      campaignConfigById: {},

      createCampaign: (name, contacts, config) => {
        const id = crypto.randomUUID()
        const campaign: ClientCampaign = {
          id,
          name,
          createdAt: new Date().toISOString(),
          status: 'draft',
          segment: config.segment,
          totalContacts: contacts.length,
          approvedCount: 0,
          sentCount: 0,
          failedCount: 0,
        }
        const normalized = contacts.map((c) => ({ ...c, sendAttempts: c.sendAttempts ?? 0 }))
        set((state) => ({
          campaigns: [campaign, ...state.campaigns],
          contactsByCampaign: { ...state.contactsByCampaign, [id]: normalized },
          campaignConfigById: { ...state.campaignConfigById, [id]: config },
          activeCampaignId: id,
        }))
        return id
      },

      updateCampaign: (id, updates) =>
        set((state) => ({
          campaigns: state.campaigns.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),

      setActiveCampaign: (id) => set({ activeCampaignId: id }),

      updateContact: (campaignId, contactId, updates) =>
        set((state) => {
          const contacts = state.contactsByCampaign[campaignId] ?? []
          const target = contacts.find((c) => c.id === contactId)
          if (target?.status === 'sent' && updates.status && updates.status !== 'sent') return {}

          const updated = contacts.map((c) => (c.id === contactId ? { ...c, ...updates } : c))
          const approvedCount = updated.filter((c) => c.status === 'approved' || c.status === 'sent').length
          const sentCount = updated.filter((c) => c.status === 'sent').length
          const failedCount = updated.filter((c) => c.status === 'failed').length
          return {
            contactsByCampaign: { ...state.contactsByCampaign, [campaignId]: updated },
            campaigns: state.campaigns.map((camp) =>
              camp.id === campaignId ? { ...camp, approvedCount, sentCount, failedCount } : camp
            ),
          }
        }),

      approveAll: (campaignId) =>
        set((state) => {
          const contacts = state.contactsByCampaign[campaignId] ?? []
          const updated = contacts.map((c) =>
            c.status === 'ready' || c.status === 'failed' ? { ...c, status: 'approved' as const } : c
          )
          const approvedCount = updated.filter((c) => c.status === 'approved' || c.status === 'sent').length
          return {
            contactsByCampaign: { ...state.contactsByCampaign, [campaignId]: updated },
            campaigns: state.campaigns.map((camp) =>
              camp.id === campaignId ? { ...camp, approvedCount } : camp
            ),
          }
        }),

      deleteCampaign: (id) =>
        set((state) => {
          const { [id]: _c, ...restContacts } = state.contactsByCampaign
          const { [id]: _cfg, ...restConfigs } = state.campaignConfigById
          return {
            campaigns: state.campaigns.filter((c) => c.id !== id),
            contactsByCampaign: restContacts,
            campaignConfigById: restConfigs,
            activeCampaignId: state.activeCampaignId === id ? null : state.activeCampaignId,
          }
        }),

      getActiveContacts: () => {
        const state = useClientStore.getState()
        if (!state.activeCampaignId) return []
        return state.contactsByCampaign[state.activeCampaignId] ?? []
      },

      getActiveConfig: () => {
        const state = useClientStore.getState()
        if (!state.activeCampaignId) return null
        return state.campaignConfigById[state.activeCampaignId] ?? null
      },

      getActiveCampaign: () => {
        const state = useClientStore.getState()
        if (!state.activeCampaignId) return null
        return state.campaigns.find((c) => c.id === state.activeCampaignId) ?? null
      },
    }),
    {
      name: 'recrutae-clients-v1',
      storage: createJSONStorage(safeStorage),
      partialize: (state) => ({
        ...state,
        contactsByCampaign: Object.fromEntries(
          Object.entries(state.contactsByCampaign).map(([cId, contacts]) => [
            cId,
            contacts.map((c) =>
              c.status === 'sent'
                ? { ...c, generatedBody: '', editedBody: '', generatedSubject: '', editedSubject: '' }
                : c
            ),
          ])
        ),
      }),
    }
  )
)
