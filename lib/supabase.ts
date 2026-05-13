import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export const isSupabaseConfigured = () => !!supabase

export type DbClientCampaign = {
  id: string
  name: string
  recruiter_name: string
  recruiter_email: string
  segment: string
  key_points: string | null
  status: string
  contact_count: number
  sent_count: number
  failed_count: number
  created_at: string
  updated_at: string
}

export type DbClientContact = {
  id: string
  campaign_id: string
  name: string | null
  first_name: string | null
  email: string
  company: string | null
  position: string | null
  status: string
  generated_subject: string | null
  generated_body: string | null
  edited_subject: string | null
  edited_body: string | null
  message_id: string | null
  error_message: string | null
  sent_at: string | null
  created_at: string
}
