import { Inbox } from 'lucide-react'
import { getSmartBoxLeads } from '@/app/actions/smartbox'
import { SmartBoxManager } from '@/components/smartbox/SmartBoxManager'

export const dynamic = 'force-dynamic'

export default async function SmartBoxPage() {
  const leadsRes = await getSmartBoxLeads()
  const leads = leadsRes.data || []

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Unified Inbox
            </span>
            <h1 className="text-xl font-bold text-zinc-100">SmartBox</h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Every genuine reply and auto-detected out-of-office response across all campaigns, triaged by Gemini and threaded in one place.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 bg-zinc-900/60 px-3 py-1.5 rounded-lg border border-zinc-800 self-start sm:self-auto">
          <Inbox className="w-3.5 h-3.5 text-indigo-400" />
          <span>{leads.length} conversation{leads.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      <SmartBoxManager initialLeads={leads} />
    </div>
  )
}
