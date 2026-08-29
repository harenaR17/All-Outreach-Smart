# In-App Setup Wizard — Implementation Plan
**Document Version:** 1.0.0  
**Target Project:** Outreach Smart  
**Objective:** Enable zero-configuration cloning so that any developer or friend can clone the repository, run `npm run dev`, and be guided through a complete in-browser setup wizard to initialize Supabase, run migrations, create the admin account, and configure all integrations without touching code.

---

## 1. Executive Summary & Architecture Overview

Currently, setting up Outreach Smart requires manual creation of `.env.local`, manual execution of 6 separate SQL migration files in the Supabase SQL Editor, manual replacement of SQL template variables, manual Supabase CLI authentication, and deploying edge functions. If environment variables are missing, Next.js crashes with unhandled server errors.

This plan details how to build an **In-App Setup Wizard (`/setup`)** that automates the entire onboarding process in the browser:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                       OUTREACH SMART SETUP FLOW                            │
│                                                                            │
│  1. Clone & Start                                                          │
│     `git clone <repo>` ──► `npm install` ──► `npm run dev`                 │
│                                                                            │
│  2. Automatic Route Guard Check                                            │
│     App detects missing .env.local or uninitialized DB ──► Redirect /setup │
│                                                                            │
│  3. Multi-Step Browser Setup Wizard                                        │
│     ├── Step 1: Connect Supabase (URL, Anon Key, Service Role Key, DB URL) │
│     ├── Step 2: 1-Click Database Migration (Auto-creates all 10+ tables)   │
│     ├── Step 3: Create Admin Account (Email & Password in Supabase Auth)   │
│     ├── Step 4: AI & Alert Integrations (Gemini API Key, Telegram Bot)     │
│     └── Step 5: Edge Functions & Cron Activation                           │
│                                                                            │
│  4. Auto-Save & Lockout                                                    │
│     Writes `.env.local` ──► Locks `/setup` route ──► Redirects to `/login` │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Current Pain Points & Root Causes

| Area | Current Issue | Root Cause |
| :--- | :--- | :--- |
| **Supabase Client Init** | App crashes on boot if `.env.local` is missing. | [src/lib/supabase/client.ts](file:///src/lib/supabase/client.ts) and [src/lib/supabase/server.ts](file:///src/lib/supabase/server.ts) throw top-level `Error('Missing NEXT_PUBLIC_SUPABASE_URL')`. |
| **Auth Context & Shell** | Unhandled promise rejection / infinite redirect loop. | [AuthContext.tsx](file:///src/components/auth/AuthContext.tsx) assumes Supabase client is non-null on mount; [AppShell.tsx](file:///src/components/AppShell.tsx) redirects to `/login` without checking if setup is needed. |
| **Database Schema** | 6 separate `.sql` files must be manually run in exact order. | Migrations are split across `00001` to `00005_cron_jobs.sql`, with hardcoded strings like `https://YOUR_PROJECT_REF.supabase.co`. |
| **Edge Functions** | Edge functions require manual Supabase CLI linking & secret injection. | `sender` and `reply-checker` require `CRON_SECRET`, `GEMINI_API_KEY`, and `TELEGRAM_BOT_TOKEN` set via CLI. |

---

## 3. Core Architectural Components to Build

### Component 1: Non-Crashing Supabase Client with Safe Fallback
* **Files:** `src/lib/supabase/client.ts` & `src/lib/supabase/server.ts`
* **Changes:**
  * Do not throw unhandled exceptions during module evaluation or runtime if credentials are missing.
  * Export helper `isSupabaseConfigured(): boolean` to check if keys exist.
  * Provide dynamic client initialization `createDynamicServerClient(url, key)` for use during the setup wizard before `.env.local` is saved.

### Component 2: Route Guard & Setup Detection Middleware
* **Files:** `src/components/AppShell.tsx`, `src/components/auth/AuthContext.tsx`, `src/middleware.ts`
* **Changes:**
  * Add `/setup` to `PUBLIC_ROUTES`.
  * If `isConfigured === false` or database ping fails:
    * Intercept page visits and seamlessly redirect the user to `/setup`.
    * Suppress authentication checks while in setup mode.
  * If setup has been completed, lock the `/setup` route from future unauthorized access.

### Component 3: Consolidated Schema Runner (`src/lib/setup/schema-bundle.ts`)
* **Purpose:** Package all tables, indexes, helper views, and triggers into a single programmatic execution bundle.
* **Mechanism:**
  * Uses a direct PostgreSQL connection driver (e.g. `postgres` / `pg`) to execute the DDL transaction.
  * Replaces placeholders dynamically:
    * Injects the user's actual Supabase project URL into `cron_config.settings`.
    * Generates a cryptographically random `CRON_SECRET`.
  * Table schema executed in order:
    1. Extensions: `pgcrypto`, `pg_cron`, `pg_net`.
    2. Tables: `email_accounts`, `campaigns`, `lead_imports`, `leads`, `campaign_steps`, `campaign_email_accounts`, `campaign_leads`, `sends`, `replies`, `gemini_api_keys`, `telegram_notify_recipients`, `campaign_telegram_recipients`, `api_keys`.
    3. Views: `campaign_sends_today`.
    4. Triggers & Cron: `cron_config.settings`, `cron.schedule('outreach-sender')`, `cron.schedule('outreach-reply-checker')`.

### Component 4: Server Actions for Setup (`src/app/actions/setup.ts`)
* `checkSetupStatus()`: Checks whether `.env.local` exists, database is reachable, and core tables exist.
* `testSupabaseConnection(input)`: Validates URL and Service Role Key by making a lightweight REST call.
* `runDatabaseMigrations(input)`: Connects via Postgres connection string or Supabase query API, creates all tables, and returns real-time progress for each table.
* `createAdminUser(input)`: Calls `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })` so the user can immediately log in without email confirmation delays.
* `saveSetupConfiguration(input)`: Writes `.env.local` on the host machine using Node `fs`.
* `testIntegrations(input)`: Validates Gemini API Key by pinging `generativelanguage.googleapis.com` and Telegram Bot Token by calling `getMe`.

### Component 5: Interactive Setup Wizard UI (`src/app/setup/page.tsx`)
* A dark-themed, glassmorphic 5-step wizard built with Tailwind CSS, Lucide icons, and framer-motion/transitions.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Step 1: Database  ──► Step 2: Schema ──► Step 3: Admin ──► Step 4: AI & Bot│
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Detailed Step-by-Step User Flow in the Wizard

### 📍 Step 1: Connect Supabase Credentials
* **Inputs:**
  * `Supabase Project URL` (e.g., `https://abcdefghijklm.supabase.co`)
  * `Supabase Anon Key` (public)
  * `Supabase Service Role Key` (secret)
  * `Database Connection String` or `Database Password` (e.g., `postgres://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`)
* **Action:** User clicks **"Test Connection"**.
* **Validation:** 
  * App verifies the REST API responds and the Postgres connection succeeds.
  * Displays green checkmarks on valid inputs.

---

### 📍 Step 2: Automated Database Initialization (1-Click)
* **UI:** A progress checklist showing each database component being initialized:
  * [x] Enable PostgreSQL extensions (`pgcrypto`, `pg_cron`, `pg_net`)
  * [x] Create core tables (`campaigns`, `inboxes`, `leads`, `sends`, `replies`)
  * [x] Create helper views (`campaign_sends_today`)
  * [x] Configure cron schedules (`outreach-sender`, `outreach-reply-checker`)
* **Action:** User clicks **"Initialize Database"**.
* **Result:** Migration bundle runs atomically. Returns success status and table counts.

---

### 📍 Step 3: Create Primary Operator Account
* **Inputs:**
  * `Admin Email Address` (e.g., `operator@mycompany.com`)
  * `Admin Password` (min 8 chars)
  * `Confirm Password`
* **Action:** App uses Supabase Admin Auth API (`auth.admin.createUser`) to create an auto-confirmed user.
* **Result:** User account is immediately active without needing email verification servers.

---

### 📍 Step 4: AI & Telegram Integrations (Optional / Skippable)
* **Inputs:**
  * `Gemini API Key` (Google AI Studio key for 5-category reply classification)
  * `Telegram Bot Token` (from @BotFather)
  * `Telegram Chat ID` (for instant notifications)
* **Action:**
  * Includes a **"Test Telegram Notification"** button that sends a real ping to the user's phone.
  * Includes a **"Skip for Now"** button if the user wants to set this up later in Settings.

---

### 📍 Step 5: Edge Functions & Cron Verification
* **UI:** 
  * Displays the 2 simple terminal commands needed to deploy edge functions to their new Supabase project:
    ```bash
    npx supabase link --project-ref <auto-filled-project-ref>
    npx supabase functions deploy sender --no-verify-jwt
    npx supabase functions deploy reply-checker --no-verify-jwt
    ```
  * Includes a **"Verify Edge Functions"** button that pings `/functions/v1/sender` with the generated `CRON_SECRET` to verify it's live.

---

### 📍 Step 6: Completion & Launch
* **Action:**
  1. Writes `.env.local` to root directory.
  2. Sets lock flag `SETUP_COMPLETED=true`.
  3. Signs the user into their new session and redirects to the Dashboard (`/`).

---

## 5. Technical Implementation Details & Code Structure

### 5.1 File Blueprint to Create / Modify

```
src/
├── app/
│   ├── setup/
│   │   ├── page.tsx                    # [NEW] Multi-step Setup Wizard page
│   │   └── layout.tsx                  # [NEW] Isolated layout without Sidebar/Header
│   └── actions/
│       └── setup.ts                    # [NEW] Server actions for DB migration, testing & save
├── components/
│   ├── setup/
│   │   ├── StepSupabase.tsx            # [NEW] Credentials form + live test
│   │   ├── StepMigration.tsx           # [NEW] 1-click migration progress visualizer
│   │   ├── StepAdminUser.tsx           # [NEW] Admin account creation
│   │   ├── StepIntegrations.tsx        # [NEW] Gemini & Telegram validation
│   │   └── StepEdgeFunctions.tsx       # [NEW] CLI command generator & health check
│   ├── auth/
│   │   └── AuthContext.tsx             # [MODIFY] Add safe fallback when DB unconfigured
│   └── AppShell.tsx                    # [MODIFY] Add /setup to allowed public routes
└── lib/
    ├── setup/
    │   ├── schema-bundle.ts            # [NEW] Complete bundled SQL schema string
    │   └── config-writer.ts            # [NEW] Writes .env.local on host
    └── supabase/
        ├── client.ts                   # [MODIFY] Graceful null return if env missing
        └── server.ts                   # [MODIFY] Dynamic client creator for wizard
```

---

### 5.2 Server Action Specifications (`src/app/actions/setup.ts`)

```typescript
// 1. Status Check
export async function getSetupStatus(): Promise<{
  isConfigured: boolean
  isDatabaseReady: boolean
  hasAdminUser: boolean
}>

// 2. Test Supabase REST & Auth
export async function testSupabaseConnection(input: {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
}): Promise<{ success: boolean; error?: string }>

// 3. Execute Migrations over Postgres Connection
export async function runDatabaseMigrations(input: {
  dbConnectionString: string
  supabaseUrl: string
  cronSecret: string
}): Promise<{
  success: boolean
  tablesCreated: string[]
  error?: string
}>

// 4. Create Confirmed Admin User
export async function createAdminUser(input: {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  email: string
  password: string
}): Promise<{ success: boolean; error?: string }>

// 5. Save Configuration to .env.local
export async function saveSetupConfiguration(input: {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  cronSecret: string
  geminiApiKey?: string
  telegramBotToken?: string
}): Promise<{ success: boolean; error?: string }>
```

---

### 5.3 Modifying Supabase Clients for Graceful Fallback

#### [MODIFY] [src/lib/supabase/client.ts](file:///src/lib/supabase/client.ts)
```typescript
export function getSupabaseBrowserClient() {
  if (typeof window === 'undefined') return null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Return null gracefully instead of throwing fatal runtime error
  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  if (!supabaseClient) {
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
```

#### [MODIFY] [src/lib/supabase/server.ts](file:///src/lib/supabase/server.ts)
```typescript
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return Boolean(url && key)
}

export function createDynamicServerClient(url: string, serviceRoleKey: string) {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

---

### 5.4 Route Guard in AppShell

#### [MODIFY] [src/components/AppShell.tsx](file:///src/components/AppShell.tsx)
```typescript
// Allow /setup as a public unauthenticated route
const PUBLIC_ROUTES = ['/login', '/setup', '/auth/update-password', '/auth/callback']

// In useEffect:
useEffect(() => {
  if (loading) return

  // If Supabase is not configured yet, direct straight to setup wizard
  if (!isSupabaseConfigured && pathname !== '/setup') {
    router.push('/setup')
    return
  }

  if (!isPublicRoute && !user) {
    router.push('/login')
  }
}, [user, loading, isPublicRoute, pathname, router])
```

---

---

## 6. Cloudflare Workers & Production Edge Deployment

A critical consideration is that **Cloudflare Workers has a read-only filesystem**, meaning Node's `fs.writeFileSync('.env.local')` cannot write to disk at runtime in production.

Here is how the In-App Setup Wizard works seamlessly across both **Local Node.js (`localhost:3000`)** and **Deployed Cloudflare Workers (`*.workers.dev` / Custom Domain)**:

### 6.1 Dual-Engine Configuration Persistence

```
                         ┌──────────────────────────────┐
                         │   Setup Wizard Completed     │
                         └──────────────┬───────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
       [ Running on Localhost ]                 [ Running on Cloudflare ]
  ┌──────────────────────────────────┐    ┌──────────────────────────────────┐
  │ Writes `.env.local` to disk via  │    │ Stores credentials in Cloudflare │
  │ Node `fs.writeFileSync`.         │    │ `CONFIG_KV` or Encrypted Cookie. │
  │                                  │    │                                  │
  │ App reloads environment and      │    │ App reads from KV immediately    │
  │ works immediately.               │    │ without requiring redeployment!  │
  └──────────────────────────────────┘    └──────────────────────────────────┘
```

#### Method 1: Cloudflare KV Storage (`CONFIG_KV`) — *Zero Redeployment*
1. In [wrangler.jsonc](file:///wrangler.jsonc), declare a KV namespace binding:
   ```jsonc
   "kv_namespaces": [
     {
       "binding": "CONFIG_KV",
       "id": "<your-kv-id>"
     }
   ]
   ```
2. When the user finishes the `/setup` wizard on the live Cloudflare URL:
   * The server action writes `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and `CRON_SECRET` directly into `env.CONFIG_KV`.
   * Server actions read from `env.CONFIG_KV` fallback if `process.env` is unpopulated.
   * **Result:** The deployed Cloudflare dashboard works instantly without needing a rebuild or redeploy!

#### Method 2: Encrypted HTTP-Only Cookie
* For single-operator dashboards without KV, the setup wizard signs and encrypts the configuration into an HTTP-only secure cookie stored on the operator's browser.
* Server actions decrypt the connection credentials per request.

---

## 7. Edge Cases & Security Considerations

1. **Security Lockout:** Once setup is completed (either via `.env.local` locally or `CONFIG_KV` on Cloudflare), subsequent requests to `/setup` will automatically redirect to `/` to prevent unauthorized database resets or credential overwriting.
2. **Idempotent Migrations:** Every SQL statement in `schema-bundle.ts` uses `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE VIEW`, and `DO $$ BEGIN ... EXCEPTION ... END $$` blocks so that running the wizard against an existing database will not fail or corrupt existing data.
3. **Environment Auto-Detection:** The setup action detects whether it is running inside Node.js or Cloudflare Workers via `typeof process.env.NEXT_RUNTIME` or `typeof EdgeRuntime` and chooses the appropriate persistence layer (Local File vs Cloudflare KV).

---

## 8. Verification & Testing Checklist

When implementing in the duplicated repository:

- [ ] **Fresh Clone Test (Local):** Clone repo to empty folder without `.env.local` and run `npm run dev`. Verify browser automatically redirects to `http://localhost:3000/setup` with no console errors.
- [ ] **Cloudflare Edge Test:** Deploy a blank build to Cloudflare Workers. Navigate to the live domain. Verify `/setup` loads smoothly on the edge worker.
- [ ] **Bad Credentials Test:** Enter invalid Supabase URL or random key in Step 1. Verify clear error toast appears and wizard prevents proceeding.
- [ ] **Migration Execution Test:** Enter real Supabase credentials and click "Initialize Database". Verify all tables, views, and cron extensions are created in Supabase Dashboard.
- [ ] **Admin Login Test:** Enter email/password in Step 3. Verify user is created in Supabase Auth as confirmed and can log into the dashboard immediately.
- [ ] **Integration Test:** Enter Gemini Key and Telegram Token. Test the Telegram test message button to receive an alert on mobile.
- [ ] **Lockout Test:** Refresh or navigate back to `/setup`. Verify automatic redirect to `/` (dashboard).

---

## 9. Summary of Benefits

With this implementation plan:
* Any developer or friend can clone the repository and be 100% operational in **under 2 minutes** locally or on **Cloudflare Workers**.
* Zero SQL editor copy-pasting, zero manual string replacements, zero terminal syntax errors.
* Zero build crashes or unhandled exceptions when environment variables are uninitialized.

