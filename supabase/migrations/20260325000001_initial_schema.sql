-- Claude Hub initial schema
-- All tables in public schema, accessed via service_role key (single-user app)

-- Instances: one per Claude Code instance
CREATE TABLE public.instances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'stopped',
  current_session_id TEXT,
  permission_mode TEXT NOT NULL DEFAULT 'default',
  allowed_tools TEXT DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessions: track history per instance
CREATE TABLE public.sessions (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  title TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ
);
CREATE INDEX idx_sessions_instance ON public.sessions(instance_id);

-- Messages: read-optimized cache (source of truth = SDK .jsonl files)
CREATE TABLE public.messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  instance_id TEXT NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tool_calls JSONB,
  message_seq INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_session ON public.messages(session_id);
CREATE UNIQUE INDEX idx_messages_seq ON public.messages(session_id, message_seq);

-- Auth: single-user password (JWT secret stored outside DB)
CREATE TABLE public.auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auth reset tokens
CREATE TABLE public.auth_reset_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Permission requests: pending tool approvals
CREATE TABLE public.permission_requests (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_input JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  timeout_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_permission_requests_instance ON public.permission_requests(instance_id);
CREATE INDEX idx_permission_requests_status ON public.permission_requests(status);

-- Chat messages for realtime relay (phone → supabase → bridge)
-- This enables the Supabase Realtime pattern used by the bridge
CREATE TABLE public.chat_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  instance_id TEXT NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'streaming' | 'done' | 'error'
  tool_calls JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_messages_instance ON public.chat_messages(instance_id);
CREATE INDEX idx_chat_messages_status ON public.chat_messages(status);

-- Enable Realtime on chat_messages for the bridge relay pattern
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.permission_requests;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER instances_updated_at
  BEFORE UPDATE ON public.instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER chat_messages_updated_at
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
