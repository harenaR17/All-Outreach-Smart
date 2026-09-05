'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  Zap,
  Send,
  Bot,
  Play,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  ExternalLink,
  Copy,
  Check,
  Terminal,
  Activity,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Info,
} from 'lucide-react'
import { testWorkerPing, executeWorkerLive } from '@/app/actions/settings'

interface Props {
  hasCronSecret?: boolean
  cronSecretPreview?: string
}

interface WorkerState {
  pingStatus: 'idle' | 'testing' | 'success' | 'error'
  pingMessage?: string
  pingTimestamp?: string
  execStatus: 'idle' | 'running' | 'success' | 'error'
  execDurationMs?: number
  execTimestamp?: string
  execResult?: Record<string, unknown>
  execError?: string
}

export function WorkerManager({ hasCronSecret = true, cronSecretPreview }: Props) {
  const [origin, setOrigin] = useState('')
  const [, startTransition] = useTransition()
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [showCurlGuide, setShowCurlGuide] = useState(false)
  const [testingAll, setTestingAll] = useState(false)

  const [senderState, setSenderState] = useState<WorkerState>({
    pingStatus: 'idle',
    execStatus: 'idle',
  })

  const [replyCheckerState, setReplyCheckerState] = useState<WorkerState>({
    pingStatus: 'idle',
    execStatus: 'idle',
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin)
    }
  }, [])

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedUrl(id)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  // ─── Test Ping (Health Check) ──────────────────────────────────────────────
  const handleTestPing = (worker: 'sender' | 'reply-checker') => {
    const setState = worker === 'sender' ? setSenderState : setReplyCheckerState

    setState((prev) => ({ ...prev, pingStatus: 'testing', pingMessage: undefined }))

    startTransition(async () => {
      const res = await testWorkerPing(worker, origin)
      if (res.success) {
        setState((prev) => ({
          ...prev,
          pingStatus: 'success',
          pingMessage: `HTTP 200 OK — Responding live`,
          pingTimestamp: res.timestamp || new Date().toLocaleTimeString(),
        }))
      } else {
        setState((prev) => ({
          ...prev,
          pingStatus: 'error',
          pingMessage: res.error || 'Endpoint unreachable',
          pingTimestamp: new Date().toLocaleTimeString(),
        }))
      }
    })
  }

  // ─── Execute Worker Live ───────────────────────────────────────────────────
  const handleExecuteLive = (worker: 'sender' | 'reply-checker') => {
    const setState = worker === 'sender' ? setSenderState : setReplyCheckerState

    setState((prev) => ({
      ...prev,
      execStatus: 'running',
      execError: undefined,
      execResult: undefined,
    }))

    startTransition(async () => {
      const res = await executeWorkerLive(worker, origin)
      if (res.success) {
        setState((prev) => ({
          ...prev,
          execStatus: 'success',
          execDurationMs: res.durationMs,
          execTimestamp: new Date().toLocaleTimeString(),
          execResult: (res.data as Record<string, unknown>) || {},
        }))
      } else {
        setState((prev) => ({
          ...prev,
          execStatus: 'error',
          execDurationMs: res.durationMs,
          execTimestamp: new Date().toLocaleTimeString(),
          execError: res.error || 'Execution failed',
          execResult: (res.data as Record<string, unknown>) || undefined,
        }))
      }
    })
  }

  // ─── Test All Endpoints ────────────────────────────────────────────────────
  const handleTestAll = async () => {
    setTestingAll(true)
    handleTestPing('sender')
    handleTestPing('reply-checker')
    setTimeout(() => setTestingAll(false), 800)
  }

  const senderEndpoint = `${origin || ''}/api/cron/sender`
  const replyCheckerEndpoint = `${origin || ''}/api/cron/reply-checker`

  return (
    <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800  hover:border-indigo-700 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-zinc-100">
              Background Automation &amp; Cron Workers
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              API Routes (/api/cron)
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Outreach Smart runs automated email sending and reply classification via built-in Next.js endpoints. Trigger them on-demand or verify live connectivity.
          </p>
        </div>

        <button
          type="button"
          onClick={handleTestAll}
          disabled={testingAll || senderState.pingStatus === 'testing' || replyCheckerState.pingStatus === 'testing'}
          className="px-3.5 py-1.5 rounded-xl border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-750 text-zinc-200 text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5 self-start cursor-pointer"
        >
          {testingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />}
          <span>Test All Endpoints</span>
        </button>
      </div>

      {/* Secret Info Bar */}
      <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-zinc-300">
            Worker Auth Status:{' '}
            <span className="font-semibold text-zinc-100">
              {hasCronSecret ? 'Protected with CRON_SECRET' : 'Default / Open (No Secret configured)'}
            </span>
          </span>
          {cronSecretPreview && (
            <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[10px] text-zinc-400">
              {cronSecretPreview}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowCurlGuide(!showCurlGuide)}
          className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition text-xs font-medium cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>{showCurlGuide ? 'Hide Cron Setup Guide' : 'External Cron & cURL Guide'}</span>
          {showCurlGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Collapsible cURL Guide */}
      {showCurlGuide && (
        <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs space-y-3 animate-in fade-in">
          <div className="flex items-center gap-2 text-zinc-300 font-medium">
            <Clock className="w-4 h-4 text-indigo-400" />
            <span>Recommended Schedule &amp; Setup:</span>
          </div>
          <p className="text-zinc-400 text-[11px]">
            You can trigger these endpoints using any external cron service (such as <strong className="text-zinc-200">cron-job.org</strong>, <strong className="text-zinc-200">EasyCron</strong>, <strong className="text-zinc-200">Cloudflare Cron Triggers</strong>, or Supabase <strong className="text-zinc-200">pg_cron</strong>).
          </p>

          <div className="space-y-2">
            <div>
              <p className="text-[11px] font-mono text-zinc-300 mb-1">1. Outreach Sender (Every 1 min):</p>
              <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[11px] text-zinc-300 flex items-center justify-between gap-2 overflow-x-auto">
                <code>curl -X POST {senderEndpoint} -H &quot;x-cron-secret: YOUR_CRON_SECRET&quot;</code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(`curl -X POST ${senderEndpoint} -H "x-cron-secret: YOUR_CRON_SECRET"`, 'curl-sender')}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition shrink-0"
                >
                  {copiedUrl === 'curl-sender' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-mono text-zinc-300 mb-1">2. Reply Checker &amp; AI Classifier (Every 3 mins):</p>
              <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[11px] text-zinc-300 flex items-center justify-between gap-2 overflow-x-auto">
                <code>curl -X POST {replyCheckerEndpoint} -H &quot;x-cron-secret: YOUR_CRON_SECRET&quot;</code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(`curl -X POST ${replyCheckerEndpoint} -H "x-cron-secret: YOUR_CRON_SECRET"`, 'curl-reply')}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition shrink-0"
                >
                  {copiedUrl === 'curl-reply' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Workers Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── 1. Outreach Sender Worker ─────────────────────────────────── */}
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/90  hover:border-emerald-700 p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            {/* Top row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <Send className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">Email Campaign Sender</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono text-[11px] text-indigo-300">/api/cron/sender</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(senderEndpoint, 'url-sender')}
                      title="Copy full URL"
                      className="p-0.5 text-zinc-500 hover:text-zinc-300 transition"
                    >
                      {copiedUrl === 'url-sender' ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-1.5">
                {senderState.pingStatus === 'success' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Ready
                  </span>
                )}
                {senderState.pingStatus === 'error' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Error
                  </span>
                )}
                {senderState.pingStatus === 'testing' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Ping...
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Processes active campaigns, verifies working windows, sender inbox rate limits, and sends scheduled step emails via Google Workspace Gmail API.
            </p>

            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>Interval: <strong className="text-zinc-300 font-mono">* * * * *</strong> (Every 1 min)</span>
            </div>
          </div>

          {/* Action Buttons & Results */}
          <div className="space-y-3 pt-2 border-t border-zinc-800/80">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleTestPing('sender')}
                disabled={senderState.pingStatus === 'testing' || senderState.execStatus === 'running'}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {senderState.pingStatus === 'testing' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Activity className="w-3.5 h-3.5 text-zinc-400" />
                )}
                <span>Ping Endpoint</span>
              </button>

              <button
                type="button"
                onClick={() => handleExecuteLive('sender')}
                disabled={senderState.execStatus === 'running' || senderState.pingStatus === 'testing'}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-200 text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {senderState.execStatus === 'running' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400" />
                )}
                <span>Run Sender Live Now</span>
              </button>
            </div>

            {/* Ping Message */}
            {senderState.pingMessage && (
              <div
                className={`p-2.5 rounded-lg text-xs flex items-center justify-between ${senderState.pingStatus === 'success'
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                  }`}
              >
                <div className="flex items-center gap-2">
                  {senderState.pingStatus === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  <span>{senderState.pingMessage}</span>
                </div>
                {senderState.pingTimestamp && (
                  <span className="text-[10px] text-zinc-500 font-mono">{senderState.pingTimestamp}</span>
                )}
              </div>
            )}

            {/* Live Execution Results Card */}
            {senderState.execStatus === 'success' && (
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Execution Completed
                  </span>
                  <span className="font-mono text-zinc-500">
                    {senderState.execDurationMs}ms • {senderState.execTimestamp}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800/80">
                    <p className="text-[10px] text-zinc-500">Sent</p>
                    <p className="text-sm font-semibold text-emerald-400">
                      {String(senderState.execResult?.sent ?? 0)}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800/80">
                    <p className="text-[10px] text-zinc-500">Failed</p>
                    <p className="text-sm font-semibold text-rose-400">
                      {String(senderState.execResult?.failed ?? 0)}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800/80">
                    <p className="text-[10px] text-zinc-500">Skipped</p>
                    <p className="text-sm font-semibold text-zinc-300">
                      {String(senderState.execResult?.skipped ?? 0)}
                    </p>
                  </div>
                </div>

                {Boolean(senderState.execResult?.message) && (
                  <p className="text-[11px] text-zinc-400 font-mono">
                    {String(senderState.execResult?.message)}
                  </p>
                )}
              </div>
            )}

            {senderState.execStatus === 'error' && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs space-y-1 animate-in fade-in">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Execution Failed ({senderState.execDurationMs}ms)</span>
                </div>
                <p className="text-[11px] text-rose-400 font-mono">{senderState.execError}</p>
              </div>
            )}
          </div>
        </div>

        {/* ─── 2. Reply Checker & AI Classifier Worker ──────────────────── */}
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/90  hover:border-emerald-700 p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            {/* Top row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">Reply Poller &amp; AI Classifier</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono text-[11px] text-cyan-300">/api/cron/reply-checker</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(replyCheckerEndpoint, 'url-reply')}
                      title="Copy full URL"
                      className="p-0.5 text-zinc-500 hover:text-zinc-300 transition"
                    >
                      {copiedUrl === 'url-reply' ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-1.5">
                {replyCheckerState.pingStatus === 'success' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Ready
                  </span>
                )}
                {replyCheckerState.pingStatus === 'error' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Error
                  </span>
                )}
                {replyCheckerState.pingStatus === 'testing' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Ping...
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Scans active Gmail threads for replies, categorizes them using Google Gemini AI, logs sentiment, and broadcasts instant Telegram alerts.
            </p>

            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>Interval: <strong className="text-zinc-300 font-mono">*/3 * * * *</strong> (Every 3 mins)</span>
            </div>
          </div>

          {/* Action Buttons & Results */}
          <div className="space-y-3 pt-2 border-t border-zinc-800/80">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleTestPing('reply-checker')}
                disabled={replyCheckerState.pingStatus === 'testing' || replyCheckerState.execStatus === 'running'}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {replyCheckerState.pingStatus === 'testing' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Activity className="w-3.5 h-3.5 text-zinc-400" />
                )}
                <span>Ping Endpoint</span>
              </button>

              <button
                type="button"
                onClick={() => handleExecuteLive('reply-checker')}
                disabled={replyCheckerState.execStatus === 'running' || replyCheckerState.pingStatus === 'testing'}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-200 text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {replyCheckerState.execStatus === 'running' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" />
                )}
                <span>Run Reply Poller Live</span>
              </button>
            </div>

            {/* Ping Message */}
            {replyCheckerState.pingMessage && (
              <div
                className={`p-2.5 rounded-lg text-xs flex items-center justify-between ${replyCheckerState.pingStatus === 'success'
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                  }`}
              >
                <div className="flex items-center gap-2">
                  {replyCheckerState.pingStatus === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  <span>{replyCheckerState.pingMessage}</span>
                </div>
                {replyCheckerState.pingTimestamp && (
                  <span className="text-[10px] text-zinc-500 font-mono">{replyCheckerState.pingTimestamp}</span>
                )}
              </div>
            )}

            {/* Live Execution Results Card */}
            {replyCheckerState.execStatus === 'success' && (
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Poller Completed
                  </span>
                  <span className="font-mono text-zinc-500">
                    {replyCheckerState.execDurationMs}ms • {replyCheckerState.execTimestamp}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 text-center pt-1">
                  <div className="p-1.5 rounded bg-zinc-900 border border-zinc-800/80">
                    <p className="text-[9px] text-zinc-500">Threads</p>
                    <p className="text-xs font-semibold text-zinc-200">
                      {String(replyCheckerState.execResult?.threadsChecked ?? 0)}
                    </p>
                  </div>
                  <div className="p-1.5 rounded bg-zinc-900 border border-zinc-800/80">
                    <p className="text-[9px] text-zinc-500">Replies</p>
                    <p className="text-xs font-semibold text-emerald-400">
                      {String(replyCheckerState.execResult?.newRepliesFound ?? 0)}
                    </p>
                  </div>
                  <div className="p-1.5 rounded bg-zinc-900 border border-zinc-800/80">
                    <p className="text-[9px] text-zinc-500">Interested</p>
                    <p className="text-xs font-semibold text-indigo-400">
                      {String(replyCheckerState.execResult?.interested ?? 0)}
                    </p>
                  </div>
                  <div className="p-1.5 rounded bg-zinc-900 border border-zinc-800/80">
                    <p className="text-[9px] text-zinc-500">Bounces</p>
                    <p className="text-xs font-semibold text-amber-400">
                      {String(replyCheckerState.execResult?.bounces ?? 0)}
                    </p>
                  </div>
                </div>

                {Boolean(replyCheckerState.execResult?.message) && (
                  <p className="text-[11px] text-zinc-400 font-mono">
                    {String(replyCheckerState.execResult?.message)}
                  </p>
                )}
              </div>
            )}

            {replyCheckerState.execStatus === 'error' && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs space-y-1 animate-in fade-in">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Execution Failed ({replyCheckerState.execDurationMs}ms)</span>
                </div>
                <p className="text-[11px] text-rose-400 font-mono">{replyCheckerState.execError}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
