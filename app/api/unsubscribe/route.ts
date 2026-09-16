import { NextRequest, NextResponse } from 'next/server'
import { normalizeSuppressionEmail, verifyUnsubscribeToken } from '@/lib/outreach/unsubscribe'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function unsubscribeSecret(): string | null {
  const secret = process.env.UNSUBSCRIBE_SIGNING_SECRET
  return secret && new TextEncoder().encode(secret).byteLength >= 32 ? secret : null
}

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function humanResult(req: NextRequest, token: string | null, status: 'success' | 'error') {
  const url = new URL('/unsubscribe', req.url)
  if (token) url.searchParams.set('token', token)
  url.searchParams.set('status', status)
  const redirect = NextResponse.redirect(url, 303)
  redirect.headers.set('Cache-Control', 'no-store')
  return redirect
}

async function isHumanConfirmation(req: NextRequest): Promise<boolean> {
  if (!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return false
  try {
    return (await req.formData()).get('human_confirmation') === '1'
  } catch {
    return false
  }
}

/** RFC 8058 one-click endpoint. The public confirmation page issues this POST after a human click. */
export async function POST(req: NextRequest) {
  const humanConfirmation = await isHumanConfirmation(req)
  const secret = unsubscribeSecret()
  if (!secret) {
    return humanConfirmation
      ? humanResult(req, req.nextUrl.searchParams.get('token'), 'error')
      : response({ error: 'Serviço de descadastro indisponível.' }, 503)
  }

  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return humanConfirmation
      ? humanResult(req, null, 'error')
      : response({ error: 'Token de descadastro inválido.' }, 400)
  }

  let claims
  try {
    claims = await verifyUnsubscribeToken(token, secret)
  } catch {
    return humanConfirmation
      ? humanResult(req, token, 'error')
      : response({ error: 'Token de descadastro inválido ou expirado.' }, 400)
  }

  if (!supabaseAdmin) {
    return humanConfirmation
      ? humanResult(req, token, 'error')
      : response({ error: 'Serviço de descadastro indisponível.' }, 503)
  }

  const { error } = await supabaseAdmin.from('email_suppressions').upsert({
    email: normalizeSuppressionEmail(claims.email),
    reason: 'unsubscribe',
    source: 'list_unsubscribe',
    message_id: null,
  }, { onConflict: 'email' })

  if (error) {
    console.error('[unsubscribe] Failed to persist suppression:', error.message)
    return humanConfirmation
      ? humanResult(req, token, 'error')
      : response({ error: 'Não foi possível concluir o descadastro.' }, 503)
  }

  if (humanConfirmation) return humanResult(req, token, 'success')
  return response({ ok: true, email: claims.email }, 200)
}
