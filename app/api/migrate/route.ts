import { NextResponse } from 'next/server'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

// One-time migration endpoint.
// Uses the Supabase JS client (HTTPS) — no direct DB connection needed.
// Hit GET /api/migrate to verify tables exist and are accessible.

// SQL to run manually in Supabase SQL Editor if tables are missing:
// https://supabase.com/dashboard → your project → SQL Editor
const SCHEMA_SQL = `
-- Execute no Supabase SQL Editor:
-- https://supabase.com/dashboard → seu projeto → SQL Editor

create extension if not exists "uuid-ossp";

create table if not exists client_campaigns (
  id            text        primary key,
  name          text        not null,
  recruiter_name text       not null default '',
  recruiter_email text      not null default '',
  segment       text        not null default '',
  key_points    text,
  status        text        not null default 'draft',
  contact_count integer     not null default 0,
  sent_count    integer     not null default 0,
  failed_count  integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists client_contacts (
  id               text        primary key,
  campaign_id      text        not null references client_campaigns(id) on delete cascade,
  name             text,
  first_name       text,
  email            text        not null,
  company          text,
  position         text,
  status           text        not null default 'pending',
  generated_subject text,
  generated_body   text,
  edited_subject   text,
  edited_body      text,
  message_id       text,
  error_message    text,
  sent_at          timestamptz,
  created_at       timestamptz not null default now()
);

-- Se as tabelas já existem com colunas uuid, converta para text:
alter table if exists client_campaigns alter column id type text using id::text;
alter table if exists client_contacts  alter column id type text using id::text;
alter table if exists client_contacts  alter column campaign_id type text using campaign_id::text;

-- RLS — permite que a chave anon leia e escreva:
alter table client_campaigns enable row level security;
alter table client_contacts  enable row level security;
drop policy if exists "recrutae_all_campaigns" on client_campaigns;
create policy "recrutae_all_campaigns" on client_campaigns for all using (true) with check (true);
drop policy if exists "recrutae_all_contacts" on client_contacts;
create policy "recrutae_all_contacts" on client_contacts for all using (true) with check (true);
`

export async function GET() {
  if (!isSupabaseConfigured() || !supabase) {
    return NextResponse.json(
      {
        success: false,
        error:
          'NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY não configurados no Vercel.',
      },
      { status: 500 }
    )
  }

  // Check client_campaigns
  const { error: campErr } = await supabase
    .from('client_campaigns')
    .select('id')
    .limit(0)

  // Check client_contacts
  const { error: contErr } = await supabase
    .from('client_contacts')
    .select('id')
    .limit(0)

  if (campErr || contErr) {
    const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
      .replace('https://', '')
      .replace('.supabase.co', '')

    return NextResponse.json(
      {
        success: false,
        action_required: true,
        message:
          'Tabelas não encontradas ou sem permissão de acesso. ' +
          'Execute o SQL abaixo no Supabase SQL Editor e acesse /api/migrate novamente.',
        sql_editor_url: projectRef
          ? `https://supabase.com/dashboard/project/${projectRef}/sql/new`
          : 'https://supabase.com/dashboard',
        schema_sql: SCHEMA_SQL,
        errors: {
          client_campaigns: campErr?.message ?? null,
          client_contacts: contErr?.message ?? null,
        },
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    message: 'Banco de dados OK. Tabelas client_campaigns e client_contacts existem e estão acessíveis.',
  })
}
