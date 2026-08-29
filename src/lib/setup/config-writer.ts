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
 * In a standard Node.js environment (Localhost / Next server), writes to `.env.local`.
 * In Cloudflare Workers environment, attempts to write to Cloudflare KV if bound.
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
  let localError: string | null = null

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
  } catch (err: unknown) {
    localError = err instanceof Error ? err.message : 'Filesystem write error'
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
    // KV not available or not running on Cloudflare, ignore
  }

  // Update in-memory process.env for the current runtime lifecycle
  for (const [k, v] of Object.entries(envMap)) {
    process.env[k] = v
  }

  if (savedLocally || savedKV) {
    return {
      success: true,
      message: savedKV && savedLocally
        ? 'Configuration saved to .env.local and Cloudflare KV.'
        : savedKV
        ? 'Configuration stored securely in Cloudflare KV.'
        : 'Configuration saved to .env.local.',
    }
  }

  return {
    success: false,
    error: localError || 'Failed to persist configuration to disk or KV storage.',
  }
}
