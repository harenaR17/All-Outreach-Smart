import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getCampaignById, getCampaignLeads, getCampaigns } from '@/app/actions/campaigns'
import { getInboxes } from '@/app/actions/inboxes'
import { getLeads } from '@/app/actions/leads'
import { getTelegramRecipients } from '@/app/actions/settings'
import { getActivitySummaryStats, getActivityFeed } from '@/app/actions/activity'
import { CampaignStudio } from '@/components/campaigns/CampaignStudio'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function CampaignStudioPage({ params }: Props) {
  const { id } = await params

  const [campaignRes, inboxesRes, leadsRes, campaignLeadsRes, tgRes, allCampaignsRes, activityStatsRes, activityFeedRes] = await Promise.all([
    getCampaignById(id),
    getInboxes(),
    getLeads({ limit: 100 }),
    getCampaignLeads(id),
    getTelegramRecipients(),
    getCampaigns(),
    getActivitySummaryStats(id),
    getActivityFeed({ campaignId: id, type: 'all' }),
  ])

  if (!campaignRes.success || !campaignRes.data) {
    notFound()
  }

  const campaign = campaignRes.data
  const inboxes = inboxesRes.data || []
  const leads = leadsRes.data || []
  const campaignLeads = campaignLeadsRes.data || []
  const telegramRecipients = tgRes.data || []
  const allCampaigns = allCampaignsRes.data || [campaign]
  const activityStats = activityStatsRes.data
  const activityEvents = activityFeedRes.data || []

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


      </div>

      {/* Main Studio Editor */}
      <CampaignStudio
        campaign={campaign}
        allInboxes={inboxes}
        sampleLeads={leads}
        campaignLeads={campaignLeads}
        allTelegramRecipients={telegramRecipients}
        allCampaigns={allCampaigns}
        activityStats={activityStats}
        activityEvents={activityEvents}
      />
    </div>
  )
}
