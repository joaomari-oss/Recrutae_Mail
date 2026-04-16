import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limiter'

type LockEntry = {
  sessionId: string
  lockedAt: number
  timeoutMs: number
}

// In-memory lock map — resets on process restart (acceptable for this use case)
const locks = new Map<string, LockEntry>()

const DEFAULT_LOCK_TIMEOUT = 5 * 60 * 1000 // 5 minutes

export async function POST(req: NextRequest) {
  if (!validateApiKey(req)) return unauthorizedResponse()

  const { allowed } = checkRateLimit('campaign-lock-global', 20, 60_000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit excedido. Tente novamente em breve.' },
      { status: 429 }
    )
  }

  let body: { campaignId?: string; sessionId?: string; action?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const { campaignId, sessionId, action } = body

  if (!campaignId || !sessionId || !action) {
    return NextResponse.json(
      { error: 'Campos obrigatórios ausentes: campaignId, sessionId, action.' },
      { status: 400 }
    )
  }

  const now = Date.now()

  if (action === 'acquire') {
    const existing = locks.get(campaignId)

    if (existing && existing.sessionId !== sessionId) {
      // Check if lock is still valid (not expired)
      if (now - existing.lockedAt < existing.timeoutMs) {
        return NextResponse.json(
          {
            success: false,
            error: 'Esta campanha está sendo enviada por outro recrutador.',
            lockedBy: existing.sessionId.slice(0, 8),
            lockedAt: new Date(existing.lockedAt).toISOString(),
            expiresAt: new Date(existing.lockedAt + existing.timeoutMs).toISOString(),
          },
          { status: 409 }
        )
      }
      // Lock expired — fall through to acquire
    }

    locks.set(campaignId, {
      sessionId,
      lockedAt: now,
      timeoutMs: DEFAULT_LOCK_TIMEOUT,
    })

    return NextResponse.json({
      success: true,
      lockedUntil: new Date(now + DEFAULT_LOCK_TIMEOUT).toISOString(),
    })
  }

  if (action === 'release') {
    const existing = locks.get(campaignId)
    if (existing?.sessionId === sessionId) {
      locks.delete(campaignId)
    }
    return NextResponse.json({ success: true })
  }

  if (action === 'heartbeat') {
    const existing = locks.get(campaignId)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Lock não encontrado.' },
        { status: 404 }
      )
    }
    if (existing.sessionId !== sessionId) {
      return NextResponse.json(
        { success: false, error: 'Lock não pertence a esta sessão.' },
        { status: 403 }
      )
    }
    // Renew the lock
    existing.lockedAt = now
    return NextResponse.json({
      success: true,
      lockedUntil: new Date(now + DEFAULT_LOCK_TIMEOUT).toISOString(),
    })
  }

  return NextResponse.json({ error: 'Ação inválida. Use: acquire, release, heartbeat.' }, { status: 400 })
}
