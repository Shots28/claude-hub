-- Bridge status: dedicated table for bridge heartbeat
-- Updated every 15s by the local bridge process
-- Single-row table: only one bridge per deployment
CREATE TABLE IF NOT EXISTS public.bridge_status (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'offline'
);

-- Guarantee row exists immediately after migration
INSERT INTO public.bridge_status (id, status) VALUES ('default', 'offline')
ON CONFLICT (id) DO NOTHING;
