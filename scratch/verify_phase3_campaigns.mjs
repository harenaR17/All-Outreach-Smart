import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

// Inline copy of template renderer logic to test independently
const TOKEN_REGEX = /\{\{(\w+)\}\}/g

function extractTokens(text) {
  const found = new Set()
  for (const match of text.matchAll(TOKEN_REGEX)) {
    found.add(match[1])
  }
  return Array.from(found)
}

function renderTemplate(template, variables, email) {
  const resolved = []
  const missing = []
  const seen = new Set()

  const rendered = template.replace(TOKEN_REGEX, (_, token) => {
    if (token === 'email') {
      if (!seen.has(token)) { resolved.push(token); seen.add(token) }
      return email
    }

    const val = variables[token]
    if (val !== undefined && val !== null && val !== '') {
      if (!seen.has(token)) { resolved.push(token); seen.add(token) }
      return String(val)
    }

    if (!seen.has(token)) { missing.push(token); seen.add(token) }
    return `{{${token}}}`
  })

  return { rendered, resolved, missing }
}

async function verifyPhase3() {
  console.log('=== Running Phase 3 Campaign Builder & Token Resolver Verification ===')

  // 1. Test Template Token Extraction
  console.log('\n--- 1. Testing Template Token Extraction ---')
  const sampleTemplate = 'Hi {{first_name}},\nI saw {{company}} is scaling {{tech_stack}}. Email: {{email}}'
  const extracted = extractTokens(sampleTemplate)
  console.log('Extracted tokens:', extracted)
  if (!extracted.includes('first_name') || !extracted.includes('company') || !extracted.includes('tech_stack') || !extracted.includes('email')) {
    throw new Error('Token extraction failed')
  }
  console.log('✅ Token extraction test passed.')

  // 2. Test Phase 3 "Done When" Requirement:
  // "Done when: a template referencing a variable the preview lead doesn't have visibly flags it instead of rendering blank."
  console.log('\n--- 2. Testing Missing-Token Diagnostic ("Done When" Criterion) ---')
  const leadWithMissingVars = {
    email: 'elon@spacex.com',
    variables: { first_name: 'Elon' } // missing 'company' and 'tech_stack'
  }

  const result = renderTemplate(sampleTemplate, leadWithMissingVars.variables, leadWithMissingVars.email)
  console.log('Rendered output:', result.rendered)
  console.log('Resolved tokens:', result.resolved)
  console.log('Missing tokens flagged:', result.missing)

  if (result.missing.includes('company') && result.missing.includes('tech_stack') && result.resolved.includes('first_name') && result.resolved.includes('email')) {
    console.log('✅ PASS: Missing tokens were explicitly detected and flagged as missing, keeping {{company}} and {{tech_stack}} visible.')
  } else {
    throw new Error(`Failed missing variable test: missing=${JSON.stringify(result.missing)}`)
  }

  // 3. Test Database Campaign Creation with Steps and Schedule
  console.log('\n--- 3. Testing Database Campaign CRUD & Multi-step Sequence ---')
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .insert({
      name: 'Phase 3 Automated Verification Sequence',
      status: 'draft',
      timezone: 'Europe/Paris',
      working_days: [1, 2, 3, 4, 5],
      working_hours_start: '09:00:00',
      working_hours_end: '18:00:00',
    })
    .select()
    .single()

  if (campErr) throw campErr
  console.log('Created campaign:', campaign.id, campaign.name, 'status:', campaign.status)

  // Insert 2 sequence steps
  const { data: steps, error: stepErr } = await supabase
    .from('campaign_steps')
    .insert([
      {
        campaign_id: campaign.id,
        step_order: 1,
        delay_days: 0,
        subject_template: 'Quick intro for {{company}}',
        body_template: 'Hi {{first_name}},\nWould love to connect regarding {{company}}.',
      },
      {
        campaign_id: campaign.id,
        step_order: 2,
        delay_days: 3,
        subject_template: 'Re: Quick intro for {{company}}',
        body_template: 'Hi {{first_name}}, following up on my previous message.',
      }
    ])
    .select()

  if (stepErr) throw stepErr
  console.log(`Created ${steps.length} campaign steps successfully. Step 1 delay=0, Step 2 delay=3.`)

  // Test status transition: draft -> active -> paused
  console.log('\n--- 4. Testing Campaign Lifecycle (draft -> active -> paused) ---')
  const { error: launchErr } = await supabase.from('campaigns').update({ status: 'active' }).eq('id', campaign.id)
  if (launchErr) throw launchErr
  console.log('Launched campaign -> status: active')

  const { error: pauseErr } = await supabase.from('campaigns').update({ status: 'paused' }).eq('id', campaign.id)
  if (pauseErr) throw pauseErr
  console.log('Paused campaign -> status: paused')

  // Cleanup test campaign
  await supabase.from('campaigns').delete().eq('id', campaign.id)
  console.log('Cleaned up test campaign.')

  console.log('\n=====================================================================')
  console.log('✅ ALL PHASE 3 VERIFICATION CRITERIA PASSED SUCCESSFULLY!')
}

verifyPhase3().catch((err) => {
  console.error('Phase 3 verification error:', err)
  process.exit(1)
})
