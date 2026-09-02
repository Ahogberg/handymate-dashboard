import type { SupabaseClient } from '@supabase/supabase-js'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

export type LaunchCheckStatus = 'pass' | 'blocked' | 'manual'

export interface LaunchCheck {
  key: string
  label: string
  status: LaunchCheckStatus
  detail: string
  missing?: string[]
}

interface EnvironmentGroup {
  key: string
  label: string
  variables: string[]
}

/**
 * Miljögrupperna motsvarar produktlöften som inte kan fungera utan samtliga
 * nycklar. Endast variabelnamn lämnar servern — aldrig värden eller prefix.
 */
export const LAUNCH_ENVIRONMENT_GROUPS: EnvironmentGroup[] = [
  {
    key: 'core',
    label: 'Kärna och tenantdata',
    variables: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'NEXT_PUBLIC_APP_URL',
      'CRON_SECRET',
    ],
  },
  {
    key: 'agents',
    label: 'Agentteam och transkribering',
    variables: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
  },
  {
    key: 'payments',
    label: 'Stripe live',
    variables: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  },
  {
    key: 'sms_voice',
    label: '46elks SMS och telefoni',
    variables: ['ELKS_API_USER', 'ELKS_API_PASSWORD'],
  },
  {
    key: 'email',
    label: 'Transaktionell e-post',
    variables: ['RESEND_API_KEY', 'RESEND_DOMAIN'],
  },
  {
    key: 'calendar',
    label: 'Google Kalender',
    variables: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
  },
  {
    key: 'push',
    label: 'Mobil push',
    variables: ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'],
  },
  {
    key: 'fortnox',
    label: 'Fortnox',
    variables: ['FORTNOX_CLIENT_ID', 'FORTNOX_CLIENT_SECRET'],
  },
]

export function evaluateLaunchEnvironment(
  env: Record<string, string | undefined>,
): LaunchCheck[] {
  return LAUNCH_ENVIRONMENT_GROUPS.map((group) => {
    const missing = group.variables.filter((name) => !env[name]?.trim())
    return {
      key: `env_${group.key}`,
      label: group.label,
      status: missing.length === 0 ? 'pass' : 'blocked',
      detail: missing.length === 0
        ? 'Alla obligatoriska miljövariabler är satta.'
        : `${missing.length} obligatoriska miljövariabler saknas.`,
      ...(missing.length > 0 ? { missing } : {}),
    }
  })
}

export const REQUIRED_STORAGE_BUCKETS = [
  'customer-documents',
  'project-files',
  'meeting-audio',
] as const

export const SELLABLE_BILLING_PLAN_IDS = [
  'professional',
  'business',
  'professional_yearly',
  'business_yearly',
] as const

export function evaluateStorageBuckets(bucketIds: string[]): LaunchCheck {
  const available = new Set(bucketIds)
  const missing = REQUIRED_STORAGE_BUCKETS.filter((bucket) => !available.has(bucket))
  return {
    key: 'storage_buckets',
    label: 'Privata dokument- och ljudbuckets',
    status: missing.length === 0 ? 'pass' : 'blocked',
    detail: missing.length === 0
      ? 'Alla buckets som används av lanseringsflödena finns.'
      : `${missing.length} bucket(s) saknas.`,
    ...(missing.length > 0 ? { missing: [...missing] } : {}),
  }
}

export function evaluateBillingPlans(
  plans: Array<{ plan_id: string; stripe_price_id: string | null }>,
): LaunchCheck {
  const byId = new Map(plans.map((plan) => [plan.plan_id, plan]))
  const missing = SELLABLE_BILLING_PLAN_IDS.filter((planId) => {
    const plan = byId.get(planId)
    return !plan?.stripe_price_id?.startsWith('price_')
  })
  return {
    key: 'stripe_prices',
    label: 'Säljbara Stripe-priser',
    status: missing.length === 0 ? 'pass' : 'blocked',
    detail: missing.length === 0
      ? 'Månads- och årspriser har Stripe price-id.'
      : `${missing.length} säljbara planrader saknar ett riktigt Stripe price-id.`,
    ...(missing.length > 0 ? { missing: [...missing] } : {}),
  }
}

/**
 * Dessa stationer kan aldrig grönmarkeras av konfiguration eller en mock.
 * De kräver en verklig leverantör, kundlik data eller fysisk enhet.
 */
export const MANUAL_LAUNCH_PROOFS: LaunchCheck[] = [
  {
    key: 'proof_stripe',
    label: 'Stripe köp → webhook → aktiv prenumeration → återbetalning',
    status: 'manual',
    detail: 'Kör med livepris och ett verkligt kort; spara Stripe event-id och billing_event-id.',
  },
  {
    key: 'proof_lisa',
    label: 'Lisa: externt samtal → affär → SMS-svar',
    status: 'manual',
    detail: 'Kräver positivt 46elks-saldo, tilldelat nummer och en extern telefon.',
  },
  {
    key: 'proof_email',
    label: 'Offert- och fakturamejl till extern inkorg',
    status: 'manual',
    detail: 'Kontrollera leverans, avsändare, PDF/länk och SPF/DKIM i en verklig inkorg.',
  },
  {
    key: 'proof_google',
    label: 'Google OAuth för icke-testanvändare',
    status: 'manual',
    detail: 'Verifiera consent screen och en riktig kalenderkoppling utanför testlistan.',
  },
  {
    key: 'proof_ios',
    label: 'iPhone PWA och push',
    status: 'manual',
    detail: 'Installera från Safari på fysisk iPhone och godkänn ett verkligt kort via push.',
  },
  {
    key: 'proof_fortnox',
    label: 'Fortnox synk mot riktigt bolag',
    status: 'manual',
    detail: 'Kör den separata Fortnox-checklistan och kontrollera idempotent återkörning.',
  },
]

export interface LaunchCheckMedBevis extends LaunchCheck {
  evidence?: string
  evidence_url?: string | null
  proven_at?: string
  proven_by?: string
}

/**
 * lanseringsbevis (sql/v202_raddningsko_och_lanseringsbevis.sql) ersätter
 * konstantens 'manual' med en riktig rad när en finns: senaste
 * icke-återkallade (revoked_at null) beviset per station. MANUAL_LAUNCH_PROOFS
 * ovan är fallbacken och stationslistan — den ändras aldrig av detta.
 *
 * Fail-soft: saknas tabellen (arSchemaSaknas) returneras
 * MANUAL_LAUNCH_PROOFS oförändrad, som innan bevistabellen fanns.
 */
export async function hamtaLanseringsbevis(supabase: SupabaseClient): Promise<LaunchCheckMedBevis[]> {
  try {
    const { data, error } = await supabase
      .from('lanseringsbevis')
      .select('station, evidence, evidence_url, proven_at, proven_by')
      .is('revoked_at', null)
      .order('proven_at', { ascending: false })

    if (error) {
      if (!arSchemaSaknas(error)) {
        console.error('[launch/readiness] kunde inte läsa lanseringsbevis (fail-soft, visar manual):', error.message)
      }
      return MANUAL_LAUNCH_PROOFS
    }

    const senasteByStation = new Map<string, { evidence: string; evidence_url: string | null; proven_at: string; proven_by: string }>()
    for (const rad of (data || []) as Array<{ station: string; evidence: string; evidence_url: string | null; proven_at: string; proven_by: string }>) {
      if (!senasteByStation.has(rad.station)) senasteByStation.set(rad.station, rad)
    }

    return MANUAL_LAUNCH_PROOFS.map((proof) => {
      const bevis = senasteByStation.get(proof.key)
      if (!bevis) return proof
      return {
        ...proof,
        status: 'pass',
        detail: bevis.evidence,
        evidence: bevis.evidence,
        evidence_url: bevis.evidence_url,
        proven_at: bevis.proven_at,
        proven_by: bevis.proven_by,
      }
    })
  } catch (err) {
    console.error('[launch/readiness] hamtaLanseringsbevis kraschade (fail-soft, visar manual):', err)
    return MANUAL_LAUNCH_PROOFS
  }
}
