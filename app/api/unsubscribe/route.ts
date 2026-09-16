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

/** RFC 8058 one-click endpoint. The public confirmation page issues this POST after a human click. */
export async function POST(req: NextRequest) {
  const secret = unsubscribeSecret()
  if (!secret) return response({ error: 'Serviço de descadastro indisponível.' }, 503)

  const token = req.nextUrl.searchParams.get('token')
  if (!token) return response({ error: 'Token de descadastro inválido.' }, 400)

  let claims
  try {
    claims = await verifyUnsubscribeToken(token, secret)
  } catch {
    return response({ error: 'Token de descadastro inválido ou expirado.' }, 400)
  }

  if (!supabaseAdmin) return response({ error: 'Serviço de descadastro indisponível.' }, 503)

  const { error } = await supabaseAdmin.from('email_suppressions').upsert({
    email: normalizeSuppressionEmail(claims.email),
    reason: 'unsubscribe',
    source: 'list_unsubscribe',
    message_id: null,
  }, { onConflict: 'email' })

  if (error) {
    console.error('[unsubscribe] Failed to persist suppression:', error.message)
    return response({ error: 'Não foi possível concluir o descadastro.' }, 503)
  }

  return response({ ok: true, email: claims.email }, 200)
}
