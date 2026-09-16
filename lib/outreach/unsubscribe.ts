import { jwtVerify, SignJWT } from 'jose'

const ISSUER = 'recrutae-mail'
const AUDIENCE = 'unsubscribe'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type UnsubscribeTokenInput = {
  email: string
  campaignId: string
}

export type UnsubscribeTokenClaims = UnsubscribeTokenInput & {
  purpose: 'unsubscribe'
}

function signingKey(secret: string): Uint8Array {
  const key = new TextEncoder().encode(secret)
  if (key.byteLength < 32) {
    throw new Error('O segredo de descadastro deve ter pelo menos 32 caracteres.')
  }
  return key
}

export function normalizeSuppressionEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(normalized)) throw new Error('E-mail inválido para descadastro.')
  return normalized
}

function campaignId(value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error('Campanha inválida para descadastro.')
  return normalized
}

export async function createUnsubscribeToken(
  input: UnsubscribeTokenInput,
  secret: string,
): Promise<string> {
  const email = normalizeSuppressionEmail(input.email)
  const campaign = campaignId(input.campaignId)

  return new SignJWT({ email, campaignId: campaign, purpose: 'unsubscribe' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('180d')
    .sign(signingKey(secret))
}

export async function verifyUnsubscribeToken(token: string, secret: string): Promise<UnsubscribeTokenClaims> {
  const { payload } = await jwtVerify(token, signingKey(secret), {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
  })

  if (payload.purpose !== 'unsubscribe' || typeof payload.email !== 'string' || typeof payload.campaignId !== 'string') {
    throw new Error('Token de descadastro inválido.')
  }

  return {
    email: normalizeSuppressionEmail(payload.email),
    campaignId: campaignId(payload.campaignId),
    purpose: 'unsubscribe',
  }
}
