/**
 * Rekryteringssignalen — växer firman?
 *
 * En hantverksfirma som annonserar efter folk växer, och en växande firma har
 * precis fått det administrativa problemet Handymate löser. Det är den
 * varmaste öppning som finns i öppna data, och den kräver ingen gissning:
 * annonsen finns publikt i Platsbanken, med datum och länk.
 *
 * KÄLLA: jobsearch.api.jobtechdev.se — Arbetsförmedlingens öppna API. Ingen
 * nyckel, publika annonser, inga personuppgifter om vår målgrupp.
 *
 * Formen nedan är avläst ur ett RIKTIGT svar (2026-09-03), sparat som fixtur
 * i tests/fixtures/jobtech-elektriker.json. Ingen struktur här är gissad —
 * det var hela poängen med att hämta ett svar först.
 *
 * Rena funktioner, ingen I/O. Hämtningen ligger i hamtaPlatsbankenTraffar()
 * längst ner och är avsiktligt tunn.
 */
import type { GtmSignal } from './signaler'

/** Bara de fält signalen faktiskt läser. Allt annat i svaret ignoreras. */
export interface PlatsbankenTraff {
  id?: string | null
  webpage_url?: string | null
  headline?: string | null
  number_of_vacancies?: number | null
  publication_date?: string | null
  removed?: boolean | null
  employer?: {
    organization_number?: string | null
    name?: string | null
    workplace?: string | null
  } | null
  occupation?: { label?: string | null } | null
  occupation_group?: { label?: string | null } | null
  workplace_address?: { municipality?: string | null; region?: string | null } | null
}

/** En annons äldre än så säger inget om läget just nu. */
export const REKRYTERING_FONSTER_DAGAR = 90

/**
 * Normaliserar ett organisationsnummer till tio siffror.
 *
 * JobTech svarar UTAN bindestreck ("5560936949"), medan svenska register och
 * handskrivna CSV-filer oftast har det ("556093-6949"). Utan normalisering
 * matchar ingenting, och signalen hade tyst uteblivit för varje företag —
 * ett fel som ser ut som "inga träffar" i stället för som en bugg.
 */
export function normaliseraOrgnummer(varde: string | null | undefined): string {
  const siffror = String(varde ?? '').replace(/\D/g, '')
  // Ett 12-siffrigt nummer bär sekelprefix (16/17/18/19/20) — skala bort det.
  if (siffror.length === 12) return siffror.slice(2)
  return siffror
}

/**
 * Härleder rekryteringssignalen ur Platsbanken-träffar.
 *
 * ORGANISATIONSNUMRET ÄR GRINDEN, inte fritextsökningen. Sökningen på
 * företagsnamn hämtar hem allt möjligt — i det fixerade svaret ligger både
 * Jönköpings kommun och SkiStar, som är helt irrelevanta för målgruppen. Bara
 * en exakt orgnummer-träff blir en signal. Hellre en missad signal än en
 * påhittad: en falsk träff skulle få Christoffer att öppna ett samtal med ett
 * påstående som inte stämmer, och det kostar mer än tystnad.
 *
 * `nu` injiceras så facit blir deterministiskt.
 */
export function harledRekryteringssignal(
  traffar: PlatsbankenTraff[],
  orgnummer: string | null | undefined,
  nu: Date = new Date(),
): GtmSignal | null {
  const vart = normaliseraOrgnummer(orgnummer)
  if (vart.length < 10) return null

  const grans = nu.getTime() - REKRYTERING_FONSTER_DAGAR * 24 * 60 * 60 * 1000

  const vara = (traffar || []).filter(traff => {
    if (traff?.removed === true) return false
    if (normaliseraOrgnummer(traff?.employer?.organization_number) !== vart) return false
    const publicerad = new Date(traff?.publication_date ?? '')
    if (Number.isNaN(publicerad.getTime())) return false
    return publicerad.getTime() >= grans && publicerad.getTime() <= nu.getTime()
  })

  if (vara.length === 0) return null

  // Senaste annonsen bär beviset — den är mest aktuell i ett samtal.
  const senaste = vara.reduce((a, b) =>
    new Date(a.publication_date ?? 0) >= new Date(b.publication_date ?? 0) ? a : b)

  const roll = senaste.occupation?.label || senaste.headline || 'en tjänst'
  const datum = String(senaste.publication_date).slice(0, 10)
  const lank = senaste.webpage_url || ''
  const platser = vara.reduce((summa, t) => summa + (t.number_of_vacancies || 1), 0)

  // Fler annonser eller fler platser = tydligare tillväxt.
  const styrka = vara.length >= 2 || platser >= 3 ? 3 : 2

  return {
    key: 'rekryterar',
    label: vara.length === 1
      ? `Rekryterar ${roll.toLowerCase()}`
      : `Rekryterar — ${vara.length} annonser, ${platser} platser`,
    // Beviset innehåller ALLTID länken till annonsen. Signalen ska gå att
    // kontrollera på tre sekunder, precis som webbplatssignalerna.
    evidence: `Platsbanken ${datum}: "${roll}"${lank ? ` — ${lank}` : ''}`,
    styrka: styrka as GtmSignal['styrka'],
  }
}

/**
 * Hämtar träffar ur Platsbanken för ett företagsnamn.
 *
 * Avsiktligt tunn: bara `q` och `limit` används, för det är de parametrar jag
 * sett fungera mot ett riktigt svar. API:et har sannolikt ett `employer`-
 * filter som vore effektivare — men det är inte verifierat, och en ogiltig
 * parameter ger tyst noll träffar i stället för ett fel. Filtreringen sker
 * därför på orgnummer i harledRekryteringssignal(), vilket är korrekt oavsett
 * hur sökningen råkade matcha.
 *
 * Fail-soft: nätverksfel eller oväntat svar ger tom lista, aldrig ett kast.
 * En utebliven signal får aldrig fälla briefen.
 */
export async function hamtaPlatsbankenTraffar(
  foretagsnamn: string,
  limit = 20,
): Promise<PlatsbankenTraff[]> {
  const q = foretagsnamn?.trim()
  if (!q) return []
  const url = `https://jobsearch.api.jobtechdev.se/search?q=${encodeURIComponent(q)}&limit=${limit}`
  try {
    const svar = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!svar.ok) {
      console.warn('[rekryteringssignal] Platsbanken svarade', svar.status)
      return []
    }
    const data = await svar.json()
    return Array.isArray(data?.hits) ? (data.hits as PlatsbankenTraff[]) : []
  } catch (err) {
    console.warn('[rekryteringssignal] Platsbanken kunde inte nås:', err instanceof Error ? err.message : err)
    return []
  }
}
