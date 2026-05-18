-- Migration: change ID columns from uuid → text
-- Required because the app generates IDs with string prefixes
-- (e.g. 'campaign-uuid', 'candidate-uuid') that are not valid PostgreSQL uuids.
-- Run this once in your Supabase SQL Editor.

-- 1. Drop the foreign key constraint so we can alter the referenced column
ALTER TABLE client_contacts DROP CONSTRAINT IF EXISTS client_contacts_campaign_id_fkey;

-- 2. Change column types (cast existing data if any rows exist)
ALTER TABLE client_campaigns ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE client_contacts  ALTER COLUMN id          TYPE text USING id::text;
ALTER TABLE client_contacts  ALTER COLUMN campaign_id TYPE text USING campaign_id::text;

-- 3. Recreate the foreign key
ALTER TABLE client_contacts ADD CONSTRAINT client_contacts_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES client_campaigns(id) ON DELETE CASCADE;
