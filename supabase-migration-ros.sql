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

-- Somente servidor. Sem o revoke, a RLS sem policy devolveria conjunto vazio
-- *sem erro* para o anon, e a checagem de supressao falharia aberta: quem se
-- descadastrou voltaria a receber e-mail.
alter table email_suppressions enable row level security;
revoke all on table email_suppressions from public;
revoke all on table email_suppressions from anon, authenticated;
grant select, insert, update, delete on table email_suppressions to service_role;

create index if not exists idx_client_campaigns_kind_created on client_campaigns(campaign_kind, created_at desc);
-- Not unique: preserve existing data; import/send flows handle duplicate contacts.
create index if not exists idx_client_contacts_campaign_email on client_contacts(campaign_id, lower(email));

-- A migracao roda em uma transacao na SQL Editor: sem garantir a tabela aqui,
-- um banco sem email_events desfaria o script inteiro no alter abaixo.
create table if not exists email_events (
  id              uuid        default gen_random_uuid() primary key,
  message_id      text        not null,
  campaign_id     text,
  contact_id      text,
  recipient_email text,
  event_type      text        not null default 'opened',
  delivery_id     text,
  received_at     timestamptz default now()
);

-- Resend/Svix assigns one identifier per delivery. Existing historic rows keep
-- NULL and remain valid; new webhook deliveries are atomically idempotent.
alter table email_events add column if not exists delivery_id text;
create unique index if not exists email_events_delivery_id_unique
  on email_events(delivery_id) where delivery_id is not null;

-- ------------------------------------------------------------
-- Isolamento das linhas ROS da chave publica.
--
-- `client_campaigns` e `client_contacts` sao compartilhadas com Candidatos e
-- Clientes, cujas telas leem direto do navegador com a chave anon. As politicas
-- antigas liberavam a tabela inteira, entao qualquer pessoa com o bundle lia o
-- destinatario e o corpo dos e-mails de divulgacao.
--
-- As politicas abaixo preservam exatamente o acesso de Clientes/Candidatos e
-- tiram as linhas ROS do alcance publico. O service_role ignora RLS, entao as
-- rotas de servidor do ROS continuam funcionando.
-- ------------------------------------------------------------
alter table client_campaigns enable row level security;
alter table client_contacts  enable row level security;

drop policy if exists "recrutae_all_campaigns" on client_campaigns;
create policy "recrutae_all_campaigns"
  on client_campaigns for all
  to anon, authenticated
  using (campaign_kind is distinct from 'ros')
  with check (campaign_kind is distinct from 'ros');

-- A subconsulta de uma policy tambem respeita a RLS da tabela consultada: para
-- o anon a campanha ROS some, o `not exists` da verdadeiro e o contato ROS
-- ficaria liberado. Esta funcao le sem RLS e fecha esse caminho.
create or replace function public.is_ros_campaign(p_campaign_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_campaigns c
    where c.id = p_campaign_id and c.campaign_kind = 'ros'
  );
$$;
revoke all on function public.is_ros_campaign(text) from public;
grant execute on function public.is_ros_campaign(text) to anon, authenticated, service_role;

drop policy if exists "recrutae_all_contacts" on client_contacts;
create policy "recrutae_all_contacts"
  on client_contacts for all
  to anon, authenticated
  using (not public.is_ros_campaign(campaign_id))
  with check (not public.is_ros_campaign(campaign_id));
