/**
 * Telegram Notification Dispatcher (Deno / Supabase Edge Functions)
 */

export interface TelegramRecipientItem {
  id: string
  chat_id: string
  bot_token: string
  label?: string | null
}

export interface ReplyAlertContext {
  leadEmail: string
  leadCompany?: string | null
  campaignName: string
  inboxEmail: string
  classification: 'real' | 'auto' | 'bounce'
  llmCategory?: 'interested' | 'not_interested' | 'out_of_office' | 'wrong_person' | 'undefined' | null
  snippet: string
  receivedAt?: string
}

const CATEGORY_BADGES: Record<string, { label: string; icon: string }> = {
  interested: { label: 'INTERESTED', icon: '🎯' },
  not_interested: { label: 'NOT INTERESTED', icon: '🛑' },
  wrong_person: { label: 'WRONG PERSON / REDIRECT', icon: '🔄' },
  undefined: { label: 'UNDEFINED (NEEDS REVIEW)', icon: '❓' },
  out_of_office: { label: 'OUT OF OFFICE', icon: '🏖️' },
}

export function escapeMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}

export function formatTelegramReplyMessage(ctx: ReplyAlertContext): string {
  const badge = ctx.llmCategory ? CATEGORY_BADGES[ctx.llmCategory] : null
  const headerIcon = badge ? badge.icon : '📬'
  const categoryTitle = badge
    ? badge.label
    : ctx.classification === 'real'
    ? 'REPLY RECEIVED'
    : ctx.classification.toUpperCase()

  const escapedSnippet = escapeMd(ctx.snippet).slice(0, 1000)
  const escapedEmail = escapeMd(ctx.leadEmail)
  const escapedInbox = escapeMd(ctx.inboxEmail)
  const escapedCampaign = escapeMd(ctx.campaignName)
  const escapedCompany = ctx.leadCompany ? escapeMd(ctx.leadCompany) : null
  const escapedTime = escapeMd(new Date(ctx.receivedAt || Date.now()).toUTCString())

  const lines = [
    `${headerIcon} *${categoryTitle}*`,
    ``,
    `👤 *Lead:* \`${escapedEmail}\``,
    escapedCompany ? `🏢 *Company:* ${escapedCompany}` : null,
    `📢 *Campaign:* ${escapedCampaign}`,
    `📧 *Inbox:* \`${escapedInbox}\``,
    ``,
    `💬 *Reply Snippet:*`,
    `> ${escapedSnippet}`,
    ``,
    `⏱️ _${escapedTime}_`,
  ].filter(Boolean)

  return lines.join('\n')
}

export async function sendTelegramNotification(
  botToken: string,
  chatId: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  if (!botToken || !chatId) {
    return { success: false, error: 'Missing Bot Token or Chat ID' }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { success: false, error: `Telegram API error (${res.status}): ${errText}` }
    }

    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown Telegram error' }
  }
}

export async function notifyAllRecipients(
  recipients: TelegramRecipientItem[],
  ctx: ReplyAlertContext,
  fallbackBotToken?: string
): Promise<{ sentCount: number; errors: string[] }> {
  const message = formatTelegramReplyMessage(ctx)
  let sentCount = 0
  const errors: string[] = []

  for (const recipient of recipients) {
    const token = recipient.bot_token || fallbackBotToken || ''
    if (!token) {
      errors.push(`Recipient ${recipient.label || recipient.chat_id}: Missing Bot Token`)
      continue
    }

    const res = await sendTelegramNotification(token, recipient.chat_id, message)
    if (res.success) {
      sentCount++
    } else if (res.error) {
      errors.push(`Recipient ${recipient.label || recipient.chat_id}: ${res.error}`)
    }
  }

  return { sentCount, errors }
}
