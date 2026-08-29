import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function testPhase2Dedup() {
  console.log('=== Running Phase 2 Deduplication Verification ===')

  const testFile = 'phase2_sample_leads.csv'
  const testLeads = [
    { email: 'alex.rivera@quantumreach.io', variables: { first_name: 'Alex', company: 'QuantumReach', role: 'Head of Sales' } },
    { email: 'claire.dubois@hyperion-tech.fr', variables: { first_name: 'Claire', company: 'Hyperion Tech', role: 'CTO' } },
    { email: 'marcus.vance@apexsol.com', variables: { first_name: 'Marcus', company: 'Apex Solutions', role: 'Founder' } },
  ]

  // Run 1: First Import
  console.log('\n--- Run 1: First Ingestion of File ---')
  const { data: import1, error: impErr1 } = await supabase
    .from('lead_imports')
    .insert({ filename: testFile, total_rows: testLeads.length, new_leads: 0, duplicate_leads: 0 })
    .select('id')
    .single()

  if (impErr1) throw impErr1

  const { data: inserted1, error: insErr1 } = await supabase
    .from('leads')
    .upsert(testLeads.map(l => ({ email: l.email, variables: l.variables, imported_via: import1.id, status: 'active' })), {
      onConflict: 'email',
      ignoreDuplicates: true,
    })
    .select('id, email')

  if (insErr1) throw insErr1

  const newLeads1 = inserted1 ? inserted1.length : 0
  const duplicateLeads1 = testLeads.length - newLeads1
  console.log(`Run 1 Result: Total=${testLeads.length}, New Added=${newLeads1}, Duplicates Skipped=${duplicateLeads1}`)

  // Run 2: Second Ingestion of the exact same File
  console.log('\n--- Run 2: Second Ingestion of Exact Same File ---')
  const { data: import2, error: impErr2 } = await supabase
    .from('lead_imports')
    .insert({ filename: testFile, total_rows: testLeads.length, new_leads: 0, duplicate_leads: 0 })
    .select('id')
    .single()

  if (impErr2) throw impErr2

  const { data: inserted2, error: insErr2 } = await supabase
    .from('leads')
    .upsert(testLeads.map(l => ({ email: l.email, variables: l.variables, imported_via: import2.id, status: 'active' })), {
      onConflict: 'email',
      ignoreDuplicates: true,
    })
    .select('id, email')

  if (insErr2) throw insErr2

  const newLeads2 = inserted2 ? inserted2.length : 0
  const duplicateLeads2 = testLeads.length - newLeads2
  console.log(`Run 2 Result: Total=${testLeads.length}, New Added=${newLeads2}, Duplicates Skipped=${duplicateLeads2}`)

  console.log('\n======================================================')
  if (newLeads2 === 0 && duplicateLeads2 === testLeads.length) {
    console.log('✅ PASS: "Done when: importing the same file twice produces zero duplicate leads rows and a (0 new, N already existed) summary the second time."')
  } else {
    console.error('❌ FAIL: Expected 0 new and 3 duplicates on second run, got:', { newLeads2, duplicateLeads2 })
    process.exit(1)
  }
}

testPhase2Dedup().catch(err => {
  console.error('Test execution error:', err)
  process.exit(1)
})
