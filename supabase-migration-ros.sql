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
