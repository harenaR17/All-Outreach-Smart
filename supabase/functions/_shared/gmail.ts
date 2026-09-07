/**
 * Gmail Thread Fetch / MIME Decode / Service-Account Auth (Deno / Supabase Edge Functions)
 *
 * Shared by `reply-checker` (classification) and `thread-sync` (SmartBox thread
 * persistence) so the threads.get fetch, MIME body decoding, and service-account
 * JWT token exchange only live in one place.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// In-memory token cache for service account JWTs, shared by every caller in
// this isolate (reply-checker and thread-sync each get their own isolate, so
// this only helps within a single invocation's loop over multiple leads).
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

export interface GmailMessageHeader {
  name: string
  value: string
}

export interface GmailMessagePart {
  mimeType: string
  body?: { data?: string }
  parts?: GmailMessagePart[]
}

export interface GmailMessage {
  id: string
  threadId: string
  snippet?: string
  labelIds?: string[]
  internalDate?: string
  payload?: {
    headers?: GmailMessageHeader[]
    mimeType?: string
    body?: { data?: string }
    parts?: GmailMessagePart[]
  }
}

// ─── Header / body helpers ───────────────────────────────────────────────────

export function getHeader(headers: GmailMessageHeader[], name: string): string | null {
  const h = headers.find((item) => item.name.toLowerCase() === name.toLowerCase())
  return h ? h.value : null
}

export function decodeBase64Url(b64url: string): string {
  try {
    const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(base64)
    return decodeURIComponent(escape(decoded))
  } catch {
    try {
      return atob(b64url.replace(/-/g, '+').replace(/_/g, '/'))
    } catch {
      return ''
    }
  }
}

export function extractPlainTextBody(payload?: GmailMessage['payload']): string {
  if (!payload) return ''

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data)
      }
      if (part.parts) {
        const nested = extractPlainTextBody(part)
        if (nested) return nested
      }
    }
  }

  return ''
}

/**
 * True when a message in a thread was sent by one of our own inboxes
 * (Gmail SENT label, or the From header matches the inbox address).
 */
export function isSentByInbox(msg: GmailMessage, inboxEmailAddress: string): boolean {
  const fromHeader = getHeader(msg.payload?.headers || [], 'from') || ''
  return Boolean(
    (msg.labelIds && msg.labelIds.includes('SENT')) ||
    (inboxEmailAddress && fromHeader.toLowerCase().includes(inboxEmailAddress.toLowerCase()))
  )
}

// ─── Thread fetch ─────────────────────────────────────────────────────────────

export async function fetchGmailThread(
  threadId: string,
  accessToken: string
): Promise<{ ok: true; messages: GmailMessage[] } | { ok: false; error: string }> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) {
    const errText = await res.text()
    return { ok: false, error: `Failed to fetch thread ${threadId}: ${errText}` }
  }

  const data = (await res.json()) as { messages?: GmailMessage[] }
  return { ok: true, messages: data.messages || [] }
}

// ─── thread_messages row shaping + diff/insert ───────────────────────────────

export interface ThreadMessageRecord {
  campaign_lead_id: string
  gmail_message_id: string
  direction: 'inbound' | 'outbound'
  from_address: string | null
  to_address: string | null
  subject: string | null
  body_text: string | null
  occurred_at: string
}

export function toThreadMessageRecord(
  msg: GmailMessage,
  campaignLeadId: string,
  inboxEmailAddress: string
): ThreadMessageRecord {
  const headers = msg.payload?.headers || []
  const bodyText = extractPlainTextBody(msg.payload) || msg.snippet || ''
  const internalDateMs = msg.internalDate ? Number(msg.internalDate) : NaN

  return {
    campaign_lead_id: campaignLeadId,
    gmail_message_id: msg.id,
    direction: isSentByInbox(msg, inboxEmailAddress) ? 'outbound' : 'inbound',
    from_address: getHeader(headers, 'from'),
    to_address: getHeader(headers, 'to'),
    subject: getHeader(headers, 'subject'),
    body_text: bodyText || null,
    occurred_at: Number.isFinite(internalDateMs)
      ? new Date(internalDateMs).toISOString()
      : new Date().toISOString(),
  }
}

/**
 * Diffs a fetched Gmail thread against already-synced `thread_messages` rows
 * for one campaign_lead and inserts only the messages that are new.
 *
 * Used both by `thread-sync`'s hourly batch (one thread fetched per lead) and
 * by `reply-checker`'s immediate inline sync (reusing the thread it just
 * fetched for classification, no extra Gmail call needed).
 */
export async function syncThreadMessages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Deno isolate has no shared Database generic to import here
  supabase: SupabaseClient<any, any, any>,
  campaignLeadId: string,
  messages: GmailMessage[],
  inboxEmailAddress: string
): Promise<{ inserted: number; error?: string }> {
  if (messages.length === 0) return { inserted: 0 }

  const { data: existingRows, error: existingErr } = await supabase
    .from('thread_messages')
    .select('gmail_message_id')
    .eq('campaign_lead_id', campaignLeadId)

  if (existingErr) return { inserted: 0, error: existingErr.message }

  const existingIds = new Set(
    (existingRows || []).map((r: { gmail_message_id: string }) => r.gmail_message_id)
  )

  const newRecords = messages
    .filter((msg) => !existingIds.has(msg.id))
    .map((msg) => toThreadMessageRecord(msg, campaignLeadId, inboxEmailAddress))

  if (newRecords.length === 0) return { inserted: 0 }

  const { error: insertErr } = await supabase.from('thread_messages').insert(newRecords)
  if (insertErr) return { inserted: 0, error: insertErr.message }

  return { inserted: newRecords.length }
}

// ─── Service Account JWT + token exchange (module-level cache) ───────────────

export async function getGmailAccessToken(
  clientEmail: string,
  privateKeyPem: string,
  subjectEmail: string
): Promise<string> {
  const cacheKey = `${clientEmail}::${subjectEmail}`
  const cached = tokenCache.get(cacheKey)

  if (cached && cached.expiresAt - 60_000 > Date.now()) {
    return cached.token
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const b64url = (obj: unknown): string =>
    btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

  const jwtHeader = { alg: 'RS256', typ: 'JWT' }
  const jwtPayload = {
    iss: clientEmail,
    sub: subjectEmail,
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ].join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  }

  const signingInput = `${b64url(jwtHeader)}.${b64url(jwtPayload)}`
  const normalised = privateKeyPem.trim().replace(/\\n/g, '\n')
  const pemBody = normalised
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')

  const keyBytes = Uint8Array.from(atob(pemBody), (c: string) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signatureBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const jwt = `${signingInput}.${sigB64}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text()
    throw new Error(`Token exchange failed (${tokenRes.status}): ${errText}`)
  }

  const tokenData = (await tokenRes.json()) as { access_token: string; expires_in: number }
  const token = tokenData.access_token

  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
  })

  return token
}
