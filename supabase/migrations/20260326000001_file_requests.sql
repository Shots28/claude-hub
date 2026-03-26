-- File requests: frontend → Supabase → bridge file reading relay
CREATE TABLE IF NOT EXISTS public.file_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id TEXT NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | completed | error
  content TEXT,                            -- file contents (null until completed, max ~1MB)
  error_message TEXT,                      -- error details if status=error
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Index for bridge polling/subscription
CREATE INDEX idx_file_requests_status ON public.file_requests(instance_id, status);

-- Index for cleanup sweep (completed requests older than 1 hour)
CREATE INDEX idx_file_requests_completed ON public.file_requests(completed_at) WHERE completed_at IS NOT NULL;

-- Required for Supabase Realtime UPDATE subscriptions
ALTER TABLE public.file_requests REPLICA IDENTITY FULL;

-- Disable RLS (single-user app, same as other tables)
ALTER TABLE public.file_requests DISABLE ROW LEVEL SECURITY;

-- Add to Realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.file_requests;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- already added
  END;
END $$;
