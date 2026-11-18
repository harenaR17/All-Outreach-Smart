import { Suspense } from 'react'
import { getCrmPipelineData } from '@/app/actions/crm'
import { getTelegramRecipients } from '@/app/actions/settings'
import { PipelineManager } from '@/components/pipeline/PipelineManager'
import { Loader2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  const [pipelineRes, tgRes] = await Promise.all([
    getCrmPipelineData({
      showArchived: true,
      showCold: true,
    }),
    getTelegramRecipients(),
  ])

  const leads = pipelineRes.data?.leads || []
  const statuses = pipelineRes.data?.statuses || []
  const telegramRecipients = tgRes.data || []

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <Suspense
        fallback={
          <div className="py-24 flex items-center justify-center gap-3 text-zinc-400 text-xs">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
            Loading CRM Pipeline...
          </div>
        }
      >
        <PipelineManager
          initialLeads={leads}
          initialStatuses={statuses}
          telegramRecipients={telegramRecipients}
        />
      </Suspense>
    </div>
  )
}
