-- Add jwt_generation counter to users table for server-side logout invalidation
-- When user logs out, increment this counter. JWT tokens include the generation
-- number at sign time; if it doesn't match on verify, the token is rejected.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS jwt_generation INTEGER NOT NULL DEFAULT 1;

-- Change allowed_tools from TEXT to JSONB for proper typing
ALTER TABLE public.instances ALTER COLUMN allowed_tools DROP DEFAULT;
ALTER TABLE public.instances ALTER COLUMN allowed_tools TYPE JSONB USING allowed_tools::jsonb;
ALTER TABLE public.instances ALTER COLUMN allowed_tools SET DEFAULT '[]'::jsonb;
