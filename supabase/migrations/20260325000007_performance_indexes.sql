-- Performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_instance_created
  ON public.chat_messages(instance_id, created_at);
CREATE INDEX IF NOT EXISTS idx_instances_status
  ON public.instances(status);
CREATE INDEX IF NOT EXISTS idx_instances_repo_path
  ON public.instances(repo_path);
