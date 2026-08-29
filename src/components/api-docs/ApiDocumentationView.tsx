'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import {
  Code2,
  KeyRound,
  ShieldCheck,
  Zap,
  Terminal,
  Layers,
  Sparkles,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Database,
  Globe,
  Lock,
  Workflow,
  Share2,
  Cpu
} from 'lucide-react'
import type { ApiKey, Campaign } from '@/lib/types/database'
import { CodeSnippet } from './CodeSnippet'
import { InteractivePlayground } from './InteractivePlayground'

type ApiKeyRow = Omit<ApiKey, 'key_hash'>

interface ApiDocumentationViewProps {
  apiKeys: ApiKeyRow[]
  campaigns: Campaign[]
}

const subscribe = () => () => {}
const getClientOrigin = () => typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://thereachsmart.net'
const getServerOrigin = () => 'https://thereachsmart.net'

export function ApiDocumentationView({ apiKeys, campaigns }: ApiDocumentationViewProps) {
  const [activeEndpointTab, setActiveEndpointTab] = useState<'POST_LEADS' | 'GET_LEADS' | 'GET_LEAD' | 'PATCH_LEAD' | 'DELETE_LEAD'>('POST_LEADS')
  const [activeAutomationTab, setActiveAutomationTab] = useState<'n8n' | 'zapier' | 'make' | 'html_form'>('n8n')
  
  const [copiedBaseUrl, setCopiedBaseUrl] = useState(false)
  const [copiedSampleKey, setCopiedSampleKey] = useState(false)
  const origin = useSyncExternalStore(subscribe, getClientOrigin, getServerOrigin)

  const handleCopyBaseUrl = async () => {
    try {
      await navigator.clipboard.writeText(origin)
      setCopiedBaseUrl(true)
      setTimeout(() => setCopiedBaseUrl(false), 2000)
    } catch {}
  }

  const handleCopySampleKey = async () => {
    try {
      await navigator.clipboard.writeText('outreach_live_your_actual_key_here')
      setCopiedSampleKey(true)
      setTimeout(() => setCopiedSampleKey(false), 2000)
    } catch {}
  }

  // Multi-language snippets for POST /api/leads
  const postLeadsSnippets = [
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X POST "${origin}/api/leads" \\
  -H "Authorization: Bearer outreach_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "alex.chen@techstartup.io",
    "variables": {
      "firstName": "Alex",
      "company": "TechStartup Inc",
      "role": "Head of Growth"
    },
    "campaign_id": "${campaigns[0]?.id || '550e8400-e29b-41d4-a716-446655440000'}",
    "skip_if_in_lead_list": true,
    "skip_if_in_campaign": true
  }'`,
    },
    {
      language: 'typescript',
      label: 'TypeScript / Fetch',
      code: `const response = await fetch('${origin}/api/leads', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer outreach_live_your_secret_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'alex.chen@techstartup.io',
    variables: {
      firstName: 'Alex',
      company: 'TechStartup Inc',
      role: 'Head of Growth'
    },
    campaign_id: '${campaigns[0]?.id || '550e8400-e29b-41d4-a716-446655440000'}',
    skip_if_in_lead_list: true,
    skip_if_in_campaign: true
  })
});

const data = await response.json();
console.log('Lead enrolled:', data);`,
    },
    {
      language: 'python',
      label: 'Python (requests)',
      code: `import requests

url = "${origin}/api/leads"
headers = {
    "Authorization": "Bearer outreach_live_your_secret_key",
    "Content-Type": "application/json"
}
payload = {
    "email": "alex.chen@techstartup.io",
    "variables": {
        "firstName": "Alex",
        "company": "TechStartup Inc",
        "role": "Head of Growth"
    },
    "campaign_id": "${campaigns[0]?.id || '550e8400-e29b-41d4-a716-446655440000'}",
    "skip_if_in_lead_list": True,
    "skip_if_in_campaign": True
}

res = requests.post(url, json=payload, headers=headers)
print(res.status_code, res.json())`,
    }
  ]

  // Multi-language snippets for GET /api/leads
  const getLeadsSnippets = [
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "${origin}/api/leads?status=active&limit=50" \\
  -H "Authorization: Bearer outreach_live_your_secret_key"`,
    },
    {
      language: 'typescript',
      label: 'TypeScript / Fetch',
      code: `const response = await fetch('${origin}/api/leads?status=active&limit=50', {
  headers: {
    'Authorization': 'Bearer outreach_live_your_secret_key'
  }
});

const { leads } = await response.json();
console.log(\`Fetched \${leads.length} leads\`);`,
    },
    {
      language: 'python',
      label: 'Python (requests)',
      code: `import requests

url = "${origin}/api/leads"
headers = {"Authorization": "Bearer outreach_live_your_secret_key"}
params = {"status": "active", "limit": 50}

res = requests.get(url, headers=headers, params=params)
leads = res.json().get("leads", [])
print(f"Found {len(leads)} leads")`,
    }
  ]

  // Multi-language snippets for GET /api/leads/:id
  const getLeadIdSnippets = [
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "${origin}/api/leads/550e8400-e29b-41d4-a716-446655440000" \\
  -H "Authorization: Bearer outreach_live_your_secret_key"`,
    },
    {
      language: 'typescript',
      label: 'TypeScript / Fetch',
      code: `const leadId = '550e8400-e29b-41d4-a716-446655440000';
const response = await fetch(\`${origin}/api/leads/\${leadId}\`, {
  headers: {
    'Authorization': 'Bearer outreach_live_your_secret_key'
  }
});

const { lead } = await response.json();
console.log('Lead Details:', lead);`,
    },
    {
      language: 'python',
      label: 'Python (requests)',
      code: `import requests

lead_id = "550e8400-e29b-41d4-a716-446655440000"
url = f"${origin}/api/leads/{lead_id}"
headers = {"Authorization": "Bearer outreach_live_your_secret_key"}

res = requests.get(url, headers=headers)
lead = res.json().get("lead")
print("Lead:", lead)`,
    }
  ]

  // Multi-language snippets for PATCH /api/leads/:id
  const patchLeadSnippets = [
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X PATCH "${origin}/api/leads/550e8400-e29b-41d4-a716-446655440000" \\
  -H "Authorization: Bearer outreach_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "variables": {
      "tier": "Enterprise",
      "phone": "+1 555-0199"
    },
    "status": "active"
  }'`,
    },
    {
      language: 'typescript',
      label: 'TypeScript / Fetch',
      code: `const leadId = '550e8400-e29b-41d4-a716-446655440000';
const response = await fetch(\`${origin}/api/leads/\${leadId}\`, {
  method: 'PATCH',
  headers: {
    'Authorization': 'Bearer outreach_live_your_secret_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    variables: {
      tier: 'Enterprise',
      phone: '+1 555-0199'
    }
  })
});

const { lead } = await response.json();
console.log('Updated Lead:', lead);`,
    },
    {
      language: 'python',
      label: 'Python (requests)',
      code: `import requests

lead_id = "550e8400-e29b-41d4-a716-446655440000"
url = f"${origin}/api/leads/{lead_id}"
headers = {
    "Authorization": "Bearer outreach_live_your_secret_key",
    "Content-Type": "application/json"
}
payload = {
    "variables": {"tier": "Enterprise", "phone": "+1 555-0199"}
}

res = requests.patch(url, json=payload, headers=headers)
print(res.status_code, res.json())`,
    }
  ]

  // Multi-language snippets for DELETE /api/leads/:id
  const deleteLeadSnippets = [
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X DELETE "${origin}/api/leads/550e8400-e29b-41d4-a716-446655440000" \\
  -H "Authorization: Bearer outreach_live_your_secret_key"`,
    },
    {
      language: 'typescript',
      label: 'TypeScript / Fetch',
      code: `const leadId = '550e8400-e29b-41d4-a716-446655440000';
const response = await fetch(\`${origin}/api/leads/\${leadId}\`, {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer outreach_live_your_secret_key'
  }
});

const data = await response.json();
console.log('Lead soft-deleted (Do-Not-Contact applied):', data);`,
    },
    {
      language: 'python',
      label: 'Python (requests)',
      code: `import requests

lead_id = "550e8400-e29b-41d4-a716-446655440000"
url = f"${origin}/api/leads/{lead_id}"
headers = {"Authorization": "Bearer outreach_live_your_secret_key"}

res = requests.delete(url, headers=headers)
print(res.status_code, res.json())`,
    }
  ]

  // n8n Node JSON snippet
  const n8nNodeJson = JSON.stringify(
    {
      nodes: [
        {
          parameters: {
            method: 'POST',
            url: `=${origin}/api/leads`,
            authentication: 'genericCredentialType',
            genericAuthType: 'httpHeaderAuth',
            sendHeaders: true,
            headerParameters: {
              parameters: [
                {
                  name: 'Authorization',
                  value: 'Bearer outreach_live_your_secret_key',
                },
              ],
            },
            sendBody: true,
            specifyBody: 'json',
            jsonBody: '={\n  "email": $json.email,\n  "variables": {\n    "firstName": $json.firstName,\n    "company": $json.company,\n    "source": "n8n"\n  },\n  "campaign_id": "' + (campaigns[0]?.id || '550e8400-e29b-41d4-a716-446655440000') + '"\n}',
            options: {},
          },
          id: 'outreach-smart-leads-api',
          name: 'Enroll in Outreach Smart',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 4.2,
          position: [460, 240],
        },
      ],
    },
    null,
    2
  )

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10">
      {/* ─── Hero Section ──────────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl bg-gradient-to-b from-indigo-950/40 via-zinc-900/60 to-zinc-950 border border-zinc-800/80 p-8 shadow-2xl overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-8 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 tracking-wide uppercase">
                REST API v1.0
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live &amp; Operational
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <Code2 className="w-8 h-8 text-indigo-400 shrink-0" />
              Public Leads &amp; Outreach API
            </h1>

            <p className="text-sm text-zinc-300 max-w-2xl leading-relaxed">
              Programmatically create leads, sync contacts from external CRM webhooks, trigger instant campaign enrollments, and manage suppression lists with high-entropy SHA-256 Bearer authentication.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0">
            <Link
              href="/settings"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold border border-zinc-700/80 shadow-md transition-all group"
            >
              <KeyRound className="w-4 h-4 text-violet-400 group-hover:scale-110 transition-transform" />
              <span>Manage API Keys</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
            </Link>

            <a
              href="#playground"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/25 transition-all"
            >
              <Sparkles className="w-4 h-4 text-indigo-200" />
              <span>Open Live Playground</span>
            </a>
          </div>
        </div>

        {/* Base URL bar */}
        <div className="mt-8 pt-6 border-t border-zinc-800/80 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/70 border border-zinc-800">
            <div className="flex items-center gap-2 overflow-hidden">
              <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
              <div className="truncate">
                <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Base Endpoint</span>
                <span className="font-mono text-zinc-200 text-xs truncate">{origin}</span>
              </div>
            </div>
            <button
              onClick={handleCopyBaseUrl}
              className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Copy Base URL"
            >
              {copiedBaseUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/70 border border-zinc-800">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-violet-400 shrink-0" />
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Authentication</span>
                <span className="font-mono text-zinc-200 text-xs">Bearer Token (SHA-256)</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] bg-violet-500/10 text-violet-300 font-semibold border border-violet-500/20">
              Header
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/70 border border-zinc-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Dedup Guarantee</span>
                <span className="font-mono text-zinc-200 text-xs">ON CONFLICT (email)</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-300 font-semibold border border-emerald-500/20">
              Active
            </span>
          </div>
        </div>
      </div>

      {/* ─── Section 1: Overview & Quickstart ─────────────────────────────────── */}
      <section id="overview" className="space-y-6 pt-2">
        <div className="border-b border-zinc-800/80 pb-3">
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            Overview &amp; Quickstart
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Learn the core principles of the Outreach Smart Leads API.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-100">1-Call Lead &amp; Campaign Enrollment</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              When a lead submits a website form or webhook, pass their email, variables, and optional <code className="text-indigo-300 font-mono">campaign_id</code> to enroll them instantly.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-100">Automatic Dedup &amp; Variable Merging</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Emails are automatically normalized to lowercase. Submitting an existing lead safely upserts their custom variables without duplicate rows or redundant emails.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <Lock className="w-4 h-4 text-rose-400" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-100">Safe Soft Deletes &amp; DNC Compliance</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              The <code className="text-rose-300 font-mono">DELETE</code> verb sets <code className="text-zinc-200 font-mono">status = &apos;do_not_contact&apos;</code> to halt future emails while safeguarding campaign send logs and analytics.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Section 2: Authentication ────────────────────────────────────────── */}
      <section id="auth" className="space-y-6 pt-4">
        <div className="border-b border-zinc-800/80 pb-3">
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Lock className="w-5 h-5 text-violet-400" />
            Authentication
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            All API requests must include a valid Bearer token in the <code className="text-violet-300 font-mono">Authorization</code> HTTP header.
          </p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Bearer Token Header Format</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Include the secret key generated from the Settings tab in your HTTP headers:
              </p>
            </div>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 text-xs font-medium transition-colors shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Generate New API Key</span>
            </Link>
          </div>

          <div className="p-3.5 bg-zinc-950 rounded-xl border border-zinc-800 font-mono text-xs text-zinc-300 flex items-center justify-between">
            <code>Authorization: Bearer outreach_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</code>
            <button
              onClick={handleCopySampleKey}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
              title="Copy header format"
            >
              {copiedSampleKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
              <span className="text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                SHA-256 One-Way Hashing
              </span>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Keys are stored only as SHA-256 cryptographic hashes in Postgres. Your raw key is shown only once at creation time and cannot be recovered if lost.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
              <span className="text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Recognizable Prefix
              </span>
              <p className="text-xs text-zinc-400 leading-relaxed">
                All production tokens start with <code className="text-violet-300 font-mono">outreach_live_</code> followed by 64 hex characters, making them easily detectable in secret scanners and git hooks.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 3: Endpoints Directory ───────────────────────────────────── */}
      <section id="endpoints" className="space-y-6 pt-4">
        <div className="border-b border-zinc-800/80 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <Terminal className="w-5 h-5 text-emerald-400" />
              Endpoints Directory
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Complete specifications, request parameters, schemas, and runnable code samples.
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span>5 Endpoints Active</span>
          </div>
        </div>

        {/* Sub-tabs for Endpoints */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { id: 'POST_LEADS', method: 'POST', path: '/api/leads', color: 'emerald', label: 'Create / Upsert' },
            { id: 'GET_LEADS', method: 'GET', path: '/api/leads', color: 'blue', label: 'List Leads' },
            { id: 'GET_LEAD', method: 'GET', path: '/api/leads/:id', color: 'blue', label: 'Get by ID' },
            { id: 'PATCH_LEAD', method: 'PATCH', path: '/api/leads/:id', color: 'amber', label: 'Update Lead' },
            { id: 'DELETE_LEAD', method: 'DELETE', path: '/api/leads/:id', color: 'rose', label: 'Soft Delete' },
          ].map((ep) => {
            const isSel = activeEndpointTab === ep.id
            return (
              <button
                key={ep.id}
                onClick={() => setActiveEndpointTab(ep.id as typeof activeEndpointTab)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isSel
                    ? 'bg-zinc-800/90 border-indigo-500/50 shadow-md ring-1 ring-indigo-500/20'
                    : 'bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                      ep.method === 'POST'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : ep.method === 'GET'
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        : ep.method === 'PATCH'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {ep.method}
                  </span>
                  <span className="text-[11px] font-medium text-zinc-300 truncate">{ep.label}</span>
                </div>
                <div className="text-[11px] font-mono text-zinc-500 truncate">{ep.path}</div>
              </button>
            )
          })}
        </div>

        {/* ── Endpoint 1: POST /api/leads ── */}
        {activeEndpointTab === 'POST_LEADS' && (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold font-mono">
                  POST
                </span>
                <code className="text-sm font-semibold text-zinc-100 font-mono">/api/leads</code>
              </div>
              <span className="text-xs text-zinc-400">Upsert Lead &amp; Optional Campaign Enrollment</span>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Creates or updates a lead by email address. If <code className="text-indigo-300 font-mono">campaign_id</code> is provided, the lead will also be automatically enrolled into that campaign with <code className="text-zinc-200 font-mono">next_send_at = now()</code> so the background engine begins sending at the next scheduled slot.
            </p>

            {/* Request Body Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Request Body (JSON)</h4>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950 text-zinc-400 border-b border-zinc-800 font-mono text-[11px]">
                    <tr>
                      <th className="p-3">Field</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Required</th>
                      <th className="p-3">Default</th>
                      <th className="p-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    <tr>
                      <td className="p-3 font-mono text-indigo-300">email</td>
                      <td className="p-3 font-mono text-zinc-400">string</td>
                      <td className="p-3"><span className="text-rose-400 font-semibold">Yes</span></td>
                      <td className="p-3 font-mono text-zinc-500">—</td>
                      <td className="p-3">Recipient email address. Automatically converted to lowercase.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-indigo-300">variables</td>
                      <td className="p-3 font-mono text-zinc-400">object</td>
                      <td className="p-3 text-zinc-500">No</td>
                      <td className="p-3 font-mono text-zinc-500">{'{}'}</td>
                      <td className="p-3">Key/value pairs for template replacement (e.g. <code className="text-zinc-400">firstName</code>, <code className="text-zinc-400">company</code>).</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-indigo-300">campaign_id</td>
                      <td className="p-3 font-mono text-zinc-400">UUID</td>
                      <td className="p-3 text-zinc-500">No</td>
                      <td className="p-3 font-mono text-zinc-500">null</td>
                      <td className="p-3">If provided, enrolls the lead into this campaign immediately.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-indigo-300">skip_if_in_lead_list</td>
                      <td className="p-3 font-mono text-zinc-400">boolean</td>
                      <td className="p-3 text-zinc-500">No</td>
                      <td className="p-3 font-mono text-zinc-400">true</td>
                      <td className="p-3">If true and email already exists, returns existing lead without touching variables.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-indigo-300">skip_if_in_campaign</td>
                      <td className="p-3 font-mono text-zinc-400">boolean</td>
                      <td className="p-3 text-zinc-500">No</td>
                      <td className="p-3 font-mono text-zinc-400">true</td>
                      <td className="p-3">If true and lead is already enrolled in the campaign, skips re-enrollment (no-op).</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Code Samples */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Example Request</h4>
              <CodeSnippet title="POST /api/leads" snippets={postLeadsSnippets} />
            </div>

            {/* Responses */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Response Examples</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400 font-mono">201 Created</span>
                    <span className="text-[11px] text-zinc-500">Lead Created / Enrolled</span>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 overflow-x-auto">
{`{
  "lead": {
    "id": "7a8b9c0d-1234-5678-9abc-def012345678",
    "email": "alex.chen@techstartup.io",
    "variables": { "firstName": "Alex", "company": "TechStartup Inc" },
    "status": "active",
    "created_at": "2026-08-28T15:30:00.000Z"
  },
  "enrollment": {
    "id": "e1f2a3b4-5678-9abc-def0-123456789abc",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "active",
    "current_step": 1,
    "next_send_at": "2026-08-28T15:30:00.000Z"
  },
  "skipped": false
}`}
                  </pre>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-400 font-mono">200 OK (Skipped)</span>
                    <span className="text-[11px] text-zinc-500">skip_if_in_lead_list = true</span>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 overflow-x-auto">
{`{
  "lead": {
    "id": "7a8b9c0d-1234-5678-9abc-def012345678",
    "email": "alex.chen@techstartup.io",
    "variables": { "firstName": "Alex" },
    "status": "active"
  },
  "enrollment": null,
  "skipped": true
}`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Endpoint 2: GET /api/leads ── */}
        {activeEndpointTab === 'GET_LEADS' && (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/30 text-xs font-bold font-mono">
                  GET
                </span>
                <code className="text-sm font-semibold text-zinc-100 font-mono">/api/leads</code>
              </div>
              <span className="text-xs text-zinc-400">List &amp; Query Leads</span>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Returns a paginated list of leads ordered by creation time descending. You can filter by exact email or outreach status.
            </p>

            {/* Query Parameters Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Query Parameters</h4>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950 text-zinc-400 border-b border-zinc-800 font-mono text-[11px]">
                    <tr>
                      <th className="p-3">Param</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Default</th>
                      <th className="p-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    <tr>
                      <td className="p-3 font-mono text-indigo-300">email</td>
                      <td className="p-3 font-mono text-zinc-400">string</td>
                      <td className="p-3 font-mono text-zinc-500">—</td>
                      <td className="p-3">Exact lookup by email address.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-indigo-300">status</td>
                      <td className="p-3 font-mono text-zinc-400">string</td>
                      <td className="p-3 font-mono text-zinc-500">—</td>
                      <td className="p-3">Filter by status: <code className="text-zinc-400">active</code>, <code className="text-zinc-400">do_not_contact</code>, or <code className="text-zinc-400">bounced</code>.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-indigo-300">limit</td>
                      <td className="p-3 font-mono text-zinc-400">integer</td>
                      <td className="p-3 font-mono text-zinc-400">50</td>
                      <td className="p-3">Maximum items to return (max: 200).</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <CodeSnippet title="GET /api/leads" snippets={getLeadsSnippets} />

            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
              <span className="text-xs font-semibold text-emerald-400 font-mono">200 OK Response</span>
              <pre className="text-[11px] font-mono text-zinc-300 overflow-x-auto">
{`{
  "leads": [
    {
      "id": "7a8b9c0d-1234-5678-9abc-def012345678",
      "email": "alex.chen@techstartup.io",
      "variables": { "firstName": "Alex", "company": "TechStartup Inc" },
      "status": "active",
      "status_reason": null,
      "status_changed_at": null,
      "created_at": "2026-08-28T15:30:00.000Z"
    }
  ]
}`}
              </pre>
            </div>
          </div>
        )}

        {/* ── Endpoint 3: GET /api/leads/:id ── */}
        {activeEndpointTab === 'GET_LEAD' && (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/30 text-xs font-bold font-mono">
                  GET
                </span>
                <code className="text-sm font-semibold text-zinc-100 font-mono">/api/leads/:id</code>
              </div>
              <span className="text-xs text-zinc-400">Retrieve Single Lead</span>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Fetch the full record for a specific lead by their database UUID.
            </p>

            <CodeSnippet title="GET /api/leads/:id" snippets={getLeadIdSnippets} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                <span className="text-xs font-semibold text-emerald-400 font-mono">200 OK</span>
                <pre className="text-[11px] font-mono text-zinc-300 overflow-x-auto">
{`{
  "lead": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "sarah@growthcorp.com",
    "variables": { "tier": "Enterprise", "teamSize": 45 },
    "status": "active",
    "created_at": "2026-08-28T14:15:00.000Z"
  }
}`}
                </pre>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                <span className="text-xs font-semibold text-amber-400 font-mono">404 Not Found</span>
                <pre className="text-[11px] font-mono text-zinc-300 overflow-x-auto">
{`{
  "error": "not found"
}`}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* ── Endpoint 4: PATCH /api/leads/:id ── */}
        {activeEndpointTab === 'PATCH_LEAD' && (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-bold font-mono">
                  PATCH
                </span>
                <code className="text-sm font-semibold text-zinc-100 font-mono">/api/leads/:id</code>
              </div>
              <span className="text-xs text-zinc-400">Update Lead Variables or Status</span>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Updates lead metadata. Variables are shallow-merged with existing fields so you don&apos;t accidentally erase previously stored values.
            </p>

            {/* Request Body Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Request Body (JSON)</h4>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950 text-zinc-400 border-b border-zinc-800 font-mono text-[11px]">
                    <tr>
                      <th className="p-3">Field</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    <tr>
                      <td className="p-3 font-mono text-indigo-300">variables</td>
                      <td className="p-3 font-mono text-zinc-400">object</td>
                      <td className="p-3">Key/value pairs to merge into existing variables.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-indigo-300">status</td>
                      <td className="p-3 font-mono text-zinc-400">string</td>
                      <td className="p-3">One of: <code className="text-zinc-400">active</code>, <code className="text-zinc-400">do_not_contact</code>, or <code className="text-zinc-400">bounced</code>.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-indigo-300">status_reason</td>
                      <td className="p-3 font-mono text-zinc-400">string</td>
                      <td className="p-3">Reason for status transition (defaults to &quot;Set via API&quot;).</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <CodeSnippet title="PATCH /api/leads/:id" snippets={patchLeadSnippets} />
          </div>
        )}

        {/* ── Endpoint 5: DELETE /api/leads/:id ── */}
        {activeEndpointTab === 'DELETE_LEAD' && (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs font-bold font-mono">
                  DELETE
                </span>
                <code className="text-sm font-semibold text-zinc-100 font-mono">/api/leads/:id</code>
              </div>
              <span className="text-xs text-rose-400 font-medium">Soft Delete (Do-Not-Contact Protection)</span>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Deliberate Soft-Delete Behavior</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Calling <code className="text-rose-300 font-mono">DELETE</code> does <strong>NOT</strong> destroy the database row or cascade-delete your historical campaign sends and replies. Instead, it marks the lead as <code className="text-amber-300 font-mono">status = &apos;do_not_contact&apos;</code> with reason <code className="text-zinc-300 font-mono">&quot;Removed via API&quot;</code>. This permanently suppresses all future automated emails while keeping audit trails intact.
              </p>
            </div>

            <CodeSnippet title="DELETE /api/leads/:id" snippets={deleteLeadSnippets} />
          </div>
        )}
      </section>

      {/* ─── Section 4: Live Interactive Playground ───────────────────────────── */}
      <section id="playground" className="space-y-6 pt-4">
        <div className="border-b border-zinc-800/80 pb-3">
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            Interactive Playground
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Test and validate requests in real-time with your active Outreach Smart environment.
          </p>
        </div>

        <InteractivePlayground apiKeys={apiKeys} campaigns={campaigns} baseUrl={origin} />
      </section>

      {/* ─── Section 5: Automations & Webhooks ─────────────────────────────────── */}
      <section id="automations" className="space-y-6 pt-4">
        <div className="border-b border-zinc-800/80 pb-3">
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Workflow className="w-5 h-5 text-cyan-400" />
            Automation &amp; Webhook Guides
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Step-by-step recipes to integrate Outreach Smart into n8n, Zapier, Make.com, or custom frontend forms.
          </p>
        </div>

        {/* Integration Selector Tabs */}
        <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2 overflow-x-auto">
          {[
            { id: 'n8n', label: 'n8n Workflow', icon: Share2 },
            { id: 'zapier', label: 'Zapier Webhooks', icon: Zap },
            { id: 'make', label: 'Make.com (Integromat)', icon: Cpu },
            { id: 'html_form', label: 'Website / HTML Form', icon: Globe },
          ].map((int) => {
            const Icon = int.icon
            const isSel = activeAutomationTab === int.id
            return (
              <button
                key={int.id}
                onClick={() => setActiveAutomationTab(int.id as typeof activeAutomationTab)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                  isSel
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-indigo-400" />
                <span>{int.label}</span>
              </button>
            )
          })}
        </div>

        {/* ── n8n Guide ── */}
        {activeAutomationTab === 'n8n' && (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 space-y-5">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-100">Connecting Outreach Smart with n8n</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Use the standard <strong>HTTP Request</strong> node in n8n to pipe leads from webhook triggers, Google Sheets, Airtable, or form submissions directly into Outreach Smart campaigns.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-1">
                <span className="text-[10px] text-zinc-500 font-bold uppercase">Step 1</span>
                <p className="font-semibold text-zinc-200">Add HTTP Request Node</p>
                <p className="text-zinc-400 text-[11px]">Set Method to <code className="text-emerald-400 font-mono">POST</code> and URL to <code className="text-zinc-300 font-mono">{origin}/api/leads</code></p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-1">
                <span className="text-[10px] text-zinc-500 font-bold uppercase">Step 2</span>
                <p className="font-semibold text-zinc-200">Set Auth Header</p>
                <p className="text-zinc-400 text-[11px]">Add Header <code className="text-violet-300 font-mono">Authorization: Bearer outreach_live_...</code></p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-1">
                <span className="text-[10px] text-zinc-500 font-bold uppercase">Step 3</span>
                <p className="font-semibold text-zinc-200">Map JSON Fields</p>
                <p className="text-zinc-400 text-[11px]">Pass <code className="text-indigo-300 font-mono">email</code> and your custom <code className="text-indigo-300 font-mono">variables</code> map.</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-zinc-300">Copy Ready-to-Paste n8n Node JSON</h4>
              <CodeSnippet
                title="n8n Node Blueprint"
                snippets={[
                  {
                    language: 'json',
                    label: 'n8n Node JSON (Paste directly onto n8n canvas)',
                    code: n8nNodeJson,
                  },
                ]}
              />
            </div>
          </div>
        )}

        {/* ── Zapier Guide ── */}
        {activeAutomationTab === 'zapier' && (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-100">Zapier: Webhooks by Zapier (Custom Request)</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              In your Zap, add an Action step using <strong>Webhooks by Zapier &gt; Custom Request</strong>:
            </p>

            <div className="space-y-3 font-mono text-xs text-zinc-300">
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Method</span>
                <span className="text-emerald-400 font-bold">POST</span>
              </div>
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                <span className="text-zinc-500 block text-[10px] uppercase font-semibold">URL</span>
                <span className="text-zinc-200">{origin}/api/leads</span>
              </div>
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Data (Raw JSON)</span>
                <pre className="text-zinc-300 mt-1 whitespace-pre-wrap">
{`{
  "email": "{{1.email}}",
  "variables": {
    "firstName": "{{1.first_name}}",
    "company": "{{1.company}}"
  },
  "campaign_id": "${campaigns[0]?.id || '550e8400-e29b-41d4-a716-446655440000'}"
}`}
                </pre>
              </div>
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Headers</span>
                <span className="text-violet-300 block">Authorization: Bearer outreach_live_your_key_here</span>
                <span className="text-zinc-400 block">Content-Type: application/json</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Make.com Guide ── */}
        {activeAutomationTab === 'make' && (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-100">Make.com (Integromat) HTTP Module</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Add the <strong>HTTP &gt; Make a request</strong> module in your Make scenario:
            </p>

            <ul className="space-y-2 text-xs text-zinc-300 list-disc pl-5">
              <li><strong>URL:</strong> <code className="text-zinc-200 font-mono">{origin}/api/leads</code></li>
              <li><strong>Method:</strong> <code className="text-emerald-400 font-mono">POST</code></li>
              <li><strong>Headers:</strong>
                <ul className="list-disc pl-5 mt-1 space-y-1 text-zinc-400">
                  <li><code className="text-violet-300 font-mono">Authorization</code>: <code className="text-zinc-300 font-mono">Bearer outreach_live_...</code></li>
                  <li><code className="text-zinc-300 font-mono">Content-Type</code>: <code className="text-zinc-300 font-mono">application/json</code></li>
                </ul>
              </li>
              <li><strong>Body type:</strong> Raw (JSON)</li>
              <li><strong>Parse response:</strong> Yes</li>
            </ul>
          </div>
        )}

        {/* ── HTML Form Guide ── */}
        {activeAutomationTab === 'html_form' && (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-100">Website / Serverless Form Handler</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Call Outreach Smart from your backend or serverless functions (Next.js API routes, Cloudflare Workers, Express, etc.) when a user submits a contact form:
            </p>

            <CodeSnippet
              title="Serverless Form Handler Example"
              snippets={[
                {
                  language: 'typescript',
                  label: 'Next.js / Node.js Handler',
                  code: `export async function handleContactForm(formData: { email: string; name: string; message: string }) {
  const res = await fetch('${origin}/api/leads', {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${process.env.OUTREACH_SMART_API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: formData.email,
      variables: {
        firstName: formData.name,
        notes: formData.message,
        source: 'Contact Us Form'
      },
      campaign_id: '${campaigns[0]?.id || '550e8400-e29b-41d4-a716-446655440000'}',
      skip_if_in_campaign: true
    }),
  });

  return await res.json();
}`,
                },
              ]}
            />
          </div>
        )}
      </section>

      {/* ─── Section 6: Schemas & Safety Guarantees ───────────────────────────── */}
      <section id="models" className="space-y-6 pt-4 pb-12">
        <div className="border-b border-zinc-800/80 pb-3">
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" />
            Schemas &amp; Safety Guarantees
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Postgres data structures, status definitions, and error handling rules.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Data Model: Lead */}
          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" />
                Lead Data Schema
              </h3>
              <span className="text-[10px] font-mono text-zinc-500">public.leads</span>
            </div>

            <pre className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-[11px] font-mono text-zinc-300 leading-relaxed overflow-x-auto">
{`interface Lead {
  id: string; // UUID v4
  email: string; // unique, lowercase
  variables: Record<string, any>; // JSONB map
  status: 'active' | 'do_not_contact' | 'bounced';
  status_reason?: string | null;
  status_changed_at?: string | null;
  imported_via?: string | null;
  created_at: string; // ISO 8601
}`}
            </pre>
          </div>

          {/* Data Model: Campaign Lead */}
          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" />
                Campaign Enrollment Schema
              </h3>
              <span className="text-[10px] font-mono text-zinc-500">public.campaign_leads</span>
            </div>

            <pre className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-[11px] font-mono text-zinc-300 leading-relaxed overflow-x-auto">
{`interface CampaignLead {
  id: string; // UUID v4
  campaign_id: string; // Foreign Key
  lead_id: string; // Foreign Key
  status: 'pending' | 'active' | 'replied' | 'bounced' | 'paused' | 'completed';
  current_step: number; // 1-indexed step
  next_send_at: string | null; // ISO 8601
  replied_at?: string | null;
}`}
            </pre>
          </div>
        </div>

        {/* Status Codes Reference */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
            HTTP Status Codes Reference
          </h3>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950 text-zinc-400 border-b border-zinc-800 font-mono text-[11px]">
                <tr>
                  <th className="p-3">Status Code</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Meaning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                <tr>
                  <td className="p-3 font-mono text-emerald-400 font-bold">200 OK</td>
                  <td className="p-3 font-medium text-zinc-200">Success / Skipped</td>
                  <td className="p-3">Request succeeded. If lead already existed and skip flag was set, returned without modification.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono text-emerald-400 font-bold">201 Created</td>
                  <td className="p-3 font-medium text-zinc-200">Resource Created</td>
                  <td className="p-3">New lead or campaign enrollment created successfully.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono text-amber-400 font-bold">207 Multi-Status</td>
                  <td className="p-3 font-medium text-zinc-200">Partial Success</td>
                  <td className="p-3">Lead was created/upserted, but campaign enrollment encountered a non-fatal warning.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono text-amber-400 font-bold">400 Bad Request</td>
                  <td className="p-3 font-medium text-zinc-200">Validation Error</td>
                  <td className="p-3">Invalid JSON body, missing email parameter, or unparseable input.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono text-rose-400 font-bold">401 Unauthorized</td>
                  <td className="p-3 font-medium text-zinc-200">Invalid Key</td>
                  <td className="p-3">Missing or invalid Bearer token. Check header in <code className="text-zinc-400 font-mono">Authorization: Bearer &lt;key&gt;</code>.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono text-amber-400 font-bold">404 Not Found</td>
                  <td className="p-3 font-medium text-zinc-200">Not Found</td>
                  <td className="p-3">No record found matching the specified UUID.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono text-rose-400 font-bold">500 Internal Error</td>
                  <td className="p-3 font-medium text-zinc-200">Server Error</td>
                  <td className="p-3">Database or unexpected backend failure.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
