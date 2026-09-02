import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { getServerSupabase } from '@/lib/supabase'
import {
  evaluateBillingPlans,
  evaluateLaunchEnvironment,
  evaluateStorageBuckets,
  hamtaLanseringsbevis,
  MANUAL_LAUNCH_PROOFS,
  SELLABLE_BILLING_PLAN_IDS,
  type LaunchCheck,
} from '@/lib/launch/readiness'

export const dynamic = 'force-dynamic'

interface SchemaProbe {
  key: string
  label: string
  table: string
  columns: string
}

const SCHEMA_PROBES: SchemaProbe[] = [
  {
    key: 'schema_support',
    label: 'Supporteskalering (v165)',
    table: 'support_ticket',
    columns: 'id,business_id,thread_id,status',
  },
  {
    key: 'schema_deal_documents',
    label: 'Dokument vid affärsskapande (v173)',
    table: 'customer_document',
    columns: 'document_id,business_id,customer_id,deal_id,lead_id',
  },
  {
    key: 'schema_installations',
    label: 'Installationsregister (v174–v175)',
    table: 'installation',
    columns: 'installation_id,business_id,project_id,status,serial_number',
  },
  {
    key: 'schema_project_numbers',
    label: 'Kanoniska projektnummer (v176)',
    table: 'project',
    columns: 'project_id,business_id,project_number',
  },
  {
    key: 'schema_project_tips',
    label: 'Projektagentens tipshistorik (v177)',
    table: 'project_tip_dismissal',
    columns: 'id,business_id,project_id,tip_key,outcome',
  },
  {
    key: 'schema_widget_truth',
    label: 'Widgetens installationssanning (v178)',
    table: 'business_config',
    columns: 'business_id,widget_last_seen_at,widget_last_seen_host',
  },
  {
    key: 'schema_lead_number',
    label: 'Golden Path leadnummer (v179)',
    table: 'leads',
    columns: 'business_id,lead_id,lead_number',
  },
]

function safeDatabaseError(error: { code?: string; message?: string } | null): string {
  if (!error) return 'Okänt databasfel.'
  return [error.code, error.message].filter(Boolean).join(': ')
}

export async function GET(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const checks: LaunchCheck[] = evaluateLaunchEnvironment(process.env)
  const supabase = getServerSupabase()

  for (const probe of SCHEMA_PROBES) {
    const { error } = await supabase.from(probe.table).select(probe.columns).limit(1)
    checks.push({
      key: probe.key,
      label: probe.label,
      status: error ? 'blocked' : 'pass',
      detail: error ? safeDatabaseError(error) : 'Tabell och obligatoriska kolumner finns i körande databas.',
    })
  }

  const { data: plans, error: plansError } = await supabase
    .from('billing_plan')
    .select('plan_id,stripe_price_id')
    .in('plan_id', [...SELLABLE_BILLING_PLAN_IDS])

  checks.push(plansError
    ? {
        key: 'stripe_prices',
        label: 'Säljbara Stripe-priser',
        status: 'blocked',
        detail: safeDatabaseError(plansError),
      }
    : evaluateBillingPlans(plans || []))

  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()
  checks.push(bucketError
    ? {
        key: 'storage_buckets',
        label: 'Privata dokument- och ljudbuckets',
        status: 'blocked',
        detail: safeDatabaseError(bucketError),
      }
    : evaluateStorageBuckets((buckets || []).map((bucket) => bucket.id)))

  const blockers = checks.filter((check) => check.status === 'blocked')
  // manual_proofs kommer från riktiga rader (lanseringsbevis) när de finns —
  // verdicten ovan räknar fortfarande BARA env/schema-blockerare (§2 i
  // programmet: manuella stationer blockerar aldrig Grind A).
  const manualProofs = await hamtaLanseringsbevis(supabase)

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    verdict: blockers.length === 0 ? 'READY_FOR_MANUAL_PROOF' : 'BLOCKED',
    summary: {
      passed: checks.filter((check) => check.status === 'pass').length,
      blocked: blockers.length,
      manual: MANUAL_LAUNCH_PROOFS.length,
    },
    checks,
    manual_proofs: manualProofs,
  }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
