import { NextRequest, NextResponse } from 'next/server'

/**
 * Validates the internal API key sent in the x-api-key header.
 * Provides a basic barrier against external callers.
 * Note: NEXT_PUBLIC_INTERNAL_API_KEY is visible in the client bundle —
 * this is intentional and provides casual protection, not security hardening.
 */
export function validateApiKey(req: NextRequest): boolean {
  const expectedKey = process.env.INTERNAL_API_KEY
  if (!expectedKey) {
    // If key is not configured, block in production, allow in development
    if (process.env.NODE_ENV === 'production') return false
    return true
  }
  const key = req.headers.get('x-api-key')
  return key === expectedKey
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
}
