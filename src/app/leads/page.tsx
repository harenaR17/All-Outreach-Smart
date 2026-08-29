import { getLeads, getLeadImports } from '@/app/actions/leads'
import { getCampaigns } from '@/app/actions/campaigns'
import { LeadsManager } from '@/components/leads/LeadsManager'
import { Users, UploadCloud, ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const [leadsRes, importsRes, campaignsRes] = await Promise.all([
    getLeads({ limit: 200 }),
    getLeadImports(),
    getCampaigns(),
  ])

  const leads = leadsRes.data || []
  const imports = importsRes.data || []
  const campaigns = campaignsRes.data || []

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Phase 2
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Leads & Spreadsheet Import
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Global deduplicated contact pool, CSV/XLSX column variable extraction, campaign assignment, and Do-Not-Contact protections.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-400">Dedup Guarantee:</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            ON CONFLICT (email) DO NOTHING
          </span>
        </div>
      </div>

      {leadsRes.error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          Failed to load leads: {leadsRes.error}
        </div>
      )}

      {/* Main Leads Management Interface */}
      <LeadsManager initialLeads={leads} imports={imports} campaigns={campaigns} />
    </div>
  )
}
