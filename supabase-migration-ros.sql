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

create table if not exists ros_send_attempts (
  campaign_id     text not null references client_campaigns(id) on delete cascade,
  contact_id      text not null references client_contacts(id) on delete cascade,
  payload         text not null,
  idempotency_key text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (campaign_id, contact_id)
);

alter table ros_send_attempts enable row level security;
revoke all on table ros_send_attempts from public;
revoke all on table ros_send_attempts from anon, authenticated;
grant select, insert, update, delete on table ros_send_attempts to service_role;

do $$ declare policy_row record;
begin
  for policy_row in
    select polname from pg_policy where polrelid = 'ros_send_attempts'::regclass
  loop
    execute format('drop policy %I on ros_send_attempts', policy_row.polname);
  end loop;
end $$;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_contacts' and column_name = 'send_payload'
  ) then
    insert into ros_send_attempts (campaign_id, contact_id, payload, idempotency_key)
    select campaign_id, id, send_payload, 'ros/' || campaign_id || '/' || id
    from client_contacts
    where send_payload is not null and send_payload <> ''
    on conflict (campaign_id, contact_id) do nothing;

    alter table client_contacts drop column if exists send_payload;
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

-- Resend/Svix assigns one identifier per delivery. Existing historic rows keep
-- NULL and remain valid; new webhook deliveries are atomically idempotent.
alter table email_events add column if not exists delivery_id text;
create unique index if not exists email_events_delivery_id_unique
  on email_events(delivery_id) where delivery_id is not null;
