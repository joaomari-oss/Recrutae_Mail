import { NextRequest, NextResponse } from 'next/server'
import { signSessionToken, safePasswordCompare, cookieOptions } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limiter'

export async function POST(req: NextRequest) {
  // Rate limit: 5 attempts per 15 minutes per IP
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'

  const { allowed, remaining, resetAt } = checkRateLimit(`login::${ip}`, 5, 15 * 60 * 1000)

  if (!allowed) {
    const retryAfterSecs = Math.ceil((resetAt - Date.now()) / 1000)
    const minutes = Math.ceil(retryAfterSecs / 60)
    return NextResponse.json(
      { error: `Muitas tentativas. Aguarde ${minutes} minuto(s).` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSecs) } }
    )
  }

  let body: { password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const expected = process.env.APP_PASSWORD
  if (!expected) {
    console.error('[auth/login] APP_PASSWORD não configurado')
    return NextResponse.json({ error: 'Servidor mal configurado.' }, { status: 500 })
  }

  const { password } = body

  // Artificial delay (500ms) on every request to slow brute force
  // even if the rate limiter resets (e.g., distributed IPs)
  await new Promise((r) => setTimeout(r, 500))

  if (!password || !safePasswordCompare(password, expected)) {
    // Return generic error — don't reveal if password is wrong vs. missing
    return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 })
  }

  const token = await signSessionToken()
  const opts = cookieOptions()

  const response = NextResponse.json({ success: true })
  response.cookies.set(opts.name, token, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
    maxAge: opts.maxAge,
  })

  return response
}
