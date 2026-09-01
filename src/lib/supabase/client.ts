import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null
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
 * Returns a singleton Supabase browser client, or null if:
 * - Running on the server (SSR)
 * - Environment variables are not yet configured (pre-setup state)
 *
 * Returning null instead of throwing allows the app to boot
 * and redirect to /setup without crashing.
 */
export function getSupabaseBrowserClient() {
  if (typeof window === 'undefined') {
    return null
  }

  const supabaseUrl = dynamicSupabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || getCookieValue('os_supabase_url')
  const supabaseAnonKey = dynamicSupabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || getCookieValue('os_supabase_anon_key')

  // Return null gracefully instead of throwing fatal runtime error
  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  if (!supabaseClient) {
    supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }

  return supabaseClient
}
