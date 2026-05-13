-- Run this in your Supabase SQL Editor
-- Project: Recrutaê Mail — Client Campaigns

create extension if not exists "uuid-ossp";

create table if not exists client_campaigns (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  recruiter_name text not null,
  recruiter_email text not null,
  segment text not null,
  key_points text,
  status text default 'draft' check (status in ('draft','generating','ready','sending','completed')),
  contact_count int default 0,
  sent_count int default 0,
  failed_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists client_contacts (
  id uuid default gen_random_uuid() primary key,
  campaign_id uuid references client_campaigns(id) on delete cascade,
  name text,
  first_name text,
  email text not null,
  company text,
  position text,
  status text default 'pending' check (status in ('pending','generating','ready','approved','sending','sent','failed')),
  generated_subject text,
  generated_body text,
  edited_subject text,
  edited_body text,
  message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- Auto-update updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger client_campaigns_updated_at
  before update on client_campaigns
  for each row execute function update_updated_at();

-- Enable RLS (optional — disable for internal tools)
-- alter table client_campaigns enable row level security;
-- alter table client_contacts enable row level security;
