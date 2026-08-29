import { type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * SHA-256 hex digest of a raw API key string.
 * Fast hash is appropriate here — tokens are already high-entropy random values,
 * unlike passwords which need bcrypt's slow hashing to resist brute-force.
 */
export async function hashKey(rawKey: string): Promise<string> {
  const data = new TextEncoder().encode(rawKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Authenticates a request by checking the Authorization: Bearer <token> header
 * against the api_keys table (comparing SHA-256 hash).
 *
 * Returns the matched api_keys.id on success (so last_used_at can be updated),
 * or null if the request is unauthenticated / the key is invalid or inactive.
 */
export async function authenticate(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const rawKey = authHeader.slice('Bearer '.length).trim()
  if (!rawKey) return null

  const hash = await hashKey(rawKey)
  const supabase = supabaseAdmin()

  const { data } = await supabase
    .from('api_keys')
    .select('id')
    .eq('key_hash', hash)
    .eq('is_active', true)
    .maybeSingle()

  if (!data) return null

  // Update last_used_at in the background — don't await, not worth blocking the request
  void supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)

  return data.id
}

/**
 * Generates a new raw API key with a recognizable prefix.
 * Format: outreach_live_<64 random hex chars>
 * The prefix makes accidentally-committed keys easy to grep for.
 */
export function generateRawKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `outreach_live_${hex}`
}
