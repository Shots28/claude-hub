// ---------------------------------------------------------------------------
// Claude Hub — Shared TypeScript Types
// ---------------------------------------------------------------------------

// ---- Instance (Claude Code process) ----

export type InstanceStatus = "idle" | "running" | "stopped" | "error" | "queued";

export type PermissionMode = "bypassPermissions" | "acceptEdits" | "plan" | "default";

export interface PendingPermission {
  id: string;
  toolName: string;
  input: ToolInput;
  requestedAt: string; // ISO-8601
}

export interface InstanceState {
  id: string;
  name: string;
  repoPath: string;
  status: InstanceStatus;
  currentSessionId: string | null;
  permissionMode: PermissionMode;
  error?: string;
  pendingPermissions: PendingPermission[];
  lastMessagePreview?: string;
  lastActivityAt: string | null; // ISO-8601
}

// ---- Tool IO ----

export type ToolInput = { [key: string]: unknown };

// ---- Message Attachments ----

export type ImageAttachment = {
  type: "image";
  media_type: string; // e.g., "image/png", "image/jpeg"
  data: string; // base64-encoded image data
  name: string;
};

export type FileAttachment = {
  type: "file";
  name: string;
  content: string; // text content
};

export type MessageAttachment = ImageAttachment | FileAttachment;

// ---- Client → Server messages ----

export interface ClientSendMessage {
  type: "send_message";
  instanceId: string;
  text: string;
}

export interface ClientInterrupt {
  type: "interrupt";
  instanceId: string;
}

export interface ClientApprovePermission {
  type: "approve_permission";
  instanceId: string;
  permissionId: string;
}

export interface ClientDenyPermission {
  type: "deny_permission";
  instanceId: string;
  permissionId: string;
}

export interface ClientSyncState {
  type: "sync_state";
}

export type ClientMessage =
  | ClientSendMessage
  | ClientInterrupt
  | ClientApprovePermission
  | ClientDenyPermission
  | ClientSyncState;

// ---- Server → Client messages ----

export interface ServerTextDelta {
  type: "text_delta";
  instanceId: string;
  delta: string;
}

export interface ServerToolStart {
  type: "tool_start";
  instanceId: string;
  toolName: string;
  toolId: string;
  input: ToolInput;
}

export interface ServerToolResult {
  type: "tool_result";
  instanceId: string;
  toolId: string;
  output: string;
  isError: boolean;
}

export interface ServerStatusChange {
  type: "status_change";
  instanceId: string;
  status: InstanceStatus;
  error?: string;
}

export interface ServerPermissionRequest {
  type: "permission_request";
  instanceId: string;
  permission: PendingPermission;
}

export interface ServerMessageDone {
  type: "message_done";
  instanceId: string;
  messageId: string;
}

export interface ServerQueuePosition {
  type: "queue_position";
  instanceId: string;
  position: number;
}

export interface ServerError {
  type: "error";
  instanceId?: string;
  message: string;
  code?: string;
}

export interface ServerSyncState {
  type: "sync_state";
  instances: InstanceState[];
}

export type ServerMessage =
  | ServerTextDelta
  | ServerToolStart
  | ServerToolResult
  | ServerStatusChange
  | ServerPermissionRequest
  | ServerMessageDone
  | ServerQueuePosition
  | ServerError
  | ServerSyncState;

// ---- Database row types (Supabase) ----
// IMPORTANT: Use `type` (not `interface`) for all row types. TypeScript interfaces
// do not satisfy `Record<string, unknown>` under strict mode, which causes
// supabase-js GenericTable constraint failures and `never` return types from `.from()`.

export type DbUser = {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
};

export type DbInstance = {
  id: string;
  user_id: string;
  name: string;
  repo_path: string;
  status: InstanceStatus;
  current_session_id: string | null;
  permission_mode: string;
  allowed_tools: string[];
  sort_order: number | null;
  error: string | null;
  error_message: string | null;
  last_message_preview: string | null;
  last_activity_at: string | null;
  model: string | null;
  max_thinking_tokens: number;
  created_at: string;
  updated_at: string;
};

export type DbMessage = {
  id: string;
  instance_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tool_name: string | null;
  tool_id: string | null;
  is_error: boolean;
  status?: "pending" | "streaming" | "done";
  created_at: string;
};

// Frontend-only extension for optimistic UI — not stored in Supabase
export type DeliveryStatus = "pending" | "delivered" | "failed";

export type UiMessage = DbMessage & {
  deliveryStatus?: DeliveryStatus;
  originalText?: string; // preserved for retry on failed messages
};

export type DbPendingPermission = {
  id: string;
  instance_id: string;
  tool_name: string;
  input: ToolInput;
  status: "pending" | "approved" | "denied";
  requested_at: string;
  resolved_at: string | null;
};

export type DbChatMessage = {
  id: string;
  instance_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: "pending" | "streaming" | "done";
  created_at: string;
};

export type DbPermissionRequest = {
  id: string;
  instance_id: string;
  tool_name: string;
  tool_input: ToolInput;
  status: "pending" | "approved" | "denied" | "timed_out";
  timeout_at: string;
  resolved_at: string | null;
  created_at: string;
};

export type DbSession = {
  id: string;
  instance_id: string;
  started_at: string;
  ended_at: string | null;
  last_message_at: string | null;
  message_count: number;
  summary: string | null;
};

export type DbAuthResetToken = {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
};

export type DbEvent = {
  id: string;
  instance_id: string | null;
  level: "info" | "warn" | "error";
  event: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type DbFileRequest = {
  id: string;
  instance_id: string;
  file_path: string;
  status: "pending" | "completed" | "error";
  content: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

// ---- Supabase generated-style database interface ----
// Matches the GenericSchema shape required by @supabase/supabase-js v2.100+:
// Tables must include Row, Insert, Update, and Relationships.
// Schema must include Tables, Views, and Functions.

export interface Database {
  public: {
    Tables: {
      users: {
        Row: DbUser;
        Insert: Omit<DbUser, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<DbUser, "id">>;
        Relationships: [];
      };
      instances: {
        Row: DbInstance;
        Insert: Omit<DbInstance, "id" | "created_at" | "updated_at" | "sort_order" | "error_message" | "model" | "max_thinking_tokens"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          sort_order?: number | null;
          error_message?: string | null;
          model?: string | null;
          max_thinking_tokens?: number;
        };
        Update: Partial<Omit<DbInstance, "id">>;
        Relationships: [
          {
            foreignKeyName: "instances_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: DbSession;
        Insert: Omit<DbSession, "id" | "started_at" | "message_count"> & {
          id?: string;
          started_at?: string;
          message_count?: number;
        };
        Update: Partial<Omit<DbSession, "id">>;
        Relationships: [
          {
            foreignKeyName: "sessions_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "instances";
            referencedColumns: ["id"];
          },
        ];
      };
      auth_reset_tokens: {
        Row: DbAuthResetToken;
        Insert: Omit<DbAuthResetToken, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<DbAuthResetToken, "id">>;
        Relationships: [
          {
            foreignKeyName: "auth_reset_tokens_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: DbMessage;
        Insert: Omit<DbMessage, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<DbMessage, "id">>;
        Relationships: [
          {
            foreignKeyName: "messages_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "instances";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: DbChatMessage;
        Insert: Omit<DbChatMessage, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<DbChatMessage, "id">>;
        Relationships: [
          {
            foreignKeyName: "chat_messages_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "instances";
            referencedColumns: ["id"];
          },
        ];
      };
      pending_permissions: {
        Row: DbPendingPermission;
        Insert: Omit<DbPendingPermission, "id" | "requested_at"> & {
          id?: string;
          requested_at?: string;
        };
        Update: Partial<Omit<DbPendingPermission, "id">>;
        Relationships: [
          {
            foreignKeyName: "pending_permissions_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "instances";
            referencedColumns: ["id"];
          },
        ];
      };
      permission_requests: {
        Row: DbPermissionRequest;
        Insert: Omit<DbPermissionRequest, "created_at"> & { created_at?: string };
        Update: Partial<Omit<DbPermissionRequest, "id">>;
        Relationships: [
          {
            foreignKeyName: "permission_requests_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "instances";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: DbEvent;
        Insert: Omit<DbEvent, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<DbEvent, "id">>;
        Relationships: [];
      };
      file_requests: {
        Row: DbFileRequest;
        Insert: Omit<DbFileRequest, "id" | "created_at" | "completed_at" | "content" | "error_message"> & {
          id?: string;
          created_at?: string;
          completed_at?: string | null;
          content?: string | null;
          error_message?: string | null;
        };
        Update: Partial<Omit<DbFileRequest, "id">>;
        Relationships: [
          {
            foreignKeyName: "file_requests_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "instances";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {};
    Functions: {};
  };
}
