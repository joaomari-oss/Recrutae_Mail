import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const AUTH_COOKIE = 'recrutae-auth'

// Paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout']

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
    if (origin) {
      const allowed = [
        process.env.NEXT_PUBLIC_APP_URL,
        'http://localhost:3000',
        'http://localhost:3001',
      ].filter(Boolean) as string[]

      if (!allowed.includes(origin)) {
        return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  // Run on everything except Next.js internals and static files already handled above
  matcher: ['/((?!_next/static|_next/image).*)'],
}
