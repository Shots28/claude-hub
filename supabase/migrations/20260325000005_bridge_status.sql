-- Bridge status: dedicated table for bridge heartbeat
-- Updated every 15s by the local bridge process
CREATE TABLE IF NOT EXISTS public.bridge_status (
  id TEXT PRIMARY KEY DEFAULT 'default',
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'online'
);
