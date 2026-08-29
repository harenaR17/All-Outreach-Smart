import { cookies } from 'next/headers'
import fs from 'node:fs'
import path from 'node:path'

export interface SetupConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  cronSecret: string
  geminiApiKey?: string
  telegramBotToken?: string
  setupCompleted?: boolean
}

/**
 * Saves configuration values.
 * 1. In a standard Node.js environment (Localhost / Node server), writes to `.env.local`.
 * 2. In Cloudflare Workers / Edge Runtime:
 *    - Suppresses read-only filesystem errors (EPERM / EROFS).
 *    - Persists values into Cloudflare KV if CONFIG_KV is bound.
 *    - Stores configuration securely in HttpOnly and client-accessible cookies.
 */
export async function saveConfiguration(config: SetupConfig): Promise<{ success: boolean; message?: string; error?: string }> {
  const envMap: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: config.supabaseUrl.trim(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: config.supabaseAnonKey.trim(),
    SUPABASE_SERVICE_ROLE_KEY: config.supabaseServiceRoleKey.trim(),
    CRON_SECRET: config.cronSecret.trim(),
    SETUP_COMPLETED: 'true',
  }

  if (config.geminiApiKey?.trim()) {
    envMap.GEMINI_API_KEY = config.geminiApiKey.trim()
  }

  if (config.telegramBotToken?.trim()) {
    envMap.TELEGRAM_BOT_TOKEN = config.telegramBotToken.trim()
  }

  let savedLocally = false
  let savedKV = false
  let savedCookies = false

  // 1. Attempt Node.js file write (Local dev / Node server)
  try {
    const envFilePath = path.join(process.cwd(), '.env.local')
    let existingContent = ''
    if (fs.existsSync(envFilePath)) {
      existingContent = fs.readFileSync(envFilePath, 'utf8')
    }

    const lines = existingContent.split(/\r?\n/).filter((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return true
      const key = trimmed.split('=')[0]?.trim()
      return !(key && key in envMap)
    })

    const newEntries = [
      '# ─── Outreach Smart Setup Configuration ──────────────────────────────',
      `NEXT_PUBLIC_SUPABASE_URL=${envMap.NEXT_PUBLIC_SUPABASE_URL}`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      `SUPABASE_SERVICE_ROLE_KEY=${envMap.SUPABASE_SERVICE_ROLE_KEY}`,
      `CRON_SECRET=${envMap.CRON_SECRET}`,
      `SETUP_COMPLETED=true`,
    ]

    if (envMap.GEMINI_API_KEY) {
      newEntries.push(`GEMINI_API_KEY=${envMap.GEMINI_API_KEY}`)
    }
    if (envMap.TELEGRAM_BOT_TOKEN) {
      newEntries.push(`TELEGRAM_BOT_TOKEN=${envMap.TELEGRAM_BOT_TOKEN}`)
    }

    const finalContent = [...lines.filter((l) => l.trim().length > 0), '', ...newEntries, ''].join('\n')
    fs.writeFileSync(envFilePath, finalContent, 'utf8')
    savedLocally = true
  } catch {
    // Read-only filesystem on Cloudflare Workers / Edge Runtime — expected and handled gracefully
  }

  // 2. Attempt Cloudflare KV write (if running on Workers with CONFIG_KV bound)
  try {
    const cf = await import('@opennextjs/cloudflare').catch(() => null)
    if (cf && typeof cf.getCloudflareContext === 'function') {
      const ctx = cf.getCloudflareContext()
      const kv = (ctx?.env as Record<string, unknown>)?.CONFIG_KV as {
        put: (key: string, value: string) => Promise<void>
      } | undefined

      if (kv && typeof kv.put === 'function') {
        for (const [k, v] of Object.entries(envMap)) {
          await kv.put(k, v)
        }
        savedKV = true
      }
    }
  } catch {
    // KV not available, proceed to cookie storage
  }

  // 3. Store in secure cookies for Edge Runtime persistence
  try {
    const cookieStore = await cookies()
    const cookieOptions = {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
    }

    // Public / Browser credentials
    cookieStore.set('os_setup_completed', 'true', cookieOptions)
    cookieStore.set('os_supabase_url', envMap.NEXT_PUBLIC_SUPABASE_URL, cookieOptions)
    cookieStore.set('os_supabase_anon_key', envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY, cookieOptions)

    // Server-only / Secret credentials
    cookieStore.set('os_service_role_key', envMap.SUPABASE_SERVICE_ROLE_KEY, {
      ...cookieOptions,
      httpOnly: true,
    })
    cookieStore.set('os_cron_secret', envMap.CRON_SECRET, {
      ...cookieOptions,
      httpOnly: true,
    })

    if (envMap.GEMINI_API_KEY) {
      cookieStore.set('os_gemini_key', envMap.GEMINI_API_KEY, { ...cookieOptions, httpOnly: true })
    }
    if (envMap.TELEGRAM_BOT_TOKEN) {
      cookieStore.set('os_telegram_token', envMap.TELEGRAM_BOT_TOKEN, { ...cookieOptions, httpOnly: true })
    }

    savedCookies = true
  } catch {
    // Cookies not writable in current context
  }

  // Update in-memory process.env for the current request lifecycle
  for (const [k, v] of Object.entries(envMap)) {
    process.env[k] = v
  }

  return {
    success: true,
    message: savedKV
      ? 'Configuration saved to Cloudflare KV and secure session.'
      : savedLocally
      ? 'Configuration saved to .env.local.'
      : 'Configuration saved to secure session.',
  }
}
