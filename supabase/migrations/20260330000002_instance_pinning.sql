-- Instance pinning — pinned instances sort to top
ALTER TABLE instances ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
