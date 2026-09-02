import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { isAdmin } from '@/lib/admin-auth'
import { getServerSupabase } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'
import { arTestNamn } from '@/lib/testdata'
import { readFunnel } from '@/lib/onboarding/funnel'
import { deriveChannelHealth, type ChannelHealth, type ChannelProof } from '@/lib/onboarding/channel-health'
import { computeActivation, type ActivationRow } from '@/lib/admin/activation-metrics'
import { RECEIPT_APPROVAL_TYPES } from '@/lib/approvals/value-receipt'
import {
  bedomOnboarding,
  bedomKanal,
  bedomAktivering,
  bedomOffert,
  bedomUppdrag,
  bedomIntegration,
  bedomHandlingar,
  bedomKort,
  bedomFalskFramgang,
  SIGNAL_LABELS,
  type RaddningsFynd,
} from '@/lib/raddning/signaler'

// force-dynamic: läser auth via verifyCronSecret/isAdmin som läser
// request.headers/cookies direkt — Next ser bara route-filens egen kod och
// skulle annars kunna cacha denna rutt statiskt (samma CLAUDE.md-lärdom
// som övriga cron/admin-rutter).
export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/raddningsko
 *
 * Daglig körning (05:25 UTC, efter driftlarm 05:15) som gör de tio
 * risksignalerna i docs/launch/FORSTA_10_KUNDER_BEVIS_OCH_RADDNING.md §3
 * till ärenden i raddningsarende — bara för de första kunderna (pilot eller
 * klar onboarding senaste 30 dagarna), aldrig demo/test.
 *
 * Auth: cron-hemligheten ELLER en inloggad plattformsadmin (samma
 * dubbelgrind som /api/cron/credit-watch, så Andreas kan köra manuellt).
 *
 * Fail-soft: saknas raddningsarende-tabellen (arSchemaSaknas) loggas en
 * varning och svaret blir { skipped: 'schema' } — ingen krasch, ingen
 * halvskriven körning.
 */
export async function GET(request: NextRequest) {
  return korOmBehorig(request)
}

export async function POST(request: NextRequest) {
  return korOmBehorig(request)
}

async function korOmBehorig(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    const admin = await isAdmin(request)
    if (!admin.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  return runRaddningsko()
}

interface CandidateRow {
  business_id: string
  business_name: string | null
  created_at: string
  onboarding_completed_at: string | null
  onboarding_data: unknown
  assigned_phone_number: string | null
  widget_enabled: boolean | null
  widget_last_seen_at: string | null
}

const SEVERITY_ORDER: Record<string, number> = { hog: 0, medel: 1, lag: 2 }
const TEST_NAMN_MONSTER = /^test\b|^asdasd$/i

function arTestForetag(name: string | null): boolean {
  return arTestNamn(name) || TEST_NAMN_MONSTER.test((name || '').trim())
}

function timmarSedanIso(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return (now.getTime() - t) / 3_600_000
}

function nyastIso(...varden: Array<string | null | undefined>): string | null {
  let nyast: { v: string; t: number } | null = null
  for (const v of varden) {
    if (!v) continue
    const t = new Date(v).getTime()
    if (!Number.isFinite(t)) continue
    if (!nyast || t > nyast.t) nyast = { v, t }
  }
  return nyast?.v ?? null
}

/** Senaste raden per business_id ur en lista, efter ett datumfält. */
function senasteRadPerForetag<T extends { business_id: string }>(
  rader: T[],
  datum: (rad: T) => string | null | undefined,
): Map<string, T> {
  const karta = new Map<string, T>()
  for (const rad of rader) {
    const befintlig = karta.get(rad.business_id)
    if (!befintlig) {
      karta.set(rad.business_id, rad)
      continue
    }
    const nyttDatum = datum(rad)
    const befintligtDatum = datum(befintlig)
    if (nyttDatum && (!befintligtDatum || new Date(nyttDatum) > new Date(befintligtDatum))) {
      karta.set(rad.business_id, rad)
    }
  }
  return karta
}

async function runRaddningsko() {
  const supabase = getServerSupabase()
  const now = new Date()
  const nowIso = now.toISOString()
  const demoBusinessId = process.env.DEMO_BUSINESS_ID || null
  const brokenSweeps: string[] = []

  // ── Kandidater: is_pilot ELLER klar/skapad senaste 30 dagarna ──────────
  let candidates: CandidateRow[] = []
  try {
    const trettioDagarSedan = new Date(now.getTime() - 30 * 86_400_000).toISOString()
    const { data, error } = await supabase
      .from('business_config')
      .select(
        'business_id, business_name, created_at, onboarding_completed_at, onboarding_data, assigned_phone_number, widget_enabled, widget_last_seen_at, is_pilot',
      )
      .or(`is_pilot.eq.true,onboarding_completed_at.gte.${trettioDagarSedan},created_at.gte.${trettioDagarSedan}`)
    if (error) throw error
    candidates = ((data || []) as Array<CandidateRow & { is_pilot: boolean | null }>).filter(b => {
      if (demoBusinessId && b.business_id === demoBusinessId) return false
      if (arTestForetag(b.business_name)) return false
      return true
    })
  } catch (err) {
    console.error('[raddningsko] kandidatlistan kraschade:', err)
    brokenSweeps.push('Kandidatlistan')
  }

  const checked = candidates.length
  const ids = candidates.map(c => c.business_id)
  const fynd: RaddningsFynd[] = []

  if (ids.length > 0) {
    const klarSedanH = new Map<string, number | null>()
    for (const c of candidates) {
      klarSedanH.set(c.business_id, c.onboarding_completed_at ? timmarSedanIso(c.onboarding_completed_at, now) : null)
    }

    // 1. Onboarding stannade — ingen extra DB-fråga, allt finns i kandidatraden.
    for (const c of candidates) {
      const funnel = readFunnel(c.onboarding_data)
      const f = bedomOnboarding(
        { business_id: c.business_id, created_at: c.created_at, onboarding_completed_at: c.onboarding_completed_at },
        funnel,
        now,
      )
      if (f) fynd.push(f)
    }

    // 2. Ingen verifierad kanal — återskapar frågorna i onboarding/channel-health/route.ts
    // per företag, men BATCHAT över kandidaterna. Anropar deriveChannelHealth
    // (logiken kopieras aldrig hit).
    try {
      const [emailRoutes, calConns, gmailImports, storefronts, widgetConvs, emailDeals, webDeals] = await Promise.all([
        supabase.from('email_inbound_route').select('business_id, last_received_at, active').eq('active', true).in('business_id', ids),
        supabase.from('calendar_connection').select('business_id, created_at').eq('provider', 'google').eq('gmail_scope_granted', true).eq('gmail_lead_import_enabled', true).in('business_id', ids),
        supabase.from('gmail_imported_message').select('business_id, imported_at').in('business_id', ids),
        supabase.from('storefront').select('business_id, is_published').in('business_id', ids),
        supabase.from('widget_conversation').select('business_id, created_at, updated_at').in('business_id', ids),
        supabase.from('deal').select('business_id, lead_id, created_at').in('source', ['email_forward', 'email_lead']).not('lead_id', 'is', null).in('business_id', ids),
        supabase.from('deal').select('business_id, lead_id, created_at').eq('source', 'website_form').not('lead_id', 'is', null).in('business_id', ids),
      ])
      for (const r of [emailRoutes, calConns, gmailImports, storefronts, widgetConvs, emailDeals, webDeals]) {
        if (r.error) throw r.error
      }

      const emailRouteByBiz = senasteRadPerForetag((emailRoutes.data || []) as any[], r => r.last_received_at)
      const calConnByBiz = senasteRadPerForetag((calConns.data || []) as any[], r => r.created_at)
      const gmailImportByBiz = senasteRadPerForetag((gmailImports.data || []) as any[], r => r.imported_at)
      const storefrontByBiz = new Map<string, { is_published: boolean | null }>()
      for (const r of (storefronts.data || []) as any[]) storefrontByBiz.set(r.business_id, r)
      const widgetConvByBiz = senasteRadPerForetag((widgetConvs.data || []) as any[], r => nyastIso(r.updated_at, r.created_at))
      const emailDealByBiz = senasteRadPerForetag((emailDeals.data || []) as any[], r => r.created_at)
      const webDealByBiz = senasteRadPerForetag((webDeals.data || []) as any[], r => r.created_at)

      // Telefonens testsamtal ligger i onboarding_data.test_call (samma väg
      // som GET /api/onboarding/channel-health). Testsamtalets deal måste
      // bekräftas mot EXAKT det id-paret klienten skrev.
      const testCallByBiz = new Map<string, { deal_id?: string; lead_id?: string; called_at?: string }>()
      for (const c of candidates) {
        const od = (c.onboarding_data || {}) as Record<string, unknown>
        const tc = od.test_call as { deal_id?: string; lead_id?: string; called_at?: string } | undefined
        if (tc) testCallByBiz.set(c.business_id, tc)
      }
      const testCallDealIds = Array.from(testCallByBiz.values()).map(t => t.deal_id).filter((v): v is string => !!v)
      const phoneDealResult = testCallDealIds.length > 0
        ? await supabase.from('deal').select('business_id, id, lead_id, created_at').in('id', testCallDealIds)
        : { data: [], error: null }
      if (phoneDealResult.error) throw phoneDealResult.error
      const phoneDealByBiz = new Map<string, any>()
      for (const r of (phoneDealResult.data || []) as any[]) phoneDealByBiz.set(r.business_id, r)

      const leadIds = new Set<string>()
      for (const tc of Array.from(testCallByBiz.values())) if (tc.lead_id) leadIds.add(tc.lead_id)
      for (const d of Array.from(emailDealByBiz.values())) if (d.lead_id) leadIds.add(d.lead_id)
      for (const d of Array.from(webDealByBiz.values())) if (d.lead_id) leadIds.add(d.lead_id)
      const leadsResult = leadIds.size > 0
        ? await supabase.from('leads').select('lead_id').in('lead_id', Array.from(leadIds))
        : { data: [], error: null }
      if (leadsResult.error) throw leadsResult.error
      const verifieradeLeadIds = new Set((leadsResult.data || []).map((r: any) => r.lead_id))

      for (const c of candidates) {
        const kSedanH = klarSedanH.get(c.business_id) ?? null
        if (kSedanH === null || kSedanH <= 48) continue

        const testCall = testCallByBiz.get(c.business_id)
        const phoneDeal = phoneDealByBiz.get(c.business_id)
        const phoneLeadExists = Boolean(testCall?.lead_id && verifieradeLeadIds.has(testCall.lead_id))

        const emailRoute = emailRouteByBiz.get(c.business_id)
        const calConn = calConnByBiz.get(c.business_id)
        const gmailImport = gmailImportByBiz.get(c.business_id)
        const emailReceivedAt = nyastIso(emailRoute?.last_received_at, gmailImport?.imported_at)
        const emailDeal = emailDealByBiz.get(c.business_id)
        const emailLeadExists = Boolean(emailDeal?.lead_id && verifieradeLeadIds.has(emailDeal.lead_id))

        const storefront = storefrontByBiz.get(c.business_id)
        const widgetConv = widgetConvByBiz.get(c.business_id)
        const widgetConvAt = widgetConv ? nyastIso(widgetConv.updated_at, widgetConv.created_at) : null
        const widgetSeenAt = c.widget_enabled ? nyastIso(widgetConvAt, c.widget_last_seen_at) : null
        const webDeal = webDealByBiz.get(c.business_id)
        const webLeadExists = Boolean(webDeal?.lead_id && verifieradeLeadIds.has(webDeal.lead_id))

        const halsa: ChannelHealth[] = [
          deriveChannelHealth('phone', {
            enabled: Boolean(c.assigned_phone_number),
            channel_verified_at: testCall?.called_at || null,
            channel_proof: testCall?.called_at ? ('call_received' as ChannelProof) : null,
            lead_exists: phoneLeadExists,
            deal_exists: Boolean(phoneDeal),
            lead_verified_at: phoneDeal?.created_at || null,
          }),
          deriveChannelHealth('email', {
            enabled: Boolean(emailRoute || calConn),
            channel_verified_at: emailReceivedAt,
            channel_proof: emailReceivedAt ? ('email_received' as ChannelProof) : null,
            lead_exists: emailLeadExists,
            deal_exists: Boolean(emailDeal),
            lead_verified_at: emailDeal?.created_at || null,
          }),
          deriveChannelHealth('web', {
            enabled: Boolean(c.widget_enabled || storefront?.is_published),
            channel_verified_at: widgetSeenAt,
            channel_proof: webLeadExists ? ('web_form_received' as ChannelProof) : (widgetSeenAt ? ('widget_loaded' as ChannelProof) : null),
            lead_exists: webLeadExists,
            deal_exists: Boolean(webDeal),
            lead_verified_at: webDeal?.created_at || null,
          }),
        ]

        const f = bedomKanal(c.business_id, halsa, kSedanH)
        if (f) fynd.push(f)
      }
    } catch (err) {
      if (!arSchemaSaknas(err)) console.error('[raddningsko] kanalhälso-svepet kraschade:', err)
      brokenSweeps.push('Kanalhälsa')
    }

    // 3. Ingen aktivering — samma pending_approvals-rader som /api/admin/pilots.
    try {
      const { data, error } = await supabase
        .from('pending_approvals')
        .select('business_id, approval_type, status, created_at, resolved_at, outcome:payload->execution_result->>outcome')
        .neq('approval_type', 'team_intro')
        .in('business_id', ids)
      if (error) throw error
      const rowsByBiz = new Map<string, ActivationRow[]>()
      for (const r of (data || []) as Array<ActivationRow & { business_id: string }>) {
        const list = rowsByBiz.get(r.business_id) || []
        list.push(r)
        rowsByBiz.set(r.business_id, list)
      }
      for (const c of candidates) {
        const kSedanH = klarSedanH.get(c.business_id) ?? null
        if (kSedanH === null) continue
        const metrics = computeActivation(rowsByBiz.get(c.business_id) || [], {
          created_at: c.created_at,
          onboarding_completed_at: c.onboarding_completed_at,
        })
        const f = bedomAktivering(c.business_id, metrics, kSedanH)
        if (f) fynd.push(f)
      }
    } catch (err) {
      if (!arSchemaSaknas(err)) console.error('[raddningsko] aktiverings-svepet kraschade:', err)
      brokenSweeps.push('Aktivering')
    }

    // 4. Ingen offert — quotes.sent_at
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select('business_id, sent_at')
        .not('sent_at', 'is', null)
        .in('business_id', ids)
      if (error) throw error
      const antalByBiz = new Map<string, number>()
      for (const r of (data || []) as Array<{ business_id: string }>) {
        antalByBiz.set(r.business_id, (antalByBiz.get(r.business_id) || 0) + 1)
      }
      for (const c of candidates) {
        const kSedanH = klarSedanH.get(c.business_id) ?? null
        const f = bedomOffert(c.business_id, antalByBiz.get(c.business_id) || 0, kSedanH)
        if (f) fynd.push(f)
      }
    } catch (err) {
      if (!arSchemaSaknas(err)) console.error('[raddningsko] offert-svepet kraschade:', err)
      brokenSweeps.push('Offerter')
    }

    // 5. Inget uppdrag — mission (ett aktivt max per företag, men vi räknar
    // alla rader någonsin skapade — signalen är "har ägaren NÅGONSIN satt
    // ett pengamål", inte "har ett aktivt just nu").
    try {
      const { data, error } = await supabase.from('mission').select('business_id').in('business_id', ids)
      if (error) throw error
      const antalByBiz = new Map<string, number>()
      for (const r of (data || []) as Array<{ business_id: string }>) {
        antalByBiz.set(r.business_id, (antalByBiz.get(r.business_id) || 0) + 1)
      }
      for (const c of candidates) {
        const kSedanH = klarSedanH.get(c.business_id) ?? null
        const f = bedomUppdrag(c.business_id, antalByBiz.get(c.business_id) || 0, kSedanH)
        if (f) fynd.push(f)
      }
    } catch (err) {
      if (!arSchemaSaknas(err)) console.error('[raddningsko] uppdrags-svepet kraschade:', err)
      brokenSweeps.push('Uppdrag')
    }

    // 6. Integration bruten — business_integration_credentials (Fortnox-token)
    // + fortnox_sync_error på customer/project. Ingen tidsstämpel sparas när
    // en synk misslyckas (se lib/fortnox.ts) — synkfel25h är därför "just nu
    // registrerade fel", inte strikt fönstrat till 25 h.
    try {
      const [creds, custErrors, projErrors] = await Promise.all([
        supabase.from('business_integration_credentials').select('business_id, fortnox_access_token, fortnox_token_expires_at').in('business_id', ids),
        supabase.from('customer').select('business_id').not('fortnox_sync_error', 'is', null).in('business_id', ids),
        supabase.from('project').select('business_id').not('fortnox_sync_error', 'is', null).in('business_id', ids),
      ])
      for (const r of [creds, custErrors, projErrors]) if (r.error) throw r.error

      const credByBiz = new Map<string, any>()
      for (const r of (creds.data || []) as any[]) credByBiz.set(r.business_id, r)
      const synkfelByBiz = new Map<string, number>()
      for (const r of [...(custErrors.data || []), ...(projErrors.data || [])] as Array<{ business_id: string }>) {
        synkfelByBiz.set(r.business_id, (synkfelByBiz.get(r.business_id) || 0) + 1)
      }
      for (const c of candidates) {
        const cred = credByBiz.get(c.business_id)
        const f = bedomIntegration(
          c.business_id,
          {
            fortnoxConnected: Boolean(cred?.fortnox_access_token),
            tokenExpiresAt: cred?.fortnox_token_expires_at || null,
            synkfel25h: synkfelByBiz.get(c.business_id) || 0,
          },
          now,
        )
        if (f) fynd.push(f)
      }
    } catch (err) {
      if (!arSchemaSaknas(err)) console.error('[raddningsko] integrations-svepet kraschade:', err)
      brokenSweeps.push('Integration')
    }

    // 7. Misslyckad handling — automation_activity senaste dygnet (samma
    // 25h-fönster som driftlarmet).
    try {
      const since25h = new Date(now.getTime() - 25 * 3_600_000).toISOString()
      const { data, error } = await supabase
        .from('automation_activity')
        .select('business_id')
        .eq('status', 'failed')
        .gte('created_at', since25h)
        .in('business_id', ids)
      if (error) throw error
      const antalByBiz = new Map<string, number>()
      for (const r of (data || []) as Array<{ business_id: string }>) {
        antalByBiz.set(r.business_id, (antalByBiz.get(r.business_id) || 0) + 1)
      }
      for (const c of candidates) {
        const f = bedomHandlingar(c.business_id, antalByBiz.get(c.business_id) || 0)
        if (f) fynd.push(f)
      }
    } catch (err) {
      if (!arSchemaSaknas(err)) console.error('[raddningsko] handlings-svepet kraschade:', err)
      brokenSweeps.push('Handlingar')
    }

    // 8. Fastnat kort — pending_approvals med status='pending'.
    try {
      const { data, error } = await supabase
        .from('pending_approvals')
        .select('id, business_id, created_at, expires_at')
        .eq('status', 'pending')
        .in('business_id', ids)
      if (error) throw error
      const radByBiz = new Map<string, Array<{ id: string; created_at: string; expires_at: string | null }>>()
      for (const r of (data || []) as Array<{ id: string; business_id: string; created_at: string; expires_at: string | null }>) {
        const list = radByBiz.get(r.business_id) || []
        list.push({ id: r.id, created_at: r.created_at, expires_at: r.expires_at })
        radByBiz.set(r.business_id, list)
      }
      for (const c of candidates) {
        const f = bedomKort(c.business_id, radByBiz.get(c.business_id) || [], now)
        if (f) fynd.push(f)
      }
    } catch (err) {
      if (!arSchemaSaknas(err)) console.error('[raddningsko] fastnat-kort-svepet kraschade:', err)
      brokenSweeps.push('Fastnade kort')
    }

    // 9. Falsk framgång — godkända kvittotyper vars execution_result säger
    // success utan extraherbara artefakter.
    try {
      const { data, error } = await supabase
        .from('pending_approvals')
        .select('id, business_id, approval_type, payload')
        .eq('status', 'approved')
        .in('approval_type', [...RECEIPT_APPROVAL_TYPES])
        .in('business_id', ids)
      if (error) throw error
      const radByBiz = new Map<string, Array<{ id: string; approval_type: string; execution_result: Record<string, unknown> | null }>>()
      for (const r of (data || []) as Array<{ id: string; business_id: string; approval_type: string; payload: Record<string, unknown> | null }>) {
        const executionResult = (r.payload?.execution_result as Record<string, unknown> | null | undefined) ?? null
        const list = radByBiz.get(r.business_id) || []
        list.push({ id: r.id, approval_type: r.approval_type, execution_result: executionResult })
        radByBiz.set(r.business_id, list)
      }
      for (const c of candidates) {
        const f = bedomFalskFramgang(c.business_id, radByBiz.get(c.business_id) || [])
        if (f) fynd.push(f)
      }
    } catch (err) {
      if (!arSchemaSaknas(err)) console.error('[raddningsko] falsk-framgång-svepet kraschade:', err)
      brokenSweeps.push('Falsk framgång')
    }
  }

  // ── Skriv fynden till raddningsarende ───────────────────────────────
  let opened = 0
  let updated = 0
  let closed = 0

  try {
    const { data: oppna, error: oppnaErr } = await supabase
      .from('raddningsarende')
      .select('id, business_id, signal, status')
      .in('status', ['oppet', 'pagaende'])
      .in('business_id', ids.length > 0 ? ids : ['__inga__'])
    if (oppnaErr) throw oppnaErr

    const oppnaByNyckel = new Map<string, { id: string; status: string }>()
    for (const r of (oppna || []) as Array<{ id: string; business_id: string; signal: string; status: string }>) {
      oppnaByNyckel.set(`${r.business_id}:${r.signal}`, { id: r.id, status: r.status })
    }

    const funnaNycklar = new Set(fynd.map(f => `${f.business_id}:${f.signal}`))

    for (const f of fynd) {
      const nyckel = `${f.business_id}:${f.signal}`
      const befintlig = oppnaByNyckel.get(nyckel)
      if (befintlig) {
        const { error } = await supabase
          .from('raddningsarende')
          .update({ last_seen_at: nowIso, severity: f.severity, summary: f.summary, evidence: f.evidence })
          .eq('id', befintlig.id)
        if (error) throw error
        updated++
      } else {
        const { error } = await supabase.from('raddningsarende').insert({
          business_id: f.business_id,
          signal: f.signal,
          severity: f.severity,
          status: 'oppet',
          summary: f.summary,
          evidence: f.evidence,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
        })
        if (error) throw error
        opened++
      }
    }

    // Öppna ärenden vars signal INTE dök upp i dagens svep stängs — utom
    // manuell_fix_kravdes, som cronen aldrig rör (bokförs/löses bara av en
    // människa, se app/api/admin/raddningsko/manuell-fix).
    for (const [nyckel, rad] of Array.from(oppnaByNyckel.entries())) {
      if (funnaNycklar.has(nyckel)) continue
      if (nyckel.endsWith(':manuell_fix_kravdes')) continue
      const { error } = await supabase
        .from('raddningsarende')
        .update({ status: 'last', resolved_by: 'system', atgard: 'Signalen försvann', resolved_at: nowIso })
        .eq('id', rad.id)
      if (error) throw error
      closed++
    }
  } catch (err) {
    if (arSchemaSaknas(err)) {
      console.warn('[raddningsko] raddningsarende-tabellen saknas — hoppar över körningen (fail-soft).')
      return NextResponse.json({ skipped: 'schema' })
    }
    console.error('[raddningsko] kunde inte skriva raddningsarende:', err)
    return NextResponse.json({ error: 'Kunde inte skriva räddningskön' }, { status: 500 })
  }

  // ── Digest ───────────────────────────────────────────────────────────
  let mailed = false
  try {
    const { data: allaOppna, error } = await supabase
      .from('raddningsarende')
      .select('business_id, signal, severity, summary, last_seen_at, business_config:business_id (business_name)')
      .in('status', ['oppet', 'pagaende'])
      .order('last_seen_at', { ascending: false })
    if (error) throw error

    const lista = (allaOppna || []) as Array<{
      business_id: string
      signal: string
      severity: string
      summary: string
      last_seen_at: string
      business_config: { business_name: string | null } | { business_name: string | null }[] | null
    }>
    lista.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))

    if (lista.length > 0) {
      const html = buildDigestHtml(lista, opened)
      const result = await sendEmail({
        to: process.env.OPS_ALERT_EMAIL || 'andreas@handymate.se',
        subject: `🛟 Räddningskön: ${lista.length} öppna (${opened} nya)`,
        html,
      })
      mailed = result.success
      if (!result.success) console.error('[raddningsko] sendEmail misslyckades:', result.error)
    }
  } catch (err) {
    console.error('[raddningsko] kunde inte bygga/skicka digest:', err)
  }

  return NextResponse.json({
    success: true,
    checked,
    found: fynd.length,
    opened,
    updated,
    closed,
    brokenSweeps,
    mailed,
  })
}

function escapeHtml(input: unknown): string {
  const s = input === null || input === undefined ? '' : String(input)
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function businessNamn(row: { business_id: string; business_config: { business_name: string | null } | { business_name: string | null }[] | null }): string {
  const bc = row.business_config
  const namn = Array.isArray(bc) ? bc[0]?.business_name : bc?.business_name
  return namn || row.business_id
}

function buildDigestHtml(
  rader: Array<{ business_id: string; signal: string; severity: string; summary: string; business_config: any }>,
  nya: number,
): string {
  const farg: Record<string, string> = { hog: '#B91C1C', medel: '#B45309', lag: '#6B7280' }
  const rows = rader
    .slice(0, 50)
    .map(
      r => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;">${escapeHtml(businessNamn(r))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;">${escapeHtml(SIGNAL_LABELS[r.signal as keyof typeof SIGNAL_LABELS] || r.signal)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;"><b style="color:${farg[r.severity] || '#374151'}">${escapeHtml(r.severity.toUpperCase())}</b></td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;">${escapeHtml(r.summary)}</td>
      </tr>`,
    )
    .join('\n')
  const more = rader.length > 50 ? `<p style="font-size:12px;color:#6B7280;">+ ${rader.length - 50} till</p>` : ''

  return `
<!DOCTYPE html>
<html lang="sv">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; padding: 20px; color: #1F2937;">
  <div style="background: #0F766E; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
    <span style="color: white; font-size: 18px; font-weight: 700;">🛟 Räddningskön</span>
  </div>
  <div style="background: #ffffff; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
    <p style="font-size: 15px; line-height: 1.6; color: #374151;">
      ${rader.length} öppna ärenden, ${nya} nya sedan igår.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#374151;">
      <thead><tr style="text-align:left;color:#6B7280;font-size:12px;">
        <th style="padding:6px 10px;">Företag</th><th style="padding:6px 10px;">Signal</th><th style="padding:6px 10px;">Allvar</th><th style="padding:6px 10px;">Vad</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${more}
    <div style="text-align: center; margin: 28px 0 12px;">
      <a href="https://app.handymate.se/admin?tab=rescue" style="display: inline-block; background: #0F766E; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Öppna räddningskön →
      </a>
    </div>
  </div>
</body>
</html>`
}
