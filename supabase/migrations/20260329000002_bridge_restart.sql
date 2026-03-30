-- Add restart_requested_at to bridge_status for remote restart support
-- When set to a recent timestamp, the bridge will gracefully exit
-- and the wrapper script (bridge.sh) will restart it automatically
ALTER TABLE public.bridge_status
  ADD COLUMN IF NOT EXISTS restart_requested_at TIMESTAMPTZ;

-- Enable Realtime on bridge_status so the bridge can detect restart requests
ALTER TABLE public.bridge_status REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE bridge_status;
