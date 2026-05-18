import { NextResponse } from 'next/server'
import { Client } from 'pg'

// One-time migration endpoint.
// Requires DATABASE_URL in .env.local — get it from:
// Supabase dashboard → Project Settings → Database → Connection string → URI (direct connection)
// Example: postgresql://postgres.xxxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres

const MIGRATION_SQL = `
-- 1. Drop FK so we can alter referenced column
ALTER TABLE client_contacts DROP CONSTRAINT IF EXISTS client_contacts_campaign_id_fkey;

-- 2. Change ID columns from uuid → text (allows prefixed IDs like "campaign-uuid")
ALTER TABLE client_campaigns ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE client_contacts  ALTER COLUMN id          TYPE text USING id::text;
ALTER TABLE client_contacts  ALTER COLUMN campaign_id TYPE text USING campaign_id::text;

-- 3. Recreate FK
ALTER TABLE client_contacts ADD CONSTRAINT client_contacts_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES client_campaigns(id) ON DELETE CASCADE;

-- 4. Enable RLS (idempotent)
ALTER TABLE client_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contacts  ENABLE ROW LEVEL SECURITY;

-- 5. Drop + recreate permissive policies so the anon key can insert/update
DROP POLICY IF EXISTS "recrutae_all_campaigns" ON client_campaigns;
CREATE POLICY "recrutae_all_campaigns" ON client_campaigns FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "recrutae_all_contacts" ON client_contacts;
CREATE POLICY "recrutae_all_contacts" ON client_contacts FOR ALL USING (true) WITH CHECK (true);
`

export async function GET() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    return NextResponse.json(
      {
        success: false,
        error: 'DATABASE_URL não configurada. Adicione ao .env.local:\n' +
          'DATABASE_URL=postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:5432/postgres\n' +
          '(Supabase → Project Settings → Database → Connection string → URI)',
      },
      { status: 500 }
    )
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    await client.query(MIGRATION_SQL)
    await client.end()
    return NextResponse.json({ success: true, message: 'Migration executada com sucesso.' })
  } catch (err) {
    await client.end().catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[migrate]', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
