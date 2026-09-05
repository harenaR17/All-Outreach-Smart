import { getGoogleAccessToken } from '@/lib/google/auth'
import type { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Gmail Thread Fetch / MIME Decode (Node / Next.js runtime)
 *
 * Node counterpart of `supabase/functions/_shared/gmail.ts`, so the
 * threads.get fetch + MIME body decoding logic doesn't live twice across the
 * Deno and Node reply-checker implementations. Token generation itself is
 * NOT duplicated here — it reuses `getGoogleAccessToken` from
 * `@/lib/google/auth`, just adding a thin in-memory cache on top.
 */

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
    return Buffer.from(base64, 'base64').toString('utf-8')
  } catch {
    return ''
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
        const nested = extractPlainTextBody(part as GmailMessage['payload'])
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
      (inboxEmailAddress && fromHeader.toLowerCase().includes(inboxEmailAddress.toLowerCase())),
  )
}

// ─── Thread fetch ─────────────────────────────────────────────────────────────

export async function fetchGmailThread(
  threadId: string,
  accessToken: string,
): Promise<{ ok: true; messages: GmailMessage[] } | { ok: false; error: string }> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

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
  inboxEmailAddress: string,
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
    occurred_at: Number.isFinite(internalDateMs) ? new Date(internalDateMs).toISOString() : new Date().toISOString(),
  }
}

/**
 * Diffs a fetched Gmail thread against already-synced `thread_messages` rows
 * for one campaign_lead and inserts only the messages that are new.
 */
export async function syncThreadMessages(
  supabase: ReturnType<typeof supabaseAdmin>,
  campaignLeadId: string,
  messages: GmailMessage[],
  inboxEmailAddress: string,
): Promise<{ inserted: number; error?: string }> {
  if (messages.length === 0) return { inserted: 0 }

  const { data: existingRows, error: existingErr } = await supabase
    .from('thread_messages')
    .select('gmail_message_id')
    .eq('campaign_lead_id', campaignLeadId)

  if (existingErr) return { inserted: 0, error: existingErr.message }

  const existingIds = new Set((existingRows || []).map((r) => r.gmail_message_id))

  const newRecords = messages
    .filter((msg) => !existingIds.has(msg.id))
    .map((msg) => toThreadMessageRecord(msg, campaignLeadId, inboxEmailAddress))

  if (newRecords.length === 0) return { inserted: 0 }

  const { error: insertErr } = await supabase.from('thread_messages').insert(newRecords)
  if (insertErr) return { inserted: 0, error: insertErr.message }

  return { inserted: newRecords.length }
}

// ─── Cached access token (reuses getGoogleAccessToken, adds a thin cache) ────

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

export async function getCachedGmailAccessToken(
  clientEmail: string,
  privateKeyPem: string,
  subjectEmail: string,
): Promise<string> {
  const cacheKey = `${clientEmail}::${subjectEmail}`
  const cached = tokenCache.get(cacheKey)

  if (cached && cached.expiresAt - 60_000 > Date.now()) {
    return cached.token
  }

  const { token, expiresAt } = await getGoogleAccessToken(clientEmail, subjectEmail, privateKeyPem, [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
  ])

  tokenCache.set(cacheKey, { token, expiresAt: new Date(expiresAt).getTime() })
  return token
}
