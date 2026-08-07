import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import {
  sweepMissedRevenue,
  findingTitle,
  type MissedRevenueFinding,
} from '@/lib/value/missed-revenue'

/**
 * Nattligt svep efter pengar som är intjänade men inte fakturerade (spår 1.3).
 *
 * `autoInvoiceOnComplete` är en TRIGGER — den ser bara det ögonblick projektet
 * markeras klart. Failar anropet, är projektet redan klart sedan tidigare,
 * eller läggs materialet in efteråt, hittas pengarna aldrig. Svepet ser bakåt.
 * Det hittar därför MER ju senare det körs första gången.
 *
 * Reglerna och tröskelvärdena ligger i lib/value/missed-revenue.ts och är
 * facit-testade. Den här filen gör bara tre saker: hämtar, anropar, skapar
 * kort.
 *
 * KILL-SWITCH: en hantverkare som pausat sina agenter ska inte få nya kort.
 * Samma mönster som cron/nurture — en pausad business hoppas över, resten
 * körs vidare.
 *
 * Korten skapas som förslag i godkännande-kön, aldrig som fakturor. Att
 * fakturera automatiskt vore att skicka pengar-krav till kund utan att
 * hantverkaren sett dem — precis det produktens grundprincip säger nej till.
 */

/** Så många kort per företag och natt. Hittar svepet 40 gamla missar ska
    hantverkaren mötas av de fem största, inte av en vägg. Resten kommer
    nästa natt — dedupen ser till att de inte dubbleras. */
const MAX_CARDS_PER_BUSINESS = 5

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const now = new Date()
  let created = 0
  let scanned = 0
  const errors: string[] = []

  try {
    const { data: businesses, error: bizErr } = await supabase
      .from('business_config')
      .select('business_id, agents_globally_paused')

    if (bizErr) throw bizErr

    for (const biz of businesses || []) {
      if (biz.agents_globally_paused) continue
      scanned++
      const businessId = biz.business_id

      try {
        // Fyra läsningar per företag. Inga embeds — flera av de här
        // relationerna saknar bekräftat körda FK:er i prod, och en PGRST200
        // hade fällt hela svepet tyst.
        const [atasRes, matsRes, projRes, invRes, openRes] = await Promise.all([
          supabase.from('project_change')
            // ═══ `id:change_id` — ALIAS, INTE ETT SKRIVFEL (2026-08-07) ═══
            //
            // Tabellens primärnyckel heter `change_id` (sql/projects.sql:71).
            // Ingen migration lägger till någon `id`-kolumn, och all annan kod
            // i repot använder `change_id`.
            //
            // Frågan selectade tidigare `id` rakt av. PostgREST svarade 42703,
            // felkontrollen nedan kastade, och catchen hoppade över HELA
            // företagets svep — alla tre reglerna, inte bara ÄTA-regeln.
            // Svepet har alltså aldrig skapat ett enda kort sedan det
            // skeppades. Verifierat mot produktionsschemat 2026-08-07:
            //   SELECT column_name FROM information_schema.columns
            //   WHERE table_name='project_change' AND column_name IN ('id','change_id')
            //   → change_id
            //
            // Aliaset gör att den rena funktionen (som tar `AtaRow.id`) och
            // dess 228 facit står orörda.
            .select('id:change_id, project_id, description, amount, signed_at, invoiced_at')
            .eq('business_id', businessId)
            .not('signed_at', 'is', null)
            .is('invoiced_at', null),
          supabase.from('project_material')
            // Samma sak här: PK heter `material_id` (sql/supplier_connections.sql:84).
            // Att bara laga ÄTA-frågan ovan hade inte hjälpt — Promise.all
            // läser båda, och EN 42703 fäller hela företagets svep.
            .select('id:material_id, project_id, total_sell, invoiced')
            .eq('business_id', businessId)
            .eq('invoiced', false),
          supabase.from('project')
            .select('project_id, name, status, completed_at')
            .eq('business_id', businessId)
            .eq('status', 'completed'),
          supabase.from('invoice')
            .select('project_id')
            .eq('business_id', businessId)
            .not('project_id', 'is', null),
          // Redan öppna kort — dedupenycklarna ligger i payloaden.
          supabase.from('pending_approvals')
            .select('payload')
            .eq('business_id', businessId)
            .eq('approval_type', 'missad_intakt')
            .eq('status', 'pending'),
        ])

        for (const [namn, res] of Object.entries({ atas: atasRes, material: matsRes, projekt: projRes, fakturor: invRes, öppna: openRes })) {
          if (res.error) throw new Error(`${namn}: ${res.error.message}`)
        }

        const alreadyOpen = new Set(
          (openRes.data || [])
            .map((r: any) => r?.payload?.dedupe_key)
            .filter((k: unknown): k is string => typeof k === 'string'),
        )

        const findings = sweepMissedRevenue({
          atas: (atasRes.data || []) as any,
          materials: (matsRes.data || []) as any,
          projects: (projRes.data || []) as any,
          invoices: (invRes.data || []) as any,
          alreadyOpen,
          now,
        }).slice(0, MAX_CARDS_PER_BUSINESS)

        for (const f of findings) {
          const ok = await createCard(supabase, businessId, f)
          if (ok) created++
        }
      } catch (err: any) {
        // Ett företags fel får inte fälla svepet för alla andra.
        console.error(`[cron/missed-revenue] ${businessId}:`, err?.message || err)
        errors.push(`${businessId}: ${err?.message || 'okänt fel'}`)
      }
    }

    return NextResponse.json({ success: true, scanned, created, errors: errors.slice(0, 10) })
  } catch (err: any) {
    console.error('[cron/missed-revenue] svepet failade:', err)
    return NextResponse.json({ error: err?.message || 'Svepet failade' }, { status: 500 })
  }
}

async function createCard(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
  f: MissedRevenueFinding,
): Promise<boolean> {
  const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const { error } = await supabase.from('pending_approvals').insert({
    id,
    business_id: businessId,
    approval_type: 'missad_intakt',
    // Ekonomi hör till den som får se den — samma resonemang som
    // behörighetskontraktet (see_financials).
    routing_role: 'owner_admin',
    title: findingTitle(f),
    description: `${f.projectName} — ${f.evidence}`,
    status: 'pending',
    // Inga pengar rör sig av att kortet skapas. Hantverkaren fakturerar
    // själv; kortet pekar bara på pengarna.
    risk_level: 'low',
    payload: {
      routed_agent: 'karin',
      kind: f.kind,
      project_id: f.projectId,
      project_name: f.projectName,
      amount_kr: f.amountKr,
      evidence: f.evidence,
      // Läses av nästa nattkörning för att inte skapa samma kort igen.
      dedupe_key: f.dedupeKey,
    },
  })

  if (error) {
    console.error('[cron/missed-revenue] kunde inte skapa kort:', error.message, { businessId, dedupeKey: f.dedupeKey })
    return false
  }
  return true
}
