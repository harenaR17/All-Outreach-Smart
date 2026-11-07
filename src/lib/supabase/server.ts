import 'server-only'
import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import { createServerClient as createSSRServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database'
import type { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

async function getStoredServerCredentials(): Promise<{
  url?: string
  serviceRoleKey?: string
  isCompleted?: boolean
}> {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  let isCompleted = process.env.SETUP_COMPLETED === 'true'

  if (!url || !serviceRoleKey || !isCompleted) {
    try {
      const cookieStore = await cookies()
      url = url || cookieStore.get('os_supabase_url')?.value
      serviceRoleKey = serviceRoleKey || cookieStore.get('os_service_role_key')?.value
      isCompleted = isCompleted || cookieStore.get('os_setup_completed')?.value === 'true'
    } catch {
      // Cookies not accessible in current context
    }
  }

  return { url, serviceRoleKey, isCompleted }
}

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
 * Creates an authenticated Supabase server client scoped to the current user's session cookies.
 * RLS policies automatically apply based on auth.uid().
 */
export async function createSessionServerClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing Supabase public credentials (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)')
  }

  return createSSRServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
  })
}

/**
 * Resolves the authenticated user from the current request cookies.
 * Cached per request/render pass to prevent duplicate auth subrequests.
 * Throws an Error if no valid session exists.
 */
export const getAuthenticatedUser = cache(async (): Promise<User> => {
  const supabase = await createSessionServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Unauthorized: Authentication required')
  }

  return user
})

/**
 * Creates a server-side Supabase client with the Service Role key.
 *
 * NOTE: Bypasses RLS. Used exclusively for background workers (cron),
 * public webhooks, or elevated administrative operations where explicit
 * user scoping is applied.
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

// Convenient export for server-side service-role operations
export const supabaseAdmin = () => createServerClient()
