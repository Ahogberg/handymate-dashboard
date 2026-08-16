/**
 * Expectation Drift — Signal 1 (docs/audits/NEXT_MOAT_WAVE.md, Koncept 3).
 *
 * ═══ VARFÖR "SIGNAL 1" ÄR SÅ HÄR SMAL ═══
 *
 * Full Expectation Drift (kundens bild vs verkligheten, jämförd mot en
 * prognos) kräver X2-pålitlighet och Company Memory — ingendera finns än
 * (se koncept-dokumentet, rad 183-188). Signal 1 kringgår hela den skulden:
 * den påstår ingenting om kundens faktiska förväntan, bara att ett
 * kundvänt ÅTAGANDE-kort har legat obehandlat länge nog att bli en risk i
 * sig självt — varken godkänt eller avfärdat. Ren kö-ålder på data som
 * redan finns.
 *
 * ═══ VARFÖR BARA DESSA TRE TYPER ═══
 *
 * approval-action-contract.ts listar ~40 korttyper. De allra flesta är
 * antingen (a) inte kundvända åtaganden (t.ex. `customer_fact`,
 * `low_stock_alert`, `karin_deadline` — interna/myndighetsting), eller
 * (b) redan förväntat att kunna ligga länge utan att det är ett problem
 * (t.ex. `autonomy_offer`, `review_request` — ingen kund väntar på dem).
 *
 * De tre typerna nedan delar ett gemensamt drag: en kund tror (eller kan
 * rimligen tro) att något är på gång — en offert, ett återkopplat samtal,
 * ett prissatt tillägg — och kortet som skulle föra det vidare ligger
 * obehandlat. Ett falsklarm här (en typ som INTE är ett kundlöfte)
 * kostar mer förtroende än ett missat larm — "hellre missa än gissa"
 * gäller även vilka typer som får vara med, inte bara datat i dem.
 *
 * Låst av tests/expectation-drift-signal1.spec.ts — växer typmängden ska
 * det synas i ett rött test, inte glida in tyst.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * De medvetet smala korttyperna Signal 1 bevakar. Varje typ representerar
 * ett obekräftat kundvänt åtagande — se filhuvudet för varför just dessa:
 *
 *   - create_quote_draft: AI-utkast till offert ur möte/samtal/lead.
 *     Kunden kan tro en offert är på väg.
 *   - meeting_followup: en uppföljning hantverkaren (eller Handymate å
 *     hans vägnar) sa skulle ske.
 *   - create_ata_draft: ett möjligt ÄTA-tillägg — kunden kan ha nämnt
 *     merarbete och väntar sig ett pris.
 */
export const STALE_SIGNAL_APPROVAL_TYPES = [
  'create_quote_draft',
  'meeting_followup',
  'create_ata_draft',
] as const

export type StaleSignalApprovalType = (typeof STALE_SIGNAL_APPROVAL_TYPES)[number]

/**
 * Fem dagar. Kortare hade larmat på helt normal handläggningstid (en
 * offert som tar ett par dagar att räkna på är inte en risk); längre hade
 * låtit ett glömt löfte ligga en hel arbetsvecka till innan någon fick
 * veta. Fem dagar är "det har gått en arbetsvecka och ingenting hände" —
 * den punkt där en kund rimligen börjar undra.
 */
export const DEFAULT_STALE_THRESHOLD_DAYS = 5

export interface StaleSignalRow {
  id: string
  approval_type: StaleSignalApprovalType
  title: string | null
  customer_id: string | null
  created_at: string
  days_stale: number
}

export interface FindStaleSignalsOptions {
  thresholdDays?: number
  /** Injicerbar "nu"-tidpunkt — aldrig new Date()/Date.now() i produktions-
      koden nedan utan att gå via detta, så beteendet är deterministiskt
      testbart. Default: verklig klocka. */
  now?: Date
}

/**
 * Ren day-math — inga sido-effekter, inget klockberoende buret via
 * new Date()/Date.now() internt. Räknar FAKTISKT förfluten tid (millisekund-
 * differens / ett dygn, avrundat neråt), inte kalenderdagar — det gör
 * funktionen tidzonssäker: två ISO-tidsstämplar med olika offset (t.ex.
 * '+00:00' och '+02:00') ger samma svar oavsett vilken tidzon processen
 * själv råkar köra i, eftersom Date-subtraktion alltid sker i UTC-epoch.
 *
 * Avrundning neråt (Math.floor) betyder att ett kort skapat för 4 dygn och
 * 23 timmar sedan räknas som 4 dagar gammalt, inte 5 — konsekvent med hur
 * "det har gått N hela dagar" normalt läses.
 */
export function daysStale(createdAtIso: string, nowIso: string): number {
  const createdMs = new Date(createdAtIso).getTime()
  const nowMs = new Date(nowIso).getTime()
  return Math.floor((nowMs - createdMs) / 86_400_000)
}

/**
 * Plockar ut kund-id ur en pending_approvals-payload oavsett vilken av de
 * två konventionerna som används i kodbasen: `payload.customer_id`
 * (meeting_followup, se app/api/voice/analyze/route.ts) eller
 * `payload.entity.customerId` (create_quote_draft/create_ata_draft, se
 * lib/quotes/suggest-quote-draft.ts och lib/ata/suggest-ata-draft.ts).
 */
function extractCustomerId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, any>
  if (typeof p.customer_id === 'string' && p.customer_id) return p.customer_id
  if (typeof p.entity?.customerId === 'string' && p.entity.customerId) return p.entity.customerId
  return null
}

/**
 * Hittar pending_approvals-rader av de bevakade typerna som är äldre än
 * tröskeln OCH fortfarande `status = 'pending'`. Tenant-filtrerad på
 * businessId i varje anrop — ingen cross-business-läsning är möjlig här.
 *
 * Ett kort som redan passerat sitt EGET expires_at räknas inte som ett
 * nytt stale-fynd — det har redan sin egen livscykel (åldringscronen tar
 * hand om det) och ska inte dubbellarma.
 *
 * Fail-closed vid DB-fel: en misslyckad läsning ger tom lista (loggad),
 * aldrig ett kastat fel som skulle fälla anroparens svep för alla företag.
 */
export async function findStaleSignals(
  supabase: SupabaseClient,
  businessId: string,
  opts: FindStaleSignalsOptions = {},
): Promise<StaleSignalRow[]> {
  const thresholdDays = opts.thresholdDays ?? DEFAULT_STALE_THRESHOLD_DAYS
  const now = opts.now ?? new Date()
  const nowIso = now.toISOString()
  const cutoffIso = new Date(now.getTime() - thresholdDays * 86_400_000).toISOString()

  const { data, error } = await supabase
    .from('pending_approvals')
    .select('id, approval_type, title, created_at, expires_at, payload')
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .in('approval_type', STALE_SIGNAL_APPROVAL_TYPES as unknown as string[])
    .lt('created_at', cutoffIso)

  if (error) {
    console.error('[expectation-drift/stale-signals] kunde inte läsa pending_approvals:', error.message)
    return []
  }

  return (data || [])
    .filter((row: any) => {
      if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return false
      return true
    })
    .map((row: any) => ({
      id: row.id as string,
      approval_type: row.approval_type as StaleSignalApprovalType,
      title: (row.title as string) ?? null,
      customer_id: extractCustomerId(row.payload),
      created_at: row.created_at as string,
      days_stale: daysStale(row.created_at, nowIso),
    }))
}
