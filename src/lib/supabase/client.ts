import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null

export function getSupabaseBrowserClient() {
  if (typeof window === 'undefined') {
    return null
  }

  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL and Anon Key must be configured')
    }

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
