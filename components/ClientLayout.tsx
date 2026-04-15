'use client'

import { Sidebar } from '@/components/Sidebar'

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-brand-dark">
      <Sidebar />
      <div className="flex-1 overflow-auto min-w-0">
        {children}
      </div>
    </div>
  )
}
