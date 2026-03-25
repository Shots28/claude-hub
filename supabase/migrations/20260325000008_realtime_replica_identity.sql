-- Ensure Realtime publication includes the required tables
-- (idempotent: will no-op if already added, or we catch the error)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- already added
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.instances;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.permission_requests;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- Set REPLICA IDENTITY FULL so UPDATE events include the full row
-- (required for Supabase Realtime postgres_changes UPDATE subscriptions)
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.instances REPLICA IDENTITY FULL;
ALTER TABLE public.permission_requests REPLICA IDENTITY FULL;

-- Ensure RLS is disabled for single-user app (anon key needs access for Realtime)
ALTER TABLE public.chat_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.instances DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_requests DISABLE ROW LEVEL SECURITY;
