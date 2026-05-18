import { NextResponse } from 'next/server'
import { supabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

// Migration/health-check endpoint.
// Uses the admin client (service role key) when available — bypasses RLS.
// Fallback to anon client if admin key not set.
// Hit GET /api/migrate to verify setup and diagnose problems.

const SCHEMA_SQL = `
-- Execute no Supabase SQL Editor:
-- https://supabase.com/dashboard → seu projeto → SQL Editor

create extension if not exists "uuid-ossp";

-- Tabela de campanhas para clientes B2B
create table if not exists client_campaigns (
  id            text        primary key,
  name          text        not null,
  recruiter_name  text      not null default '',
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

-- Tabela de contatos das campanhas
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

-- Migração segura: converte uuid → text se necessário
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name='client_campaigns' and column_name='id' and data_type='uuid'
  ) then
    alter table client_campaigns alter column id type text using id::text;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_name='client_contacts' and column_name='id' and data_type='uuid'
  ) then
    alter table client_contacts alter column id type text using id::text;
    alter table client_contacts alter column campaign_id type text using campaign_id::text;
  end if;
end $$;

-- RLS — habilita e cria políticas permissivas (necessário para chave anon)
alter table client_campaigns enable row level security;
alter table client_contacts  enable row level security;
drop policy if exists "recrutae_all_campaigns" on client_campaigns;
create policy "recrutae_all_campaigns" on client_campaigns
  for all to anon, authenticated using (true) with check (true);
drop policy if exists "recrutae_all_contacts" on client_contacts;
create policy "recrutae_all_contacts" on client_contacts
  for all to anon, authenticated using (true) with check (true);
`

export async function GET() {
  // Pick the best available client
  const db = supabaseAdmin ?? supabase
  const usingAdmin = isAdminConfigured()

  if (!db || !isSupabaseConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error:
          'NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY não configurados no Vercel. ' +
          'Configure também SUPABASE_SERVICE_ROLE_KEY para melhor segurança.',
      },
      { status: 500 }
    )
  }

  // Check tables exist
  const { error: campErr } = await db.from('client_campaigns').select('id').limit(0)
  const { error: contErr } = await db.from('client_contacts').select('id').limit(0)

  if (campErr || contErr) {
    const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
      .replace('https://', '')
      .replace('.supabase.co', '')

    return NextResponse.json(
      {
        success: false,
        action_required: true,
        message:
          'Tabelas não encontradas ou sem permissão. ' +
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

  // Test write: insert a probe row then immediately delete it
  const probeId = `_migrate_probe_${Date.now()}`
  const { error: insertErr } = await db.from('client_campaigns').insert({
    id: probeId,
    name: '__probe__',
    status: 'draft',
    contact_count: 0,
    sent_count: 0,
    failed_count: 0,
  })

  if (insertErr) {
    const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
      .replace('https://', '')
      .replace('.supabase.co', '')

    return NextResponse.json(
      {
        success: false,
        action_required: true,
        message:
          'Tabelas existem mas escrita falhou (provável problema de RLS). ' +
          'Execute o SQL de RLS abaixo no Supabase SQL Editor e acesse /api/migrate novamente.' +
          (usingAdmin ? '' : ' Configure também SUPABASE_SERVICE_ROLE_KEY para bypass automático de RLS.'),
        sql_editor_url: projectRef
          ? `https://supabase.com/dashboard/project/${projectRef}/sql/new`
          : 'https://supabase.com/dashboard',
        schema_sql: SCHEMA_SQL,
        write_error: insertErr.message,
        using_admin_client: usingAdmin,
      },
      { status: 500 }
    )
  }

  // Cleanup probe row
  await db.from('client_campaigns').delete().eq('id', probeId)

  return NextResponse.json({
    success: true,
    message: `Banco de dados OK. Tabelas existem e escrita funciona.${usingAdmin ? ' Admin client (service role) ativo.' : ' Usando chave anon.'}`,
    using_admin_client: usingAdmin,
  })
}

