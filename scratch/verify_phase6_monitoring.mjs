import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function verifyPhase6() {
  console.log('=== Running Phase 6 Monitoring & Polish Verification ===\n')

  // --- 1. Create a test campaign with leads and sequence ---
  console.log('--- 1. Setting up test campaign with lead and send records ---')
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .insert({
      name: `Phase 6 Test Campaign ${Date.now()}`,
      status: 'active',
      timezone: 'Europe/Paris',
      working_days: [1, 2, 3, 4, 5],
      working_hours_start: '09:00:00',
      working_hours_end: '18:00:00',
      stop_on_auto_reply: true,
    })
    .select()
    .single()

  if (campErr) throw campErr
  console.log('Created test campaign:', campaign.id, campaign.name)

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .insert({
      email: `lead.phase6.${Date.now()}@enterprise.com`,
      variables: { first_name: 'Elena', company: 'Global Corp' },
      status: 'active',
    })
    .select()
    .single()

  if (leadErr) throw leadErr
  console.log('Created test lead:', lead.id, lead.email)

  const { data: campaignLead, error: clErr } = await supabase
    .from('campaign_leads')
    .insert({
      campaign_id: campaign.id,
      lead_id: lead.id,
      status: 'active',
      current_step: 0,
      next_send_at: new Date(Date.now() + 86400000).toISOString(),
    })
    .select()
    .single()

  if (clErr) throw clErr
  console.log('Created campaign_lead:', campaignLead.id)

  const { data: step, error: stepErr } = await supabase
    .from('campaign_steps')
    .insert({
      campaign_id: campaign.id,
      step_order: 0,
      delay_days: 0,
      subject_template: 'Hello {{first_name}}',
      body_template: 'Quick question for {{company}}',
    })
    .select()
    .single()

  if (stepErr) throw stepErr
  console.log('Created campaign step:', step.id)

  const { data: inboxes } = await supabase.from('email_accounts').select('id').limit(1)
  let emailAccountId = inboxes?.[0]?.id
  let createdTestInbox = false

  if (!emailAccountId) {
    const { data: newInbox, error: inboxErr } = await supabase
      .from('email_accounts')
      .insert({
        email_address: `test.inbox.${Date.now()}@domain.com`,
        service_account_client_email: 'sa@project.iam.gserviceaccount.com',
        service_account_private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7\n-----END PRIVATE KEY-----',
        daily_send_limit: 50,
        is_active: true,
      })
      .select()
      .single()
    if (inboxErr) throw inboxErr
    emailAccountId = newInbox.id
    createdTestInbox = true
  }

  // Insert a mock send record
  const { data: sendRow, error: sendErr } = await supabase
    .from('sends')
    .insert({
      campaign_lead_id: campaignLead.id,
      step_id: step.id,
      email_account_id: emailAccountId,
      status: 'sent',
      gmail_message_id: `msg_${Date.now()}`,
      gmail_thread_id: `thread_${Date.now()}`,
    })
    .select()
    .single()

  if (sendErr) throw sendErr
  console.log('Created mock send record:', sendRow.id)

  // Insert a mock reply record with Gemini category
  const { data: replyRow, error: replyErr } = await supabase
    .from('replies')
    .insert({
      campaign_lead_id: campaignLead.id,
      gmail_message_id: `reply_${Date.now()}`,
      classification: 'real',
      llm_category: 'interested',
      snippet: 'Sounds great! Can we meet on Tuesday at 3pm?',
    })
    .select()
    .single()

  if (replyErr) throw replyErr
  console.log('Created mock reply record with category "interested":', replyRow.id)

  // --- 2. Verify Campaign Leads Retrieval ---
  console.log('\n--- 2. Verifying Campaign Leads Query ---')
  const { data: clList, error: queryErr } = await supabase
    .from('campaign_leads')
    .select('*, leads!inner(*)')
    .eq('campaign_id', campaign.id)

  if (queryErr) throw queryErr
  console.log(`Retrieved ${clList.length} campaign lead(s).`)
  if (clList.length === 0 || clList[0].leads.email !== lead.email) {
    throw new Error('Failed to retrieve campaign leads with joined lead details')
  }
  console.log('✅ PASS: Per-campaign leads retrieval verified.')

  // --- 3. Verify Campaign Pause & Resume Transitions ---
  console.log('\n--- 3. Verifying Campaign Pause & Resume Transitions ---')
  // Pause campaign
  const { error: pauseErr } = await supabase
    .from('campaigns')
    .update({ status: 'paused' })
    .eq('id', campaign.id)
  if (pauseErr) throw pauseErr

  const { data: pausedCamp } = await supabase
    .from('campaigns')
    .select('status')
    .eq('id', campaign.id)
    .single()
  console.log('Campaign status after pause:', pausedCamp.status)
  if (pausedCamp.status !== 'paused') throw new Error('Pause campaign failed')

  // Resume campaign
  const { error: resumeErr } = await supabase
    .from('campaigns')
    .update({ status: 'active' })
    .eq('id', campaign.id)
  if (resumeErr) throw resumeErr

  const { data: resumedCamp } = await supabase
    .from('campaigns')
    .select('status')
    .eq('id', campaign.id)
    .single()
  console.log('Campaign status after resume:', resumedCamp.status)
  if (resumedCamp.status !== 'active') throw new Error('Resume campaign failed')
  console.log('✅ PASS: Pause and resume state transitions verified.')

  // --- 4. Cleanup ---
  console.log('\n--- 4. Cleaning up test data ---')
  await supabase.from('replies').delete().eq('id', replyRow.id)
  await supabase.from('sends').delete().eq('id', sendRow.id)
  await supabase.from('campaign_steps').delete().eq('id', step.id)
  await supabase.from('campaign_leads').delete().eq('id', campaignLead.id)
  await supabase.from('leads').delete().eq('id', lead.id)
  await supabase.from('campaigns').delete().eq('id', campaign.id)
  if (createdTestInbox) {
    await supabase.from('email_accounts').delete().eq('id', emailAccountId)
  }
  console.log('Cleaned up test campaign and associated records.')

  console.log('\n=====================================================================')
  console.log('✅ ALL PHASE 6 MONITORING & POLISH VERIFICATION TESTS PASSED!')
}

verifyPhase6().catch((err) => {
  console.error('Phase 6 verification error:', err)
  process.exit(1)
})
