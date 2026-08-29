import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getCampaignById, getCampaignLeads } from '@/app/actions/campaigns'
import { getInboxes } from '@/app/actions/inboxes'
import { getLeads } from '@/app/actions/leads'
import { getTelegramRecipients } from '@/app/actions/settings'
import { CampaignStudio } from '@/components/campaigns/CampaignStudio'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function CampaignStudioPage({ params }: Props) {
  const { id } = await params

  const [campaignRes, inboxesRes, leadsRes, campaignLeadsRes, tgRes] = await Promise.all([
    getCampaignById(id),
    getInboxes(),
    getLeads({ limit: 100 }),
    getCampaignLeads(id),
    getTelegramRecipients(),
  ])

  if (!campaignRes.success || !campaignRes.data) {
    notFound()
  }

  const campaign = campaignRes.data
  const inboxes = inboxesRes.data || []
  const leads = leadsRes.data || []
  const campaignLeads = campaignLeadsRes.data || []
  const telegramRecipients = tgRes.data || []

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Breadcrumb & Nav */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Campaigns</span>
        </Link>

        <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
          <span>Campaign ID:</span>
          <span className="text-zinc-400">{campaign.id.slice(0, 8)}...</span>
        </div>
      </div>

      {/* Main Studio Editor */}
      <CampaignStudio
        campaign={campaign}
        allInboxes={inboxes}
        sampleLeads={leads}
        campaignLeads={campaignLeads}
        allTelegramRecipients={telegramRecipients}
      />
    </div>
  )
}
