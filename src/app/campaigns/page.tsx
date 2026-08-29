import { getCampaigns } from '@/app/actions/campaigns'
import { CampaignsManager } from '@/components/campaigns/CampaignsManager'
import { Megaphone } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const { data: campaigns, error } = await getCampaigns()

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Phase 3
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Campaigns & Sequence Studio
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Build multi-step email sequences, configure delays, live preview against real leads with token diagnostics, and assign inbox pools.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          Failed to load campaigns: {error}
        </div>
      )}

      {/* Campaigns Grid & Management */}
      <CampaignsManager initialCampaigns={campaigns || []} />
    </div>
  )
}
