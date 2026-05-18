import { NextResponse } from 'next/server'
import { Client } from 'pg'

// One-time migration endpoint.
// Requires DATABASE_URL in Vercel env vars — get it from:
// Supabase → Project Settings → Database → Connection string → URI
// Example: postgresql://postgres.xxxx:PASSWORD@aws-0-sa-east-1.pooler.supabase.com:6543/postgres

const MIGRATION_SQL = `
DO $$
BEGIN

  -- ── Create tables if they don't exist yet (with text PKs from the start) ──────

  CREATE TABLE IF NOT EXISTS client_campaigns (
    id            text        PRIMARY KEY,
    name          text        NOT NULL,
    recruiter_name text       NOT NULL DEFAULT '',
    recruiter_email text      NOT NULL DEFAULT '',
    segment       text        NOT NULL DEFAULT '',
    key_points    text,
    status        text        NOT NULL DEFAULT 'draft',
    contact_count integer     NOT NULL DEFAULT 0,
    sent_count    integer     NOT NULL DEFAULT 0,
    failed_count  integer     NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS client_contacts (
    id               text        PRIMARY KEY,
    campaign_id      text        NOT NULL,
    name             text,
    first_name       text,
    email            text        NOT NULL,
    company          text,
    position         text,
    status           text        NOT NULL DEFAULT 'pending',
    generated_subject text,
    generated_body   text,
    edited_subject   text,
    edited_body      text,
    message_id       text,
    error_message    text,
    sent_at          timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now()
  );

  -- ── If tables already existed with uuid columns, migrate them to text ─────────

  -- Drop FK first (may not exist)
  ALTER TABLE client_contacts DROP CONSTRAINT IF EXISTS client_contacts_campaign_id_fkey;

  -- Alter campaign id
  BEGIN
    ALTER TABLE client_campaigns ALTER COLUMN id TYPE text USING id::text;
  EXCEPTION WHEN others THEN NULL;
  END;

  -- Alter contact id
  BEGIN
    ALTER TABLE client_contacts ALTER COLUMN id TYPE text USING id::text;
  EXCEPTION WHEN others THEN NULL;
  END;

  -- Alter contact campaign_id
  BEGIN
    ALTER TABLE client_contacts ALTER COLUMN campaign_id TYPE text USING campaign_id::text;
  EXCEPTION WHEN others THEN NULL;
  END;

  -- Recreate FK (drop first to be safe)
  ALTER TABLE client_contacts DROP CONSTRAINT IF EXISTS client_contacts_campaign_id_fkey;
  ALTER TABLE client_contacts ADD CONSTRAINT client_contacts_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES client_campaigns(id) ON DELETE CASCADE;

  -- ── RLS: enable + permissive policies so anon key can read/write ──────────────

  ALTER TABLE client_campaigns ENABLE ROW LEVEL SECURITY;
  ALTER TABLE client_contacts  ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "recrutae_all_campaigns" ON client_campaigns;
  CREATE POLICY "recrutae_all_campaigns" ON client_campaigns FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "recrutae_all_contacts" ON client_contacts;
  CREATE POLICY "recrutae_all_contacts" ON client_contacts FOR ALL USING (true) WITH CHECK (true);

END $$;
`

export async function GET() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    return NextResponse.json(
      {
        success: false,
        error: 'DATABASE_URL não configurada no Vercel. Adicione em Settings → Environment Variables.\n' +
          'Valor: Supabase → Project Settings → Database → Connection string → URI',
      },
      { status: 500 }
    )
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  })

  try {
    await client.connect()
    await client.query(MIGRATION_SQL)
    await client.end()
    return NextResponse.json({
      success: true,
      message: 'Migration executada com sucesso. Tabelas criadas/atualizadas, RLS configurado.',
    })
  } catch (err) {
    await client.end().catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[migrate]', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
