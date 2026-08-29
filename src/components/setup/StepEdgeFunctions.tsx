'use client'

import React, { useState } from 'react'
import { verifyEdgeFunctions, setProjectSecrets, saveSetupConfiguration } from '@/app/actions/setup'
import {
  Terminal,
  Copy,
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
  const [copiedCli, setCopiedCli] = useState(false)

  // Extract project ref from URL (e.g. https://abcdef.supabase.co -> abcdef)
  const projectRef = formData.supabaseUrl.replace(/^https?:\/\//, '').split('.')[0] || 'YOUR_PROJECT_REF'

  const cliCommands = `# 1. Link your Supabase project
npx supabase link --project-ref ${projectRef}

# 2. Set environment secrets for background processing
npx supabase secrets set CRON_SECRET="${formData.cronSecret}" ${
    formData.geminiApiKey ? `GEMINI_API_KEY="${formData.geminiApiKey}" ` : ''
  }${formData.telegramBotToken ? `TELEGRAM_BOT_TOKEN="${formData.telegramBotToken}" ` : ''}

# 3. Deploy the background sender & reply-checker edge functions
npx supabase functions deploy sender --no-verify-jwt
npx supabase functions deploy reply-checker --no-verify-jwt`

  const handleCopyCli = () => {
    navigator.clipboard.writeText(cliCommands)
    setCopiedCli(true)
    setTimeout(() => setCopiedCli(false), 2500)
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
      const res = await verifyEdgeFunctions({
        supabaseUrl: formData.supabaseUrl,
        cronSecret: formData.cronSecret,
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
          Edge Functions & Activation
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Deploy the background email sender and Gmail reply-polling worker to your Supabase project.
        </p>
      </div>

      <div className="space-y-4">
        {/* Method 1: Programmatic Secret Injection */}
        <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Option A: 1-Click Secret Injection via Supabase Access Token
            </span>
            <a
              href="https://supabase.com/dashboard/account/tokens"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
            >
              Get Access Token <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex gap-2">
            <input
              type="password"
              placeholder="sbp_xxxxxxxxxxxxxxxxxxxxxxxx..."
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
              <span>{injectingSecrets ? 'Injecting...' : 'Sync Secrets'}</span>
            </button>
          </div>

          {secretsSuccess && (
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Secrets successfully synced to Supabase Edge Function environment.
            </p>
          )}
          {secretsError && (
            <p className="text-xs text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {secretsError}
            </p>
          )}
        </div>

        {/* Method 2: CLI Commands */}
        <div className="bg-zinc-950 border border-zinc-850 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-zinc-400" />
              CLI Deployment Commands
            </span>
            <button
              type="button"
              onClick={handleCopyCli}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition cursor-pointer"
            >
              {copiedCli ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCli ? 'Copied!' : 'Copy Commands'}</span>
            </button>
          </div>

          <pre className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 text-[11px] text-zinc-300 font-mono overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar">
            {cliCommands}
          </pre>
        </div>

        {/* Verification Check */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
          <div>
            <p className="text-xs font-medium text-zinc-300">Verify Live Edge Functions</p>
            <p className="text-[11px] text-zinc-500">Test if your deployed workers respond to pg_cron authentication</p>
          </div>
          <button
            type="button"
            onClick={handleVerify}
            disabled={verifying}
            className="px-3.5 py-1.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />}
            <span>{verifying ? 'Checking...' : 'Verify Status'}</span>
          </button>
        </div>

        {verificationResult && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className={`p-3 rounded-xl border flex items-center gap-2 ${
              verificationResult.sender.reachable ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
            }`}>
              {verificationResult.sender.reachable ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-zinc-500" />}
              <span>Sender Function: {verificationResult.sender.reachable ? 'Active' : 'Pending deploy'}</span>
            </div>
            <div className={`p-3 rounded-xl border flex items-center gap-2 ${
              verificationResult.replyChecker.reachable ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
            }`}>
              {verificationResult.replyChecker.reachable ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-zinc-500" />}
              <span>Reply Checker: {verificationResult.replyChecker.reachable ? 'Active' : 'Pending deploy'}</span>
            </div>
          </div>
        )}
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
