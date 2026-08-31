'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  verifyEdgeFunctions,
  setProjectSecrets,
  saveSetupConfiguration,
  getDatabaseCronSettings,
  syncDatabaseCronAppUrl,
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
import { useRouter } from 'next/navigation'

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

export function StepEdgeFunctions({ formData, onBack }: StepEdgeFunctionsProps) {
  const router = useRouter()
  const [managementToken, setManagementToken] = useState(formData.managementToken || '')
  const [injectingSecrets, setInjectingSecrets] = useState(false)
  const [secretsSuccess, setSecretsSuccess] = useState<boolean | null>(null)
  const [secretsError, setSecretsError] = useState<string | null>(null)

  const [verifying, setVerifying] = useState(false)
  const [verificationResult, setVerificationResult] = useState<{
    sender: { reachable: boolean; status?: number; error?: string }
    replyChecker: { reachable: boolean; status?: number; error?: string }
  } | null>(null)

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

  const handleInjectSecrets = async () => {
    if (!managementToken.trim()) return
    setInjectingSecrets(true)
    setSecretsError(null)
    setSecretsSuccess(null)

    try {
      const secrets: Record<string, string> = {
        CRON_SECRET: formData.cronSecret,
      }

      const res = await setProjectSecrets({
        projectRef,
        managementToken,
        secrets,
      })

      if (res.success) {
        setSecretsSuccess(true)
      } else {
        setSecretsSuccess(false)
        setSecretsError(res.error || 'Failed to inject secrets.')
      }
    } catch (err: unknown) {
      setSecretsSuccess(false)
      setSecretsError(err instanceof Error ? err.message : 'API call failed.')
    } finally {
      setInjectingSecrets(false)
    }
  }

  const handleVerify = async () => {
    setVerifying(true)
    try {
      const appUrl = typeof window !== 'undefined' ? window.location.origin : undefined
      const res = await verifyEdgeFunctions({
        supabaseUrl: formData.supabaseUrl,
        cronSecret: formData.cronSecret,
        appUrl,
      })
      setVerificationResult(res)
    } catch {
      setVerificationResult({
        sender: { reachable: false, error: 'Connection error' },
        replyChecker: { reachable: false, error: 'Connection error' },
      })
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
        // Redirect to Login
        router.push('/login?setup=complete')
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
          Background processing runs securely on your Next.js application via <span className="text-indigo-300 font-mono">/api/cron</span>.
        </p>
      </div>

      <div className="space-y-4">
        {/* ─── 1. Live Database Cron Configuration Card (cron_config.settings) ─── */}
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4.5 space-y-3.5">
          <div className="flex items-center justify-between">
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
                </div>
                <p className="font-mono text-[11px] text-zinc-400">
                  {dbSettings?.app_url || <span className="text-rose-400 italic">Not set in database</span>}
                </p>
              </div>

              {!isAppUrlMatched && (
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

        {/* ─── 2. Built-in Worker Status Card ─── */}
        <div className="bg-gradient-to-br from-indigo-950/40 via-zinc-900/60 to-zinc-900/40 border border-indigo-500/20 rounded-2xl p-4.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Sparkles className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                  Built-in Next.js Worker Endpoints
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Automated email sending and reply polling run securely on your web server.
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              verificationResult?.sender.reachable
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-zinc-900/80 border-zinc-800 text-zinc-400'
            }`}>
              <div className="flex items-center gap-2">
                {verificationResult?.sender.reachable ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Check className="w-4 h-4 text-zinc-500" />
                )}
                <div>
                  <p className="font-medium text-zinc-200">Email Sender</p>
                  <p className="text-[10px] text-zinc-500 font-mono">/api/cron/sender</p>
                </div>
              </div>
              <span className="text-[11px] font-medium">
                {verificationResult ? (verificationResult.sender.reachable ? 'Ready' : 'Unreachable') : 'Built-in'}
              </span>
            </div>

            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              verificationResult?.replyChecker.reachable
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-zinc-900/80 border-zinc-800 text-zinc-400'
            }`}>
              <div className="flex items-center gap-2">
                {verificationResult?.replyChecker.reachable ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Check className="w-4 h-4 text-zinc-500" />
                )}
                <div>
                  <p className="font-medium text-zinc-200">Reply Checker</p>
                  <p className="text-[10px] text-zinc-500 font-mono">/api/cron/reply-checker</p>
                </div>
              </div>
              <span className="text-[11px] font-medium">
                {verificationResult ? (verificationResult.replyChecker.reachable ? 'Ready' : 'Unreachable') : 'Built-in'}
              </span>
            </div>
          </div>
        </div>

        {/* ─── 3. Optional: Sync Secrets to Supabase Project ─── */}
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-zinc-500" />
              Optional: Sync Secrets to Supabase Project
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

          <div className="flex gap-2">
            <input
              type="password"
              placeholder="sbp_xxxxxxxxxxxxxxxxxxxxxxxx... (optional)"
              value={managementToken}
              onChange={(e) => {
                setManagementToken(e.target.value)
                setSecretsSuccess(null)
              }}
              className="flex-1 bg-zinc-900/90 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 transition font-mono"
            />
            <button
              type="button"
              onClick={handleInjectSecrets}
              disabled={injectingSecrets || !managementToken.trim()}
              className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {injectingSecrets ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
              <span>{injectingSecrets ? 'Syncing...' : 'Sync Secrets'}</span>
            </button>
          </div>

          {secretsSuccess && (
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Secrets synced to Supabase environment.
            </p>
          )}
          {secretsError && (
            <p className="text-xs text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {secretsError}
            </p>
          )}
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
