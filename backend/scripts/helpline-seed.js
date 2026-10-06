// Loads the starter Helpline knowledge (src/helpline/data/knowledge.json) into the Supabase table
// helpline_knowledge. Only entries whose question is not in the table yet are inserted: existing
// rows, including ones edited in Supabase, are never updated or deleted. Safe to run again.
//
//   npm run helpline:seed
//
// Needs the migration supabase/migrations/20261006000005_helpline_knowledge.sql and
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in backend/.env.
import fs from 'node:fs'
import { supabaseAdmin } from '../src/supabase/adminClient.js'

const entries = JSON.parse(fs.readFileSync(new URL('../src/helpline/data/knowledge.json', import.meta.url), 'utf8'))

if (!supabaseAdmin) {
  console.error('✘ Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.')
  process.exit(1)
}

const { data, error } = await supabaseAdmin
  .from('helpline_knowledge')
  .upsert(entries, { onConflict: 'question', ignoreDuplicates: true })
  .select('question')

if (error) {
  const missingTable = ['42P01', 'PGRST205'].includes(error.code) || /helpline_knowledge/.test(error.message)
  console.error(
    missingTable
      ? '✘ Table helpline_knowledge not found. Run supabase/migrations/20261006000005_helpline_knowledge.sql in the Supabase SQL editor first.'
      : `✘ Could not seed helpline knowledge: ${error.message}`,
  )
  process.exit(1)
}

console.log(`✔ ${data.length} new entries added, ${entries.length - data.length} already present (left unchanged).`)
