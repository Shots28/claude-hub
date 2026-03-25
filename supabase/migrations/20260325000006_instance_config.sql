ALTER TABLE public.instances ADD COLUMN IF NOT EXISTS model TEXT DEFAULT 'sonnet';
ALTER TABLE public.instances ADD COLUMN IF NOT EXISTS max_thinking_tokens INTEGER DEFAULT 0;
