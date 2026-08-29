'use client'

import { useState } from 'react'
import {
  Play,
  Loader2,
  Check,
  Copy,
  Terminal,
  Clock,
  KeyRound,
  Sparkles
} from 'lucide-react'
import type { ApiKey, Campaign } from '@/lib/types/database'

type ApiKeyRow = Omit<ApiKey, 'key_hash'>

interface InteractivePlaygroundProps {
  apiKeys?: ApiKeyRow[]
  campaigns?: Campaign[]
  baseUrl?: string
}

type EndpointOption = 'POST_LEADS' | 'GET_LEADS' | 'GET_LEAD_ID' | 'PATCH_LEAD_ID' | 'DELETE_LEAD_ID'

export function InteractivePlayground({ apiKeys = [], campaigns = [] }: InteractivePlaygroundProps) {
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointOption>('POST_LEADS')
  const [customKey, setCustomKey] = useState('')
  const [useCustomKey, setUseCustomKey] = useState(false)

  // Parameters State
  const [email, setEmail] = useState('alex.chen@techstartup.io')
  const [leadId, setLeadId] = useState('')
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || '')
  const [skipIfInLeadList, setSkipIfInLeadList] = useState(true)
  const [skipIfInCampaign, setSkipIfInCampaign] = useState(true)
  const [variablesJson, setVariablesJson] = useState(
    JSON.stringify(
      {
        firstName: 'Alex',
        company: 'TechStartup Inc',
        role: 'Head of Growth',
        location: 'Berlin',
      },
      null,
      2
    )
  )

  // GET Leads Filter State
  const [filterEmail, setFilterEmail] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [limit, setLimit] = useState(10)

  // PATCH State
  const [patchStatus, setPatchStatus] = useState<string>('active')
  const [patchReason, setPatchReason] = useState('Updated via API Playground')
  const [patchVariablesJson, setPatchVariablesJson] = useState(
    JSON.stringify(
      {
        priority: 'high',
        dealSize: '$50k',
      },
      null,
      2
    )
  )

  // Execution & Response State
  const [isLoading, setIsLoading] = useState(false)
  const [responseStatus, setResponseStatus] = useState<number | null>(null)
  const [responseStatusText, setResponseStatusText] = useState<string | null>(null)
  const [responseTime, setResponseTime] = useState<number | null>(null)
  const [responseBody, setResponseBody] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Construct request details
  const getRequestConfig = () => {
    let method = 'GET'
    let path = '/api/leads'
    let bodyData: unknown = undefined

    const token = useCustomKey || apiKeys.length === 0 ? customKey : customKey || 'outreach_live_sample_token'

    switch (selectedEndpoint) {
      case 'POST_LEADS': {
        method = 'POST'
        path = '/api/leads'
        let parsedVars = {}
        try {
          parsedVars = variablesJson ? JSON.parse(variablesJson) : {}
        } catch {
          parsedVars = {}
        }
        bodyData = {
          email: email.trim(),
          variables: parsedVars,
          campaign_id: campaignId || undefined,
          skip_if_in_lead_list: skipIfInLeadList,
          skip_if_in_campaign: skipIfInCampaign,
        }
        break
      }
      case 'GET_LEADS': {
        method = 'GET'
        const params = new URLSearchParams()
        if (filterEmail.trim()) params.set('email', filterEmail.trim())
        if (filterStatus) params.set('status', filterStatus)
        if (limit) params.set('limit', String(limit))
        const qs = params.toString()
        path = `/api/leads${qs ? `?${qs}` : ''}`
        break
      }
      case 'GET_LEAD_ID': {
        method = 'GET'
        path = `/api/leads/${leadId.trim() || ':id'}`
        break
      }
      case 'PATCH_LEAD_ID': {
        method = 'PATCH'
        path = `/api/leads/${leadId.trim() || ':id'}`
        let parsedVars = {}
        try {
          parsedVars = patchVariablesJson ? JSON.parse(patchVariablesJson) : {}
        } catch {
          parsedVars = {}
        }
        bodyData = {
          variables: parsedVars,
          status: patchStatus || undefined,
          status_reason: patchReason || undefined,
        }
        break
      }
      case 'DELETE_LEAD_ID': {
        method = 'DELETE'
        path = `/api/leads/${leadId.trim() || ':id'}`
        break
      }
    }

    return { method, path, bodyData, token }
  }

  const { method, path, bodyData, token } = getRequestConfig()

  const handleExecute = async () => {
    setIsLoading(true)
    setResponseStatus(null)
    setResponseBody(null)
    setResponseTime(null)

    const startTime = performance.now()

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      }

      const fetchOptions: RequestInit = {
        method,
        headers,
      }

      if (bodyData && (method === 'POST' || method === 'PATCH')) {
        headers['Content-Type'] = 'application/json'
        fetchOptions.body = JSON.stringify(bodyData)
      }

      const res = await fetch(path, fetchOptions)
      const duration = Math.round(performance.now() - startTime)

      setResponseStatus(res.status)
      setResponseStatusText(res.statusText || (res.status === 200 ? 'OK' : res.status === 201 ? 'Created' : 'Response'))
      setResponseTime(duration)

      const text = await res.text()
      try {
        const json = JSON.parse(text)
        setResponseBody(JSON.stringify(json, null, 2))
      } catch {
        setResponseBody(text)
      }
    } catch (err: unknown) {
      const duration = Math.round(performance.now() - startTime)
      setResponseStatus(0)
      setResponseStatusText('Network / CORS Error')
      setResponseTime(duration)
      setResponseBody(
        JSON.stringify(
          {
            error: 'Request failed',
            message: err instanceof Error ? err.message : String(err),
            hint: 'Ensure your API key is provided and authorized.',
          },
          null,
          2
        )
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyResponse = async () => {
    if (!responseBody) return
    try {
      await navigator.clipboard.writeText(responseBody)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    if (status >= 400 && status < 500) return 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    return 'bg-red-500/10 text-red-400 border-red-500/30'
  }

  const getMethodBadge = (m: string) => {
    switch (m) {
      case 'POST':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      case 'GET':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30'
      case 'PATCH':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      case 'DELETE':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30'
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700'
    }
  }

  return (
    <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 shadow-inner">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              Interactive API Playground
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Live Console
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Test real API requests directly against your Outreach Smart instance.
            </p>
          </div>
        </div>

        {/* Endpoint Selector Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-zinc-950/80 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => setSelectedEndpoint('POST_LEADS')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedEndpoint === 'POST_LEADS'
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="font-mono text-[10px] font-bold mr-1 text-emerald-400">POST</span> /leads
          </button>
          <button
            onClick={() => setSelectedEndpoint('GET_LEADS')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedEndpoint === 'GET_LEADS'
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="font-mono text-[10px] font-bold mr-1 text-blue-400">GET</span> /leads
          </button>
          <button
            onClick={() => setSelectedEndpoint('GET_LEAD_ID')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedEndpoint === 'GET_LEAD_ID'
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="font-mono text-[10px] font-bold mr-1 text-blue-400">GET</span> /:id
          </button>
          <button
            onClick={() => setSelectedEndpoint('PATCH_LEAD_ID')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedEndpoint === 'PATCH_LEAD_ID'
                ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="font-mono text-[10px] font-bold mr-1 text-amber-400">PATCH</span> /:id
          </button>
          <button
            onClick={() => setSelectedEndpoint('DELETE_LEAD_ID')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedEndpoint === 'DELETE_LEAD_ID'
                ? 'bg-rose-600/20 text-rose-300 border border-rose-500/30 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="font-mono text-[10px] font-bold mr-1 text-rose-400">DEL</span> /:id
          </button>
        </div>
      </div>

      {/* Auth Token Selector */}
      <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-violet-400" />
            API Key Authentication (Bearer Token)
          </label>
          {apiKeys.length > 0 && (
            <button
              onClick={() => setUseCustomKey(!useCustomKey)}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {useCustomKey ? 'Use saved key' : 'Enter custom key'}
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="password"
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
            placeholder="Paste your raw API key (outreach_live_...)"
            className="flex-1 bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <p className="text-[11px] text-zinc-500">
          Tip: You can generate or copy your active secret key in the{' '}
          <a href="/settings" className="text-indigo-400 hover:underline">
            Settings &gt; API Keys
          </a>{' '}
          tab.
        </p>
      </div>

      {/* Dynamic Request Builder Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input Parameters (7 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            Request Parameters
          </h4>

          {/* Endpoint: POST /api/leads */}
          {selectedEndpoint === 'POST_LEADS' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Lead Email <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {campaigns.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Auto-Enroll Campaign (Optional)
                  </label>
                  <select
                    value={campaignId}
                    onChange={(e) => setCampaignId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Do not enroll into campaign --</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 p-3 bg-zinc-950/60 border border-zinc-800 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipIfInLeadList}
                    onChange={(e) => setSkipIfInLeadList(e.target.checked)}
                    className="rounded border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="text-[11px]">
                    <span className="font-medium text-zinc-200 block">skip_if_in_lead_list</span>
                    <span className="text-zinc-500">Don&apos;t overwrite existing variables</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-3 bg-zinc-950/60 border border-zinc-800 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipIfInCampaign}
                    onChange={(e) => setSkipIfInCampaign(e.target.checked)}
                    className="rounded border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="text-[11px]">
                    <span className="font-medium text-zinc-200 block">skip_if_in_campaign</span>
                    <span className="text-zinc-500">Skip if already enrolled</span>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Custom Variables (JSON Object)
                </label>
                <textarea
                  value={variablesJson}
                  onChange={(e) => setVariablesJson(e.target.value)}
                  rows={5}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Endpoint: GET /api/leads */}
          {selectedEndpoint === 'GET_LEADS' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Filter by Email (Exact match, optional)
                </label>
                <input
                  type="text"
                  value={filterEmail}
                  onChange={(e) => setFilterEmail(e.target.value)}
                  placeholder="e.g. founder@acme.com"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Status Filter
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="do_not_contact">Do Not Contact</option>
                    <option value="bounced">Bounced</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Limit (Max 200)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Endpoint: GET /api/leads/:id */}
          {selectedEndpoint === 'GET_LEAD_ID' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Lead UUID <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={leadId}
                  onChange={(e) => setLeadId(e.target.value)}
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Endpoint: PATCH /api/leads/:id */}
          {selectedEndpoint === 'PATCH_LEAD_ID' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Lead UUID <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={leadId}
                  onChange={(e) => setLeadId(e.target.value)}
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    New Status (Optional)
                  </label>
                  <select
                    value={patchStatus}
                    onChange={(e) => setPatchStatus(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="active">Active</option>
                    <option value="do_not_contact">Do Not Contact</option>
                    <option value="bounced">Bounced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Status Reason
                  </label>
                  <input
                    type="text"
                    value={patchReason}
                    onChange={(e) => setPatchReason(e.target.value)}
                    placeholder="Reason"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Variables (Shallow-merged with existing)
                </label>
                <textarea
                  value={patchVariablesJson}
                  onChange={(e) => setPatchVariablesJson(e.target.value)}
                  rows={4}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Endpoint: DELETE /api/leads/:id */}
          {selectedEndpoint === 'DELETE_LEAD_ID' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Lead UUID <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={leadId}
                  onChange={(e) => setLeadId(e.target.value)}
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-300">
                <strong>Soft Delete Notice:</strong> This will mark the lead as{' '}
                <code className="text-amber-200">do_not_contact</code> to suppress future
                campaigns while preserving message and reply audit history.
              </div>
            </div>
          )}

          {/* Execution Button */}
          <div className="pt-2">
            <button
              onClick={handleExecute}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50 active:scale-[0.99]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Executing Request...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Send Request ({method})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Live Request Preview & Response (6 cols) */}
        <div className="lg:col-span-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center justify-between">
              <span>Preview &amp; Output</span>
              {responseTime !== null && (
                <span className="flex items-center gap-1 text-[11px] text-zinc-400 font-mono">
                  <Clock className="w-3 h-3 text-zinc-500" /> {responseTime}ms
                </span>
              )}
            </h4>

            {/* Request Summary Box */}
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-300 space-y-1">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getMethodBadge(method)}`}>
                  {method}
                </span>
                <span className="text-zinc-200 font-semibold truncate">{path}</span>
              </div>
              <div className="text-zinc-500 text-[10px]">
                Authorization: Bearer {token.slice(0, 14)}••••••••
              </div>
            </div>

            {/* Response Area */}
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden shadow-inner flex flex-col min-h-[260px]">
              {/* Response Header */}
              <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/90 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-400">Response</span>
                  {responseStatus !== null && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${getStatusColor(
                        responseStatus
                      )}`}
                    >
                      {responseStatus} {responseStatusText}
                    </span>
                  )}
                </div>

                {responseBody && (
                  <button
                    onClick={handleCopyResponse}
                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Response Content */}
              <div className="p-4 flex-1 overflow-x-auto text-xs font-mono">
                {isLoading ? (
                  <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-zinc-500 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                    <span>Waiting for server response...</span>
                  </div>
                ) : responseBody ? (
                  <pre className="text-emerald-300 leading-relaxed whitespace-pre-wrap">
                    <code>{responseBody}</code>
                  </pre>
                ) : (
                  <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-zinc-500 text-center px-4">
                    <Terminal className="w-8 h-8 text-zinc-700 mb-2" />
                    <p className="text-xs text-zinc-400 font-sans">Ready to execute.</p>
                    <p className="text-[11px] text-zinc-600 font-sans mt-0.5">
                      Configure your parameters and click &ldquo;Send Request&rdquo; to see the live JSON response.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
