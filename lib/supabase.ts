// ---------------------------------------------------------------------------
// Claude Hub — Supabase Client Initialization
// ---------------------------------------------------------------------------
// Server-side: import { supabase } from "@/lib/supabase"
// Client-side: import { createBrowserClient } from "@/lib/supabase"
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// ---- Environment variables ----

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---- Server-side client (service role — full access, never expose to browser) ----

function createServerClient(): SupabaseClient<Database> {
  if (!SUPABASE_URL) {
    throw new Error("Missing env var NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing env var SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Lazy singleton — created on first access so missing env vars don't crash
// module evaluation during client-side bundling.
let _serverClient: SupabaseClient<Database> | null = null;

/**
 * Service-role Supabase client for server-side use only.
 * Lazily initialized on first call.
 */
export function getServerClient(): SupabaseClient<Database> {
  if (!_serverClient) {
    _serverClient = createServerClient();
  }
  return _serverClient;
}

/**
 * Convenience alias — lazily initialized server client.
 *
 * Uses a Proxy so the client is only constructed when a method is first called,
 * preventing missing env vars from crashing module evaluation during
 * client-side bundling. TypeScript sees the full SupabaseClient<Database> type.
 */
export const supabase: SupabaseClient<Database> = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop, receiver) {
      const client = getServerClient();
      const value = Reflect.get(client, prop, receiver);
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);

// ---- Browser-side client (anon key — respects RLS) ----

let _browserClient: SupabaseClient<Database> | null = null;

/**
 * Returns a singleton Supabase client for use in React components / browser code.
 * Uses the anon key so all queries go through RLS.
 */
export function createBrowserClient(): SupabaseClient<Database> {
  if (_browserClient) return _browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  _browserClient = createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });

  return _browserClient;
}
