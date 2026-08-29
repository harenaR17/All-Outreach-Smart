'use client'

import { useState, useTransition } from 'react'
import {
  X,
  Mail,
  Key,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  FileJson,
  HelpCircle,
  Clock,
  Gauge,
  Sparkles,
  Info,
  Copy,
  Check,
  ExternalLink,
  ArrowRight,
  Cloud,
  Building2,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Layers
} from 'lucide-react'
import { addInbox } from '@/app/actions/inboxes'

interface AddInboxModalProps {
  isOpen: boolean
  onClose: () => void
}

const SCOPE_SEND = 'https://www.googleapis.com/auth/gmail.send'
const SCOPE_READONLY = 'https://www.googleapis.com/auth/gmail.readonly'
const SCOPE_MODIFY = 'https://www.googleapis.com/auth/gmail.modify'
const SCOPES_COMBINED = `${SCOPE_SEND}, ${SCOPE_READONLY}, ${SCOPE_MODIFY}`

export function AddInboxModal({ isOpen, onClose }: AddInboxModalProps) {
  const [isPending, startTransition] = useTransition()

  // Visual Guide State
  const [showVisualGuide, setShowVisualGuide] = useState(true)
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1)
  const [copiedScope, setCopiedScope] = useState<'send' | 'readonly' | 'modify' | 'all' | null>(null)

  // Form Fields
  const [emailAddress, setEmailAddress] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [dailySendLimit, setDailySendLimit] = useState(30)
  const [minSecondsBetweenSends, setMinSecondsBetweenSends] = useState(180)

  // JSON Quick Paste Area
  const [jsonPaste, setJsonPaste] = useState('')
  const [jsonParsedMsg, setJsonParsedMsg] = useState<string | null>(null)

  // Feedback State
  const [errorDetails, setErrorDetails] = useState<{
    error: string
    errorCode?: string
    remediation?: string
  } | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  if (!isOpen) return null

  const handleCopyScope = (type: 'send' | 'readonly' | 'modify' | 'all') => {
    let textToCopy = SCOPES_COMBINED
    if (type === 'send') textToCopy = SCOPE_SEND
    if (type === 'readonly') textToCopy = SCOPE_READONLY
    if (type === 'modify') textToCopy = SCOPE_MODIFY

    navigator.clipboard.writeText(textToCopy)
    setCopiedScope(type)
    setTimeout(() => setCopiedScope(null), 2000)
  }

  const handleJsonParse = (pasted: string) => {
    setJsonPaste(pasted)
    setJsonParsedMsg(null)
    if (!pasted.trim()) return

    try {
      const parsed = JSON.parse(pasted)
      if (parsed.client_email && parsed.private_key) {
        setClientEmail(parsed.client_email)
        setPrivateKey(parsed.private_key)
        setJsonParsedMsg(`Extracted credentials for: ${parsed.client_email}`)
      } else {
        setJsonParsedMsg('JSON does not contain client_email and private_key keys.')
      }
    } catch {
      // Ignore if not valid JSON yet
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorDetails(null)
    setSuccessMsg(null)

    startTransition(async () => {
      const res = await addInbox({
        emailAddress,
        displayName: displayName || undefined,
        clientEmail,
        privateKey,
        dailySendLimit,
        minSecondsBetweenSends,
      })

      if (res.success) {
        setSuccessMsg(`Mailbox ${emailAddress} connected, verified, and confirmation test email sent!`)
        setTimeout(() => {
          onClose()
          // Reset
          setEmailAddress('')
          setDisplayName('')
          setClientEmail('')
          setPrivateKey('')
          setJsonPaste('')
          setJsonParsedMsg(null)
          setSuccessMsg(null)
          setErrorDetails(null)
        }, 1200)
      } else {
        setErrorDetails({
          error: res.error || 'Failed to verify inbox connection',
          errorCode: res.errorCode,
          remediation: res.remediation,
        })
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800/90 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-cyan-400 p-[1px] shadow-md shadow-indigo-500/10 flex items-center justify-center">
              <div className="w-full h-full bg-zinc-950 rounded-[11px] flex items-center justify-center">
                <Mail className="w-4 h-4 text-indigo-400" />
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                Connect Google Workspace Inbox
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  Service Account
                </span>
              </h2>
              <p className="text-xs text-zinc-400">Authenticate via Domain-Wide Delegation (No personal OAuth required)</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVisualGuide(!showVisualGuide)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{showVisualGuide ? 'Hide Setup Guide' : 'Show Setup Guide'}</span>
              {showVisualGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              onClick={onClose}
              disabled={isPending}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {/* ========================================================================= */}
          {/* VISUAL ARCHITECTURE & SETUP GUIDE (Option 1 & 3 combined)                 */}
          {/* ========================================================================= */}
          {showVisualGuide && (
            <div className="rounded-2xl bg-gradient-to-b from-zinc-900/90 to-zinc-950/80 border border-indigo-500/25 p-5 space-y-5 shadow-lg shadow-indigo-950/20 animate-in fade-in">
              {/* Architecture Flow Banner */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    How Domain-Wide Delegation Works
                  </span>
                  <span className="text-[10px] text-zinc-400">One-time setup per domain</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Step Node 1 */}
                  <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 relative overflow-hidden flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold">
                        <Cloud className="w-4 h-4" />
                        <span>1. Google Cloud</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Create a Service Account & download its JSON key. Enable Gmail API.
                      </p>
                    </div>
                    <div className="mt-2 pt-2 border-t border-zinc-800/60 text-[10px] text-indigo-300 font-mono">
                      Provides Client ID & Key
                    </div>
                  </div>

                  {/* Step Node 2 */}
                  <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-indigo-500/30 relative overflow-hidden flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
                        <Building2 className="w-4 h-4" />
                        <span>2. Workspace Admin</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Authorize Client ID in <code className="text-zinc-200">admin.google.com</code> with Send & Read scopes.
                      </p>
                    </div>
                    <div className="mt-2 pt-2 border-t border-zinc-800/60 text-[10px] text-cyan-300 font-mono">
                      Authorizes Domain Scopes
                    </div>
                  </div>

                  {/* Step Node 3 */}
                  <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-emerald-500/30 relative overflow-hidden flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                        <ShieldCheck className="w-4 h-4" />
                        <span>3. Outreach Smart</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Connect each mailbox with the key. Impersonates securely with zero OAuth popups.
                      </p>
                    </div>
                    <div className="mt-2 pt-2 border-t border-zinc-800/60 text-[10px] text-emerald-300 font-mono">
                      Ready to Send & Track
                    </div>
                  </div>
                </div>
              </div>

              {/* One-Click OAuth Scope Quick-Copy Bar */}
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/90 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    Required OAuth Scopes for Workspace Admin Console
                  </span>
                  <button
                    onClick={() => handleCopyScope('all')}
                    className={`text-[11px] px-2 py-1 rounded-md transition-all font-medium flex items-center gap-1 cursor-pointer ${
                      copiedScope === 'all'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {copiedScope === 'all' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedScope === 'all' ? 'Copied All 3 Scopes!' : 'Copy All 3 (Comma-Separated)'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {/* Send Scope */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-mono">
                    <span className="truncate text-zinc-300 pr-2" title={SCOPE_SEND}>{SCOPE_SEND}</span>
                    <button
                      onClick={() => handleCopyScope('send')}
                      title="Copy Gmail Send Scope"
                      className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors shrink-0"
                    >
                      {copiedScope === 'send' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>

                  {/* Readonly Scope */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-mono">
                    <span className="truncate text-zinc-300 pr-2" title={SCOPE_READONLY}>{SCOPE_READONLY}</span>
                    <button
                      onClick={() => handleCopyScope('readonly')}
                      title="Copy Gmail Readonly Scope"
                      className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors shrink-0"
                    >
                      {copiedScope === 'readonly' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>

                  {/* Modify Scope */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-mono">
                    <span className="truncate text-zinc-300 pr-2" title={SCOPE_MODIFY}>{SCOPE_MODIFY}</span>
                    <button
                      onClick={() => handleCopyScope('modify')}
                      title="Copy Gmail Modify Scope"
                      className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors shrink-0"
                    >
                      {copiedScope === 'modify' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* 3-Step Interactive Instructions Tabs */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
                  <button
                    type="button"
                    onClick={() => setActiveStep(1)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeStep === 1
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white/20 text-[10px] flex items-center justify-center">1</span>
                    <span>GCP Setup</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveStep(2)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeStep === 2
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white/20 text-[10px] flex items-center justify-center">2</span>
                    <span>Workspace Delegation</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveStep(3)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeStep === 3
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white/20 text-[10px] flex items-center justify-center">3</span>
                    <span>Fill &amp; Verify</span>
                  </button>
                </div>

                {/* Step 1 Details */}
                {activeStep === 1 && (
                  <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-2 text-xs text-zinc-300">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-100">Step 1: Google Cloud Console Setup</span>
                      <a
                        href="https://console.cloud.google.com/apis/library/gmail.googleapis.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 underline"
                      >
                        <span>Open Google Cloud Console</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-zinc-400 leading-relaxed">
                      <li>Create or select a GCP project and enable the <strong>Gmail API</strong>.</li>
                      <li>Go to <strong>IAM &amp; Admin ➔ Service Accounts</strong> and click <strong>Create Service Account</strong>.</li>
                      <li>Under the newly created service account, navigate to the <strong>Keys</strong> tab ➔ <strong>Add Key ➔ Create new key (JSON)</strong>.</li>
                      <li>In the Service Account settings, check <strong>&quot;Enable Google Workspace Domain-wide Delegation&quot;</strong> and copy the numeric <strong>OAuth2 Client ID</strong>.</li>
                    </ol>
                  </div>
                )}

                {/* Step 2 Details */}
                {activeStep === 2 && (
                  <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-2 text-xs text-zinc-300">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-100">Step 2: Authorize in Google Workspace Admin</span>
                      <a
                        href="https://admin.google.com/ac/owl/domainwidedelegation"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 underline"
                      >
                        <span>Open Workspace Delegation Settings</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-zinc-400 leading-relaxed">
                      <li>Log into <code className="text-zinc-200">admin.google.com</code> as a Super Admin.</li>
                      <li>Navigate to <strong>Security ➔ Access and data control ➔ API controls ➔ Manage Domain Wide Delegation</strong>.</li>
                      <li>Click <strong>Add new</strong>, paste the numeric <strong>Client ID</strong> from Step 1.</li>
                      <li>In OAuth scopes, click <em>&quot;Copy All 3 (Comma-Separated)&quot;</em> above and paste them into the box, then click <strong>Authorize</strong>.</li>
                    </ol>
                  </div>
                )}

                {/* Step 3 Details */}
                {activeStep === 3 && (
                  <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-2 text-xs text-zinc-300">
                    <span className="font-semibold text-zinc-100">Step 3: Connect Mailboxes in Outreach Smart</span>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      You can now reuse this same Service Account JSON file for every mailbox on your domain (e.g. <code className="text-zinc-300">alex@thereachsmart.net</code>, <code className="text-zinc-300">sarah@thereachsmart.net</code>). Simply paste the JSON in the quick-fill box below, set your mailbox email, and click <strong>Verify &amp; Connect</strong>!
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick Paste Service Account JSON Helper */}
          <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                <FileJson className="w-3.5 h-3.5" />
                Quick Auto-Fill from GCP Service Account JSON
              </span>
              <span className="text-[10px] text-zinc-400">Pasting JSON auto-fills credentials below</span>
            </div>
            <textarea
              rows={2}
              value={jsonPaste}
              onChange={(e) => handleJsonParse(e.target.value)}
              placeholder="Paste contents of downloaded service account .json file here..."
              disabled={isPending}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950/80 border border-indigo-500/30 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-all"
            />
            {jsonParsedMsg && (
              <p className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {jsonParsedMsg}
              </p>
            )}
          </div>

          {/* Connect Inbox Form */}
          <form id="add-inbox-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Mailbox Email Address */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                  <span>Mailbox Address (To Impersonate) *</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. outreach1@thereachsmart.net"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  disabled={isPending}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                />
              </div>

              {/* Display Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  <span>Display Name / Sender Label</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alex (ReachSmart 1)"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={isPending}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Service Account Client Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Service Account Client Email *
              </label>
              <input
                type="email"
                required
                placeholder="e.g. cold-outreach@project-id.iam.gserviceaccount.com"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                disabled={isPending}
                className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
              />
            </div>

            {/* Service Account Private Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>Private Key (PEM Format) *</span>
                <span className="text-[11px] text-zinc-500 font-mono">-----BEGIN PRIVATE KEY-----</span>
              </label>
              <textarea
                rows={4}
                required
                placeholder="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC6...\n-----END PRIVATE KEY-----"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                disabled={isPending}
                className="w-full px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
              />
            </div>

            {/* Rate Limits */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                    Daily Send Limit
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">per UTC day</span>
                </div>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={dailySendLimit}
                  onChange={(e) => setDailySendLimit(parseInt(e.target.value) || 30)}
                  disabled={isPending}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-xs font-semibold text-zinc-100"
                />
                <p className="text-[10px] text-zinc-400">
                  Default 30. Inbox pauses until next UTC day once limit is reached.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    Min Spacing Cooldown
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">seconds</span>
                </div>
                <input
                  type="number"
                  min={10}
                  max={3600}
                  value={minSecondsBetweenSends}
                  onChange={(e) => setMinSecondsBetweenSends(parseInt(e.target.value) || 180)}
                  disabled={isPending}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-xs font-semibold text-zinc-100"
                />
                <p className="text-[10px] text-zinc-400">
                  Default 180s (3m). Minimum delay before this inbox is reused.
                </p>
              </div>
            </div>
          </form>

          {/* Success Banner */}
          {successMsg && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Detailed Error Diagnostics */}
          {errorDetails && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs space-y-2 animate-in fade-in">
              <div className="flex items-start gap-2.5 text-rose-300 font-medium">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorDetails.error}</span>
              </div>
              {errorDetails.remediation && (
                <div className="pl-6 pt-1 border-t border-rose-500/20 text-[11px] text-rose-200/80 space-y-1">
                  <span className="font-semibold text-rose-200">Action Required:</span>
                  <p className="leading-relaxed">{errorDetails.remediation}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800/80 bg-zinc-900/50 flex items-center justify-between">
          <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-400" />
            <span>Validates Gmail API &amp; sends a confirmation test email to the inbox</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-inbox-form"
              disabled={isPending || !emailAddress || !clientEmail || !privateKey}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying with Gmail API...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Verify &amp; Connect Inbox</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
