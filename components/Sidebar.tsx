'use client'

import { useState } from 'react'
import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  Upload,
  Megaphone,
  Pencil,
  Rocket,
  CheckCircle,
  FolderOpen,
  Mail,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type NavEntry = {
  href:  string
  label: string
  icon:  React.ComponentType<{ className?: string }>
  match: (p: string) => boolean
}

const navItems: NavEntry[] = [
  { href: '/',        label: 'Upload',   icon: Upload,      match: (p) => p === '/' },
  { href: '/campaign', label: 'Campanha', icon: Megaphone,   match: (p) => p === '/campaign' },
  { href: '/review',  label: 'Revisão',  icon: Pencil,      match: (p) => p === '/review' },
  { href: '/sending', label: 'Enviando', icon: Rocket,      match: (p) => p === '/sending' },
  { href: '/sent',    label: 'Enviados', icon: CheckCircle, match: (p) => p === '/sent' },
]

const bottomItems: NavEntry[] = [
  { href: '/campaigns', label: 'Campanhas', icon: FolderOpen, match: (p) => p.startsWith('/campaigns') },
  { href: '/emails',    label: 'Histórico', icon: Mail,       match: (p) => p.startsWith('/emails') },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const NavItem = ({ item }: { item: NavEntry }) => {
    const Icon = item.icon
    const isActive = item.match(pathname)

    return (
      <Link
        href={item.href}
        className={cn(
          'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
          'text-brand-muted hover:text-brand-white',
          isActive
            ? 'bg-brand-coral/10 text-brand-white'
            : 'hover:bg-white/5',
          collapsed && 'justify-center px-2'
        )}
      >
        {/* Active indicator */}
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-coral rounded-r-full" />
        )}

        <Icon
          className={cn(
            'flex-shrink-0 transition-colors duration-200',
            collapsed ? 'h-5 w-5' : 'h-4 w-4',
            isActive ? 'text-brand-coral' : 'text-brand-muted group-hover:text-brand-white'
          )}
        />

        {!collapsed && (
          <span
            className={cn(
              'text-sm font-medium whitespace-nowrap transition-all duration-200',
              isActive ? 'text-brand-white' : 'text-brand-muted group-hover:text-brand-white'
            )}
          >
            {item.label}
          </span>
        )}

        {/* Tooltip when collapsed */}
        {collapsed && (
          <div className="pointer-events-none absolute left-full ml-2 px-2 py-1 bg-brand-charcoal border border-white/10 rounded-md text-xs text-brand-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
            {item.label}
          </div>
        )}
      </Link>
    )
  }

  return (
    <aside
      className={cn(
        'relative flex flex-col flex-shrink-0 h-full border-r border-white/5 bg-brand-charcoal transition-all duration-300 ease-out',
        collapsed ? 'w-[60px]' : 'w-[220px]'
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex items-center h-16 border-b border-white/5 transition-all duration-300',
          collapsed ? 'justify-center px-2' : 'px-4'
        )}
      >
        <Link href="/" className="flex items-center justify-center">
          <Image
            src="/recrutae.webp"
            alt="Recrutaê"
            width={collapsed ? 28 : 36}
            height={collapsed ? 28 : 36}
            className="object-contain transition-all duration-300"
            priority
          />
        </Link>
      </div>

      {/* Main nav */}
      <nav className="flex-1 flex flex-col gap-0.5 p-2 pt-3 overflow-hidden">
        {navItems.map((item) => (
          <NavItem key={item.href} item={item} />
        ))}

        {/* Divider */}
        <div className="my-2 border-t border-white/5" />

        {bottomItems.map((item) => (
          <NavItem key={item.href} item={item} />
        ))}
      </nav>

      {/* Toggle collapse button */}
      <div className="p-2 border-t border-white/5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-brand-muted hover:text-brand-white hover:bg-white/5 transition-all duration-200',
            collapsed && 'justify-center px-2'
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 flex-shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 flex-shrink-0" />
              <span className="text-xs">Recolher</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
