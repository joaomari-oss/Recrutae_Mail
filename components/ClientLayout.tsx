'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { validateStoreIntegrity, cleanupOldCampaigns } from '@/lib/integrity'

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
      <Sidebar />
      <div className="flex-1 overflow-auto min-w-0">
        {children}
      </div>
    </div>
  )
}
