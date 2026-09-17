import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const AUTH_COOKIE = 'recrutae-auth'

// Paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/unsubscribe', '/api/unsubscribe', '/api/webhooks/resend']

// Static asset extensions to skip entirely
const STATIC_EXT = /\.(ico|webp|png|jpg|jpeg|svg|gif|css|js|woff2?)$/

function getSecret(): Uint8Array | null {
  const raw = process.env.JWT_SECRET
  if (!raw || raw.length < 32) return null
  return new TextEncoder().encode(raw)
}

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(AUTH_COOKIE)?.value
  if (!token) return false

  const secret = getSecret()
  if (!secret) return false

  try {
    await jwtVerify(token, secret)
    return true
  } catch {
    return false
  }
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * A própria origem da requisição é sempre confiável: o navegador preenche
 * `Origin` sozinho, então um site de terceiros não consegue forjar este valor.
 *
 * Sem isto, abrir o app por qualquer endereço que não seja exatamente o
 * configurado — a URL do deploy na Vercel, uma prévia, um domínio próprio
 * recém-apontado — fazia toda chamada de API responder "Origem não permitida",
 * e a tela só dizia que não deu para salvar.
 */
function isSameOrigin(origin: string, req: NextRequest): boolean {
  const host = req.headers.get('host')
  try {
    const parsed = new URL(origin)
    if (host && parsed.host === host) return true
    return parsed.origin === req.nextUrl.origin
  } catch {
    return false
  }
}

function isConfiguredOrigin(origin: string): boolean {
  return [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_BASE_URL,
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean).includes(origin)
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip static files
  if (STATIC_EXT.test(pathname)) return NextResponse.next()

  const pub = isPublic(pathname)

  // ── Authentication gate ─────────────────────────────────────────────────
  if (!pub) {
    const authed = await isAuthenticated(req)

    if (!authed) {
      // API routes → 401 JSON
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Sessão expirada. Faça login novamente.' }, { status: 401 })
      }
      // Page routes → redirect to /login preserving the intended destination
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('from', pathname)
      return NextResponse.redirect(url)
    }
  }

  // ── Origin check for API routes (when authenticated) ─────────────────────
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
    const origin = req.headers.get('origin')
    if (origin && !isSameOrigin(origin, req) && !isConfiguredOrigin(origin)) {
      return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
    }
  }

  return NextResponse.next()
}

export const config = {
  // Run on everything except Next.js internals and static files already handled above
  matcher: ['/((?!_next/static|_next/image).*)'],
}
