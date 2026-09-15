import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { RosCampaign, RosCampaignConfig, RosContact } from '@/lib/rosTypes'

interface RosStore {
  campaigns: RosCampaign[]
  activeCampaignId: string | null
  contactsByCampaign: Record<string, RosContact[]>
  campaignConfigById: Record<string, RosCampaignConfig>
  createCampaign: (name: string, contacts: RosContact[], config: RosCampaignConfig) => string
  updateCampaign: (id: string, updates: Partial<RosCampaign>) => void
  setActiveCampaign: (id: string | null) => void
  updateContact: (campaignId: string, contactId: string, updates: Partial<RosContact>) => void
  approveAll: (campaignId: string) => void
  deleteCampaign: (id: string) => void
  getActiveContacts: () => RosContact[]
  getActiveConfig: () => RosCampaignConfig | null
  getActiveCampaign: () => RosCampaign | null
}

const safeStorage = () => {
  if (typeof window === 'undefined') return { getItem: (_: string) => null, setItem: (_: string, __: string) => {}, removeItem: (_: string) => {} }
  return {
    getItem: (name: string) => { try { return localStorage.getItem(name) } catch { return null } },
    setItem: (name: string, value: string) => { try { localStorage.setItem(name, value) } catch {} },
    removeItem: (name: string) => { try { localStorage.removeItem(name) } catch {} },
  }
}

export const useRosStore = create<RosStore>()(persist((set) => ({
  campaigns: [] as RosCampaign[], activeCampaignId: null as string | null, contactsByCampaign: {} as Record<string, RosContact[]>, campaignConfigById: {} as Record<string, RosCampaignConfig>,
  createCampaign: (name, contacts, config) => {
    const id = crypto.randomUUID()
    const campaign: RosCampaign = { id, name, createdAt: new Date().toISOString(), campaignKind: 'ros', status: 'draft', totalContacts: contacts.length, approvedCount: 0, sentCount: 0, failedCount: 0 }
    const normalized = contacts.map((c) => ({ ...c, sendAttempts: c.sendAttempts ?? 0 }))
    set((state) => ({ campaigns: [campaign, ...state.campaigns], contactsByCampaign: { ...state.contactsByCampaign, [id]: normalized }, campaignConfigById: { ...state.campaignConfigById, [id]: config }, activeCampaignId: id }))
    return id
  },
  updateCampaign: (id, updates) => set((state) => ({ campaigns: state.campaigns.map((c) => c.id === id ? { ...c, ...updates } : c) })),
  setActiveCampaign: (id) => set({ activeCampaignId: id }),
  updateContact: (campaignId, contactId, updates) => set((state) => {
    const contacts = state.contactsByCampaign[campaignId] ?? []
    const target = contacts.find((c) => c.id === contactId)
    if (target?.status === 'sent' && updates.status && updates.status !== 'sent') return {}
    const updated = contacts.map((c) => c.id === contactId ? { ...c, ...updates } : c)
    const approvedCount = updated.filter((c) => c.status === 'approved' || c.status === 'sent').length
    const sentCount = updated.filter((c) => c.status === 'sent').length
    const failedCount = updated.filter((c) => c.status === 'failed').length
    return { contactsByCampaign: { ...state.contactsByCampaign, [campaignId]: updated }, campaigns: state.campaigns.map((c) => c.id === campaignId ? { ...c, approvedCount, sentCount, failedCount } : c) }
  }),
  approveAll: (campaignId) => set((state) => {
    const contacts = state.contactsByCampaign[campaignId] ?? []
    const updated = contacts.map((c) => c.status === 'ready' || c.status === 'failed' ? { ...c, status: 'approved' as const } : c)
    const approvedCount = updated.filter((c) => c.status === 'approved' || c.status === 'sent').length
    return { contactsByCampaign: { ...state.contactsByCampaign, [campaignId]: updated }, campaigns: state.campaigns.map((c) => c.id === campaignId ? { ...c, approvedCount } : c) }
  }),
  deleteCampaign: (id) => set((state) => { const { [id]: _, ...contacts } = state.contactsByCampaign; const { [id]: __, ...configs } = state.campaignConfigById; return { campaigns: state.campaigns.filter((c) => c.id !== id), contactsByCampaign: contacts, campaignConfigById: configs, activeCampaignId: state.activeCampaignId === id ? null : state.activeCampaignId } }),
  getActiveContacts: (): RosContact[] => { const state = useRosStore.getState(); return state.activeCampaignId ? state.contactsByCampaign[state.activeCampaignId] ?? [] : [] },
  getActiveConfig: (): RosCampaignConfig | null => { const state = useRosStore.getState(); return state.activeCampaignId ? state.campaignConfigById[state.activeCampaignId] ?? null : null },
  getActiveCampaign: (): RosCampaign | null => { const state = useRosStore.getState(); return state.activeCampaignId ? state.campaigns.find((c) => c.id === state.activeCampaignId) ?? null : null },
}), { name: 'recrutae-ros-v1', storage: createJSONStorage(safeStorage), partialize: (state) => ({ ...state, contactsByCampaign: Object.fromEntries(Object.entries(state.contactsByCampaign).map(([id, contacts]) => [id, contacts.map((c) => c.status === 'sent' ? { ...c, generatedBody: '', editedBody: '', generatedSubject: '', editedSubject: '' } : c)]) ) }) }))
