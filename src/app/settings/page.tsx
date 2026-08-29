import { getGeminiKeys, getTelegramRecipients, listApiKeys } from '@/app/actions/settings'
import { GeminiKeysManager } from '@/components/settings/GeminiKeysManager'
import { TelegramRecipientsManager } from '@/components/settings/TelegramRecipientsManager'
import { ApiKeysManager } from '@/components/settings/ApiKeysManager'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [keysRes, tgRes, apiKeysRes] = await Promise.all([
    getGeminiKeys(),
    getTelegramRecipients(),
    listApiKeys(),
  ])

  const geminiKeys = keysRes.data || []
  const telegramRecipients = tgRes.data || []
  const apiKeys = apiKeysRes.data || []

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Phase 5
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Settings &amp; Intelligence Keys
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Manage Gemini API keys for reply classification, Telegram notification channels, and external API access keys.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Gemini API Keys */}
        <GeminiKeysManager initialKeys={geminiKeys} />

        {/* Right Column: Telegram Notification Recipients */}
        <TelegramRecipientsManager initialRecipients={telegramRecipients} />
      </div>

      {/* Full-width: External API Keys */}
      <ApiKeysManager initialKeys={apiKeys} />
    </div>
  )
}
