/**
 * Onboardingtratten — vilket steg nås när, per företag och variant.
 *
 * Bakgrund (2026-09-01): produktionsdata visade att alla externa signups
 * stannade på onboardingsteg 4 (telefon → betalning), men det fanns bara
 * "nuvarande steg" per företag — inte NÄR stegen nåddes, hur länge de tog,
 * eller om Setup Studio eller den klassiska guiden användes. Andreas kör
 * ett A/B-test på onboardingen; utan tidsstämplar går det inte att läsa av.
 *
 * Datamodell: INGEN ny kolumn. Tidsstämplarna bor under nyckeln
 * `_funnel` i business_config.onboarding_data (jsonb som redan finns och
 * redan merge:as i PUT /api/onboarding). Servern äger nyckeln — klientens
 * kopia strippas alltid innan merge (stripFunnelFromClientData).
 *
 *   onboarding_data._funnel = {
 *     v: 1,
 *     variant: 'studio' | 'classic',      // senast rapporterade UI-variant
 *     reached: { '1': iso, '2': iso, … }, // FÖRSTA gången ett UI-steg nåddes
 *     finalized_at: iso                   // POST /api/onboarding lyckades
 *   }
 *
 * UI-stegen är 0–7 (app/onboarding/page.tsx, TOTAL_STEPS = 8); steg 0 är
 * introt och sparas aldrig. Finalize är "steg 8" i tratten.
 *
 * Rena funktioner, ingen I/O. Räknade fakta — aldrig ett kausalitets-
 * påstående om varför någon föll bort.
 */

import { arTestNamn } from '@/lib/testdata'

export const FUNNEL_KEY = '_funnel'
export const FUNNEL_VERSION = 1
export const FUNNEL_FINAL_STEP = 8

export type OnboardingVariant = 'studio' | 'classic'

export interface FunnelRecord {
  v: number
  variant?: OnboardingVariant
  reached: Record<string, string>
  finalized_at?: string
}

/** UI-stegens etiketter (samma ordning som app/onboarding/page.tsx). */
export const STEG_ETIKETTER: Record<number, string> = {
  1: 'Företaget',
  2: 'Så jobbar du',
  3: 'Telefon',
  4: 'Aktivera (betalning)',
  5: 'Importera data',
  6: 'Artikelregister',
  7: 'Rundtur',
  8: 'Klar',
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function readFunnel(onboardingData: unknown): FunnelRecord | null {
  if (!isRecord(onboardingData)) return null
  const raw = onboardingData[FUNNEL_KEY]
  if (!isRecord(raw)) return null
  const reached: Record<string, string> = {}
  if (isRecord(raw.reached)) {
    for (const [k, v] of Object.entries(raw.reached)) {
      if (/^\d+$/.test(k) && typeof v === 'string') reached[k] = v
    }
  }
  return {
    v: typeof raw.v === 'number' ? raw.v : FUNNEL_VERSION,
    variant: raw.variant === 'studio' || raw.variant === 'classic' ? raw.variant : undefined,
    reached,
    finalized_at: typeof raw.finalized_at === 'string' ? raw.finalized_at : undefined,
  }
}

export function normaliseraVariant(v: unknown): OnboardingVariant | undefined {
  return v === 'studio' || v === 'classic' ? v : undefined
}

/** Klientens kopia av _funnel får aldrig skrivas tillbaka — servern äger den. */
export function stripFunnelFromClientData<T extends Record<string, unknown>>(data: T): Omit<T, typeof FUNNEL_KEY> {
  if (!(FUNNEL_KEY in data)) return data
  const { [FUNNEL_KEY]: _ignored, ...rest } = data
  return rest as Omit<T, typeof FUNNEL_KEY>
}

/**
 * Första gången ett steg nås stämplas det; senare besök ändrar inget.
 * Varianten uppdateras alltid till den senast rapporterade (kunden kan
 * byta till klassisk guide mitt i).
 */
export function markStepReached(
  existing: FunnelRecord | null,
  step: number,
  nowIso: string,
  variant?: OnboardingVariant,
): FunnelRecord {
  const base: FunnelRecord = existing ?? { v: FUNNEL_VERSION, reached: {} }
  const reached = { ...base.reached }
  if (Number.isInteger(step) && step >= 1 && step <= FUNNEL_FINAL_STEP - 1 && !reached[String(step)]) {
    reached[String(step)] = nowIso
  }
  return {
    ...base,
    v: FUNNEL_VERSION,
    reached,
    ...(variant ? { variant } : {}),
  }
}

export function markFinalized(existing: FunnelRecord | null, nowIso: string): FunnelRecord {
  const base: FunnelRecord = existing ?? { v: FUNNEL_VERSION, reached: {} }
  return { ...base, v: FUNNEL_VERSION, finalized_at: base.finalized_at ?? nowIso }
}

// ─── Sammanställning ────────────────────────────────────────────────────

export interface FunnelRow {
  business_id: string
  business_name: string | null
  created_at: string
  onboarding_step: number | null
  onboarding_completed_at: string | null
  subscription_status: string | null
  stripe_subscription_id: string | null
  onboarding_data: unknown
}

export interface StegRad {
  steg: number
  etikett: string
  nadde: number
  /** Andel av de som nådde föregående steg som INTE nådde detta. null för steg 1. */
  bortfall_pct: number | null
  /** Median minuter från föregående steg (eller kontoskapande för steg 1). null utan tidsstämplar. */
  median_minuter: number | null
  /** Hur många av `nadde` som bidrog med tidsstämpel. */
  med_tid: number
}

export interface FunnelSammanstallning {
  foretag: number
  exkluderade_test: number
  klara: number
  betalande: number
  /** Valde "Aktivera senare" i betalsteget (onboarding_data.activationDeferredAt). */
  skot_upp_betalning: number
  steg: StegRad[]
  /** Median minuter från kontoskapande till finalize. */
  median_minuter_till_klar: number | null
  per_variant: Array<{ variant: OnboardingVariant | 'okand'; foretag: number; klara: number; steg: Array<Pick<StegRad, 'steg' | 'nadde'>> }>
  fastnade_pa: Array<{ steg: number; etikett: string; antal: number }>
}

export interface ForetagRad {
  business_id: string
  business_name: string
  created_at: string
  is_test: boolean
  variant: OnboardingVariant | 'okand'
  max_steg: number
  max_steg_etikett: string
  klar: boolean
  betalande: boolean
  skot_upp_betalning: boolean
  /** Minuter från kontoskapande till senaste kända händelse i tratten. */
  minuter_i_tratten: number | null
  har_tidsstamplar: boolean
}

/** Aktivera senare (2026-09-02): klienten stämplar activationDeferredAt i onboarding_data. */
export function harSkjutitUppBetalning(onboardingData: unknown): boolean {
  const v = (onboardingData as { activationDeferredAt?: unknown } | null | undefined)?.activationDeferredAt
  return typeof v === 'string' && Number.isFinite(Date.parse(v))
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function minutesBetween(fromIso: string | undefined, toIso: string | undefined): number | null {
  if (!fromIso || !toIso) return null
  const a = Date.parse(fromIso)
  const b = Date.parse(toIso)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return Math.round((b - a) / 60_000)
}

/**
 * Högsta nådda trattsteg 1–8 för en rad. Tidsstämplar vinner; saknas de
 * (konton från före 2026-09-01) används onboarding_step som legacy-
 * approximation (1–7 ≈ UI-steg, ≥8 = klar).
 */
export function harledMaxSteg(row: FunnelRow, funnel: FunnelRecord | null): number {
  if (row.onboarding_completed_at || funnel?.finalized_at) return FUNNEL_FINAL_STEP
  const stamplade = funnel ? Object.keys(funnel.reached).map(Number).filter(n => Number.isFinite(n)) : []
  if (stamplade.length > 0) return Math.max(...stamplade)
  const legacy = row.onboarding_step ?? 0
  if (legacy >= FUNNEL_FINAL_STEP) return FUNNEL_FINAL_STEP
  return Math.max(0, Math.min(FUNNEL_FINAL_STEP - 1, legacy))
}

export function beskrivForetag(row: FunnelRow, nowMs: number = Date.now()): ForetagRad {
  const funnel = readFunnel(row.onboarding_data)
  const maxSteg = harledMaxSteg(row, funnel)
  const klar = maxSteg >= FUNNEL_FINAL_STEP
  const senaste = funnel
    ? [funnel.finalized_at, ...Object.values(funnel.reached)].filter((s): s is string => typeof s === 'string').sort().at(-1)
    : row.onboarding_completed_at ?? undefined
  return {
    business_id: row.business_id,
    business_name: row.business_name || row.business_id,
    created_at: row.created_at,
    is_test: arTestNamn(row.business_name) || /^test\b|^asdasd$/i.test((row.business_name || '').trim()),
    variant: funnel?.variant ?? 'okand',
    max_steg: maxSteg,
    max_steg_etikett: maxSteg === 0 ? 'Intro' : STEG_ETIKETTER[maxSteg] ?? String(maxSteg),
    klar,
    betalande: Boolean(row.stripe_subscription_id) || row.subscription_status === 'active',
    skot_upp_betalning: harSkjutitUppBetalning(row.onboarding_data),
    minuter_i_tratten: senaste ? minutesBetween(row.created_at, senaste) : (klar ? null : Math.round((nowMs - Date.parse(row.created_at)) / 60_000)),
    har_tidsstamplar: Boolean(funnel && Object.keys(funnel.reached).length > 0),
  }
}

export function sammanstallTratt(rows: FunnelRow[], nowMs: number = Date.now()): { summering: FunnelSammanstallning; foretag: ForetagRad[] } {
  const foretag = rows.map(r => beskrivForetag(r, nowMs))
  const riktiga = rows.filter((_, i) => !foretag[i].is_test)
  const riktigaBeskrivna = foretag.filter(f => !f.is_test)

  const steg: StegRad[] = []
  let forraNadde = riktiga.length
  for (let n = 1; n <= FUNNEL_FINAL_STEP; n++) {
    const nadde = riktigaBeskrivna.filter(f => f.max_steg >= n).length
    const tider: number[] = []
    for (const row of riktiga) {
      const funnel = readFunnel(row.onboarding_data)
      if (!funnel) continue
      const till = n === FUNNEL_FINAL_STEP ? funnel.finalized_at : funnel.reached[String(n)]
      const fran = n === 1 ? row.created_at : funnel.reached[String(n - 1)]
      const m = minutesBetween(fran, till)
      if (m !== null) tider.push(m)
    }
    steg.push({
      steg: n,
      etikett: STEG_ETIKETTER[n],
      nadde,
      bortfall_pct: n === 1 || forraNadde === 0 ? null : Math.round(((forraNadde - nadde) / forraNadde) * 100),
      median_minuter: median(tider),
      med_tid: tider.length,
    })
    forraNadde = nadde
  }

  const tillKlar: number[] = []
  for (const row of riktiga) {
    const funnel = readFunnel(row.onboarding_data)
    const m = minutesBetween(row.created_at, funnel?.finalized_at ?? row.onboarding_completed_at ?? undefined)
    if (m !== null && funnel?.finalized_at) tillKlar.push(m)
  }

  const varianter: Array<OnboardingVariant | 'okand'> = ['studio', 'classic', 'okand']
  const per_variant = varianter
    .map(variant => {
      const egna = riktigaBeskrivna.filter(f => f.variant === variant)
      return {
        variant,
        foretag: egna.length,
        klara: egna.filter(f => f.klar).length,
        steg: Array.from({ length: FUNNEL_FINAL_STEP }, (_, i) => i + 1).map(n => ({ steg: n, nadde: egna.filter(f => f.max_steg >= n).length })),
      }
    })
    .filter(v => v.foretag > 0)

  const fastnade = new Map<number, number>()
  for (const f of riktigaBeskrivna) {
    if (f.klar) continue
    fastnade.set(f.max_steg, (fastnade.get(f.max_steg) ?? 0) + 1)
  }

  return {
    summering: {
      foretag: riktiga.length,
      exkluderade_test: rows.length - riktiga.length,
      klara: riktigaBeskrivna.filter(f => f.klar).length,
      betalande: riktigaBeskrivna.filter(f => f.betalande).length,
      skot_upp_betalning: riktigaBeskrivna.filter(f => f.skot_upp_betalning).length,
      steg,
      median_minuter_till_klar: median(tillKlar),
      per_variant,
      fastnade_pa: Array.from(fastnade.entries())
        .map(([s, antal]) => ({ steg: s, etikett: s === 0 ? 'Intro' : STEG_ETIKETTER[s] ?? String(s), antal }))
        .sort((a, b) => b.antal - a.antal),
    },
    foretag: foretag.sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }
}
