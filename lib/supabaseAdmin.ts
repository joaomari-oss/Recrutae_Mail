/**
 * Server-side Supabase admin client.
 * Uses SUPABASE_SERVICE_ROLE_KEY — bypasses RLS.
 * NEVER import this file from client components or pages.
 * Only use in API routes (app/api/**).
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export const supabaseAdmin =
  url && serviceRoleKey
    ? createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

/** True when the admin client is available (service role key is set). */
export const isAdminConfigured = () => !!supabaseAdmin
