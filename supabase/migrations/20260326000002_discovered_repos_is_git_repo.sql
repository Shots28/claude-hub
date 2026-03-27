-- Add is_git_repo column to discovered_repos table
-- This allows showing all folders, not just git repos, while still indicating which are repos

ALTER TABLE public.discovered_repos
ADD COLUMN IF NOT EXISTS is_git_repo BOOLEAN NOT NULL DEFAULT false;
