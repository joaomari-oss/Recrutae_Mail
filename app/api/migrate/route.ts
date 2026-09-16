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
  send_payload     text,
  created_at       timestamptz not null default now()
);

alter table client_contacts add column if not exists send_payload text;

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

-- Garantir defaults em colunas NOT NULL (tabelas criadas com schema antigo podem não ter)
alter table client_campaigns alter column recruiter_name  set default '';
alter table client_campaigns alter column recruiter_email set default '';
alter table client_campaigns alter column segment         set default '';
alter table client_campaigns alter column status          set default 'draft';
alter table client_campaigns alter column contact_count   set default 0;
alter table client_campaigns alter column sent_count      set default 0;
alter table client_campaigns alter column failed_count    set default 0;

-- RLS — habilita e cria políticas permissivas (necessário para chave anon)
alter table client_campaigns enable row level security;
alter table client_contacts  enable row level security;
drop policy if exists "recrutae_all_campaigns" on client_campaigns;
create policy "recrutae_all_campaigns" on client_campaigns
  for all to anon, authenticated using (true) with check (true);
drop policy if exists "recrutae_all_contacts" on client_contacts;
create policy "recrutae_all_contacts" on client_contacts
  for all to anon, authenticated using (true) with check (true);

-- Divulgação ROS: additive and safe to run repeatedly.
alter table client_campaigns add column if not exists campaign_kind text not null default 'clients';
alter table client_campaigns add column if not exists recruiter_role text not null default '';
alter table client_campaigns add column if not exists recruiter_linkedin text not null default '';
alter table client_campaigns add column if not exists recruiter_whatsapp text not null default '';
alter table client_campaigns add column if not exists reply_to text not null default '';
alter table client_campaigns add column if not exists subject_template text not null default '';
alter table client_campaigns add column if not exists vary_subject boolean not null default false;
alter table client_campaigns add column if not exists variation_percent smallint not null default 6;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'client_campaigns_kind_check' and conrelid = 'client_campaigns'::regclass
  ) then
    alter table client_campaigns add constraint client_campaigns_kind_check
      check (campaign_kind in ('clients', 'ros'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'client_campaigns_variation_check' and conrelid = 'client_campaigns'::regclass
  ) then
    alter table client_campaigns add constraint client_campaigns_variation_check
      check (variation_percent between 5 and 8);
  end if;
end $$;

create table if not exists email_suppressions (
  email text primary key,
  reason text not null check (reason in ('unsubscribe', 'bounce', 'complaint')),
  source text not null,
  message_id text,
  created_at timestamptz not null default now()
);

-- Server/service-role access only: deliberately no anon/authenticated policy.
alter table email_suppressions enable row level security;

create index if not exists idx_client_campaigns_kind_created on client_campaigns(campaign_kind, created_at desc);
-- Not unique: preserve existing data; import/send flows handle duplicate contacts.
create index if not exists idx_client_contacts_campaign_email on client_contacts(campaign_id, lower(email));

create table if not exists email_events (
  id uuid default gen_random_uuid() primary key,
  message_id text not null,
  campaign_id text,
  contact_id text,
  recipient_email text,
  event_type text not null default 'opened',
  delivery_id text,
  received_at timestamptz default now()
);
alter table email_events add column if not exists contact_id text;
alter table email_events add column if not exists delivery_id text;
create unique index if not exists email_events_delivery_id_unique
  on email_events(delivery_id) where delivery_id is not null;
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
  const { error: campErr } = await db.from('client_campaigns')
    .select('id, campaign_kind, recruiter_role, recruiter_linkedin, recruiter_whatsapp, reply_to, subject_template, vary_subject, variation_percent').limit(0)
  const { error: contErr } = await db.from('client_contacts').select('id').limit(0)
  // Suppressions intentionally have no anon/authenticated policy. An anon
  // health check must not mistake that expected denial for a missing table.
  const { error: suppressionErr } = usingAdmin
    ? await db.from('email_suppressions').select('email, reason, source, message_id, created_at').limit(0)
    : { error: null }
  const { error: eventsErr } = await db.from('email_events').select('contact_id, campaign_id, event_type, received_at').limit(0)

  if (campErr || contErr || suppressionErr || eventsErr) {
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
          email_suppressions: suppressionErr?.message ?? null,
          email_events: eventsErr?.message ?? null,
        },
      },
      { status: 500 }
    )
  }

  // Test write: insert a probe row then immediately delete it.
  // Include all NOT NULL fields so the insert works regardless of whether
  // the column defaults have been applied via the migration SQL.
  const probeId = crypto.randomUUID()
  const { error: insertErr } = await db.from('client_campaigns').insert({
    id: probeId,
    name: '__probe__',
    recruiter_name: '',
    recruiter_email: '',
    segment: '',
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

