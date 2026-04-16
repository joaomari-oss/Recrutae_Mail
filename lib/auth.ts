import { SignJWT, jwtVerify } from 'jose'
import { createHash, timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'

export const AUTH_COOKIE = 'recrutae-auth'
const SESSION_SECONDS = 8 * 60 * 60 // 8 hours

function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET
  if (!raw || raw.length < 32) {
    throw new Error('JWT_SECRET não configurado ou muito curto (mínimo 32 caracteres)')
  }
  return new TextEncoder().encode(raw)
}

/** Signs a new JWT session token */
export async function signSessionToken(): Promise<string> {
  return new SignJWT({ v: 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(getSecret())
}

/** Verifies a JWT session token. Returns true if valid and not expired. */
export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret())
    return true
  } catch {
    return false
  }
}

/**
 * Timing-safe password comparison using SHA-256 hashes to normalize length.
 * Hashing both values prevents length-based timing leaks.
 */
export function safePasswordCompare(input: string, expected: string): boolean {
  const hashInput = createHash('sha256').update(input).digest()
  const hashExpected = createHash('sha256').update(expected).digest()
  return timingSafeEqual(hashInput, hashExpected)
}

/** Extracts the auth cookie value from an incoming request */
export function getTokenFromRequest(req: NextRequest): string | undefined {
  return req.cookies.get(AUTH_COOKIE)?.value
}

/** Standard cookie options — HttpOnly, Secure in prod, SameSite=Strict */
export function cookieOptions(maxAge: number = SESSION_SECONDS) {
  return {
    name: AUTH_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge,
  }
}
