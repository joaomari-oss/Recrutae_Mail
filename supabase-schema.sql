-- ============================================================
-- Recrutaê Mail — Schema Supabase
-- Execute no SQL Editor: https://supabase.com/dashboard → seu projeto → SQL Editor
-- Este script é IDEMPOTENTE: seguro para rodar mais de uma vez.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- Tabela de campanhas B2B (envio para empresas/clientes)
-- ------------------------------------------------------------
create table if not exists client_campaigns (
  id              text        primary key,
  name            text        not null,
  recruiter_name  text        not null default '',
  recruiter_email text        not null default '',
  segment         text        not null default '',
  key_points      text,
  status          text        not null default 'draft',
  contact_count   integer     not null default 0,
  sent_count      integer     not null default 0,
  failed_count    integer     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Tabela de contatos das campanhas B2B
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Migração segura: converte colunas uuid → text (se ainda forem uuid)
-- Necessário se as tabelas foram criadas com um schema antigo.
-- ------------------------------------------------------------
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'client_campaigns'
      and column_name = 'id'
      and data_type = 'uuid'
  ) then
    alter table client_campaigns alter column id type text using id::text;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_name = 'client_contacts'
      and column_name = 'id'
      and data_type = 'uuid'
  ) then
    alter table client_contacts drop constraint if exists client_contacts_campaign_id_fkey;
    alter table client_contacts alter column id          type text using id::text;
    alter table client_contacts alter column campaign_id type text using campaign_id::text;
    alter table client_contacts
      add constraint client_contacts_campaign_id_fkey
      foreign key (campaign_id) references client_campaigns(id) on delete cascade;
  end if;
end $$;

-- Auto-update updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists client_campaigns_updated_at on client_campaigns;
create trigger client_campaigns_updated_at
  before update on client_campaigns
  for each row execute function update_updated_at();

-- ------------------------------------------------------------
-- Row Level Security (RLS)
-- O backend usa SUPABASE_SERVICE_ROLE_KEY (bypass automático).
-- As políticas abaixo permitem leitura/escrita pela chave anon também.
-- ------------------------------------------------------------
alter table client_campaigns enable row level security;
alter table client_contacts  enable row level security;

drop policy if exists "recrutae_all_campaigns" on client_campaigns;
create policy "recrutae_all_campaigns"
  on client_campaigns for all
  to anon, authenticated
  using (true) with check (true);

drop policy if exists "recrutae_all_contacts" on client_contacts;
create policy "recrutae_all_contacts"
  on client_contacts for all
  to anon, authenticated
  using (true) with check (true);

-- ------------------------------------------------------------
-- Índices para performance
-- ------------------------------------------------------------
create index if not exists idx_client_contacts_campaign_id on client_contacts(campaign_id);
create index if not exists idx_client_contacts_status       on client_contacts(status);
create index if not exists idx_client_campaigns_status      on client_campaigns(status);
create index if not exists idx_client_campaigns_created_at  on client_campaigns(created_at desc);

-- ──────────────────────────────────────────────────────────────────────────────
-- Email open/click events (populated by Resend webhooks)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists email_events (
  id              uuid        default gen_random_uuid() primary key,
  message_id      text        not null,
  campaign_id     text,
  recipient_email text,
  event_type      text        not null default 'opened',
  received_at     timestamptz default now()
);

create index if not exists email_events_campaign_id_idx on email_events(campaign_id);
create index if not exists email_events_message_id_idx  on email_events(message_id);
create index if not exists email_events_received_at_idx on email_events(received_at desc);

-- ------------------------------------------------------------
-- Verificação final
-- ------------------------------------------------------------
select
  'client_campaigns' as tabela,
  count(*) as linhas
from client_campaigns
union all
select
  'client_contacts' as tabela,
  count(*) as linhas
from client_contacts
union all
select
  'email_events' as tabela,
  count(*) as linhas
from email_events;

