'use server'

import { createDynamicServerClient, isSupabaseConfigured, isSetupCompleted } from '@/lib/supabase/server'
import { getSchemaSteps, CORE_TABLES } from '@/lib/setup/schema-bundle'
import { saveConfiguration, type SetupConfig } from '@/lib/setup/config-writer'
import postgres from 'postgres'

export interface SetupStatus {
  isConfigured: boolean
  isDatabaseReady: boolean
  hasAdminUser: boolean
  existingTables: string[]
  supabaseUrl?: string
}

/**
 * 1. Inspect setup state and database readiness.
 */
export async function getSetupStatus(): Promise<SetupStatus> {
  const configured = isSupabaseConfigured()
  const completed = isSetupCompleted()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return {
      isConfigured: false,
      isDatabaseReady: false,
      hasAdminUser: false,
      existingTables: [],
    }
  }

  try {
    const supabase = createDynamicServerClient(url, serviceKey)

    // Check existing tables
    const { data: tablesData } = await supabase
      .from('campaigns')
      .select('id')
      .limit(1)

    // Query auth users count to check for admin account
    const { data: usersData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
    const hasAdminUser = (usersData?.users?.length ?? 0) > 0

    const isDatabaseReady = tablesData !== null

    return {
      isConfigured: configured || completed,
      isDatabaseReady,
      hasAdminUser,
      existingTables: isDatabaseReady ? [...CORE_TABLES] : [],
      supabaseUrl: url,
    }
  } catch {
    return {
      isConfigured: configured,
      isDatabaseReady: false,
      hasAdminUser: false,
      existingTables: [],
      supabaseUrl: url,
    }
  }
}

/**
 * 2. Validate Supabase REST credentials and Service Role Key.
 */
export async function testSupabaseConnection(input: {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  dbConnectionString?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanUrl = input.supabaseUrl.trim().replace(/\/$/, '')
    const cleanServiceKey = input.supabaseServiceRoleKey.trim()

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      return { success: false, error: 'Supabase URL must start with https:// or http://' }
    }

    const client = createDynamicServerClient(cleanUrl, cleanServiceKey)

    // Ping auth service with service role client
    const { error: authError } = await client.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (authError) {
      return { success: false, error: `Authentication failed: ${authError.message}` }
    }

    // If direct database connection string provided, test direct postgres connection
    if (input.dbConnectionString?.trim()) {
      const connStr = input.dbConnectionString.trim()
      try {
        const sql = postgres(connStr, {
          max: 1,
          ssl: 'require',
          connect_timeout: 8,
          idle_timeout: 5,
        })
        await sql`SELECT 1;`
        await sql.end()
      } catch (dbErr: unknown) {
        return {
          success: false,
          error: `Database connection string failed: ${dbErr instanceof Error ? dbErr.message : 'Unable to connect to PostgreSQL'}`,
        }
      }
    }

    return { success: true }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to connect to Supabase project',
    }
  }
}

/**
 * 3. Run database migrations using direct Postgres connection or Supabase Management API.
 */
export async function runDatabaseMigrations(input: {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  cronSecret: string
  dbConnectionString?: string
  managementToken?: string
}): Promise<{
  success: boolean
  completedSteps: string[]
  failedStep?: string
  error?: string
}> {
  const cleanUrl = input.supabaseUrl.trim().replace(/\/$/, '')
  const cronSecret = input.cronSecret.trim()
  const dbConn = input.dbConnectionString?.trim()
  const managementToken = input.managementToken?.trim()
  const projectRef = cleanUrl.replace(/^https?:\/\//, '').split('.')[0] || ''

  const steps = getSchemaSteps(cleanUrl, cronSecret)
  const completedSteps: string[] = []

  // Strategy A: Direct PostgreSQL connection driver (recommended & universal)
  if (dbConn) {
    let sqlClient: ReturnType<typeof postgres> | null = null
    try {
      sqlClient = postgres(dbConn, {
        max: 1,
        ssl: 'require',
        connect_timeout: 15,
        idle_timeout: 10,
      })

      for (const step of steps) {
        try {
          await sqlClient.unsafe(step.sql)
          completedSteps.push(step.label)
        } catch (err: unknown) {
          const errStr = err instanceof Error ? err.message : String(err)
          // Handle extension permission warnings gracefully on managed cloud tiers
          if (step.sql.includes('CREATE EXTENSION') && (errStr.includes('permission') || errStr.includes('must be superuser') || errStr.includes('extension'))) {
            completedSteps.push(`${step.label} (skipped / manual toggle required)`)
            continue
          }
          await sqlClient.end()
          return {
            success: false,
            completedSteps,
            failedStep: step.label,
            error: errStr,
          }
        }
      }

      await sqlClient.end()
      return { success: true, completedSteps }
    } catch (connErr: unknown) {
      if (sqlClient) await sqlClient.end().catch(() => {})
      return {
        success: false,
        completedSteps,
        error: `PostgreSQL connection error: ${connErr instanceof Error ? connErr.message : String(connErr)}`,
      }
    }
  }

  // Strategy B: Supabase Management API Query Endpoint (https://api.supabase.com/v1/projects/{ref}/database/query)
  if (managementToken && projectRef) {
    const queryEndpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`

    for (const step of steps) {
      try {
        const res = await fetch(queryEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managementToken}`,
          },
          body: JSON.stringify({ query: step.sql }),
        })

        if (!res.ok) {
          const errText = await res.text()
          if (step.sql.includes('CREATE EXTENSION')) {
            completedSteps.push(`${step.label} (skipped / manual toggle required)`)
            continue
          }
          return {
            success: false,
            completedSteps,
            failedStep: step.label,
            error: `API error (${res.status}): ${errText}`,
          }
        }

        completedSteps.push(step.label)
      } catch (err: unknown) {
        return {
          success: false,
          completedSteps,
          failedStep: step.label,
          error: err instanceof Error ? err.message : 'Management API query failed',
        }
      }
    }

    return { success: true, completedSteps }
  }

  // If neither direct connection string nor management token provided
  return {
    success: false,
    completedSteps: [],
    error: 'Please provide either the Database Connection String (from Supabase Database Settings) or a Supabase Management Access Token to execute SQL migrations.',
  }
}

/**
 * 4. Create confirmed admin user in Supabase Auth.
 */
export async function createAdminUser(input: {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  email: string
  password: string
}): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    const cleanUrl = input.supabaseUrl.trim().replace(/\/$/, '')
    const serviceKey = input.supabaseServiceRoleKey.trim()
    const email = input.email.trim()
    const password = input.password

    if (!email || !email.includes('@')) {
      return { success: false, error: 'Please provide a valid email address.' }
    }
    if (!password || password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters long.' }
    }

    const client = createDynamicServerClient(cleanUrl, serviceKey)

    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'admin', created_via: 'setup_wizard' },
    })

    if (error) {
      // If user already exists, update their password so they can log in
      if (error.message.includes('already exists') || error.message.includes('unique')) {
        const { data: listData } = await client.auth.admin.listUsers()
        const existing = listData?.users.find((u) => u.email === email)
        if (existing) {
          const { error: updateErr } = await client.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
          })
          if (updateErr) return { success: false, error: updateErr.message }
          return { success: true, userId: existing.id }
        }
      }
      return { success: false, error: error.message }
    }

    return { success: true, userId: data.user?.id }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create admin user',
    }
  }
}

/**
 * 5. Test AI (Gemini) and Telegram integrations.
 */
export async function testIntegrations(input: {
  geminiApiKey?: string
  telegramBotToken?: string
  telegramChatId?: string
}): Promise<{
  gemini?: { success: boolean; error?: string; model?: string }
  telegram?: { success: boolean; error?: string; botName?: string }
}> {
  const result: {
    gemini?: { success: boolean; error?: string; model?: string }
    telegram?: { success: boolean; error?: string; botName?: string }
  } = {}

  // Test Gemini API Key
  if (input.geminiApiKey?.trim()) {
    try {
      const key = input.geminiApiKey.trim()
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
      if (res.ok) {
        result.gemini = { success: true, model: 'gemini-2.5-flash / gemini-2.0-flash' }
      } else {
        const errJson = await res.json().catch(() => ({})) as { error?: { message?: string } }
        result.gemini = {
          success: false,
          error: errJson.error?.message || `Google API returned HTTP ${res.status}`,
        }
      }
    } catch (err: unknown) {
      result.gemini = {
        success: false,
        error: err instanceof Error ? err.message : 'Gemini connection failed',
      }
    }
  }

  // Test Telegram Bot Token
  if (input.telegramBotToken?.trim()) {
    try {
      const token = input.telegramBotToken.trim()
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
      const json = await res.json().catch(() => ({})) as { ok?: boolean; result?: { username?: string; first_name?: string } }
      if (json.ok && json.result) {
        result.telegram = {
          success: true,
          botName: `@${json.result.username || json.result.first_name}`,
        }

        // Send a test message if Chat ID provided
        if (input.telegramChatId?.trim()) {
          const chatId = input.telegramChatId.trim()
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '⚡ *Outreach Smart Connection Verified!*\nYour Telegram notifications are now active.',
              parse_mode: 'Markdown',
            }),
          })
        }
      } else {
        result.telegram = { success: false, error: 'Invalid Telegram Bot Token.' }
      }
    } catch (err: unknown) {
      result.telegram = {
        success: false,
        error: err instanceof Error ? err.message : 'Telegram connection failed',
      }
    }
  }

  return result
}

/**
 * 6. Verify Edge Functions health.
 */
export async function verifyEdgeFunctions(input: {
  supabaseUrl: string
  cronSecret: string
}): Promise<{
  sender: { reachable: boolean; status?: number; error?: string }
  replyChecker: { reachable: boolean; status?: number; error?: string }
}> {
  const cleanUrl = input.supabaseUrl.trim().replace(/\/$/, '')
  const cronSecret = input.cronSecret.trim()

  const checkFunc = async (name: string) => {
    try {
      const res = await fetch(`${cleanUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': cronSecret,
        },
        body: JSON.stringify({ _ping: true }),
      })
      return {
        reachable: res.status !== 404 && res.status !== 502,
        status: res.status,
      }
    } catch (err: unknown) {
      return {
        reachable: false,
        error: err instanceof Error ? err.message : 'Connection failed',
      }
    }
  }

  const [sender, replyChecker] = await Promise.all([
    checkFunc('sender'),
    checkFunc('reply-checker'),
  ])

  return { sender, replyChecker }
}

/**
 * 7. Programmatic Edge Function Secrets Injection via Management API.
 */
export async function setProjectSecrets(input: {
  projectRef: string
  managementToken: string
  secrets: Record<string, string>
}): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = input.projectRef.trim()
    const token = input.managementToken.trim()

    const payload = Object.entries(input.secrets).map(([name, value]) => ({
      name,
      value,
    }))

    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.text()
      return { success: false, error: `Supabase API error (${res.status}): ${err}` }
    }

    return { success: true }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update secrets via Management API',
    }
  }
}

/**
 * 8. Save final setup configuration.
 */
export async function saveSetupConfiguration(config: SetupConfig): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  return saveConfiguration(config)
}
