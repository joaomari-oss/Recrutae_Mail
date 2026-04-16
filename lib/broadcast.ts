const CHANNEL_NAME = 'recrutae-sync'

export type SyncMessage =
  | { type: 'CAMPAIGN_SENDING_STARTED'; campaignId: string; sessionId: string }
  | { type: 'CAMPAIGN_SENDING_FINISHED'; campaignId: string }
  | { type: 'CANDIDATE_STATUS_CHANGED'; campaignId: string; candidateId: string; status: string }
  | { type: 'STORE_UPDATED'; timestamp: number }

export function createBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null
  return new BroadcastChannel(CHANNEL_NAME)
}

export function broadcastMessage(msg: SyncMessage): void {
  if (typeof window === 'undefined') return
  const bc = new BroadcastChannel(CHANNEL_NAME)
  bc.postMessage(msg)
  bc.close()
}
