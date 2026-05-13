'use client'

import { useState, useEffect } from 'react'
import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  Upload, Megaphone, Pencil, Rocket, CheckCircle,
  FolderOpen, Mail, ChevronLeft, ChevronRight, LogOut,
  Building2, UserPlus, Settings, Send, LayoutGrid, Sun, Moon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSessionId } from '@/lib/session'
import { useTheme } from '@/lib/theme'

type NavEntry = {
  href:  string
  label: string
  icon:  React.ComponentType<{ className?: string }>
  match: (p: string) => boolean
}

const candidateNavItems: NavEntry[] = [
  { href: '/candidates', label: 'Upload',    icon: Upload,       match: (p) => p === '/candidates' },
  { href: '/campaign',   label: 'Campanha',  icon: Megaphone,    match: (p) => p === '/campaign' },
  { href: '/review',     label: 'Revisão',   icon: Pencil,       match: (p) => p === '/review' },
  { href: '/sending',    label: 'Enviando',  icon: Rocket,       match: (p) => p === '/sending' },
  { href: '/sent',       label: 'Enviados',  icon: CheckCircle,  match: (p) => p === '/sent' },
]

const candidateBottomItems: NavEntry[] = [
  { href: '/campaigns', label: 'Campanhas', icon: FolderOpen, match: (p) => p.startsWith('/campaigns') },
  { href: '/emails',    label: 'Histórico', icon: Mail,       match: (p) => p.startsWith('/emails') },
]

const clientNavItems: NavEntry[] = [
  { href: '/clients',          label: 'Contatos',   icon: UserPlus,    match: (p) => p === '/clients' },
  { href: '/clients/compose',  label: 'Configurar', icon: Settings,    match: (p) => p === '/clients/compose' },
  { href: '/clients/review',   label: 'Revisão',    icon: Pencil,      match: (p) => p === '/clients/review' },
  { href: '/clients/sending',  label: 'Enviando',   icon: Send,        match: (p) => p === '/clients/sending' },
  { href: '/clients/sent',     label: 'Enviados',   icon: CheckCircle, match: (p) => p === '/clients/sent' },
]

const clientBottomItems: NavEntry[] = [
  { href: '/clients/campaigns', label: 'Campanhas', icon: Building2, match: (p) => p.startsWith('/clients/campaigns') },
]

export function Sidebar() {
  const pathname   = usePathname()
  const router     = useRouter()
  const [collapsed, setCollapsed]   = useState(false)
  const [sessionId, setSessionId]   = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  const isClientMode = pathname.startsWith('/clients')
  const navItems     = isClientMode ? clientNavItems     : candidateNavItems
  const bottomItems  = isClientMode ? clientBottomItems  : candidateBottomItems
  const { theme, toggleTheme } = useTheme()

  useEffect(() => { setSessionId(getSessionId()) }, [])

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try { await fetch('/api/auth/logout', { method: 'POST' }) }
    finally { router.replace('/login') }
  }

  const NavItem = ({ item }: { item: NavEntry }) => {
    const Icon     = item.icon
    const isActive = item.match(pathname)

    return (
      <Link
        href={item.href}
        className={cn(
          'group relative flex items-center gap-3 rounded-xl transition-all duration-200',
          collapsed ? 'justify-center p-2.5' : 'px-3 py-2.5',
          isActive
            ? 'bg-brand-coral/12 text-brand-white'
            : 'text-brand-muted hover:text-brand-white hover:bg-white/4'
        )}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-brand-coral rounded-r-full shadow-[0_0_8px_rgba(242,201,76,0.5)]" />
        )}
        <div className={cn(
          'flex items-center justify-center rounded-lg transition-all duration-200 flex-shrink-0',
          collapsed ? 'w-8 h-8' : 'w-7 h-7',
          isActive ? 'bg-brand-coral/15' : 'bg-transparent group-hover:bg-white/5'
        )}>
          <Icon className={cn(
            'transition-colors duration-200',
            collapsed ? 'h-4.5 w-4.5' : 'h-[15px] w-[15px]',
            isActive ? 'text-brand-coral' : 'text-brand-muted group-hover:text-brand-white'
          )} style={{ width: collapsed ? 18 : 15, height: collapsed ? 18 : 15 }} />
        </div>
        {!collapsed && (
          <span className={cn(
            'text-[13px] font-medium whitespace-nowrap transition-colors duration-200',
            isActive ? 'text-brand-white' : 'text-brand-muted group-hover:text-brand-white'
          )}>
            {item.label}
          </span>
        )}
        {collapsed && (
          <div className="pointer-events-none absolute left-full ml-3 px-3 py-1.5 bg-brand-surface border border-white/8 rounded-xl text-[12px] text-brand-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 shadow-xl">
            {item.label}
          </div>
        )}
      </Link>
    )
  }

  return (
    <aside className={cn(
      'relative flex flex-col flex-shrink-0 h-full transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
      'border-r border-white/[0.045]',
      'bg-brand-dark',
      collapsed ? 'w-[64px]' : 'w-[224px]'
    )}>

      {/* Top glow */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

      {/* Logo area */}
      <div className={cn(
        'flex items-center h-[60px] border-b border-white/[0.045] transition-all duration-300',
        collapsed ? 'justify-center px-2' : 'px-4 gap-3'
      )}>
        <Link href="/" className="flex items-center justify-center flex-shrink-0 group">
          <div className={cn(
            'rounded-xl border border-white/8 bg-brand-charcoal flex items-center justify-center transition-all duration-300 group-hover:border-brand-coral/20',
            collapsed ? 'w-9 h-9' : 'w-8 h-8'
          )}>
            <Image
              src="/recrutae.webp"
              alt="Recrutaê"
              width={collapsed ? 20 : 18}
              height={collapsed ? 20 : 18}
              className="object-contain"
              priority
            />
          </div>
        </Link>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <span className={cn(
              'inline-flex items-center text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-md border',
              isClientMode
                ? 'text-brand-coral/90 border-brand-coral/25 bg-brand-coral/8'
                : 'text-brand-muted/70 border-white/8 bg-white/4'
            )}>
              {isClientMode ? 'CLIENTES' : 'CANDIDATOS'}
            </span>
          </div>
        )}
      </div>

      {/* Nav section label */}
      {!collapsed && (
        <div className="px-4 pt-5 pb-1.5">
          <span className="text-[10px] font-semibold tracking-[0.12em] text-brand-muted/40 uppercase">
            Fluxo
          </span>
        </div>
      )}

      {/* Main nav */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2 overflow-hidden">
        {navItems.map((item) => (
          <NavItem key={item.href} item={item} />
        ))}

        {!collapsed && (
          <div className="px-2 pt-5 pb-1.5">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-brand-muted/40 uppercase">
              Histórico
            </span>
          </div>
        )}
        {collapsed && <div className="my-3 mx-1 border-t border-white/[0.045]" />}

        {bottomItems.map((item) => (
          <NavItem key={item.href} item={item} />
        ))}

        <div className="my-2 mx-1 border-t border-white/[0.045]" />

        {/* Switch mode */}
        <Link
          href="/"
          className={cn(
            'group relative flex items-center rounded-xl transition-all duration-200',
            collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
            'text-brand-muted/50 hover:text-brand-muted hover:bg-white/3'
          )}
        >
          <div className={cn(
            'flex items-center justify-center rounded-lg flex-shrink-0',
            collapsed ? 'w-8 h-8' : 'w-7 h-7'
          )}>
            <LayoutGrid style={{ width: collapsed ? 16 : 14, height: collapsed ? 16 : 14 }} className="transition-colors" />
          </div>
          {!collapsed && <span className="text-[12px] font-medium">Trocar modo</span>}
          {collapsed && (
            <div className="pointer-events-none absolute left-full ml-3 px-3 py-1.5 bg-brand-surface border border-white/8 rounded-xl text-[12px] text-brand-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all z-50 shadow-xl">
              Trocar modo
            </div>
          )}
        </Link>
      </nav>

      {/* Bottom: session + logout + collapse */}
      <div className="border-t border-white/[0.045] p-2 space-y-0.5">
        {!collapsed && sessionId && (
          <div className="px-3 pb-1">
            <span className="text-[9px] text-brand-muted/35 font-mono select-none" title={`Session: ${sessionId}`}>
              {sessionId.slice(0, 8)}
            </span>
          </div>
        )}

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          title="Sair"
          className={cn(
            'group w-full flex items-center rounded-xl transition-all duration-200',
            collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
            'text-brand-muted/50 hover:text-brand-error hover:bg-brand-error/6'
          )}
        >
          <div className={cn('flex items-center justify-center flex-shrink-0', collapsed ? 'w-8 h-8' : 'w-7 h-7')}>
            <LogOut style={{ width: collapsed ? 16 : 14, height: collapsed ? 16 : 14 }} />
          </div>
          {!collapsed && <span className="text-[13px] font-medium">Sair</span>}
          {collapsed && (
            <div className="pointer-events-none absolute left-full ml-3 px-3 py-1.5 bg-brand-surface border border-white/8 rounded-xl text-[12px] text-brand-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all z-50 shadow-xl">
              Sair
            </div>
          )}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          className={cn(
            'group relative w-full flex items-center rounded-xl transition-all duration-200',
            collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
            'text-brand-muted/50 hover:text-brand-muted hover:bg-white/4'
          )}
        >
          <div className={cn(
            'flex items-center justify-center rounded-lg flex-shrink-0 transition-all duration-300',
            collapsed ? 'w-8 h-8' : 'w-7 h-7',
          )}>
            {theme === 'dark'
              ? <Sun   style={{ width: collapsed ? 16 : 14, height: collapsed ? 16 : 14 }} className="transition-transform duration-300 group-hover:rotate-12" />
              : <Moon  style={{ width: collapsed ? 16 : 14, height: collapsed ? 16 : 14 }} className="transition-transform duration-300 group-hover:-rotate-12" />
            }
          </div>
          {!collapsed && (
            <span className="text-[13px] font-medium">
              {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            </span>
          )}
          {collapsed && (
            <div className="pointer-events-none absolute left-full ml-3 px-3 py-1.5 bg-brand-surface border border-white/8 rounded-xl text-[12px] text-brand-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all z-50 shadow-xl">
              {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            </div>
          )}
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'w-full flex items-center rounded-xl transition-all duration-200',
            collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
            'text-brand-muted/40 hover:text-brand-muted hover:bg-white/4'
          )}
        >
          <div className={cn('flex items-center justify-center flex-shrink-0', collapsed ? 'w-8 h-8' : 'w-7 h-7')}>
            {collapsed
              ? <ChevronRight style={{ width: 14, height: 14 }} />
              : <ChevronLeft  style={{ width: 14, height: 14 }} />
            }
          </div>
          {!collapsed && <span className="text-[12px] font-medium">Recolher</span>}
        </button>
      </div>
    </aside>
  )
}
