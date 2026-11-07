import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database'

let supabaseClient: ReturnType<typeof createBrowserClient<Database>> | null = null
let dynamicSupabaseUrl: string | null = null
let dynamicSupabaseAnonKey: string | null = null

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'))
  return match ? decodeURIComponent(match[3]) : null
}

/**
 * Allows setting Supabase connection credentials dynamically at runtime.
 */
export function setBrowserSupabaseCredentials(url: string, anonKey: string) {
  if (url && anonKey) {
    dynamicSupabaseUrl = url
    dynamicSupabaseAnonKey = anonKey
    supabaseClient = null
  }
}

/**
 * Returns true if the browser-side Supabase environment variables or cookies are present.
 */
export function isSupabaseBrowserConfigured(): boolean {
  const url = dynamicSupabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || getCookieValue('os_supabase_url')
  const key = dynamicSupabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || getCookieValue('os_supabase_anon_key')
  const completed =
    process.env.NEXT_PUBLIC_SETUP_COMPLETED === 'true' ||
    process.env.SETUP_COMPLETED === 'true' ||
    getCookieValue('os_setup_completed') === 'true'
  return Boolean(url && key) || completed
}

/**
 * Returns a singleton Supabase browser client configured with cookie-based session persistence,
 * or null if:
 * - Running on the server (SSR)
 * - Environment variables are not yet configured (pre-setup state)
 */
export function getSupabaseBrowserClient() {
  if (typeof window === 'undefined') {
    return null
  }

  const supabaseUrl = dynamicSupabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || getCookieValue('os_supabase_url')
  const supabaseAnonKey = dynamicSupabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || getCookieValue('os_supabase_anon_key')

  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  if (!supabaseClient) {
    supabaseClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
  }

  return supabaseClient
}
