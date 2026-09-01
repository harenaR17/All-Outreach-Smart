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
 * Safely returns public Supabase connection parameters (URL and Anon Key).
 * Used by client auth context to initialize browser client if build-time env vars were not inlined.
 */
export async function getPublicSupabaseConfig(): Promise<{
  supabaseUrl: string
  supabaseAnonKey: string
  isConfigured: boolean
}> {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  let completed = process.env.SETUP_COMPLETED === 'true' || process.env.NEXT_PUBLIC_SETUP_COMPLETED === 'true'

  if (!url || !anonKey || !completed) {
    try {
      const { cookies } = await import('next/headers')
      const cookieStore = await cookies()
      url = url || cookieStore.get('os_supabase_url')?.value || ''
      anonKey = anonKey || cookieStore.get('os_supabase_anon_key')?.value || ''
      completed = completed || cookieStore.get('os_setup_completed')?.value === 'true'
    } catch {
      // Cookies not accessible
    }
  }

  return {
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    isConfigured: Boolean(url && anonKey) || completed,
  }
}

/**
 * 1. Inspect setup state and database readiness.
 */
export async function getSetupStatus(): Promise<SetupStatus> {
  let configured = isSupabaseConfigured()
  let completed = isSetupCompleted()

  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey || !completed) {
    try {
      const { cookies } = await import('next/headers')
      const cookieStore = await cookies()
      url = url || cookieStore.get('os_supabase_url')?.value
      serviceKey = serviceKey || cookieStore.get('os_service_role_key')?.value
      completed = completed || cookieStore.get('os_setup_completed')?.value === 'true'
      if (url && serviceKey) configured = true
    } catch {
      // Cookies not accessible
    }
  }

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
  managementToken?: string
  dbConnectionString?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanUrl = input.supabaseUrl.trim().replace(/\/$/, '')
    const cleanServiceKey = input.supabaseServiceRoleKey.trim()
    const managementToken = input.managementToken?.trim()
    const projectRef = cleanUrl.replace(/^https?:\/\//, '').split('.')[0] || ''

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      return { success: false, error: 'Supabase URL must start with https:// or http://' }
    }

    const client = createDynamicServerClient(cleanUrl, cleanServiceKey)

    // 1. Ping auth service with service role client
    const { error: authError } = await client.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (authError) {
      return { success: false, error: `Authentication failed: ${authError.message}` }
    }

    // 2. If Management Token provided, verify against Supabase Management API
    if (managementToken && projectRef) {
      try {
        const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}`, {
          headers: { Authorization: `Bearer ${managementToken}` },
        })
        if (!res.ok) {
          const errText = await res.text()
          return {
            success: false,
            error: `Personal Access Token invalid (${res.status}): ${errText || res.statusText}`,
          }
        }
      } catch (tokenErr: unknown) {
        return {
          success: false,
          error: `Management API unreachable: ${tokenErr instanceof Error ? tokenErr.message : String(tokenErr)}`,
        }
      }
    }

    // 3. If direct database connection string provided, test direct postgres connection
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
 * 3. Run database migrations using Supabase Management API (HTTPS) or direct Postgres connection.
 */
export async function runDatabaseMigrations(input: {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  cronSecret: string
  managementToken?: string
  dbConnectionString?: string
  appUrl?: string
}): Promise<{
  success: boolean
  completedSteps: string[]
  failedStep?: string
  error?: string
}> {
  const cleanUrl = input.supabaseUrl.trim().replace(/\/$/, '')
  const cronSecret = input.cronSecret.trim()
  const managementToken = input.managementToken?.trim()
  const dbConn = input.dbConnectionString?.trim()
  const projectRef = cleanUrl.replace(/^https?:\/\//, '').split('.')[0] || ''
  const appUrl = input.appUrl?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || ''

  const steps = getSchemaSteps(cleanUrl, cronSecret, appUrl)
  const completedSteps: string[] = []

  // Strategy A: Supabase Management API Query Endpoint (100% HTTPS - works on Cloudflare & Localhost)
  if (managementToken && projectRef) {
    const endpoints = [
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      `https://api.supabase.com/v1/projects/${projectRef}/query`,
    ]

    for (const step of steps) {
      let stepSuccess = false
      let lastError = ''

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${managementToken}`,
            },
            body: JSON.stringify({ query: step.sql }),
          })

          if (res.ok) {
            completedSteps.push(step.label)
            stepSuccess = true
            break
          } else {
            const errText = await res.text()
            lastError = `HTTP ${res.status}: ${errText}`
            // Handle permission notice on extension creation gracefully
            if (step.sql.includes('CREATE EXTENSION') && (res.status === 403 || errText.includes('permission'))) {
              completedSteps.push(`${step.label} (skipped / manual toggle required)`)
              stepSuccess = true
              break
            }
          }
        } catch (fetchErr: unknown) {
          lastError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
        }
      }

      if (!stepSuccess) {
        return {
          success: false,
          completedSteps,
          failedStep: step.label,
          error: lastError || 'Query execution failed',
        }
      }
    }

    return { success: true, completedSteps }
  }

  // Strategy B: Direct PostgreSQL connection driver (fallback for Node environments)
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

  return {
    success: false,
    completedSteps: [],
    error: 'Please provide a Supabase Personal Access Token (sbp_...) or Database Connection String to execute migrations.',
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
 * 5. Verify background cron workers health.
 */
export async function verifyEdgeFunctions(input: {
  supabaseUrl: string
  cronSecret: string
  appUrl?: string
}): Promise<{
  sender: { reachable: boolean; status?: number; error?: string }
  replyChecker: { reachable: boolean; status?: number; error?: string }
}> {
  const cleanUrl = input.supabaseUrl.trim().replace(/\/$/, '')
  const cronSecret = input.cronSecret.trim()
  const appUrl = input.appUrl?.trim().replace(/\/$/, '')

  const checkFunc = async (name: string) => {
    // 1. Check Next.js App API route first if appUrl is provided
    if (appUrl) {
      try {
        const res = await fetch(`${appUrl}/api/cron/${name}?ping=true`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': cronSecret,
          },
        })
        if (res.status === 200 || res.status === 401) {
          return {
            reachable: true,
            status: res.status,
          }
        }
      } catch {
        // App URL route ping failed, fall through to check Supabase Edge Function
      }
    }

    // 2. Fallback check for deployed Supabase Edge Function
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

/**
 * 9. Inspect cron_config.settings directly from the Supabase database.
 */
export async function getDatabaseCronSettings(input: {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  managementToken?: string
}): Promise<{
  success: boolean
  settings?: Record<string, string>
  error?: string
}> {
  try {
    const cleanUrl = input.supabaseUrl.trim().replace(/\/$/, '')
    const cleanServiceKey = input.supabaseServiceRoleKey.trim()
    const managementToken = input.managementToken?.trim()
    const projectRef = cleanUrl.replace(/^https?:\/\//, '').split('.')[0] || ''

    // 1. Try Management API if token provided
    if (managementToken && projectRef) {
      try {
        const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managementToken}`,
          },
          body: JSON.stringify({ query: 'SELECT key, value FROM cron_config.settings;' }),
        })
        if (res.ok) {
          const rows = (await res.json()) as Array<{ key: string; value: string }>
          const settings: Record<string, string> = {}
          for (const row of rows) {
            settings[row.key] = row.value
          }
          return { success: true, settings }
        }
      } catch {
        // Fallback to client query
      }
    }

    // 2. Fallback to Service Role REST client
    const client = createDynamicServerClient(cleanUrl, cleanServiceKey)
    const { data, error } = await (client as any)
      .from('cron_config.settings')
      .select('key, value')

    if (error) {
      return { success: false, error: error.message }
    }

    const settings: Record<string, string> = {}
    for (const row of ((data as Array<{ key: string; value: string }>) || [])) {
      settings[row.key] = row.value
    }
    return { success: true, settings }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to query database settings' }
  }
}

/**
 * 10. Sync / fix app_url in cron_config.settings and reschedule cron jobs.
 */
export async function syncDatabaseCronAppUrl(input: {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  managementToken?: string
  appUrl: string
  cronSecret?: string
}): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const cleanUrl = input.supabaseUrl.trim().replace(/\/$/, '')
    const cleanServiceKey = input.supabaseServiceRoleKey.trim()
    const cleanAppUrl = input.appUrl.trim().replace(/\/$/, '')
    const managementToken = input.managementToken?.trim()
    const projectRef = cleanUrl.replace(/^https?:\/\//, '').split('.')[0] || ''

    if (managementToken && projectRef) {
      const sql = `
        INSERT INTO cron_config.settings (key, value)
        VALUES ('app_url', '${cleanAppUrl}')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

        SELECT cron.schedule(
          'outreach-sender',
          '* * * * *',
          $$
          SELECT
            net.http_post(
              url     := (SELECT value || '/api/cron/sender' FROM cron_config.settings WHERE key = 'app_url'),
              headers := jsonb_build_object(
                'Content-Type',    'application/json',
                'x-cron-secret',   (SELECT value FROM cron_config.settings WHERE key = 'cron_secret')
              ),
              body    := '{}'::jsonb
            )
          $$
        );

        SELECT cron.schedule(
          'outreach-reply-checker',
          '*/3 * * * *',
          $$
          SELECT
            net.http_post(
              url     := (SELECT value || '/api/cron/reply-checker' FROM cron_config.settings WHERE key = 'app_url'),
              headers := jsonb_build_object(
                'Content-Type',    'application/json',
                'x-cron-secret',   (SELECT value FROM cron_config.settings WHERE key = 'cron_secret')
              ),
              body    := '{}'::jsonb
            )
          $$
        );
      `
      const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managementToken}`,
        },
        body: JSON.stringify({ query: sql }),
      })
      if (res.ok) {
        return { success: true }
      }
    }

    // Direct client upsert fallback
    const client = createDynamicServerClient(cleanUrl, cleanServiceKey)
    const { error } = await (client as any)
      .from('cron_config.settings')
      .upsert({ key: 'app_url', value: cleanAppUrl }, { onConflict: 'key' })

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update app_url in database' }
  }
}

