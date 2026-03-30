-- ---------------------------------------------------------------------------
-- local_sessions: Stores IDE/CLI session metadata synced from bridge
-- Allows Vercel API to show desktop sessions without filesystem access
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS local_sessions (
  id TEXT PRIMARY KEY,              -- Session UUID
  repo_path TEXT NOT NULL,          -- Original repo path (e.g., /Users/foo/bar)
  repo_name TEXT NOT NULL,          -- Short name (e.g., bar)
  preview TEXT,                     -- First user message preview
  message_count INTEGER DEFAULT 0,  -- Number of messages
  last_activity_at TIMESTAMPTZ,     -- Last activity timestamp
  synced_at TIMESTAMPTZ DEFAULT NOW() -- When this was synced
);

-- Index for ordering by activity
CREATE INDEX IF NOT EXISTS idx_local_sessions_activity ON local_sessions (last_activity_at DESC);

-- Index for filtering by repo
CREATE INDEX IF NOT EXISTS idx_local_sessions_repo ON local_sessions (repo_path);

-- Enable RLS but allow service role full access
ALTER TABLE local_sessions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role has full access to local_sessions"
  ON local_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Enable realtime for live updates (optional)
ALTER PUBLICATION supabase_realtime ADD TABLE local_sessions;
