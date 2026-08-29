'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { EmailAccount, EmailAccountInsert, EmailAccountUpdate } from '@/lib/types/database'
import { verifyGmailInbox, sendSelfTestEmail, normalizePrivateKey } from '@/lib/google/auth'

export async function getInboxes(): Promise<{
  success: boolean
  data?: EmailAccount[]
  error?: string
}> {
  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from('email_accounts')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: (data as EmailAccount[]) || [] }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch inboxes'
    return { success: false, error: message }
  }
}

export interface AddInboxInput {
  emailAddress: string
  displayName?: string
  clientEmail: string
  privateKey: string
  dailySendLimit?: number
  minSecondsBetweenSends?: number
}

export async function addInbox(input: AddInboxInput): Promise<{
  success: boolean
  data?: EmailAccount
  error?: string
  errorCode?: string
  remediation?: string
}> {
  try {
    const emailAddress = input.emailAddress.trim().toLowerCase()
    const clientEmail = input.clientEmail.trim()
    const privateKey = normalizePrivateKey(input.privateKey)
    const displayName = input.displayName?.trim() || null
    const dailySendLimit = Number(input.dailySendLimit) || 30
    const minSecondsBetweenSends = Number(input.minSecondsBetweenSends) || 180

    if (!emailAddress || !clientEmail || !privateKey) {
      return {
        success: false,
        error: 'Please fill in the mailbox address, service account client email, and private key.',
      }
    }

    // 1. Verify credentials and profile read access via Gmail API
    const verification = await verifyGmailInbox({
      emailAddress,
      clientEmail,
      privateKey,
    })

    if (!verification.success) {
      return {
        success: false,
        error: verification.error || 'Gmail verification failed.',
        errorCode: verification.errorCode,
        remediation: verification.remediation,
      }
    }

    // 2. Send confirmation self-test email to verify gmail.send scope and active delegation
    const testSend = await sendSelfTestEmail({
      emailAddress,
      clientEmail,
      privateKey,
    })

    if (!testSend.success) {
      return {
        success: false,
        error: `Gmail read succeeded, but sending test confirmation email failed: ${testSend.error}`,
        errorCode: testSend.errorCode || 'GMAIL_SEND_ERROR',
        remediation:
          testSend.remediation ||
          'Check that https://www.googleapis.com/auth/gmail.send is included in Google Workspace Admin Console Domain-Wide Delegation.',
      }
    }

    // 3. Insert verified inbox into Supabase email_accounts table
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from('email_accounts')
      .insert({
        email_address: emailAddress,
        display_name: displayName,
        service_account_client_email: clientEmail,
        service_account_private_key: privateKey,
        google_access_token: testSend.accessToken || verification.accessToken || null,
        google_token_expires_at: testSend.tokenExpiresAt || verification.tokenExpiresAt || null,
        status: 'active',
        error_message: null,
        daily_send_limit: dailySendLimit,
        min_seconds_between_sends: minSecondsBetweenSends,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          error: `An inbox with address "${emailAddress}" is already connected.`,
        }
      }
      return { success: false, error: error.message }
    }

    revalidatePath('/inboxes')
    revalidatePath('/')
    return { success: true, data: data as EmailAccount }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add inbox'
    return { success: false, error: message }
  }
}

export async function testInboxConnection(inboxId: string): Promise<{
  success: boolean
  error?: string
  remediation?: string
}> {
  try {
    const supabase = supabaseAdmin()
    const { data: inbox, error: fetchError } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', inboxId)
      .single()

    if (fetchError || !inbox) {
      return { success: false, error: 'Inbox not found in database.' }
    }

    const verification = await verifyGmailInbox({
      emailAddress: inbox.email_address,
      clientEmail: inbox.service_account_client_email,
      privateKey: inbox.service_account_private_key,
    })

    if (verification.success) {
      await supabase
        .from('email_accounts')
        .update({
          status: 'active',
          error_message: null,
          google_access_token: verification.accessToken || null,
          google_token_expires_at: verification.tokenExpiresAt || null,
        })
        .eq('id', inboxId)

      revalidatePath('/inboxes')
      revalidatePath('/')
      return { success: true }
    } else {
      await supabase
        .from('email_accounts')
        .update({
          status: 'error',
          error_message: verification.error || 'Connection verification failed',
        })
        .eq('id', inboxId)

      revalidatePath('/inboxes')
      revalidatePath('/')
      return {
        success: false,
        error: verification.error,
        remediation: verification.remediation,
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to test connection'
    return { success: false, error: message }
  }
}

/**
 * Sends an on-demand confirmation test email to the inbox itself to verify gmail.send capability.
 */
export async function sendTestEmailAction(inboxId: string): Promise<{
  success: boolean
  error?: string
  remediation?: string
}> {
  try {
    const supabase = supabaseAdmin()
    const { data: inbox, error: fetchError } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', inboxId)
      .single()

    if (fetchError || !inbox) {
      return { success: false, error: 'Inbox not found in database.' }
    }

    const testSend = await sendSelfTestEmail({
      emailAddress: inbox.email_address,
      clientEmail: inbox.service_account_client_email,
      privateKey: inbox.service_account_private_key,
    })

    if (testSend.success) {
      await supabase
        .from('email_accounts')
        .update({
          status: 'active',
          error_message: null,
          google_access_token: testSend.accessToken || null,
          google_token_expires_at: testSend.tokenExpiresAt || null,
        })
        .eq('id', inboxId)

      revalidatePath('/inboxes')
      revalidatePath('/')
      return { success: true }
    } else {
      await supabase
        .from('email_accounts')
        .update({
          status: 'error',
          error_message: testSend.error || 'Test email send failed',
        })
        .eq('id', inboxId)

      revalidatePath('/inboxes')
      revalidatePath('/')
      return {
        success: false,
        error: testSend.error,
        remediation: testSend.remediation,
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send test email'
    return { success: false, error: message }
  }
}

export async function updateInboxSettings(
  inboxId: string,
  updates: {
    daily_send_limit?: number
    min_seconds_between_sends?: number
    is_active?: boolean
    display_name?: string | null
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = supabaseAdmin()
    const updatePayload: EmailAccountUpdate = {}

    if (typeof updates.daily_send_limit === 'number') {
      updatePayload.daily_send_limit = Math.max(1, updates.daily_send_limit)
    }
    if (typeof updates.min_seconds_between_sends === 'number') {
      updatePayload.min_seconds_between_sends = Math.max(10, updates.min_seconds_between_sends)
    }
    if (typeof updates.is_active === 'boolean') {
      updatePayload.is_active = updates.is_active
    }
    if (updates.display_name !== undefined) {
      updatePayload.display_name = updates.display_name
    }

    const { error } = await supabase
      .from('email_accounts')
      .update(updatePayload)
      .eq('id', inboxId)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/inboxes')
    revalidatePath('/')
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update inbox settings'
    return { success: false, error: message }
  }
}

export async function deleteInbox(inboxId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = supabaseAdmin()
    const { error } = await supabase.from('email_accounts').delete().eq('id', inboxId)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/inboxes')
    revalidatePath('/')
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete inbox'
    return { success: false, error: message }
  }
}
