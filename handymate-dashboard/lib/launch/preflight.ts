/**
 * Förkravssonden — vad som FAKTISKT är redo inför lanseringsprovet.
 *
 * ═══ VARFÖR DEN BEHÖVS UTÖVER evaluateLaunchEnvironment ═══
 *
 * `evaluateLaunchEnvironment` (lib/launch/readiness.ts) svarar på "är
 * miljövariabeln satt?". Det är en nödvändig fråga men inte den som avgör om
 * ett prov går att köra. Mätt 2026-09-03 mot prod:
 *
 *   ELKS_API_USER: "✅ Set (uff9...)"          ← env-checken ser detta
 *   46elks svarade 403: "Not enough credits"   ← och missar detta
 *
 * Hela Grind B (Lisa, SMS, telefoni) var alltså blockerad medan env-checken
 * rapporterade grönt. Ett bevisprotokoll som startar på den signalen stannar
 * halvvägs och måste köras om.
 *
 * Sonden svarar i stället på "svarar tjänsten, och kan vi använda den?" — och
 * den ersätter inte env-checken utan kompletterar den.
 *
 * ═══ ÅTERANVÄNDNING, INTE OMSKRIVNING ═══
 *
 * lib/observability/credit-watch.ts gör redan de fyra tyngsta kontrollerna
 * (databas, 46elks-saldo, Anthropic-kredit, Stripe-nyckel) med riktiga anrop,
 * och används av /api/health och admins support-vy. Sonden anropar den i
 * stället för att bygga ett andra, divergerande sanningsbegrepp om samma
 * tjänster. Här tillkommer bara det credit-watch inte täcker: Resend, Google,
 * Fortnox och lagringshinkarna.
 *
 * ═══ LÄSANDE, ALDRIG SÄNDANDE ═══
 *
 * Andreas-beslut 2026-09-03: sonden skickar aldrig ett SMS eller mejl. Den
 * frågar om saldo, domänstatus och tokengiltighet. Därför kostar den noll och
 * kan köras hur ofta som helst — en förkontroll som kostar pengar körs inte,
 * och en förkontroll som inte körs skyddar ingen.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  korKreditbevakning,
  type KontrollResultat,
} from '@/lib/observability/credit-watch'
import { REQUIRED_STORAGE_BUCKETS } from '@/lib/launch/readiness'

/**
 * 'klar'      — tjänsten svarar och går att använda
 * 'blockerad' — tjänsten svarar men vi kan inte använda den (slut kredit,
 *               overifierad domän, återkallad token). Provet kan inte köras.
 * 'okand'     — kontrollen gick inte att göra. ALDRIG samma sak som klar:
 *               en tystnad som betyder "vi vet inte" får inte se ut som ett ja.
 */
export type PreflightStatus = 'klar' | 'blockerad' | 'okand'

export interface PreflightStation {
  key: string
  /** Vilken del av Codex testsvit som blockeras när den här inte är klar. */
  grind: string
  label: string
  status: PreflightStatus
  /** Klartext, avsedd att kopieras rakt in i protokollets BLOCKERAD-rad. */
  orsak: string
}

export interface PreflightResultat {
  kontrollerad: string
  stationer: PreflightStation[]
  klara: number
  blockerade: number
  okanda: number
  /** true bara när ingen station är blockerad eller okänd. */
  redoAttStarta: boolean
}

/** credit-watch: 'ok' → klar, 'error' → blockerad, 'warn' → blockerad om det rör kredit. */
function franKreditbevakning(r: KontrollResultat): PreflightStatus {
  if (r.status === 'ok') return 'klar'
  if (r.status === 'error') return 'blockerad'
  // 'warn' på saldo betyder "räcker inte länge till" — för ett provprotokoll
  // som ska skicka riktiga SMS är det blockerande, inte en varning.
  return r.key === 'elks_balance' ? 'blockerad' : 'okand'
}

const GRIND: Record<string, string> = {
  database: 'Grind A — maskinell sanning',
  elks_balance: 'Grind B §8.2 — Lisa och 46elks',
  anthropic_credit: 'Grind A — agentteam och transkribering',
  stripe_key: 'Grind B §8.1 — Stripe live och Bränsle',
  resend_domain: 'Grind B §8.3 — e-post',
  google_token: 'Grind B §8.4 — Google',
  fortnox_connection: 'Grind B §8.6 — Fortnox',
  storage_buckets: 'Grind A — kärna och tenantdata',
}

const ETIKETT: Record<string, string> = {
  database: 'Databasen',
  elks_balance: '46elks saldo',
  anthropic_credit: 'Anthropic-kredit',
  stripe_key: 'Stripe-nyckel',
  resend_domain: 'Resend-domän',
  google_token: 'Google-token',
  fortnox_connection: 'Fortnox-anslutning',
  storage_buckets: 'Lagringshinkar',
}

/** Resend: domänen måste vara verifierad, annars går inget mejl ut. */
export async function kontrolleraResend(
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
): Promise<PreflightStation> {
  const bas = { key: 'resend_domain', grind: GRIND.resend_domain, label: ETIKETT.resend_domain }
  if (!env.RESEND_API_KEY) {
    return { ...bas, status: 'blockerad', orsak: 'RESEND_API_KEY saknas — ingen e-post kan skickas.' }
  }
  try {
    const res = await fetchImpl('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
    })
    if (res.status === 401 || res.status === 403) {
      return { ...bas, status: 'blockerad', orsak: 'Resend avvisar API-nyckeln.' }
    }
    if (!res.ok) {
      return { ...bas, status: 'okand', orsak: `Resend svarade HTTP ${res.status} — status kunde inte avgöras.` }
    }
    const body = (await res.json().catch(() => null)) as { data?: Array<{ name?: string; status?: string }> } | null
    const domaner = body?.data ?? []
    const onskad = (env.RESEND_DOMAIN || 'handymate.se').toLowerCase()
    const traff = domaner.find(d => (d.name || '').toLowerCase() === onskad)
    if (!traff) {
      return { ...bas, status: 'blockerad', orsak: `Domänen ${onskad} finns inte i Resend-kontot.` }
    }
    if ((traff.status || '').toLowerCase() !== 'verified') {
      return { ...bas, status: 'blockerad', orsak: `Domänen ${onskad} är inte verifierad (status: ${traff.status || 'okänd'}).` }
    }
    return { ...bas, status: 'klar', orsak: `Domänen ${onskad} är verifierad.` }
  } catch (err) {
    return { ...bas, status: 'okand', orsak: `Resend kunde inte nås: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Google: en refresh-token som inte längre går att växla in är det vanligaste
 * tysta felet — den ser giltig ut i databasen tills någon försöker använda den.
 */
export async function kontrolleraGoogle(
  supabase: SupabaseClient,
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
): Promise<PreflightStation> {
  const bas = { key: 'google_token', grind: GRIND.google_token, label: ETIKETT.google_token }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return { ...bas, status: 'blockerad', orsak: 'GOOGLE_CLIENT_ID/SECRET saknas.' }
  }
  try {
    const { data, error } = await supabase
      .from('calendar_connection')
      .select('business_id, refresh_token')
      .not('refresh_token', 'is', null)
      .limit(1)
      .maybeSingle()

    if (error) {
      return { ...bas, status: 'okand', orsak: `Kunde inte läsa calendar_connection: ${error.message}` }
    }
    if (!data?.refresh_token) {
      return { ...bas, status: 'blockerad', orsak: 'Inget konto har en Google-anslutning att prova mot.' }
    }

    const res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: String(data.refresh_token),
        grant_type: 'refresh_token',
      }),
    })
    if (res.ok) {
      return { ...bas, status: 'klar', orsak: `Refresh-token gick att växla in (konto ${data.business_id}).` }
    }
    const text = await res.text().catch(() => '')
    if (res.status === 400 || res.status === 401) {
      return { ...bas, status: 'blockerad', orsak: `Google avvisar refresh-token (HTTP ${res.status}) — anslutningen måste göras om.` }
    }
    return { ...bas, status: 'okand', orsak: `Google svarade HTTP ${res.status}: ${text.slice(0, 120)}` }
  } catch (err) {
    return { ...bas, status: 'okand', orsak: `Google kunde inte nås: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** Fortnox: läsande — finns ett kopplat bolag att köra skarpprovet mot? */
export async function kontrolleraFortnox(supabase: SupabaseClient): Promise<PreflightStation> {
  const bas = { key: 'fortnox_connection', grind: GRIND.fortnox_connection, label: ETIKETT.fortnox_connection }
  try {
    const { data, error } = await supabase
      .from('business_config')
      .select('business_id, business_name')
      .eq('fortnox_connected', true)
      .limit(1)
      .maybeSingle()

    if (error) {
      return { ...bas, status: 'okand', orsak: `Kunde inte läsa Fortnox-status: ${error.message}` }
    }
    if (!data) {
      return { ...bas, status: 'blockerad', orsak: 'Inget konto är Fortnox-kopplat — §8.6 kan inte köras.' }
    }
    return { ...bas, status: 'klar', orsak: `${data.business_name || data.business_id} är Fortnox-kopplat.` }
  } catch (err) {
    return { ...bas, status: 'okand', orsak: `Fortnox-kontrollen kastade: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** Lagringshinkarna — saknas en bucket failar uppladdningar först vid användning. */
export async function kontrolleraBuckets(supabase: SupabaseClient): Promise<PreflightStation> {
  const bas = { key: 'storage_buckets', grind: GRIND.storage_buckets, label: ETIKETT.storage_buckets }
  try {
    const { data, error } = await supabase.storage.listBuckets()
    if (error) {
      return { ...bas, status: 'okand', orsak: `Kunde inte lista hinkar: ${error.message}` }
    }
    const finns = new Set((data || []).map(b => b.name))
    const saknas = REQUIRED_STORAGE_BUCKETS.filter(b => !finns.has(b))
    if (saknas.length > 0) {
      return { ...bas, status: 'blockerad', orsak: `Saknade hinkar: ${saknas.join(', ')}` }
    }
    return { ...bas, status: 'klar', orsak: `Alla ${REQUIRED_STORAGE_BUCKETS.length} hinkar finns.` }
  } catch (err) {
    return { ...bas, status: 'okand', orsak: `Hinkkontrollen kastade: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** Ren aggregering — testbar utan nätverk. */
export function sammanstall(stationer: PreflightStation[], kontrolleradIso: string): PreflightResultat {
  const klara = stationer.filter(s => s.status === 'klar').length
  const blockerade = stationer.filter(s => s.status === 'blockerad').length
  const okanda = stationer.filter(s => s.status === 'okand').length
  return {
    kontrollerad: kontrolleradIso,
    stationer,
    klara,
    blockerade,
    okanda,
    // Ett okänt läge räknas ALDRIG som redo. Provet ska inte starta på en
    // gissning — det är hela poängen med att skilja okand från klar.
    redoAttStarta: blockerade === 0 && okanda === 0,
  }
}

export async function korPreflight(supabase: SupabaseClient): Promise<PreflightResultat> {
  // De fyra tyngsta kontrollerna görs redan av credit-watch med riktiga anrop.
  // dbProbe skickas in så databaskontrollen använder SAMMA klient som resten
  // av sonden — annars kunde de två råka svara om olika miljöer.
  const kredit = await korKreditbevakning({
    dbProbe: async () => {
      const { error } = await supabase.from('business_config').select('business_id').limit(1)
      return !error
    },
  }).catch((): KontrollResultat[] => [])

  const franKredit: PreflightStation[] = kredit.map(r => ({
    key: r.key,
    grind: GRIND[r.key] || 'Grind A',
    label: ETIKETT[r.key] || r.key,
    status: franKreditbevakning(r),
    orsak: r.summary,
  }))

  // En kontroll som inte kom tillbaka från credit-watch är okänd, inte klar.
  const saknade = (['database', 'elks_balance', 'anthropic_credit', 'stripe_key'] as const)
    .filter(k => !franKredit.some(s => s.key === k))
    .map<PreflightStation>(k => ({
      key: k,
      grind: GRIND[k],
      label: ETIKETT[k],
      status: 'okand',
      orsak: 'Kreditbevakningen returnerade ingen kontroll för den här stationen.',
    }))

  const [resend, google, fortnox, buckets] = await Promise.all([
    kontrolleraResend(),
    kontrolleraGoogle(supabase),
    kontrolleraFortnox(supabase),
    kontrolleraBuckets(supabase),
  ])

  return sammanstall(
    [...franKredit, ...saknade, resend, google, fortnox, buckets],
    new Date().toISOString(),
  )
}
