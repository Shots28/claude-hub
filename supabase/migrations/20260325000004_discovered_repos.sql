-- Discovered repos: local bridge scans filesystem and syncs here
-- so the Vercel-hosted frontend can read them
CREATE TABLE public.discovered_repos (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
