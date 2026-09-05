# Supabase Edge Functions — Setup UI Integration Plan

## Context

The `StepEdgeFunctions.tsx` component currently guides users through a setup where:
- Background jobs (`sender`, `reply-checker`) run as **Next.js API routes** on Cloudflare Workers
- `pg_cron` calls back to `app_url/api/cron/...` to trigger them
- This causes **CPU time limit exceeded** errors on Cloudflare's 50ms cap

The functions are written as Deno Edge Functions under `supabase/functions/`, but on a **first-time
setup** they are not deployed yet — the setup wizard must deploy the function code itself before it
can inject secrets, configure auth, or switch cron over to it. The goal is to make the **setup UI
handle all of this natively** — deploying function code, switching cron targets, injecting secrets,
configuring authentication (preventing 401 unauthorized errors), and verifying Edge Functions —
without requiring manual CLI commands.

This design is **generic across however many functions exist** under `supabase/functions/` at any
given time (currently `sender` and `reply-checker`; a third, `thread-sync`, lands via a separate,
independently-mergeable issue). Nothing in the deploy/schedule/auth logic hardcodes a fixed count or
fixed names beyond a small schedule config map — see "Generic, multi-function design" below.

---

## Step 0 (new): Deploy Function Code

This is the step the original draft of this plan was missing. Before secrets/auth/cron-switching can
do anything useful, the Edge Function *code* has to actually exist on the Supabase project — on a
fresh project it does not.

### [NEW] `deployEdgeFunctions`

A server action that:
1. Enumerates the subdirectories of `supabase/functions/` on disk, **excluding `_shared`** (a helpers
   folder imported by other functions, not a function itself).
2. For each slug found, walks the local (relative-import) dependency graph starting from
   `supabase/functions/<slug>/index.ts` — e.g. `reply-checker/index.ts` importing
   `../_shared/gemini.ts` and `../_shared/telegram.ts` — so shared helper files are uploaded
   alongside the entrypoint. Remote imports (`https://esm.sh/...`) are left alone; Deno resolves
   those over the network at runtime and they don't need to be uploaded.
3. Uploads each function via the Supabase Management API's multipart deploy endpoint:
   `POST https://api.supabase.com/v1/projects/{ref}/functions/deploy?slug=<slug>`
   with a `multipart/form-data` body containing:
   - `metadata`: `{ "name": "<slug>", "entrypoint_path": "<repo-root-relative path>" }`
   - one `file` part per local file (entrypoint + any local imports), each named by its path
     relative to the repo root (e.g. `supabase/functions/sender/index.ts`,
     `supabase/functions/_shared/gemini.ts`) — this mirrors the same path-anchoring convention the
     Supabase CLI itself uses for `supabase functions deploy --use-api` (paths relative to the
     working directory, forward-slashed), which is what makes relative imports like
     `../_shared/gemini.ts` resolve correctly server-side.

This step only works when invoked from a Node.js runtime with filesystem access to the repository
source (e.g. `npm run dev` locally, or a CI/deploy step) — the deployed Cloudflare Workers runtime
only ships the Next.js build's traced output, not the raw `supabase/functions/**` sources, so running
it there fails fast with a clear, actionable error rather than silently deploying nothing.

---

## Generic, multi-function design

Two places need to know which functions exist / how to schedule them, and both are designed to stay
correct as functions are added or removed without further code changes here:

- **Deploy** (`deployEdgeFunctions`) and **auth config** (`configureEdgeFunctionsAuth`): iterate
  whatever directories currently exist under `supabase/functions/` (excluding `_shared`). No
  function name is hardcoded in the iteration itself.
- **Cron scheduling** (`switchCronToEdgeFunctions`): a static schedule map,

  ```ts
  const EDGE_FUNCTION_CRON_SCHEDULES: Record<string, string> = {
    sender: '* * * * *',
    'reply-checker': '*/3 * * * *',
    'thread-sync': '0 3 * * *',
  }
  ```

  Only slugs that are **both** present in this map **and** actually exist on disk get scheduled. A
  map entry for a not-yet-created function (e.g. `thread-sync`, before its own issue merges) is
  simply skipped — not an error. Once that function's directory exists (after the other issue
  merges), re-running `switchCronToEdgeFunctions` picks it up automatically.
- Unscheduling is likewise generic: rather than hardcoding `cron.unschedule('outreach-sender')` /
  `cron.unschedule('outreach-reply-checker')`, it runs
  `SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'outreach-%'` — this removes
  *every* previously scheduled `outreach-*` job regardless of how many existed or what they pointed
  at (App URL or Edge Function), before the fresh set is scheduled.

---

## The 401 UNAUTHORIZED_NO_AUTH_HEADER Issue & Solution

By default, Supabase Edge Functions enforce JWT authentication at the gateway level. If an incoming request lacks an `Authorization: Bearer <token>` header:
- The gateway immediately rejects it with HTTP 401 (`UNAUTHORIZED_NO_AUTH_HEADER`)
- The request never reaches the Deno function code, meaning internal `x-cron-secret` validation cannot run

### How the Plan Guarantees No 401 Errors (Defense in Depth)

1. **Gateway Level (`verify_jwt: false`):**
   `configureEdgeFunctionsAuth` calls, for every deployed function slug:
   `PATCH https://api.supabase.com/v1/projects/{ref}/functions/{slug}` with `{ "verify_jwt": false }`
   This matches the CLI `--no-verify-jwt` flag.

2. **Cron Query Level (Fallback Authorization Header):**
   In `switchCronToEdgeFunctions`, the generated `pg_net` SQL for every scheduled job includes:
   - `x-cron-secret` (checked by application logic)
   - `Authorization: Bearer <anon_key>` (satisfies default gateway check even if `verify_jwt` was not disabled)

3. **Verification Level:**
   `verifyEdgeFunctions` passes both the anon key and `x-cron-secret` so verification pings never trip gateway auth checks.

---

## What the UI Needs to Do Differently

Currently, the component assumes the workers live on the Next.js app (`app_url`).
After this change, the UI will:

0. Deploy Edge Function code for whichever functions exist on disk (first-time setup)
1. Detect whether Edge Functions are already deployed
2. Inject all required secrets into the Supabase project
3. **Disable gateway JWT verification** on every deployed function via Management API
4. Switch `pg_cron` jobs to call `supabase_url/functions/v1/...` with correct headers
5. Verify the Edge Functions are reachable, authorized, and responding
6. Make `app_url` optional/informational rather than required

---

## Changes Required

---

### 1. `src/app/actions/setup.ts`

#### [NEW] `deployEdgeFunctions`
See "Step 0" above.

```ts
export async function deployEdgeFunctions(input: {
  projectRef: string
  managementToken: string
}): Promise<{
  success: boolean
  deployed: string[]
  failedSlug?: string
  error?: string
}>
```

#### [MODIFY] `setProjectSecrets`
Previously only ever received `CRON_SECRET` in its generic `secrets` bag from the caller. The
signature now accepts optional `supabaseUrl` / `supabaseServiceRoleKey` companions, which — when
provided — get merged in as `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` automatically. The `secrets`
field itself is kept as a free-form bag for backward compatibility with the existing call site.

```ts
export async function setProjectSecrets(input: {
  projectRef: string
  managementToken: string
  secrets: Record<string, string>
  supabaseUrl?: string
  supabaseServiceRoleKey?: string
}): Promise<{ success: boolean; error?: string }>
```

| Secret | Value |
|---|---|
| `CRON_SECRET` | From `formData.cronSecret` (via `secrets`) |
| `SUPABASE_URL` | From `input.supabaseUrl` |
| `SUPABASE_SERVICE_ROLE_KEY` | From `input.supabaseServiceRoleKey` |

The Edge Functions use `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` directly via `Deno.env.get(...)`. Without them, the functions will boot but fail to connect to the database.

#### [NEW] `configureEdgeFunctionsAuth`
A server action that uses the Supabase Management API token to disable gateway JWT checking for
every deployed function slug (enumerated from disk, or passed explicitly via `slugs`):
- `PATCH https://api.supabase.com/v1/projects/{projectRef}/functions/{slug}` -> `{ "verify_jwt": false }`

This guarantees that external webhooks and internal database cron queries aren't rejected with HTTP 401.

```ts
export async function configureEdgeFunctionsAuth(input: {
  projectRef: string
  managementToken: string
  slugs?: string[]
}): Promise<{ success: boolean; configured: string[]; failedSlug?: string; error?: string }>
```

#### [NEW] `switchCronToEdgeFunctions`
A server action that:
1. Unschedules every existing `outreach-*` job (generic — see above), whatever it used to point at.
2. Ensures `supabase_url`, `cron_secret`, `anon_key` are present in `cron_config.settings`.
3. Re-creates one job per function slug that is present both on disk (or passed via `slugs`) and in
   `EDGE_FUNCTION_CRON_SCHEDULES`, pointing at `supabase_url/functions/v1/<slug>`.
4. Uses the Management API query endpoint (same pattern as `syncDatabaseCronAppUrl`), with a direct
   Postgres connection string as a fallback strategy (same pattern as `runDatabaseMigrations`).

```ts
export async function switchCronToEdgeFunctions(input: {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  supabaseAnonKey: string
  cronSecret: string
  managementToken?: string
  dbConnectionString?: string
  slugs?: string[]
}): Promise<{ success: boolean; scheduled: string[]; error?: string }>
```

SQL it executes (generated per present slug — shown here for `sender` / `reply-checker`, but scales to however many slugs match `EDGE_FUNCTION_CRON_SCHEDULES`):
```sql
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'outreach-%';

INSERT INTO cron_config.settings (key, value) VALUES ('supabase_url', '<SUPABASE_URL>')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO cron_config.settings (key, value) VALUES ('cron_secret', '<CRON_SECRET>')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO cron_config.settings (key, value) VALUES ('anon_key', '<SUPABASE_ANON_KEY>')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT cron.schedule(
  'outreach-sender', '* * * * *',
  $$ SELECT net.http_post(
    url     := (SELECT value FROM cron_config.settings WHERE key = 'supabase_url') || '/functions/v1/sender',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM cron_config.settings WHERE key = 'anon_key'),
      'x-cron-secret', (SELECT value FROM cron_config.settings WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) $$
);

SELECT cron.schedule(
  'outreach-reply-checker', '*/3 * * * *',
  $$ SELECT net.http_post(
    url     := (SELECT value FROM cron_config.settings WHERE key = 'supabase_url') || '/functions/v1/reply-checker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM cron_config.settings WHERE key = 'anon_key'),
      'x-cron-secret', (SELECT value FROM cron_config.settings WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) $$
);

-- If/once `thread-sync` exists on disk, a third block for it is generated the same way,
-- with no code change to switchCronToEdgeFunctions required.
```

> **Note:** Including both `verify_jwt: false` AND the `Authorization` header ensures that 401 errors are mathematically impossible regardless of individual project configuration.

#### [MODIFY] `verifyEdgeFunctions`
Previously checked `app_url/api/cron/...` first and fell back to the Edge Function URL. After this change:
- Check `supabase_url/functions/v1/<slug>` **first**, with an optional `Authorization: Bearer <anonKey>` header
- Fall back to `app_url/api/cron/<slug>` only on a 404 (i.e. nothing deployed at that Edge Function slug yet) or network error
- Distinguish and surface 401 vs 404 vs 500 in the returned `error` message instead of collapsing them into a single `reachable` boolean

```ts
export async function verifyEdgeFunctions(input: {
  supabaseUrl: string
  cronSecret: string
  appUrl?: string
  anonKey?: string
}): Promise<{
  sender: { reachable: boolean; status?: number; error?: string }
  replyChecker: { reachable: boolean; status?: number; error?: string }
}>
```

`anonKey` is optional so the existing call site (which doesn't pass it yet) keeps compiling; the paired frontend issue should pass it to get the full defense-in-depth header on verification pings.

---

### 2. `src/components/setup/StepEdgeFunctions.tsx` (separate frontend issue)

#### Card 0 (new) — Deploy Function Code
- A button: **"Deploy Edge Functions"**, calling `deployEdgeFunctions({ projectRef, managementToken })`
- Shows one row per slug returned in `deployed`, plus a clear error if `deployEdgeFunctions` fails
  (most commonly: wizard is running against a deployed Cloudflare Workers instance rather than a
  local/Node environment with repo access — surface that explanation directly from `error`)

#### Card 1 — Database Cron Configuration
**No structural changes.** The `app_url`, `cron_secret`, and `supabase_url` rows stay.
- `app_url` row: demote to informational only. Hide the "Sync Current Domain" button once cron is switched to Edge Functions.
- Add a read-only status badge: **"Cron target: Edge Functions"** vs **"Cron target: App URL"** — determined by inspecting whether the live cron job SQL contains `/functions/v1/` or `/api/cron/`.

#### Card 2 — Worker Status
**Relabel** from "Built-in Next.js Worker Endpoints" → **"Background Workers"**
- Show a tile per deployed function slug (not hardcoded to 2 — reflect whatever `deployEdgeFunctions` / `configureEdgeFunctionsAuth` returned), subtitle updates from `/api/cron/<slug>` to `/functions/v1/<slug>` once switched
- The "Test Workers Live" button tests the active execution target and verifies no 401/auth issues exist

#### Card 3 — Secrets, Auth & Cron Switch
This card becomes the **primary action card** for Edge Function setup. It needs to:

**Step A — Inject Secrets & Configure Auth**
- Expand from only `CRON_SECRET` to all three secrets (`CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) by passing `supabaseUrl` / `supabaseServiceRoleKey` to `setProjectSecrets`
- Call `configureEdgeFunctionsAuth` to automatically disable gateway JWT checks (`verify_jwt: false`)
- Show per-item status indicators (✓ Secrets Injected, ✓ JWT Auth Disabled)
- Keep the management token input

**Step B — Switch Cron Jobs**
- A button: **"Switch Cron to Edge Functions"**
- Calls `switchCronToEdgeFunctions` with `supabaseAnonKey`
- Disabled until Step A is confirmed
- Shows success/error inline, listing the `scheduled` slugs returned

**Step C — Verify**
- The existing "Test Workers Live" button covers this, now passing `anonKey` to `verifyEdgeFunctions`
- Resolves against Edge Function URLs with valid headers, ensuring 200 OK and no 401

#### State additions needed
```ts
const [deployingFunctions, setDeployingFunctions] = useState(false)
const [deployedSlugs, setDeployedSlugs] = useState<string[] | null>(null)
const [deployError, setDeployError] = useState<string | null>(null)

const [switchingCron, setSwitchingCron] = useState(false)
const [cronSwitchSuccess, setCronSwitchSuccess] = useState<boolean | null>(null)
const [cronSwitchError, setCronSwitchError] = useState<string | null>(null)
const [cronTarget, setCronTarget] = useState<'app_url' | 'edge_functions' | null>(null)
```

---

### 3. Cron Target Detection (read-only, from existing data)

We can detect which mode is active by querying the live cron job definition:
```sql
SELECT command FROM cron.job WHERE jobname = 'outreach-sender';
```
- If command contains `/functions/v1/` → Edge Functions mode
- If command contains `/api/cron/` → App URL mode

---

## What Does NOT Change

| Item | Reason |
|---|---|
| `app_url` row in `cron_config.settings` | Left in DB, just unused by cron after switch |
| `00005_cron_jobs.sql` migration | No need to alter — the switch happens at runtime via `switchCronToEdgeFunctions` |
| The "Complete Setup & Launch" button | Unchanged |
| `saveSetupConfiguration` | Unchanged |
| Edge Function source code itself | Deployed as-is; this plan only covers getting it onto the project and wired up |

---

## Flow After Changes

```
User arrives at StepEdgeFunctions
        ↓
[Card 0] Deploy Edge Functions
  → Enumerates supabase/functions/* (excl. _shared)
  → Uploads each via Management API /functions/deploy
        ↓
[Card 1] Shows live cron_config.settings
  - Detects cron target: "App URL" or "Edge Functions"
        ↓
[Card 3] Secrets, Auth & Cron Switch
  Step A: Enter Management Token
          → Inject CRON_SECRET + SUPABASE_URL + SERVICE_ROLE_KEY
          → Disable JWT Gateway Verification (verify_jwt: false) per deployed slug
  Step B: "Switch Cron to Edge Functions"
          → Unschedules every outreach-* job
          → Stores supabase_url/cron_secret/anon_key in cron_config.settings
          → Schedules one job per (present-on-disk ∩ known-schedule) slug, with
            Authorization + x-cron-secret headers
        ↓
[Card 1] Refreshes — cron_secret ✓, supabase_url ✓, cron target: Edge Functions
        ↓
[Card 2] "Test Workers Live" → verifyEdgeFunctions hits /functions/v1/ URLs first
  - sender: Ready ✓ (200 OK, No 401)
  - reply-checker: Ready ✓ (200 OK, No 401)
        ↓
"Complete Setup & Launch Dashboard"
```

---

## Files to Change

| File | Change Type |
|---|---|
| `src/app/actions/setup.ts` | Add `deployEdgeFunctions`, Modify `setProjectSecrets`, Add `configureEdgeFunctionsAuth`, Add `switchCronToEdgeFunctions`, Modify `verifyEdgeFunctions` |
| `src/components/setup/StepEdgeFunctions.tsx` | (separate frontend issue) Add Card 0 (deploy), Modify Card 2 labels, Modify Card 3 (secrets + auth + switch button), Add cron target + deploy state |

No new migration files, no new routes, no changes to the Edge Function source code itself.
