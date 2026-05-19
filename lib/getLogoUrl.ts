import { LOGO_DATA_URI } from './logoBase64'

/**
 * Returns the best logo URL for use in email HTML.
 * Gmail blocks data: URIs, so we prefer a real HTTPS URL when available.
 * Priority:
 *   1. NEXT_PUBLIC_SITE_URL (set manually in Vercel for custom domains)
 *   2. VERCEL_PROJECT_PRODUCTION_URL (Vercel auto-sets stable production URL)
 *   3. VERCEL_URL (Vercel auto-sets deployment-specific URL)
 *   4. data: URI fallback (works in non-Gmail clients)
 */
export function getLogoUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (explicit) return `${explicit}/recrutae.webp`

  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (prod) return `https://${prod}/recrutae.webp`

  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}/recrutae.webp`

  return LOGO_DATA_URI
}
