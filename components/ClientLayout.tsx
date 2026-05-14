'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { validateStoreIntegrity, cleanupOldCampaigns } from '@/lib/integrity'
import { useAppStore } from '@/store'

function StoreInitializer() {
  useEffect(() => {
    // Run on first load — validate store integrity and clean up old campaigns
    validateStoreIntegrity()
    const removed = cleanupOldCampaigns(90)
    if (removed > 0) {
      console.info(`[cleanup] ${removed} campanha(s) antiga(s) removida(s) do localStorage.`)
    }
  }, [])
  return null
}

/** Polls /api/email-events every 60 s to pick up Resend webhook events */
function EmailOpenPoller() {
  const addEmailOpenEvents = useAppStore((s) => s.addEmailOpenEvents)
  const lastPolledRef = useRef<string>(
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  )

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/email-events?since=${lastPolledRef.current}`)
        if (!res.ok) return
        const { events } = await res.json()
        if (Array.isArray(events) && events.length > 0) {
          addEmailOpenEvents(events)
        }
        // Always advance the cursor so we don't re-fetch old events
        lastPolledRef.current = new Date().toISOString()
      } catch {
        // network error — silent fail, retry on next tick
      }
    }

    poll()
    const id = setInterval(poll, 60_000)
    return () => clearInterval(id)
  }, [addEmailOpenEvents])

  return null
}

// Pages that render full-screen without the sidebar
const NO_SIDEBAR_PATHS = ['/login', '/']

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isHomePage = NO_SIDEBAR_PATHS.includes(pathname)

  if (isHomePage) {
    return (
      <>
        <StoreInitializer />
        {children}
      </>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-brand-dark">
      <StoreInitializer />
      <EmailOpenPoller />
      <Sidebar />
      <div className="flex-1 overflow-auto min-w-0">
        {children}
      </div>
    </div>
  )
}
