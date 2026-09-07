'use server'

import { createDynamicServerClient, isSupabaseConfigured, isSetupCompleted } from '@/lib/supabase/server'
import { getSchemaSteps, CORE_TABLES } from '@/lib/setup/schema-bundle'
import { saveConfiguration, type SetupConfig } from '@/lib/setup/config-writer'
import postgres from 'postgres'
import { promises as fsPromises } from 'node:fs'
import path from 'node:path'

// ─── Edge Functions: deploy + cron scheduling helpers ───────────────────────
//
// These helpers back `deployEdgeFunctions`, `configureEdgeFunctionsAuth` and
// `switchCronToEdgeFunctions` below. They are intentionally generic — they
// enumerate whatever subdirectories currently exist under `supabase/functions/`
// (excluding `_shared`, a helpers folder, not a function) rather than
// hardcoding function names. This lets a new function directory (e.g.
// `thread-sync`) get picked up automatically once it exists on disk, with no
// code change required here.
//
// NOTE: reading `supabase/functions/**` from disk only works in a Node.js
// runtime with access to the repository source (e.g. `npm run dev` locally,
// or a CI/deploy step). It will not work from within the deployed Cloudflare
// Workers runtime, which only ships the traced Next.js output — callers get a
// clear error in that case rather than a silent failure.

/**
 * Per-function pg_cron schedule. Only slugs that both (a) appear here and (b)
 * actually exist under `supabase/functions/` get scheduled — an entry for a
 * not-yet-created function (e.g. `thread-sync` before its own migration/code
 * lands) is simply skipped, not an error.
 */
const EDGE_FUNCTION_CRON_SCHEDULES: Record<string, string> = {
  sender: '* * * * *',
  'reply-checker': '*/3 * * * *',
  'thread-sync': '0 * * * *',
}

/** Enumerates deployable Edge Function slugs under `supabase/functions/`. */
async function listEdgeFunctionSlugs(): Promise<string[]> {
  const functionsDir = path.join(process.cwd(), 'supabase', 'functions')
  const entries = await fsPromises.readdir(functionsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
    .map((entry) => entry.name)
    .sort()
}

/** Converts an absolute path to a repo-root-relative, forward-slashed path (matches the Supabase CLI's own `toRelPath` convention for Management API deploys). */
function toApiRelativePath(absPath: string): string {
  return path.relative(process.cwd(), absPath).split(path.sep).join('/')
}

// Matches `import ... from './x.ts'`, `import './x.ts'`, and `import('./x.ts')` — local
// (relative) specifiers only. Remote specifiers (e.g. `https://esm.sh/...`) are resolved
// directly by the Deno runtime and never need to be uploaded.
const LOCAL_IMPORT_RE = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g

/**
 * Walks the local (relative-import) dependency graph of an Edge Function's
 * entrypoint, e.g. `reply-checker/index.ts` importing `../_shared/gemini.ts`.
 * Returns absolute paths of every local file that needs to be uploaded
 * alongside the entrypoint for the deploy to resolve correctly.
 */
async function collectLocalImportGraph(entrypoint: string): Promise<string[]> {
  const visited = new Set<string>()
  const queue: string[] = [path.resolve(entrypoint)]

  while (queue.length > 0) {
    const current = queue.shift() as string
    if (visited.has(current)) continue
    visited.add(current)

    let contents: string
    try {
      contents = await fsPromises.readFile(current, 'utf8')
    } catch {
      continue
    }

    const dir = path.dirname(current)
    for (const match of contents.matchAll(LOCAL_IMPORT_RE)) {
      const imported = path.resolve(dir, match[1])
      if (!visited.has(imported)) {
        queue.push(imported)
      }
    }
  }

  return [...visited]
}

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
      if (sqlClient) await sqlClient.end().catch(() => { })
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

/** Shape of a single Edge Function's reachability check, as classified by `checkFunc` below. */
export interface EdgeFunctionVerification {
  reachable: boolean
  status?: number
  error?: string
}

/**
 * 5. Verify background cron workers health.
 *
 * Priority order is Edge Function first, App URL (`/api/cron/<slug>`) as a
 * fallback for projects that haven't switched cron over yet. Statuses are
 * distinguished rather than collapsed into a single "reachable" boolean so
 * the UI can tell a genuine 401 (JWT/auth misconfiguration) apart from a 404
 * (not deployed under this slug/URL) or a 5xx (function deployed but
 * throwing at runtime).
 *
 * Generic over `slugs` — defaults to the same disk enumeration used by
 * `deployEdgeFunctions` / `configureEdgeFunctionsAuth` /
 * `switchCronToEdgeFunctions`, so a new function directory (e.g.
 * `thread-sync`) gets a live verification result automatically with no code
 * change here. If disk enumeration isn't possible in the current runtime
 * (e.g. the deployed Cloudflare Workers instance, which doesn't ship
 * `supabase/functions/**`), falls back to the historical two-slug set
 * (`sender`, `reply-checker`) so the health check keeps working rather than
 * erroring outright.
 *
 * The return value is keyed by slug (`result['reply-checker']`, etc.) — the
 * new generic shape consumers should migrate to. For backward compatibility
 * with existing callers (notably `StepEdgeFunctions.tsx`, until it migrates
 * in a follow-up — see #17), the two legacy named fields `sender` /
 * `replyChecker` are also spread at the top level, mirroring the keyed
 * entries for `sender` / `reply-checker`. Once #17 lands and the UI reads
 * the keyed record directly, the two legacy fields can be dropped.
 */
export async function verifyEdgeFunctions(input: {
  supabaseUrl: string
  cronSecret: string
  appUrl?: string
  anonKey?: string
  slugs?: string[]
}): Promise<
  Record<string, EdgeFunctionVerification> & {
    sender: EdgeFunctionVerification
    replyChecker: EdgeFunctionVerification
  }
> {
  const cleanUrl = input.supabaseUrl.trim().replace(/\/$/, '')
  const cronSecret = input.cronSecret.trim()
  const appUrl = input.appUrl?.trim().replace(/\/$/, '')
  const anonKey = input.anonKey?.trim()

  const describeStatus = (status: number): string => {
    if (status === 401) return 'Unauthorized (401) — check verify_jwt / anon key / x-cron-secret'
    if (status === 404) return 'Not found (404) — function is not deployed at this URL'
    if (status >= 500) return `Server error (${status}) — function reached but threw while executing`
    return `Unexpected HTTP ${status}`
  }

  const checkFunc = async (name: string): Promise<EdgeFunctionVerification> => {
    // 1. Primary: deployed Supabase Edge Function URL
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
      }
      if (anonKey) headers.Authorization = `Bearer ${anonKey}`

      const res = await fetch(`${cleanUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ _ping: true }),
      })

      if (res.status === 200) {
        return { reachable: true, status: res.status }
      }
      if (res.status !== 404) {
        // Function exists but responded with an auth/runtime error — surface it
        // directly instead of silently falling back to the App URL check.
        return { reachable: false, status: res.status, error: describeStatus(res.status) }
      }
      // 404 → nothing deployed at this slug/URL yet; fall through to App URL.
    } catch {
      // Network error reaching the Edge Function — fall through to App URL.
    }

    // 2. Fallback: legacy Next.js App API route
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
          return { reachable: true, status: res.status }
        }
        return { reachable: false, status: res.status, error: describeStatus(res.status) }
      } catch (err: unknown) {
        return {
          reachable: false,
          error: err instanceof Error ? err.message : 'Connection failed',
        }
      }
    }

    return {
      reachable: false,
      error: 'Edge Function not found (404) and no App URL fallback configured.',
    }
  }

  let slugs = input.slugs
  if (!slugs || slugs.length === 0) {
    try {
      slugs = await listEdgeFunctionSlugs()
    } catch {
      // Disk enumeration unavailable in this runtime (e.g. deployed Cloudflare Workers
      // instance) — fall back to the historical two-slug set rather than erroring out.
      slugs = ['sender', 'reply-checker']
    }
  }

  const results = Object.fromEntries(
    await Promise.all(slugs.map(async (slug) => [slug, await checkFunc(slug)] as const))
  ) as Record<string, EdgeFunctionVerification>

  // Legacy named fields for backward compatibility with callers that haven't migrated to the
  // keyed record yet (see #17). Fall back to an "unreachable" placeholder if `slugs` was passed
  // explicitly without these two entries, so the shape is always fully populated.
  const sender = results.sender ?? { reachable: false, error: 'Not checked' }
  const replyChecker = results['reply-checker'] ?? { reachable: false, error: 'Not checked' }

  return { ...results, sender, replyChecker }
}

/**
 * 6. Deploy Edge Function code via the Supabase Management API.
 *
 * Enumerates whatever subdirectories currently exist under
 * `supabase/functions/` (excluding `_shared`) and deploys each one — this is
 * the step that must run before secrets/auth/cron-switching, since those all
 * assume the function code is already live. Uses the Management API's
 * multipart deploy endpoint (`POST /v1/projects/{ref}/functions/deploy`),
 * the same endpoint the Supabase CLI itself uses for `supabase functions
 * deploy --use-api`. Uploaded file names and `entrypoint_path` are anchored
 * at the repo root (`process.cwd()`), matching the CLI's own convention, so
 * relative imports like `../_shared/gemini.ts` resolve the same way they do
 * locally.
 *
 * Requires being invoked from a Node.js runtime with access to the repo
 * source (e.g. `npm run dev` locally, or a CI/deploy step) — the deployed
 * Cloudflare Workers runtime does not ship `supabase/functions/**` as part
 * of the traced Next.js output, so this will fail there with a clear error
 * rather than silently deploying nothing.
 */
export async function deployEdgeFunctions(input: {
  projectRef: string
  managementToken: string
}): Promise<{
  success: boolean
  deployed: string[]
  failedSlug?: string
  error?: string
}> {
  const ref = input.projectRef.trim()
  const token = input.managementToken.trim()
  const functionsDir = path.join(process.cwd(), 'supabase', 'functions')

  let slugs: string[]
  try {
    slugs = await listEdgeFunctionSlugs()
  } catch (err: unknown) {
    return {
      success: false,
      deployed: [],
      error: `Could not read supabase/functions/ (${err instanceof Error ? err.message : String(err)}). Edge Function deployment must be run from an environment with access to the repository source (e.g. "npm run dev" locally), not from the deployed Cloudflare Workers instance.`,
    }
  }

  if (slugs.length === 0) {
    return { success: false, deployed: [], error: 'No Edge Functions found under supabase/functions/.' }
  }

  const deployed: string[] = []
  for (const slug of slugs) {
    try {
      const entrypoint = path.join(functionsDir, slug, 'index.ts')
      const localFiles = await collectLocalImportGraph(entrypoint)

      const form = new FormData()
      form.append(
        'metadata',
        JSON.stringify({
          name: slug,
          entrypoint_path: toApiRelativePath(entrypoint),
        })
      )
      for (const filePath of localFiles) {
        const contents = await fsPromises.readFile(filePath)
        form.append('file', new Blob([contents]), toApiRelativePath(filePath))
      }

      const res = await fetch(
        `https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${encodeURIComponent(slug)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        }
      )

      if (!res.ok) {
        const errText = await res.text()
        return {
          success: false,
          deployed,
          failedSlug: slug,
          error: `Deploy failed for "${slug}" (HTTP ${res.status}): ${errText || res.statusText}`,
        }
      }

      deployed.push(slug)
    } catch (err: unknown) {
      return {
        success: false,
        deployed,
        failedSlug: slug,
        error: err instanceof Error ? err.message : `Failed to deploy "${slug}"`,
      }
    }
  }

  return { success: true, deployed }
}

/**
 * 7. Programmatic Edge Function Secrets Injection via Management API.
 *
 * `secrets` remains a free-form bag for backward compatibility with existing
 * callers. `supabaseUrl` / `supabaseServiceRoleKey` are optional companions
 * that, when provided, are merged in as `SUPABASE_URL` /
 * `SUPABASE_SERVICE_ROLE_KEY` — the Edge Functions read both directly via
 * `Deno.env.get(...)` and boot without connecting to the database if they're
 * missing.
 */
export async function setProjectSecrets(input: {
  projectRef: string
  managementToken: string
  secrets: Record<string, string>
  supabaseUrl?: string
  supabaseServiceRoleKey?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = input.projectRef.trim()
    const token = input.managementToken.trim()

    const secrets: Record<string, string> = { ...input.secrets }
    if (input.supabaseUrl?.trim()) {
      secrets.SUPABASE_URL = input.supabaseUrl.trim().replace(/\/$/, '')
    }
    if (input.supabaseServiceRoleKey?.trim()) {
      secrets.SUPABASE_SERVICE_ROLE_KEY = input.supabaseServiceRoleKey.trim()
    }

    const payload = Object.entries(secrets).map(([name, value]) => ({
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
 * 7b. Disable gateway JWT verification (`verify_jwt: false`) per deployed
 * Edge Function via the Management API. This is the gateway-level half of
 * the 401 defense-in-depth (see `switchCronToEdgeFunctions` for the other
 * half — the `Authorization: Bearer <anon_key>` header on the cron query
 * itself). Matches the CLI's `--no-verify-jwt` flag.
 */
export async function configureEdgeFunctionsAuth(input: {
  projectRef: string
  managementToken: string
  slugs?: string[]
}): Promise<{
  success: boolean
  configured: string[]
  failedSlug?: string
  error?: string
}> {
  const ref = input.projectRef.trim()
  const token = input.managementToken.trim()

  let slugs = input.slugs
  if (!slugs || slugs.length === 0) {
    try {
      slugs = await listEdgeFunctionSlugs()
    } catch (err: unknown) {
      return {
        success: false,
        configured: [],
        error: `Could not determine which Edge Functions to configure (${err instanceof Error ? err.message : String(err)}). Pass "slugs" explicitly, or run from an environment with access to supabase/functions/.`,
      }
    }
  }

  if (slugs.length === 0) {
    return { success: false, configured: [], error: 'No Edge Functions to configure.' }
  }

  const configured: string[] = []
  for (const slug of slugs) {
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ verify_jwt: false }),
      })

      if (!res.ok) {
        const errText = await res.text()
        return {
          success: false,
          configured,
          failedSlug: slug,
          error: `Failed to disable JWT verification for "${slug}" (HTTP ${res.status}): ${errText || res.statusText}`,
        }
      }

      configured.push(slug)
    } catch (err: unknown) {
      return {
        success: false,
        configured,
        failedSlug: slug,
        error: err instanceof Error ? err.message : `Failed to configure "${slug}"`,
      }
    }
  }

  return { success: true, configured }
}

/**
 * 7c. Switch pg_cron from calling `app_url/api/cron/<slug>` to calling
 * `supabase_url/functions/v1/<slug>` directly.
 *
 * Generically unschedules every existing `outreach-*` job (regardless of
 * which slugs it used to point at) via `SELECT cron.unschedule(jobname) FROM
 * cron.job WHERE jobname LIKE 'outreach-%'`, then reschedules one job per
 * function slug that is both (a) present in `EDGE_FUNCTION_CRON_SCHEDULES`
 * and (b) actually deployed on disk (or explicitly passed via `slugs`). A
 * schedule entry for a slug that doesn't exist yet (e.g. `thread-sync`
 * before its own issue merges) is skipped silently, not an error.
 *
 * Each scheduled job sends both `Authorization: Bearer <anon_key>` (satisfies
 * the gateway's default JWT check even if `verify_jwt` wasn't disabled) and
 * `x-cron-secret` (checked by the function's own application logic) —
 * defense-in-depth against 401s, mirroring `configureEdgeFunctionsAuth`.
 */
export async function switchCronToEdgeFunctions(input: {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  supabaseAnonKey: string
  cronSecret: string
  managementToken?: string
  dbConnectionString?: string
  slugs?: string[]
}): Promise<{
  success: boolean
  scheduled: string[]
  error?: string
}> {
  const cleanUrl = input.supabaseUrl.trim().replace(/\/$/, '')
  const anonKey = input.supabaseAnonKey.trim()
  const cronSecret = input.cronSecret.trim()
  const managementToken = input.managementToken?.trim()
  const dbConn = input.dbConnectionString?.trim()
  const projectRef = cleanUrl.replace(/^https?:\/\//, '').split('.')[0] || ''

  let slugs = input.slugs
  if (!slugs || slugs.length === 0) {
    try {
      slugs = await listEdgeFunctionSlugs()
    } catch (err: unknown) {
      return {
        success: false,
        scheduled: [],
        error: `Could not determine which Edge Functions to schedule (${err instanceof Error ? err.message : String(err)}). Pass "slugs" explicitly, or run from an environment with access to supabase/functions/.`,
      }
    }
  }

  const toSchedule = slugs.filter((slug) => slug in EDGE_FUNCTION_CRON_SCHEDULES)
  if (toSchedule.length === 0) {
    return { success: false, scheduled: [], error: 'No known Edge Function schedules matched the deployed functions.' }
  }

  const scheduleStatements = toSchedule
    .map((slug) => {
      const schedule = EDGE_FUNCTION_CRON_SCHEDULES[slug]
      const jobName = `outreach-${slug}`
      return `
        SELECT cron.schedule(
          '${jobName}', '${schedule}',
          $$ SELECT net.http_post(
            url     := (SELECT value FROM cron_config.settings WHERE key = 'supabase_url') || '/functions/v1/${slug}',
            headers := jsonb_build_object(
              'Content-Type',  'application/json',
              'Authorization', 'Bearer ' || (SELECT value FROM cron_config.settings WHERE key = 'anon_key'),
              'x-cron-secret', (SELECT value FROM cron_config.settings WHERE key = 'cron_secret')
            ),
            body := '{}'::jsonb
          ) $$
        );`
    })
    .join('\n')

  const sql = `
      -- Remove every previously scheduled outreach-* job, whether it targeted
      -- app_url/api/cron/<slug> or an earlier functions/v1/<slug> set.
      SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'outreach-%';

      -- Ensure cron_config.settings has the values the jobs below reference.
      INSERT INTO cron_config.settings (key, value) VALUES ('supabase_url', '${cleanUrl}')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
      INSERT INTO cron_config.settings (key, value) VALUES ('cron_secret', '${cronSecret}')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
      INSERT INTO cron_config.settings (key, value) VALUES ('anon_key', '${anonKey}')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

      ${scheduleStatements}
    `

  if (managementToken && projectRef) {
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managementToken}`,
        },
        body: JSON.stringify({ query: sql }),
      })
      if (res.ok) {
        return { success: true, scheduled: toSchedule }
      }
      const errText = await res.text()
      if (!dbConn) {
        return { success: false, scheduled: [], error: `Supabase API error (${res.status}): ${errText}` }
      }
    } catch (err: unknown) {
      if (!dbConn) {
        return {
          success: false,
          scheduled: [],
          error: err instanceof Error ? err.message : 'Management API request failed',
        }
      }
    }
  }

  if (dbConn) {
    let sqlClient: ReturnType<typeof postgres> | null = null
    try {
      sqlClient = postgres(dbConn, {
        max: 1,
        ssl: 'require',
        connect_timeout: 15,
        idle_timeout: 10,
      })
      await sqlClient.unsafe(sql)
      await sqlClient.end()
      return { success: true, scheduled: toSchedule }
    } catch (err: unknown) {
      if (sqlClient) await sqlClient.end().catch(() => { })
      return {
        success: false,
        scheduled: [],
        error: err instanceof Error ? err.message : 'Failed to switch cron jobs via direct database connection',
      }
    }
  }

  return {
    success: false,
    scheduled: [],
    error: 'Please provide a Supabase Personal Access Token (sbp_...) or Database Connection String to switch cron jobs.',
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

