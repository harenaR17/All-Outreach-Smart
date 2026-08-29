import { listApiKeys } from '@/app/actions/settings'
import { getCampaigns } from '@/app/actions/campaigns'
import { ApiDocumentationView } from '@/components/api-docs/ApiDocumentationView'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'API Documentation | Outreach Smart',
  description: 'Interactive API documentation, code recipes, live testing playground, and webhook integration guides for Outreach Smart.',
}

export default async function ApiDocsPage() {
  const [apiKeysRes, campaignsRes] = await Promise.all([
    listApiKeys(),
    getCampaigns(),
  ])

  const apiKeys = apiKeysRes.data || []
  const campaigns = campaignsRes.data || []

  return <ApiDocumentationView apiKeys={apiKeys} campaigns={campaigns} />
}
