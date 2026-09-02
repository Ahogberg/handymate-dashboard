/**
 * Adoptionsmåttet — "aktiv på ≥4 ytor inom 30 dagar" (GTM "De första femton", 2026-09-02).
 *
 * Måttet självgående onboarding ska rapporteras på: ett nytt företag som på egen
 * hand tar produkten i bruk, utan att en grundare suttit bredvid. Ingen ny tabell,
 * ingen analytics-SDK — samma princip som lib/admin/activation-metrics.ts: allt
 * räknas retroaktivt ur tidsstämplar som redan finns.
 *
 * Fönstret börjar vid business_config.onboarding_completed_at. Det är avsiktligt:
 * importen i onboardingsteg 4 sker FÖRE finalize, så importerade kunder, jobb och
 * fakturor hamnar utanför fönstret och kan aldrig räknas som egen användning.
 *
 * Setup är inte användning — push-prenumeration och Fortnox-koppling räknas inte.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** De åtta ytorna. Nyckeln är stabil (facit//admin), etiketten är för människor. */
export const YTOR = {
  samtal: 'Lisa tog ett samtal',
  beslut: 'Beslut i godkännandekön',
  offert: 'Offert skickad',
  faktura: 'Faktura skickad',
  kund: 'Kund tillagd',
  projekt: 'Jobb skapat',
  matte: 'Frågat Matte',
  falt: 'Tid, ÄTA eller dagbok från fältet',
} as const

export type Yta = keyof typeof YTOR
export const YTA_NYCKLAR = Object.keys(YTOR) as Yta[]

export const ADOPTION_FONSTER_DAGAR = 30
export const ADOPTION_TROSKEL = 4

const DYGN_MS = 86_400_000

export interface AdoptionHandelse {
  business_id: string
  yta: Yta
  ts: string
}

export interface Adoption {
  /** Ytor med minst en egen handling inom fönstret */
  ytor: Yta[]
  antal: number
  /** Dygn sedan onboarding slutfördes, 1 = första dygnet. null utan slutförd onboarding */
  dag: number | null
  /** true när 30-dagarsfönstret passerat — först då är utfallet slutgiltigt */
  fonsterKlart: boolean
  aktiv: boolean
}

export interface AdoptionBusiness {
  business_id: string
  onboarding_completed_at: string | null
}

const tid = (v: string | null | undefined): number | null => {
  if (!v) return null
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * Räknar ut adoptionen för ETT företag ur dess egna händelser.
 * Ren funktion — inga anrop, ingen klocka utom den inskickade.
 */
export function computeAdoption(
  handelser: AdoptionHandelse[],
  business: AdoptionBusiness,
  nowIso: string,
): Adoption {
  const start = tid(business.onboarding_completed_at)
  if (start == null) {
    return { ytor: [], antal: 0, dag: null, fonsterKlart: false, aktiv: false }
  }
  const now = tid(nowIso) ?? Date.now()
  const slut = start + ADOPTION_FONSTER_DAGAR * DYGN_MS

  const traffade = new Set<Yta>()
  for (const h of handelser) {
    const t = tid(h.ts)
    if (t == null || t < start || t >= slut) continue
    traffade.add(h.yta)
  }

  const ytor = YTA_NYCKLAR.filter(y => traffade.has(y))
  return {
    ytor,
    antal: ytor.length,
    dag: Math.floor((now - start) / DYGN_MS) + 1,
    fonsterKlart: now >= slut,
    aktiv: ytor.length >= ADOPTION_TROSKEL,
  }
}

/** "3/8 ytor · dag 12" / "5/8 ytor · aktiv" / "—" innan onboarding är klar */
export function formatAdoption(a: Adoption): string {
  if (a.dag == null) return '—'
  const bas = `${a.antal}/${YTA_NYCKLAR.length} ytor`
  return a.aktiv ? `${bas} · aktiv` : `${bas} · dag ${a.dag}`
}

export interface AdoptionAggregat {
  /** Konton vars 30-dagarsfönster stängt — bara de har ett slutgiltigt utfall */
  klara: number
  aktivaKlara: number
  /** Andel av de klara som nådde tröskeln. null när inget fönster stängt än */
  andel: number | null
  /** Konton som slutfört onboardingen men fortfarande är inne i fönstret */
  pagaende: number
  aktivaPagaende: number
}

export function aggregateAdoption(rader: Adoption[]): AdoptionAggregat {
  const klaraRader = rader.filter(a => a.dag != null && a.fonsterKlart)
  const pagaendeRader = rader.filter(a => a.dag != null && !a.fonsterKlart)
  const aktivaKlara = klaraRader.filter(a => a.aktiv).length
  return {
    klara: klaraRader.length,
    aktivaKlara,
    andel: klaraRader.length > 0 ? Math.round((aktivaKlara / klaraRader.length) * 100) / 100 : null,
    pagaende: pagaendeRader.length,
    aktivaPagaende: pagaendeRader.filter(a => a.aktiv).length,
  }
}

/**
 * Hämtar händelserna för en uppsättning företag — en query per källa, alla
 * parallellt, klippta till det yttersta fönstret som något av företagen kan ha.
 * Ett läsfel på en källa utelämnar bara den källan (warn), aldrig hela måttet.
 */
export async function hamtaAdoptionHandelser(
  supabase: SupabaseClient,
  businesses: AdoptionBusiness[],
): Promise<Map<string, AdoptionHandelse[]>> {
  const med = businesses.filter(b => tid(b.onboarding_completed_at) != null)
  const perBusiness = new Map<string, AdoptionHandelse[]>()
  if (med.length === 0) return perBusiness

  const ids = med.map(b => b.business_id)
  const starter = med.map(b => tid(b.onboarding_completed_at) as number)
  const minStart = new Date(Math.min(...starter)).toISOString()
  const maxSlut = new Date(Math.max(...starter) + ADOPTION_FONSTER_DAGAR * DYGN_MS).toISOString()

  type Kalla = {
    yta: Yta
    tabell: string
    ts: string
    filtrera?: (q: any) => any
  }
  // Fältet är tre tabeller men EN yta — hantverkaren som rapporterar från bygget.
  const kallor: Kalla[] = [
    { yta: 'samtal', tabell: 'call_recording', ts: 'created_at', filtrera: q => q.eq('direction', 'inbound') },
    {
      yta: 'beslut',
      tabell: 'pending_approvals',
      ts: 'resolved_at',
      filtrera: q => q.in('status', ['approved', 'rejected']).neq('approval_type', 'team_intro'),
    },
    { yta: 'offert', tabell: 'quotes', ts: 'sent_at' },
    { yta: 'faktura', tabell: 'invoice', ts: 'sent_at' },
    { yta: 'kund', tabell: 'customer', ts: 'created_at' },
    { yta: 'projekt', tabell: 'project', ts: 'created_at' },
    { yta: 'matte', tabell: 'thread_message', ts: 'created_at', filtrera: q => q.eq('role', 'user') },
    { yta: 'falt', tabell: 'time_entry', ts: 'created_at' },
    { yta: 'falt', tabell: 'project_change', ts: 'created_at' },
    { yta: 'falt', tabell: 'field_reports', ts: 'created_at' },
  ]

  const resultat = await Promise.all(
    kallor.map(async (k): Promise<AdoptionHandelse[]> => {
      try {
        let q = supabase
          .from(k.tabell)
          .select(`business_id, ${k.ts}`)
          .in('business_id', ids)
          .gte(k.ts, minStart)
          .lte(k.ts, maxSlut)
          .limit(20000)
        if (k.filtrera) q = k.filtrera(q)
        const { data, error } = await q
        if (error) {
          console.warn(`[adoption] ${k.tabell} kunde inte läsas (ytan utelämnas):`, error.message)
          return []
        }
        // Selecten byggs av en variabel (k.ts) — PostgREST-typningen kan inte
        // härleda kolumnerna, så raderna typas som vanliga objekt här.
        const rader = (data || []) as unknown as Array<Record<string, unknown>>
        return rader
          .map(r => ({
            business_id: String(r.business_id),
            yta: k.yta,
            ts: String(r[k.ts] ?? ''),
          }))
          .filter(h => h.ts.length > 0)
      } catch (err) {
        console.warn(`[adoption] ${k.tabell} kunde inte läsas (ytan utelämnas):`, err)
        return []
      }
    }),
  )

  for (const h of resultat.flat()) {
    const lista = perBusiness.get(h.business_id) || []
    lista.push(h)
    perBusiness.set(h.business_id, lista)
  }
  return perBusiness
}
