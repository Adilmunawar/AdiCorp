import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { emitPermissionErrorEvent, extractSupabaseTable, parsePermissionError } from '@/lib/permissionErrors';

// Public project values (the publishable key is meant to ship to browsers; RLS protects the data).
const FALLBACK_URL = "https://umybjmuzbxfxdtbumgma.supabase.co";
const FALLBACK_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVteWJqbXV6YnhmeGR0YnVtZ21hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc1NTY3MzUsImV4cCI6MjA2MzEzMjczNX0.ODvajzrDaKfqDOzXGNwEr4CaAYRgPY38e-vYeVTS5OY";

/** Project URL, read from the Vite env with the current project as fallback. */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL;
/** Publishable (anon) key, read from the Vite env with the current project as fallback. */
export const SUPABASE_PUBLISHABLE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_PUBLISHABLE_KEY;

/** localStorage, or an in-memory stand-in when the browser blocks site storage (the session then lasts for the tab). */
function sessionStore(): Storage {
  try {
    localStorage.getItem("adicorp.probe");
    return localStorage;
  } catch {
    const m = new Map<string, string>();
    return {
      get length() {
        return m.size;
      },
      clear: () => m.clear(),
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  }
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: sessionStore(),
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: async (input, init) => {
      const response = await fetch(input, init);

      if (response.ok) return response;

      const requestUrl = input instanceof Request ? input.url : String(input);
      if (!requestUrl.includes('/rest/v1/')) return response;

      try {
        const payload = await response.clone().json();
        const table = extractSupabaseTable(requestUrl);
        const permissionError = parsePermissionError(payload, table);

        if (permissionError) {
          emitPermissionErrorEvent(permissionError);
        }
      } catch {
        return response;
      }

      return response;
    },
  },
});

/**
 * Untyped handle on the same client, used by the module RPC wrappers that pass the
 * function name as a variable. ./types.ts is generated from the live schema
 * (`supabase gen types`); prefer the typed `supabase` export for direct calls.
 */
export const db = supabase as unknown as SupabaseClient;
