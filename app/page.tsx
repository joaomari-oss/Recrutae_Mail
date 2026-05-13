'use client'

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Users, Building2, ArrowUpRight, Zap, Target, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function LandingPage() {
  const router = useRouter()

  return (
    <main className="relative min-h-screen bg-brand-dark flex flex-col items-center justify-center px-6 overflow-hidden select-none">

      {/* Ambient lights */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] rounded-full bg-brand-coral/[0.05] blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[300px] rounded-full bg-brand-coral/[0.03] blur-[100px]" />
        <div className="absolute top-1/3 right-0 w-[300px] h-[300px] rounded-full bg-purple-500/[0.015] blur-[80px]" />
      </div>

      {/* Subtle grid pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.018]"
        style={{
          backgroundImage: `linear-gradient(rgba(245,242,235,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(245,242,235,0.5) 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative z-10 w-full max-w-[560px] flex flex-col items-center gap-12">

        {/* Wordmark */}
        <div className="flex flex-col items-center gap-4 animate-fade-up" style={{ animationFillMode: 'forwards' }}>
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-brand-coral/20 blur-xl animate-glow" />
            <div className="relative w-[72px] h-[72px] rounded-2xl bg-brand-charcoal border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] flex items-center justify-center">
              <Image src="/recrutae.webp" alt="Recrutaê" width={44} height={44} className="object-contain" priority />
            </div>
          </div>
          <div className="text-center space-y-1.5">
            <h1 className="text-[32px] font-display font-bold text-brand-white tracking-[-0.03em] leading-none">
              Recrutaê Mail
            </h1>
            <p className="text-[14px] text-brand-muted font-light tracking-wide">
              Plataforma de outreach · escolha o modo
            </p>
          </div>
        </div>

        {/* Mode cards */}
        <div className="w-full grid grid-cols-2 gap-4 animate-fade-up stagger-1" style={{ animationFillMode: 'forwards' }}>

          {/* Candidatos */}
          <button
            onClick={() => router.push('/candidates')}
            className={cn(
              'group relative flex flex-col text-left rounded-2xl overflow-hidden',
              'bg-brand-charcoal border border-white/[0.06]',
              'hover:border-brand-coral/30 transition-all duration-300',
              'hover:shadow-[0_20px_60px_rgba(0,0,0,0.5),0_0_0_1px_rgba(242,201,76,0.1)]',
              'hover:-translate-y-0.5',
              'p-6'
            )}
          >
            {/* Card ambient */}
            <div className="absolute inset-0 bg-gradient-to-br from-brand-coral/[0.04] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

            <div className="flex items-start justify-between mb-5">
              <div className="w-10 h-10 rounded-xl bg-brand-coral/10 border border-brand-coral/[0.15] flex items-center justify-center">
                <Users className="h-[18px] w-[18px] text-brand-coral" />
              </div>
              <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center group-hover:bg-brand-coral/10 transition-colors duration-200">
                <ArrowUpRight className="h-3.5 w-3.5 text-brand-muted/50 group-hover:text-brand-coral transition-colors" />
              </div>
            </div>

            <div className="flex-1 space-y-2 mb-5">
              <h2 className="text-[17px] font-display font-bold text-brand-white tracking-tight leading-snug">
                Candidatos
              </h2>
              <p className="text-[12.5px] text-brand-muted/80 leading-relaxed font-light">
                Outreach para candidatos a vagas via Apollo.io ou Octopus CRM.
              </p>
            </div>

            <div className="space-y-1.5 border-t border-white/[0.05] pt-4">
              <div className="flex items-center gap-2 text-[11px] text-brand-muted/60">
                <Zap className="h-3 w-3 text-brand-coral/50 flex-shrink-0" />
                <span>Envia via <span className="font-mono text-brand-muted/80">@recrutae.net.br</span></span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-brand-muted/60">
                <Target className="h-3 w-3 text-brand-coral/50 flex-shrink-0" />
                <span>CSV do Apollo.io / Octopus</span>
              </div>
            </div>
          </button>

          {/* Clientes */}
          <button
            onClick={() => router.push('/clients')}
            className={cn(
              'group relative flex flex-col text-left rounded-2xl overflow-hidden',
              'bg-brand-charcoal border border-white/[0.06]',
              'hover:border-brand-coral/30 transition-all duration-300',
              'hover:shadow-[0_20px_60px_rgba(0,0,0,0.5),0_0_0_1px_rgba(242,201,76,0.1)]',
              'hover:-translate-y-0.5',
              'p-6'
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-brand-coral/[0.04] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

            <div className="flex items-start justify-between mb-5">
              <div className="w-10 h-10 rounded-xl bg-brand-coral/10 border border-brand-coral/[0.15] flex items-center justify-center">
                <Building2 className="h-[18px] w-[18px] text-brand-coral" />
              </div>
              <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center group-hover:bg-brand-coral/10 transition-colors duration-200">
                <ArrowUpRight className="h-3.5 w-3.5 text-brand-muted/50 group-hover:text-brand-coral transition-colors" />
              </div>
            </div>

            <div className="flex-1 space-y-2 mb-5">
              <h2 className="text-[17px] font-display font-bold text-brand-white tracking-tight leading-snug">
                Clientes
              </h2>
              <p className="text-[12.5px] text-brand-muted/80 leading-relaxed font-light">
                Prospecção B2B para empresas contratantes. Manual ou via CSV.
              </p>
            </div>

            <div className="space-y-1.5 border-t border-white/[0.05] pt-4">
              <div className="flex items-center gap-2 text-[11px] text-brand-muted/60">
                <Zap className="h-3 w-3 text-brand-coral/50 flex-shrink-0" />
                <span>Envia via <span className="font-mono text-brand-muted/80">@recrutae.com.br</span></span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-brand-muted/60">
                <Layers className="h-3 w-3 text-brand-coral/50 flex-shrink-0" />
                <span>24 segmentos de mercado</span>
              </div>
            </div>
          </button>

        </div>

        {/* Footer */}
        <p
          className="text-[11px] text-brand-muted/30 tracking-widest uppercase font-medium animate-fade-up stagger-2"
          style={{ animationFillMode: 'forwards' }}
        >
          Recrutaê · uso interno
        </p>
      </div>
    </main>
  )
}
