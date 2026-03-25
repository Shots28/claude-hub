-- Add users table for auth (replaces the simple auth table)
-- Single-user app but designed to be extensible

CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Drop old auth table if it exists (was placeholder)
DROP TABLE IF EXISTS public.auth CASCADE;
