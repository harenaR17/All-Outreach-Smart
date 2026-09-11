'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { GeminiApiKey, TelegramRecipient, ApiKey } from '@/lib/types/database'
import { sendTelegramNotification } from '@/lib/telegram/notify'
import { hashKey, generateRawKey } from '@/lib/api-auth'

// ─── Gemini API Keys ─────────────────────────────────────────────────────────

export async function getGeminiKeys(): Promise<{
  success: boolean
  data?: GeminiApiKey[]
  error?: string
}> {
  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from('gemini_api_keys')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return { success: false, error: error.message }
    return { success: true, data: (data as GeminiApiKey[]) || [] }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function addGeminiKey(input: {
  label: string
  apiKey: string
}): Promise<{ success: boolean; modelUsed?: string; error?: string }> {
  try {
    const rawKey = input.apiKey.trim()
    if (!rawKey) return { success: false, error: 'API key is required' }

    // 1. Pre-flight verification with Gemini API (uses same model fallback as reply classifier)
    const testRes = await testGeminiKey(rawKey)
    if (!testRes.success) {
      return {
        success: false,
        error: `Gemini API key verification failed: ${testRes.error || 'Invalid API Key'}`,
      }
    }

    const supabase = supabaseAdmin()
    const { error } = await supabase.from('gemini_api_keys').insert({
      label: input.label.trim() || null,
      api_key: rawKey,
      is_active: true,
    })

    if (error) return { success: false, error: error.message }

    revalidatePath('/settings')
    return { success: true, modelUsed: testRes.modelUsed }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function toggleGeminiKey(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = supabaseAdmin()
    const { error } = await supabase
      .from('gemini_api_keys')
      .update({ is_active: isActive })
      .eq('id', id)

    if (error) return { success: false, error: error.message }

    revalidatePath('/settings')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteGeminiKey(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = supabaseAdmin()
    const { error } = await supabase.from('gemini_api_keys').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    revalidatePath('/settings')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

import { getAvailableFlashModels, DEFAULT_FALLBACK_MODELS } from '@/lib/llm/gemini'

export async function testGeminiKey(apiKey: string): Promise<{
  success: boolean
  modelUsed?: string
  error?: string
}> {
  const key = apiKey.trim()
  if (!key) return { success: false, error: 'API key is required' }

  const lastError: string[] = []
  const models = await getAvailableFlashModels([{ id: 'test-probe', api_key: key }])

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }],
          }),
        }
      )

      // Rate-limited on this model — try the next one
      if (res.status === 429) {
        lastError.push(`${model}: rate-limited (429)`)
        continue
      }

      if (!res.ok) {
        const errText = await res.text()
        lastError.push(`${model}: HTTP ${res.status}`)
        // 400/403 on first model likely means invalid key — don't bother trying others
        if (res.status === 400 || res.status === 403) {
          return { success: false, error: `Gemini API returned ${res.status}: ${errText}` }
        }
        continue
      }

      // At least one model responded successfully — key is valid
      return { success: true, modelUsed: model }
    } catch (err) {
      lastError.push(`${model}: ${err instanceof Error ? err.message : 'network error'}`)
    }
  }

  return {
    success: false,
    error: `All Gemini models failed. Last errors: ${lastError.slice(-3).join(' | ')}`,
  }
}

// ─── Telegram Recipients ────────────────────────────────────────────────────

export async function getTelegramRecipients(): Promise<{
  success: boolean
  data?: TelegramRecipient[]
  error?: string
}> {
  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from('telegram_notify_recipients')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return { success: false, error: error.message }
    return { success: true, data: (data as TelegramRecipient[]) || [] }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function addTelegramRecipient(input: {
  label: string
  botToken: string
  chatId: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const token = input.botToken.trim()
    const chat = input.chatId.trim()

    if (!token) return { success: false, error: 'Bot Token is required (from @BotFather)' }
    if (!chat) return { success: false, error: 'Chat ID is required' }

    // 1. Send immediate welcome confirmation message to verify bot token + chat ID
    const welcomeMessage = [
      '🤖 Outreach Smart — Connection Confirmed',
      '',
      '✅ This Telegram chat has been successfully linked to Outreach Smart.',
      'You will now receive real-time alerts here when leads reply or when outreach events occur.',
      '',
      `⏱️ Connected at: ${new Date().toUTCString()}`,
    ].join('\n')
    const testRes = await sendTelegramNotification(token, chat, welcomeMessage)

    if (!testRes.success) {
      return {
        success: false,
        error: `Telegram test message failed: ${testRes.error || 'Unable to send message'}. Please ensure you have opened the bot in Telegram and tapped Start (/start), and that your Chat ID is correct.`,
      }
    }

    const supabase = supabaseAdmin()
    const { error } = await supabase.from('telegram_notify_recipients').insert({
      label: input.label.trim() || null,
      bot_token: token,
      chat_id: chat,
      is_active: true,
    })

    if (error) return { success: false, error: error.message }

    revalidatePath('/settings')
    revalidatePath('/campaigns')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function toggleTelegramRecipient(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = supabaseAdmin()
    const { error } = await supabase
      .from('telegram_notify_recipients')
      .update({ is_active: isActive })
      .eq('id', id)

    if (error) return { success: false, error: error.message }

    revalidatePath('/settings')
    revalidatePath('/campaigns')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteTelegramRecipient(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = supabaseAdmin()
    const { error } = await supabase.from('telegram_notify_recipients').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    revalidatePath('/settings')
    revalidatePath('/campaigns')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function testTelegramNotification(
  botToken: string,
  chatId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = botToken.trim()
    const chat = chatId.trim()

    if (!token) return { success: false, error: 'Bot Token is required' }
    if (!chat) return { success: false, error: 'Chat ID is required' }

    const testMessage = [
      '🤖 Outreach Smart — Test Alert',
      '',
      '✅ Your Telegram notification bot is connected and operational!',
      '',
      `⏱️ ${new Date().toUTCString()}`,
    ].join('\n')
    return await sendTelegramNotification(token, chat, testMessage)
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to send Telegram test message' }
  }
}

// ─── API Keys ────────────────────────────────────────────────────────────────

export async function listApiKeys(): Promise<{
  success: boolean
  data?: Omit<ApiKey, 'key_hash'>[]
  error?: string
}> {
  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, label, is_active, created_at, last_used_at')
      .order('created_at', { ascending: false })

    if (error) return { success: false, error: error.message }
    return { success: true, data: (data as Omit<ApiKey, 'key_hash'>[]) || [] }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Creates a new API key.
 * Returns the raw key ONCE — it is never stored and cannot be recovered.
 * The caller must display it immediately and instruct the user to copy it.
 */
export async function createApiKey(label: string): Promise<{
  success: boolean
  rawKey?: string
  id?: string
  error?: string
}> {
  try {
    const rawKey = generateRawKey()
    const keyHash = await hashKey(rawKey)

    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        label: label.trim() || null,
        key_hash: keyHash,
        is_active: true,
      })
      .select('id')
      .single()

    if (error) return { success: false, error: error.message }

    revalidatePath('/settings')
    return { success: true, rawKey, id: data.id }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function toggleApiKey(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = supabaseAdmin()
    const { error } = await supabase
      .from('api_keys')
      .update({ is_active: isActive })
      .eq('id', id)

    if (error) return { success: false, error: error.message }

    revalidatePath('/settings')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteApiKey(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = supabaseAdmin()
    const { error } = await supabase.from('api_keys').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    revalidatePath('/settings')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── Workers & Cron Testing ──────────────────────────────────────────────────

export async function getCronConfig(): Promise<{
  hasCronSecret: boolean
  cronSecretPreview?: string
}> {
  let cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) {
    try {
      const { cookies } = await import('next/headers')
      const cookieStore = await cookies()
      cronSecret = cookieStore.get('os_cron_secret')?.value || ''
    } catch {}
  }
  if (!cronSecret) {
    try {
      const supabase = supabaseAdmin()
      const { data } = await (supabase as any)
        .from('cron_config.settings')
        .select('value')
        .eq('key', 'cron_secret')
        .maybeSingle()
      if (data?.value) cronSecret = data.value
    } catch {}
  }

  const hasSecret = Boolean(cronSecret && cronSecret.length > 0)
  const cronSecretPreview = hasSecret
    ? `${cronSecret!.slice(0, 4)}••••••••${cronSecret!.slice(-4)}`
    : undefined

  return {
    hasCronSecret: hasSecret,
    cronSecretPreview,
  }
}

import { NextRequest } from 'next/server'
import { POST as runSenderPost, GET as runSenderGet } from '@/app/api/cron/sender/route'
import { POST as runReplyCheckerPost, GET as runReplyCheckerGet } from '@/app/api/cron/reply-checker/route'

export async function testWorkerPing(
  worker: 'sender' | 'reply-checker',
  clientOrigin?: string
): Promise<{
  success: boolean
  status?: number
  url: string
  worker: string
  timestamp?: string
  data?: any
  error?: string
}> {
  let appUrl = clientOrigin?.trim().replace(/\/$/, '')
  if (!appUrl) {
    appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'
  }

  let cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) {
    try {
      const { cookies } = await import('next/headers')
      const cookieStore = await cookies()
      cronSecret = cookieStore.get('os_cron_secret')?.value || ''
    } catch {}
  }
  if (!cronSecret) {
    try {
      const supabase = supabaseAdmin()
      const { data } = await (supabase as any)
        .from('cron_config.settings')
        .select('value')
        .eq('key', 'cron_secret')
        .maybeSingle()
      if (data?.value) cronSecret = data.value
    } catch {}
  }

  const targetUrl = `${appUrl}/api/cron/${worker}?ping=true`

  try {
    const dummyReq = new NextRequest(new URL(targetUrl), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(cronSecret ? { 'x-cron-secret': cronSecret } : {}),
      },
    })

    const handler = worker === 'sender' ? runSenderGet : runReplyCheckerGet
    const res = await handler(dummyReq)
    const data = await res.json().catch(() => null)

    if (res.ok) {
      return {
        success: true,
        status: res.status,
        url: targetUrl,
        worker,
        timestamp: data?.timestamp || new Date().toISOString(),
        data,
      }
    } else {
      return {
        success: false,
        status: res.status,
        url: targetUrl,
        worker,
        error: data?.error || `HTTP ${res.status}: Verification failed`,
        data,
      }
    }
  } catch (err: unknown) {
    return {
      success: false,
      url: targetUrl,
      worker,
      error: err instanceof Error ? err.message : 'Execution failed.',
    }
  }
}

export async function executeWorkerLive(
  worker: 'sender' | 'reply-checker',
  clientOrigin?: string
): Promise<{
  success: boolean
  status?: number
  url: string
  worker: string
  durationMs: number
  data?: any
  error?: string
}> {
  let appUrl = clientOrigin?.trim().replace(/\/$/, '')
  if (!appUrl) {
    appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'
  }

  let cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) {
    try {
      const { cookies } = await import('next/headers')
      const cookieStore = await cookies()
      cronSecret = cookieStore.get('os_cron_secret')?.value || ''
    } catch {}
  }
  if (!cronSecret) {
    try {
      const supabase = supabaseAdmin()
      const { data } = await (supabase as any)
        .from('cron_config.settings')
        .select('value')
        .eq('key', 'cron_secret')
        .maybeSingle()
      if (data?.value) cronSecret = data.value
    } catch {}
  }

  const targetUrl = `${appUrl}/api/cron/${worker}`
  const startTime = Date.now()

  try {
    const dummyReq = new NextRequest(new URL(targetUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cronSecret ? { 'x-cron-secret': cronSecret } : {}),
      },
    })

    const handler = worker === 'sender' ? runSenderPost : runReplyCheckerPost
    const res = await handler(dummyReq)
    const durationMs = Date.now() - startTime
    const data = await res.json().catch(() => null)

    if (res.ok) {
      return {
        success: true,
        status: res.status,
        url: targetUrl,
        worker,
        durationMs,
        data,
      }
    } else {
      return {
        success: false,
        status: res.status,
        url: targetUrl,
        worker,
        durationMs,
        error: data?.error || `HTTP ${res.status}: Execution failed`,
        data,
      }
    }
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime
    return {
      success: false,
      url: targetUrl,
      worker,
      durationMs,
      error: err instanceof Error ? err.message : 'Execution failed.',
    }
  }
}


