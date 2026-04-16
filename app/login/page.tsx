'use client'

import { Suspense, useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff, Lock, Loader2, AlertTriangle } from 'lucide-react'

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const from         = searchParams.get('from') || '/'

  const [password, setPassword] = useState('')
  const [show, setShow]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || !password.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setAttempts((n) => n + 1)
        setError(data.error || 'Senha incorreta.')
        setPassword('')
        inputRef.current?.focus()
        return
      }

      // Redirect to intended destination (never back to /login)
      router.replace(from === '/login' ? '/' : from)
    } catch {
      setError('Falha de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-brand-charcoal border border-white/8 rounded-2xl p-8 shadow-2xl space-y-5">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-brand-error/10 border border-brand-error/20 text-brand-error text-sm animate-fade-in">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Password field */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-brand-muted uppercase tracking-widest">
            Senha de acesso
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Lock className="h-4 w-4 text-brand-muted" />
            </div>
            <input
              ref={inputRef}
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError(null)
              }}
              placeholder="Digite a senha"
              autoComplete="current-password"
              disabled={loading}
              className="w-full bg-brand-dark border border-white/10 rounded-lg pl-10 pr-11 py-3 text-brand-white placeholder:text-brand-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/40 focus:border-brand-coral/40 disabled:opacity-50 transition-all"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              disabled={loading}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-brand-muted hover:text-brand-white transition-colors"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !password.trim()}
          className="btn-coral w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Verificando…</>
          ) : (
            'Entrar'
          )}
        </button>
      </form>

      {/* Attempt counter hint */}
      {attempts >= 3 && (
        <p className="text-center text-xs text-brand-muted animate-fade-in">
          Após 5 tentativas incorretas, o acesso é bloqueado por 15 minutos.
        </p>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-brand-dark flex flex-col items-center justify-center px-4">
      {/* Radial gradient backdrop */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% -10%, rgba(242,106,79,0.12) 0%, transparent 70%)',
        }}
      />

      <div
        className="relative w-full max-w-sm space-y-8 animate-fade-up"
        style={{ animationFillMode: 'forwards' }}
      >
        {/* Logo + title */}
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/recrutae.webp"
            alt="Recrutaê"
            width={52}
            height={52}
            className="object-contain"
            priority
          />
          <div className="text-center">
            <h1 className="text-2xl font-display font-bold text-brand-white">
              Recrutaê Mail
            </h1>
            <p className="text-brand-muted text-sm mt-1">
              Acesso restrito a recrutadores
            </p>
          </div>
        </div>

        {/* Form wrapped in Suspense (required by Next.js for useSearchParams) */}
        <Suspense fallback={
          <div className="bg-brand-charcoal border border-white/8 rounded-2xl p-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-brand-coral animate-spin" />
          </div>
        }>
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-brand-muted/40">
          Sessão expira em 8 horas
        </p>
      </div>
    </div>
  )
}
