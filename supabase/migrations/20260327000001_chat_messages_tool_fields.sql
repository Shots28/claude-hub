-- Add tool_name, tool_id, and is_error columns to chat_messages
-- These are used to display tool calls as distinct activity items in the UI

ALTER TABLE public.chat_messages
ADD COLUMN IF NOT EXISTS tool_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tool_id TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_error BOOLEAN DEFAULT FALSE;

-- Index for filtering tool calls
CREATE INDEX IF NOT EXISTS idx_chat_messages_tool_name
  ON public.chat_messages(tool_name)
  WHERE tool_name IS NOT NULL;
