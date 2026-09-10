'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  verifyEdgeFunctions,
  setProjectSecrets,
  saveSetupConfiguration,
  getDatabaseCronSettings,
  syncDatabaseCronAppUrl,
  deployEdgeFunctions,
  configureEdgeFunctionsAuth,
  switchCronToEdgeFunctions,
  type EdgeFunctionVerification,
} from '@/app/actions/setup'
import {
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Rocket,
  ShieldCheck,
  Sparkles,
  Key,
  ExternalLink,
  Database,
  RefreshCw,
  Zap,
} from 'lucide-react'

interface StepEdgeFunctionsProps {
  formData: {
    supabaseUrl: string
    supabaseAnonKey: string
    supabaseServiceRoleKey: string
    managementToken?: string
    cronSecret: string
    adminEmail: string
  }
  onBack: () => void
}

// Known Edge Function slugs. Mirrors the backend's `EDGE_FUNCTION_CRON_SCHEDULES` map in
// `src/app/actions/setup.ts`. `verifyEdgeFunctions` now returns a keyed record covering every
// slug it enumerates on disk (including `thread-sync`), so every tile below gets a live
// "Ready"/"Unreachable" badge once "Test Workers Live" runs — looked up directly by `slug`.
const WORKER_TILES: Array<{ slug: string; label: string }> = [
  { slug: 'sender', label: 'Email Sender' },
  { slug: 'reply-checker', label: 'Reply Checker' },
  { slug: 'thread-sync', label: 'Thread Sync' },
]

export function StepEdgeFunctions({ formData, onBack }: StepEdgeFunctionsProps) {
  const [managementToken, setManagementToken] = useState(formData.managementToken || '')

  // ─── Step A: Deploy & Inject Secrets & Configure Auth ─────────────────────
  const [deployingAll, setDeployingAll] = useState(false)
  const [deployedSlugs, setDeployedSlugs] = useState<string[] | null>(null)
  const [secretsInjected, setSecretsInjected] = useState<boolean | null>(null)
  const [authConfigured, setAuthConfigured] = useState<boolean | null>(null)
  const [deploySuccess, setDeploySuccess] = useState<boolean | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)

  // ─── Step B: Switch Cron to Edge Functions ────────────────────────────────
  const [switchingCron, setSwitchingCron] = useState(false)
  const [cronSwitchSuccess, setCronSwitchSuccess] = useState<boolean | null>(null)
  const [cronSwitchError, setCronSwitchError] = useState<string | null>(null)
  const [scheduledSlugs, setScheduledSlugs] = useState<string[] | null>(null)

  // ─── Step C: Verify ────────────────────────────────────────────────────────
  const [verifying, setVerifying] = useState(false)
  const [verificationResult, setVerificationResult] = useState<Record<string, EdgeFunctionVerification> | null>(null)

  // ─── Database cron_config.settings State ─────────────────────────────────────
  const [dbSettings, setDbSettings] = useState<Record<string, string> | null>(null)
  const [loadingDbSettings, setLoadingDbSettings] = useState(false)
  const [dbSettingsError, setDbSettingsError] = useState<string | null>(null)
  const [syncingAppUrl, setSyncingAppUrl] = useState(false)
  const [syncAppUrlSuccess, setSyncAppUrlSuccess] = useState(false)

  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)

  const originUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const projectRef = formData.supabaseUrl.replace(/^https?:\/\//, '').split('.')[0] || 'YOUR_PROJECT_REF'

  // Fetch cron_config.settings from database
  const fetchDbSettings = useCallback(async () => {
    setLoadingDbSettings(true)
    setDbSettingsError(null)
    try {
      const res = await getDatabaseCronSettings({
        supabaseUrl: formData.supabaseUrl,
        supabaseServiceRoleKey: formData.supabaseServiceRoleKey,
        managementToken: managementToken || formData.managementToken,
      })
      if (res.success && res.settings) {
        setDbSettings(res.settings)
      } else {
        setDbSettingsError(res.error || 'Unable to fetch cron settings from database.')
      }
    } catch (err: unknown) {
      setDbSettingsError(err instanceof Error ? err.message : 'Failed to query database.')
    } finally {
      setLoadingDbSettings(false)
    }
  }, [formData.supabaseUrl, formData.supabaseServiceRoleKey, formData.managementToken, managementToken])

  useEffect(() => {
    fetchDbSettings()
  }, [fetchDbSettings])

  // Derive the active cron target from `cron_config.settings`. `anon_key` is only ever written
  // by `switchCronToEdgeFunctions`, so its presence is a reliable read-only signal that the live
  // cron jobs currently point at `supabase_url/functions/v1/<slug>` rather than `app_url/api/cron/<slug>`.
  // Computed directly from `dbSettings` (no separate state/effect needed) so it always reflects
  // the latest fetch, including the refresh triggered right after a successful cron switch.
  const cronTarget: 'app_url' | 'edge_functions' | null = !dbSettings
    ? null
    : dbSettings.anon_key && dbSettings.anon_key.trim().length > 0
      ? 'edge_functions'
      : 'app_url'

  // Sync / Fix app_url in database
  const handleSyncAppUrl = async () => {
    if (!originUrl) return
    setSyncingAppUrl(true)
    setSyncAppUrlSuccess(false)
    setDbSettingsError(null)

    try {
      const res = await syncDatabaseCronAppUrl({
        supabaseUrl: formData.supabaseUrl,
        supabaseServiceRoleKey: formData.supabaseServiceRoleKey,
        managementToken: managementToken || formData.managementToken,
        appUrl: originUrl,
        cronSecret: formData.cronSecret,
      })

      if (res.success) {
        setSyncAppUrlSuccess(true)
        await fetchDbSettings()
      } else {
        setDbSettingsError(res.error || 'Failed to update app_url in database.')
      }
    } catch (err: unknown) {
      setDbSettingsError(err instanceof Error ? err.message : 'Sync request failed.')
    } finally {
      setSyncingAppUrl(false)
    }
  }

  // ─── Step A: Deploy function code, inject secrets, disable gateway JWT checks ──
  const handleDeployAndConfigure = async () => {
    if (!managementToken.trim()) return
    setDeployingAll(true)
    setDeployError(null)
    setDeploySuccess(null)
    setDeployedSlugs(null)
    setSecretsInjected(null)
    setAuthConfigured(null)

    try {
      // 1. Deploy Edge Function code
      const deployRes = await deployEdgeFunctions({ projectRef, managementToken })
      setDeployedSlugs(deployRes.deployed)
      if (!deployRes.success) {
        setDeployError(
          deployRes.error ||
            `Failed to deploy Edge Functions${deployRes.failedSlug ? ` (${deployRes.failedSlug})` : ''}.`
        )
        return
      }

      // 2. Inject secrets (CRON_SECRET + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
      const secretsRes = await setProjectSecrets({
        projectRef,
        managementToken,
        secrets: { CRON_SECRET: formData.cronSecret },
        supabaseUrl: formData.supabaseUrl,
        supabaseServiceRoleKey: formData.supabaseServiceRoleKey,
      })
      if (!secretsRes.success) {
        setSecretsInjected(false)
        setDeployError(secretsRes.error || 'Failed to inject secrets.')
        return
      }
      setSecretsInjected(true)

      // 3. Disable gateway JWT verification per deployed function
      const authRes = await configureEdgeFunctionsAuth({
        projectRef,
        managementToken,
        slugs: deployRes.deployed,
      })
      if (!authRes.success) {
        setAuthConfigured(false)
        setDeployError(
          authRes.error ||
            `Failed to disable JWT verification${authRes.failedSlug ? ` for "${authRes.failedSlug}"` : ''}.`
        )
        return
      }
      setAuthConfigured(true)
      setDeploySuccess(true)
    } catch (err: unknown) {
      setDeployError(err instanceof Error ? err.message : 'Deploy & configure step failed.')
    } finally {
      setDeployingAll(false)
    }
  }

  // ─── Step B: Switch pg_cron to call Edge Functions directly ────────────────
  const handleSwitchCron = async () => {
    setSwitchingCron(true)
    setCronSwitchError(null)
    setCronSwitchSuccess(null)

    try {
      const res = await switchCronToEdgeFunctions({
        supabaseUrl: formData.supabaseUrl,
        supabaseServiceRoleKey: formData.supabaseServiceRoleKey,
        supabaseAnonKey: formData.supabaseAnonKey,
        cronSecret: formData.cronSecret,
        managementToken: managementToken || formData.managementToken,
        slugs: deployedSlugs || undefined,
      })

      if (res.success) {
        setCronSwitchSuccess(true)
        setScheduledSlugs(res.scheduled)
        await fetchDbSettings()
      } else {
        setCronSwitchSuccess(false)
        setCronSwitchError(res.error || 'Failed to switch cron jobs to Edge Functions.')
      }
    } catch (err: unknown) {
      setCronSwitchSuccess(false)
      setCronSwitchError(err instanceof Error ? err.message : 'Cron switch request failed.')
    } finally {
      setSwitchingCron(false)
    }
  }

  // ─── Step C: Verify ─────────────────────────────────────────────────────────
  const handleVerify = async () => {
    setVerifying(true)
    try {
      const appUrl = typeof window !== 'undefined' ? window.location.origin : undefined
      const res = await verifyEdgeFunctions({
        supabaseUrl: formData.supabaseUrl,
        cronSecret: formData.cronSecret,
        appUrl,
        anonKey: formData.supabaseAnonKey,
      })
      setVerificationResult(res)
    } catch {
      setVerificationResult(
        Object.fromEntries(
          WORKER_TILES.map((worker) => [worker.slug, { reachable: false, error: 'Connection error' }])
        )
      )
    } finally {
      setVerifying(false)
    }
  }

  const handleFinishSetup = async () => {
    setFinishing(true)
    setFinishError(null)

    try {
      const res = await saveSetupConfiguration({
        supabaseUrl: formData.supabaseUrl,
        supabaseAnonKey: formData.supabaseAnonKey,
        supabaseServiceRoleKey: formData.supabaseServiceRoleKey,
        cronSecret: formData.cronSecret,
        setupCompleted: true,
      })

      if (res.success) {
        // Full page navigation (not router.push) so AppShell re-fetches setup
        // status fresh instead of bouncing back to /setup on its stale cached
        // "incomplete" state.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/login?setup=complete'
      } else {
        setFinishError(res.error || 'Failed to persist setup configuration.')
        setFinishing(false)
      }
    } catch (err: unknown) {
      setFinishError(err instanceof Error ? err.message : 'Failed to finalize setup.')
      setFinishing(false)
    }
  }

  const isAppUrlConfigured = Boolean(dbSettings?.app_url && dbSettings.app_url.trim().length > 0)
  const isAppUrlMatched = dbSettings?.app_url?.trim().replace(/\/$/, '') === originUrl?.trim().replace(/\/$/, '')

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
          <Rocket className="w-5 h-5 text-indigo-400" />
          Background Workers &amp; Automation
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Background processing runs securely via{' '}
          <span className="text-indigo-300 font-mono">
            {cronTarget === 'edge_functions' ? '/functions/v1' : '/api/cron'}
          </span>
          .
        </p>
      </div>

      <div className="space-y-4">
        {/* ─── 1. Live Database Cron Configuration Card (cron_config.settings) ─── */}
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4.5 space-y-3.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Database className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                  Database Cron Configuration (cron_config.settings)
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Verified parameters used by pg_cron to trigger your scheduled campaigns.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {cronTarget === 'edge_functions' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-500/10 text-indigo-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  Cron target: Edge Functions
                </span>
              ) : cronTarget === 'app_url' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Cron target: App URL
                </span>
              ) : null}

              <button
                type="button"
                onClick={fetchDbSettings}
                disabled={loadingDbSettings}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition disabled:opacity-50 flex items-center gap-1 text-xs cursor-pointer"
                title="Refresh database settings"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDbSettings ? 'animate-spin text-indigo-400' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {/* Database Rows Inspection */}
          <div className="space-y-2 text-xs">
            {/* app_url row */}
            <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-zinc-200">app_url</span>
                  {isAppUrlMatched ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Ready
                    </span>
                  ) : isAppUrlConfigured ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Configured
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Missing
                    </span>
                  )}
                  {cronTarget === 'edge_functions' && (
                    <span className="text-[10px] text-zinc-500 italic">informational only — cron now targets Edge Functions</span>
                  )}
                </div>
                <p className="font-mono text-[11px] text-zinc-400">
                  {dbSettings?.app_url || <span className="text-rose-400 italic">Not set in database</span>}
                </p>
              </div>

              {!isAppUrlMatched && cronTarget !== 'edge_functions' && (
                <button
                  type="button"
                  onClick={handleSyncAppUrl}
                  disabled={syncingAppUrl}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow disabled:opacity-50 flex items-center gap-1.5 self-start sm:self-center cursor-pointer"
                >
                  {syncingAppUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  <span>Sync Current Domain ({originUrl})</span>
                </button>
              )}
            </div>

            {/* cron_secret & supabase_url rows */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-850 space-y-0.5">
                <span className="font-mono text-[10px] text-zinc-500 uppercase">cron_secret</span>
                <p className="font-mono text-[11px] text-zinc-300">
                  {dbSettings?.cron_secret ? (
                    `${dbSettings.cron_secret.slice(0, 4)}••••••••${dbSettings.cron_secret.slice(-4)}`
                  ) : (
                    <span className="text-zinc-600">Pending</span>
                  )}
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-850 space-y-0.5">
                <span className="font-mono text-[10px] text-zinc-500 uppercase">supabase_url</span>
                <p className="font-mono text-[11px] text-zinc-300 truncate">
                  {dbSettings?.supabase_url || formData.supabaseUrl}
                </p>
              </div>
            </div>
          </div>

          {syncAppUrlSuccess && (
            <p className="text-xs text-emerald-400 flex items-center gap-1.5 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Successfully saved app_url to database and configured cron schedules.
            </p>
          )}

          {dbSettingsError && (
            <p className="text-xs text-rose-400 flex items-center gap-1.5 animate-in fade-in">
              <AlertCircle className="w-3.5 h-3.5" />
              {dbSettingsError}
            </p>
          )}
        </div>

        {/* ─── 2. Background Workers Status Card ─── */}
        <div className="bg-gradient-to-br from-indigo-950/40 via-zinc-900/60 to-zinc-900/40 border border-indigo-500/20 rounded-2xl p-4.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Sparkles className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                  Background Workers
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {cronTarget === 'edge_functions'
                    ? 'Email sending, reply polling, and thread sync run on Supabase Edge Functions.'
                    : 'Automated email sending and reply polling run securely on your web server.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying}
              className="px-3.5 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />}
              <span>{verifying ? 'Testing...' : 'Test Workers Live'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1 text-xs">
            {WORKER_TILES.map((worker) => {
              const result = verificationResult?.[worker.slug]
              const isChecked = Boolean(result)
              const isReady = Boolean(result?.reachable)
              const targetPath = cronTarget === 'edge_functions' ? `/functions/v1/${worker.slug}` : `/api/cron/${worker.slug}`
              const statusLabel = isChecked
                ? isReady
                  ? 'Ready'
                  : 'Unreachable'
                : deployedSlugs?.includes(worker.slug)
                  ? 'Deployed'
                  : 'Built-in'

              return (
                <div
                  key={worker.slug}
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    isChecked && isReady
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : isChecked && !isReady
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        : 'bg-zinc-900/80 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isChecked && isReady ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isChecked && !isReady ? (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Check className="w-4 h-4 text-zinc-500" />
                    )}
                    <div>
                      <p className="font-medium text-zinc-200">{worker.label}</p>
                      <p className="text-[10px] text-zinc-500 font-mono">{targetPath}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium">{statusLabel}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ─── 3. Deploy, Secure & Switch Cron to Edge Functions ─── */}
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4.5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Rocket className="w-3.5 h-3.5 text-indigo-400" />
              Deploy &amp; Switch to Edge Functions
            </span>
            <a
              href="https://supabase.com/dashboard/account/tokens"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-400 hover:text-zinc-300 flex items-center gap-1 transition"
            >
              Get Access Token <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Step A */}
          <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                A
              </span>
              <p className="text-xs font-semibold text-zinc-200">Deploy &amp; Inject Secrets &amp; Configure Auth</p>
            </div>

            <div className="flex gap-2">
              <input
                type="password"
                placeholder="sbp_xxxxxxxxxxxxxxxxxxxxxxxx... (required)"
                value={managementToken}
                onChange={(e) => {
                  setManagementToken(e.target.value)
                  setDeploySuccess(null)
                }}
                className="flex-1 bg-zinc-900/90 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 transition font-mono"
              />
              <button
                type="button"
                onClick={handleDeployAndConfigure}
                disabled={deployingAll || !managementToken.trim()}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {deployingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                <span>{deployingAll ? 'Deploying...' : 'Deploy & Configure'}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span
                className={`px-1.5 py-0.5 rounded-lg text-[10px] font-medium border flex items-center gap-1 ${
                  deployedSlugs && deployedSlugs.length > 0
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" /> Functions Deployed
              </span>
              <span
                className={`px-1.5 py-0.5 rounded-lg text-[10px] font-medium border flex items-center gap-1 ${
                  secretsInjected
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" /> Secrets Injected
              </span>
              <span
                className={`px-1.5 py-0.5 rounded-lg text-[10px] font-medium border flex items-center gap-1 ${
                  authConfigured
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" /> JWT Auth Disabled
              </span>
            </div>

            {deploySuccess && (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Deployed: {deployedSlugs?.join(', ')}. Secrets injected and JWT verification disabled.
              </p>
            )}
            {deployError && (
              <p className="text-xs text-rose-400 flex items-center gap-1.5 animate-in fade-in">
                <AlertCircle className="w-3.5 h-3.5" />
                {deployError}
              </p>
            )}
          </div>

          {/* Step B */}
          <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                  B
                </span>
                <p className="text-xs font-semibold text-zinc-200">Switch Cron to Edge Functions</p>
              </div>
              <button
                type="button"
                onClick={handleSwitchCron}
                disabled={switchingCron || !deploySuccess}
                title={!deploySuccess ? 'Complete Step A first' : undefined}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {switchingCron ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                <span>{switchingCron ? 'Switching...' : 'Switch Cron to Edge Functions'}</span>
              </button>
            </div>

            <span
              className={`px-1.5 py-0.5 rounded-lg text-[10px] font-medium border flex items-center gap-1 w-fit ${
                cronSwitchSuccess
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" /> Cron Switched
            </span>

            {cronSwitchSuccess && (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Scheduled: {scheduledSlugs?.join(', ')}.
              </p>
            )}
            {cronSwitchError && (
              <p className="text-xs text-rose-400 flex items-center gap-1.5 animate-in fade-in">
                <AlertCircle className="w-3.5 h-3.5" />
                {cronSwitchError}
              </p>
            )}
          </div>

          {/* Step C */}
          <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center shrink-0">
              C
            </span>
            <p className="text-xs text-zinc-400">
              <span className="font-semibold text-zinc-200">Verify</span> — use{' '}
              <span className="font-semibold text-indigo-300">Test Workers Live</span> above to confirm the switched
              endpoints respond without 401/404 errors.
            </p>
          </div>
        </div>
      </div>

      {finishError && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Setup Error</p>
            <p className="text-rose-400 mt-0.5">{finishError}</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
        <button
          type="button"
          onClick={onBack}
          disabled={finishing}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm font-medium transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={handleFinishSetup}
          disabled={finishing}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-sm font-semibold shadow-xl shadow-indigo-500/25 transition disabled:opacity-50 cursor-pointer"
        >
          {finishing ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Rocket className="w-4 h-4" />}
          <span>{finishing ? 'Finalizing Setup...' : 'Complete Setup & Launch Dashboard'}</span>
        </button>
      </div>
    </div>
  )
}
