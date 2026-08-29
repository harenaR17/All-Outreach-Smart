'use client'

import React, { useState } from 'react'
import { verifyEdgeFunctions, setProjectSecrets, saveSetupConfiguration } from '@/app/actions/setup'
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
} from 'lucide-react'
import { useRouter } from 'next/navigation'

interface StepEdgeFunctionsProps {
  formData: {
    supabaseUrl: string
    supabaseAnonKey: string
    supabaseServiceRoleKey: string
    managementToken?: string
    cronSecret: string
    geminiApiKey: string
    telegramBotToken: string
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

  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)

  // Extract project ref from URL (e.g. https://abcdef.supabase.co -> abcdef)
  const projectRef = formData.supabaseUrl.replace(/^https?:\/\//, '').split('.')[0] || 'YOUR_PROJECT_REF'

  const handleInjectSecrets = async () => {
    if (!managementToken.trim()) return
    setInjectingSecrets(true)
    setSecretsError(null)
    setSecretsSuccess(null)

    try {
      const secrets: Record<string, string> = {
        CRON_SECRET: formData.cronSecret,
      }
      if (formData.geminiApiKey) secrets.GEMINI_API_KEY = formData.geminiApiKey
      if (formData.telegramBotToken) secrets.TELEGRAM_BOT_TOKEN = formData.telegramBotToken

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
        geminiApiKey: formData.geminiApiKey,
        telegramBotToken: formData.telegramBotToken,
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

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
          <Rocket className="w-5 h-5 text-indigo-400" />
          Background Workers & Automation
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Background processing is built directly into your application — zero terminal commands or external deployments required.
        </p>
      </div>

      <div className="space-y-4">
        {/* Built-in Worker Status Card */}
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

        {/* Optional: Supabase Edge Functions Secret Injection (Fallback) */}
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
