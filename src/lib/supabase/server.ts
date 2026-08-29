import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

/**
 * Returns true if the server-side Supabase environment variables are present.
 * Used by server actions and middleware to determine if setup is needed.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return Boolean(url && key)
}

/**
 * Returns true if the setup wizard has been completed.
 * Checks the SETUP_COMPLETED environment variable.
 */
export function isSetupCompleted(): boolean {
  return process.env.SETUP_COMPLETED === 'true'
}

/**
 * Creates a server-side Supabase client with the Service Role key.
 *
 * CRITICAL ARCHITECTURAL CONTRACT:
 * - There is no user login / RLS boundary in the browser.
 * - All Supabase access occurs exclusively server-side via Server Actions / Route Handlers.
 * - This service-role client bypasses RLS and has full administrative access.
 * - NEVER import or expose this client to client components.
 */
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }

  if (!supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
  }

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * Creates a one-off Supabase client with user-provided credentials.
 * Used during the setup wizard before .env.local is written.
 */
export function createDynamicServerClient(url: string, serviceRoleKey: string) {
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

// Convenient export for server-side operations
export const supabaseAdmin = () => createServerClient()
