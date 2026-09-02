/**
 * Kundminnet, pass 3, del 2 — ETT läs-API.
 *
 * Bakgrund: docs/audits/KUNDMINNE_REVISION_2026-09-02.md. Minnet finns i
 * tre lager som aldrig pratat med varandra — agent_memories (lib/agents/
 * memory.ts), customer_fact (v122, "säg-det-en-gång-minnet") och
 * Företagsmodellen (lib/company/company-model.ts) — och varje promptbyggare
 * (matte/chat, agent/trigger, voice/analyze, tool-router) har hittills gjort
 * sitt EGET urval av dem. Den här filen är den enda platsen som slår ihop
 * alla tre till EN text att injicera i en prompt.
 *
 * Ärlighetskontraktet: `hamtaKundkontext` kraschar ALDRIG. Varje del
 * (företag, kund, minnen) läses för sig i sitt eget try/catch — en trasig
 * källa utelämnar bara den delen (console.warn en gång) i stället för att
 * fälla hela blocket, precis som lib/compliance/communication-trail.ts och
 * lib/company/company-model.ts redan gör.
 *
 * Facit: tests/kundminne-pass3.spec.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCompanyModel } from '@/lib/company/company-model'
import { describeBranches, resolveBusinessBranch } from '@/lib/branch'
import { getRelevantMemories, buildMemoryPrompt } from '@/lib/agents/memory'
import { phoneCandidates } from '@/lib/voice/find-customer-by-phone'
import { stockholmDay } from '@/lib/compliance/communication-trail'

export type KundkontextKallTyp =
  | 'minne'
  | 'kundfakta'
  | 'samtal'
  | 'sms'
  | 'mejl'
  | 'portal'
  | 'foretagsmodell'

export interface KundkontextKalla {
  typ: KundkontextKallTyp
  id: string | null
  tid: string | null
}

export interface Kundkontext {
  block: string
  kallor: KundkontextKalla[]
}

export interface HamtaKundkontextInput {
  businessId: string
  customerId?: string | null
  agentId: string
  /** Användarens/triggerns senaste text — driver relevanssökningen i
   *  agentminnet (lib/agents/memory.ts, byggMinnesfraga). Valfri: utan den
   *  faller minnesdelen tillbaka på ren viktighetsrankning, som förut. */
  fraga?: string
}

/** Totalt tecken-tak för blocket — en prompt ska inte svälla obegränsat
 *  bara för att en kund har ett långt fakta-/kanalhistorik. Överskrids
 *  taket klipps de LÄGST prioriterade delarna bort helt (se ORDNING nedan),
 *  aldrig en enskild rad mitt i en mening. Exporterad för facit
 *  (tests/kundminne-pass3.spec.ts). */
export const MAX_BLOCK_LENGTH = 2500

/** Hur många kanalrader (samtal/SMS/mejl/portal) som visas per kanal. */
const KANAL_RAD_LIMIT = 3

/** Hur många bekräftade kundfakta som visas, senaste först. */
const FAKTA_LIMIT = 8

const KANAL_LABEL: Record<'samtal' | 'sms' | 'mejl' | 'portal', string> = {
  samtal: 'Samtal',
  sms: 'SMS',
  mejl: 'Mejl',
  portal: 'Portal',
}

/**
 * Ren radformaterare — INGEN I/O, testbar med en fixtur. "DATUM · KANAL:
 * text" med texten klippt till max `maxLen` tecken (ellips om avkortad).
 * Saknas datumet (null/ogiltigt) skrivs "okänt datum" hellre än ett
 * NaN-datum eller att raden hoppas över — en odaterad rad är fortfarande
 * information.
 */
export function formateraKontextrad(
  datumIso: string | null,
  kanal: string,
  text: string,
  maxLen = 160,
): string {
  const trimmad = (text || '').trim()
  const kortad =
    trimmad.length > maxLen ? `${trimmad.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…` : trimmad
  const datum = datumIso && !Number.isNaN(new Date(datumIso).getTime()) ? stockholmDay(datumIso) : 'okänt datum'
  return `${datum} · ${kanal}: ${kortad}`
}

/** Varnar en gång per körning per del — samma "en varning, aldrig en
 *  logglavin" som resten av kundminnet (memory.ts, company-model.ts). */
function varnaEnGang(del: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  console.warn(`[kundkontext] ${del} kunde inte läsas (utelämnas):`, message)
}

// ── Del 1: "Om företaget" ur Företagsmodellen ────────────────────────────

async function byggForetagsdel(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{ rader: string[]; kallor: KundkontextKalla[] }> {
  try {
    const model = await loadCompanyModel(supabase, businessId)
    const rader: string[] = []
    const kallor: KundkontextKalla[] = []

    if (model.branch.value) {
      const text = describeBranches(
        resolveBusinessBranch({ branch: model.branch.value, secondary_branches: model.secondary_branches.value }),
      )
      rader.push(`- Bransch: ${text} (${model.branch.authority})`)
      kallor.push({ typ: 'foretagsmodell', id: null, tid: model.branch.freshness })
    }
    if (model.hourly_rate.value !== null) {
      rader.push(`- Timpris: ${model.hourly_rate.value} kr/tim (${model.hourly_rate.authority})`)
      kallor.push({ typ: 'foretagsmodell', id: null, tid: model.hourly_rate.freshness })
    }
    // payment_terms_days är det ENDA fältet i Företagsmodellen som bär ett
    // icke-null värde under authority 'hardcoded_default' (KVITTOPRINCIPEN,
    // se company-model.ts filhuvud) — 30 dagar visas för ALLA företag,
    // konfigurerade eller ej. Ett generiskt systemdefault är inte "vad
    // Handymate vet om DEN HÄR firman"; tas bara med när ägaren faktiskt
    // satt egna villkor, annars förblir en helt okonfigurerad firma tom
    // (som tänkt) i stället för att alltid visa en intetsägande 30-dagarsrad.
    if (model.payment_terms_days.value !== null && model.payment_terms_days.authority !== 'hardcoded_default') {
      rader.push(`- Betalvillkor: ${model.payment_terms_days.value} dagar (${model.payment_terms_days.authority})`)
      kallor.push({ typ: 'foretagsmodell', id: null, tid: model.payment_terms_days.freshness })
    }
    if (model.margin_target_percent.value !== null) {
      rader.push(`- Marginalmål: ${model.margin_target_percent.value}% (${model.margin_target_percent.authority})`)
      kallor.push({ typ: 'foretagsmodell', id: null, tid: model.margin_target_percent.freshness })
    }

    return { rader: rader.slice(0, 6), kallor }
  } catch (err) {
    varnaEnGang('företagsmodellen', err)
    return { rader: [], kallor: [] }
  }
}

// ── Del 2: "Om kunden" — fakta + de senaste raderna per kanal ────────────

interface KundKanalDel {
  namn: string | null
  faktaRader: string[]
  faktaKallor: KundkontextKalla[]
  samtalRader: string[]
  samtalKallor: KundkontextKalla[]
  smsRader: string[]
  smsKallor: KundkontextKalla[]
  mejlRader: string[]
  mejlKallor: KundkontextKalla[]
  portalRader: string[]
  portalKallor: KundkontextKalla[]
}

async function byggKunddel(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string,
): Promise<KundKanalDel | null> {
  const { data: customer, error: customerErr } = await supabase
    .from('customer')
    .select('name, phone_number')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .maybeSingle()

  if (customerErr) {
    varnaEnGang('kunden', customerErr)
    return null
  }
  if (!customer) return null

  const result: KundKanalDel = {
    namn: customer.name || null,
    faktaRader: [],
    faktaKallor: [],
    samtalRader: [],
    samtalKallor: [],
    smsRader: [],
    smsKallor: [],
    mejlRader: [],
    mejlKallor: [],
    portalRader: [],
    portalKallor: [],
  }

  // Bekräftad kundfakta, senaste först.
  try {
    const { data, error } = await supabase
      .from('customer_fact')
      .select('id, content, fact_type, created_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(FAKTA_LIMIT)
    if (error) throw error
    for (const f of data || []) {
      result.faktaRader.push(`- ${f.fact_type}: ${(f.content || '').trim()}`)
      result.faktaKallor.push({ typ: 'kundfakta', id: f.id, tid: f.created_at })
    }
  } catch (err) {
    varnaEnGang('kundfakta', err)
  }

  // Senaste samtalen (call_recording.transcript_summary).
  try {
    const { data, error } = await supabase
      .from('call_recording')
      .select('recording_id, transcript_summary, created_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .not('transcript_summary', 'is', null)
      .order('created_at', { ascending: false })
      .limit(KANAL_RAD_LIMIT)
    if (error) throw error
    for (const c of data || []) {
      result.samtalRader.push(formateraKontextrad(c.created_at, KANAL_LABEL.samtal, c.transcript_summary || ''))
      result.samtalKallor.push({ typ: 'samtal', id: c.recording_id, tid: c.created_at })
    }
  } catch (err) {
    varnaEnGang('samtalshistorik', err)
  }

  // SMS via phoneCandidates (samma idiom som pass 1 — kunden kan vara
  // sparad i valfri telefonform, skrivarna sparar alltid E.164).
  try {
    const candidates = phoneCandidates(customer.phone_number)
    if (candidates.length > 0) {
      const { data, error } = await supabase
        .from('sms_conversation')
        .select('id, role, content, created_at')
        .eq('business_id', businessId)
        .in('phone_number', candidates)
        .order('created_at', { ascending: false })
        .limit(KANAL_RAD_LIMIT)
      if (error) throw error
      for (const s of data || []) {
        result.smsRader.push(formateraKontextrad(s.created_at, KANAL_LABEL.sms, s.content || ''))
        result.smsKallor.push({ typ: 'sms', id: s.id, tid: s.created_at })
      }
    }
  } catch (err) {
    varnaEnGang('SMS-historik', err)
  }

  // E-post.
  try {
    const { data, error } = await supabase
      .from('email_conversations')
      .select('id, subject, body_text, received_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('received_at', { ascending: false })
      .limit(KANAL_RAD_LIMIT)
    if (error) throw error
    for (const e of data || []) {
      const text = [e.subject, e.body_text].filter(Boolean).join(': ')
      result.mejlRader.push(formateraKontextrad(e.received_at, KANAL_LABEL.mejl, text))
      result.mejlKallor.push({ typ: 'mejl', id: e.id, tid: e.received_at })
    }
  } catch (err) {
    varnaEnGang('mejlhistorik', err)
  }

  // Portalmeddelanden.
  try {
    const { data, error } = await supabase
      .from('customer_message')
      .select('id, message, created_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(KANAL_RAD_LIMIT)
    if (error) throw error
    for (const p of data || []) {
      result.portalRader.push(formateraKontextrad(p.created_at, KANAL_LABEL.portal, p.message || ''))
      result.portalKallor.push({ typ: 'portal', id: p.id, tid: p.created_at })
    }
  } catch (err) {
    varnaEnGang('portalmeddelanden', err)
  }

  return result
}

// ── Sammansättningen ──────────────────────────────────────────────────────

interface Del {
  namn: string
  text: string
  kallor: KundkontextKalla[]
}

/**
 * Hämtar och slår ihop de tre lagren till EN text: "## Vad Handymate vet".
 * Ordningen (viktigast/färskast först) ÄR prioritetsordningen taket klipper
 * efter — trängs blocket över MAX_BLOCK_LENGTH tas hela delar bort från
 * slutet (minnen → portal → mejl → SMS → samtal → fakta), aldrig en rad
 * mitt i en mening. Företagsraderna och kundens namn rörs aldrig av taket
 * — de är för korta för att någonsin vara boven, och alltid mest relevanta.
 */
export async function hamtaKundkontext(
  supabase: SupabaseClient,
  input: HamtaKundkontextInput,
): Promise<Kundkontext> {
  const { businessId, agentId } = input
  const customerId = input.customerId || null

  const [foretag, kund] = await Promise.all([
    byggForetagsdel(supabase, businessId),
    customerId ? byggKunddel(supabase, businessId, customerId) : Promise.resolve(null),
  ])

  let minnesBlock = ''
  try {
    const minnen = await getRelevantMemories(businessId, agentId, customerId, input.fraga)
    minnesBlock = buildMemoryPrompt(minnen).trim()
  } catch (err) {
    varnaEnGang('minnen', err)
  }

  // Valfria delar, i FALLANDE prioritet (index 0 = viktigast, behålls
  // längst). Klipps från slutet (sist i arrayen) vid platsbrist — se
  // KUND_DELAR nedan för vilka "namn" som räknas som kundinnehåll.
  const KUND_DELAR = new Set(['kundfakta', 'samtal', 'sms', 'mejl', 'portal'])
  const valfria: Del[] = []
  if (kund && kund.faktaRader.length > 0) {
    valfria.push({ namn: 'kundfakta', text: kund.faktaRader.join('\n'), kallor: kund.faktaKallor })
  }
  if (kund && kund.samtalRader.length > 0) {
    valfria.push({ namn: 'samtal', text: kund.samtalRader.join('\n'), kallor: kund.samtalKallor })
  }
  if (kund && kund.smsRader.length > 0) {
    valfria.push({ namn: 'sms', text: kund.smsRader.join('\n'), kallor: kund.smsKallor })
  }
  if (kund && kund.mejlRader.length > 0) {
    valfria.push({ namn: 'mejl', text: kund.mejlRader.join('\n'), kallor: kund.mejlKallor })
  }
  if (kund && kund.portalRader.length > 0) {
    valfria.push({ namn: 'portal', text: kund.portalRader.join('\n'), kallor: kund.portalKallor })
  }
  if (minnesBlock) {
    valfria.push({ namn: 'minnen', text: `Minnen:\n${minnesBlock}`, kallor: [{ typ: 'minne', id: null, tid: null }] })
  }

  // "Om <namn>:"-rubriken skrivs bara om NÅGOT kundinnehåll faktiskt
  // överlevde (fakta/samtal/SMS/mejl/portal) — en bar rubrik utan en enda
  // rad under sig hjälper ingen och räknas som "tomt" precis som resten.
  const bygg = (delar: Del[]): { block: string; kallor: KundkontextKalla[] } => {
    const grund: string[] = []
    if (foretag.rader.length > 0) {
      grund.push(['Om företaget:', ...foretag.rader].join('\n'))
    }
    if (kund && delar.some((d) => KUND_DELAR.has(d.namn))) {
      grund.push(`Om ${kund.namn || 'kunden'}:`)
    }

    const stycken = [...grund, ...delar.map((d) => d.text)]
    const kallor = [...foretag.kallor, ...delar.flatMap((d) => d.kallor)]
    if (stycken.length === 0) return { block: '', kallor: [] }
    const block = ['## Vad Handymate vet', ...stycken].join('\n\n')
    return { block, kallor }
  }

  // Klipp från slutet (lägst prioriterat/äldst) tills blocket ryms.
  let kvarvarande = [...valfria]
  let resultat = bygg(kvarvarande)
  while (resultat.block.length > MAX_BLOCK_LENGTH && kvarvarande.length > 0) {
    kvarvarande = kvarvarande.slice(0, -1)
    resultat = bygg(kvarvarande)
  }

  return resultat
}
