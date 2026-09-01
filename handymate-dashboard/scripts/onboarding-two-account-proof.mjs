#!/usr/bin/env node

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env.test', quiet: true })

const phaseArg = process.argv.find(arg => arg.startsWith('--phase='))
const phase = phaseArg?.split('=')[1] || 'pre'
if (!['pre', 'post'].includes(phase)) {
  console.error('Använd --phase=pre eller --phase=post')
  process.exit(2)
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const classicId = process.env.PROOF_CLASSIC_BUSINESS_ID
const studioId = process.env.PROOF_STUDIO_BUSINESS_ID

if (!url || !serviceKey) {
  console.error('SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY måste finnas i vald env-fil.')
  process.exit(2)
}
if (!classicId || !studioId) {
  console.error('Sätt PROOF_CLASSIC_BUSINESS_ID och PROOF_STUDIO_BUSINESS_ID i den lokala shell-sessionen.')
  process.exit(2)
}
if (classicId === studioId) {
  console.error('Klassisk och Studio måste använda två olika testföretag.')
  process.exit(2)
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function count(table, businessId, apply = query => query) {
  const query = apply(db.from(table).select('*', { count: 'exact', head: true }).eq('business_id', businessId))
  const { count: value, error } = await query
  if (error) throw new Error(`${table}: ${error.message}`)
  return value ?? 0
}

async function snapshot(label, businessId) {
  const { data: config, error: configError } = await db
    .from('business_config')
    .select('business_id,onboarding_step,onboarding_completed_at')
    .eq('business_id', businessId)
    .maybeSingle()
  if (configError) throw new Error(`business_config: ${configError.message}`)
  if (!config) throw new Error(`${label}: business_config saknas`)

  const { data: members, error: memberError } = await db
    .from('business_users')
    .select('role')
    .eq('business_id', businessId)
  if (memberError) throw new Error(`business_users: ${memberError.message}`)

  const metrics = {
    membersOwnerAdmin: (members || []).filter(row => ['owner', 'admin'].includes(row.role)).length,
    products: await count('products', businessId),
    pricedProducts: await count('products', businessId, q => q.gt('sales_price', 0)),
    jobTypes: await count('job_types', businessId, q => q.eq('is_active', true)),
    templates: await count('quote_templates', businessId),
    linkedTemplates: await count('quote_templates', businessId, q => q.not('job_type_slug', 'is', null)),
    customers: await count('customer', businessId),
    deals: await count('deal', businessId),
    quotes: await count('quotes', businessId),
    sentQuotes: await count('quotes', businessId, q => q.eq('status', 'sent')),
  }

  return {
    label,
    businessId,
    onboardingStep: config.onboarding_step ?? 0,
    onboardingCompleted: Boolean(config.onboarding_completed_at),
    ...metrics,
  }
}

function evaluatePre(row) {
  const empty = ['products', 'jobTypes', 'templates', 'customers', 'deals', 'quotes']
    .every(key => row[key] === 0)
  return row.membersOwnerAdmin >= 1 && !row.onboardingCompleted && empty
}

function evaluatePost(row) {
  return row.membersOwnerAdmin >= 1 &&
    row.onboardingCompleted &&
    row.products >= 3 && row.pricedProducts >= 3 &&
    row.jobTypes >= 1 && row.linkedTemplates >= 1 &&
    row.quotes >= 1 && row.sentQuotes >= 1
}

try {
  const rows = await Promise.all([
    snapshot('A · klassisk', classicId),
    snapshot('B · Setup Studio', studioId),
  ])
  const evaluate = phase === 'pre' ? evaluatePre : evaluatePost
  const result = rows.map(row => ({ ...row, pass: evaluate(row) }))
  console.table(result)
  const ok = result.every(row => row.pass)
  console.log(ok ? `TVÅKONTOSBEVIS ${phase.toUpperCase()}: PASS` : `TVÅKONTOSBEVIS ${phase.toUpperCase()}: FAIL`)
  process.exit(ok ? 0 : 1)
} catch (error) {
  console.error(`TVÅKONTOSBEVIS ${phase.toUpperCase()}: ERROR — ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
