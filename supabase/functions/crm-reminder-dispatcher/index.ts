/**
 * CRM Reminder Dispatcher — Supabase Edge Function
 *
 * Runs every 5 minutes via pg_cron.
 * Queries crm_reminders for any pending reminders whose fire_at <= now(),
 * sends a Telegram notification for each, and marks them as fired.
 *
 * Uses the same telegram.ts shared helper as reply-checker.
 * Uses the same x-cron-secret auth pattern as all other cron functions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  sendTelegramNotification,
  escapeMd,
  type TelegramRecipientItem,
} from '../_shared/telegram.ts'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PendingReminder {
  id: string
  user_id: string
  entry_id: string
  recipient_id: string | null
  reminder_type: 'no_response' | 'meeting' | 'follow_up' | 'custom'
  fire_at: string
  message: string
  crm_pipeline_entries: {
    lead_id: string
    status_id: string
    leads: {
      email: string
      variables: Record<string, unknown>
    }
  }
}

interface TelegramRecipientRow extends TelegramRecipientItem {
  user_id: string
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // 1. Shared secret check
  const authHeader = req.headers.get('x-cron-secret')
  const expectedSecret = Deno.env.get('CRON_SECRET')

  if (expectedSecret && authHeader !== expectedSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN')

  const results = {
    remindersChecked: 0,
    remindersFired: 0,
    errors: [] as string[],
    timestamp: new Date().toISOString(),
  }

  try {
    // 2. Fetch all pending reminders that are due
    const { data: pendingReminders, error: remindersError } = await supabase
      .from('crm_reminders')
      .select(`
        id,
        user_id,
        entry_id,
        recipient_id,
        reminder_type,
        fire_at,
        message,
        crm_pipeline_entries (
          lead_id,
          status_id,
          leads ( email, variables )
        )
      `)
      .eq('status', 'pending')
      .lte('fire_at', new Date().toISOString())
      .order('fire_at', { ascending: true })
      .limit(200) // Safety cap per run

    if (remindersError) throw remindersError

    const reminders = (pendingReminders || []) as unknown as PendingReminder[]
    results.remindersChecked = reminders.length

    if (reminders.length === 0) {
      return jsonResponse({ status: 'ok', message: 'No pending reminders due', ...results })
    }

    // 3. Fetch all active Telegram recipients, indexed by user_id
    const { data: tgData } = await supabase
      .from('telegram_notify_recipients')
      .select('id, chat_id, bot_token, label, user_id')
      .eq('is_active', true)

    const recipientsByUser = new Map<string, TelegramRecipientItem[]>()
    for (const r of (tgData || []) as unknown as TelegramRecipientRow[]) {
      const list = recipientsByUser.get(r.user_id) ?? []
      list.push(r)
      recipientsByUser.set(r.user_id, list)
    }

    // 4. Fire each reminder
    const firedIds: string[] = []
    const now = new Date().toISOString()

    for (const reminder of reminders) {
      try {
        let recipients = recipientsByUser.get(reminder.user_id) ?? []

        // If a specific bot/recipient was selected, filter to only that recipient
        if (reminder.recipient_id) {
          recipients = recipients.filter((r) => r.id === reminder.recipient_id)
        }

        if (recipients.length === 0) {
          // No Telegram recipients configured or matching target — mark fired anyway
          // so we don't re-queue it endlessly
          firedIds.push(reminder.id)
          results.errors.push(
            `Reminder ${reminder.id}: No matching active Telegram recipients for user ${reminder.user_id} (target: ${reminder.recipient_id || 'all'})`
          )
          continue
        }

        let sentCount = 0
        for (const recipient of recipients) {
          const token = recipient.bot_token || telegramBotToken || ''
          if (!token) {
            results.errors.push(
              `Reminder ${reminder.id}: Recipient ${recipient.label || recipient.chat_id} has no bot token`
            )
            continue
          }

          const res = await sendTelegramNotification(token, recipient.chat_id, reminder.message)
          if (res.success) {
            sentCount++
          } else if (res.error) {
            results.errors.push(
              `Reminder ${reminder.id} → recipient ${recipient.label || recipient.chat_id}: ${res.error}`
            )
          }
        }

        if (sentCount > 0) {
          results.remindersFired++
        }
        firedIds.push(reminder.id)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        results.errors.push(`Reminder ${reminder.id}: ${msg}`)
        // Still mark as fired to avoid infinite retry on a bad reminder
        firedIds.push(reminder.id)
      }
    }

    // 5. Bulk mark all processed reminders as fired
    if (firedIds.length > 0) {
      await supabase
        .from('crm_reminders')
        .update({ status: 'fired', fired_at: now })
        .in('id', firedIds)
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message, ...results }, 500)
  }

  return jsonResponse({ status: 'ok', ...results })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Re-export escapeMd so it's available if needed in future template expansion
export { escapeMd }
