/**
 * Bolagsverket "värdefulla datamängder"-klient (2026-08-15).
 *
 * Endpoints bekräftade mot en verklig, publicerad tredjeparts-klients
 * dokumentation (BolagsverketEx, ett Elixir-bibliotek) — bolagsverket.se:s
 * egna sidor är CAPTCHA-skyddade mot automatiserad läsning, så exakt
 * request-/svarsschema för `POST /organisationer` är en välgrundad
 * gissning byggd på Bolagsverkets dokumenterade fältnamn på andra ställen
 * (t.ex. `identitetsbeteckning` för org.nr). Svarstolkningen
 * (`parseOrganisationResponse`) är MEDVETET defensiv — validerar formen
 * innan den litar på den, ger `null`/`invalid_response` hellre än att
 * gissa fram ett fält eller krascha.
 *
 * VERIFIERA mot den riktiga tekniska dokumentationen som följer med
 * API-nycklarna (efter Bolagsverkets "kundanmälan", se tasks/todo.md)
 * innan produktionsanvändning — särskilt `/organisationer`-svarets
 * exakta fältnamn.
 *
 * RÄTTAT 2026-09-17 efter skarpt fel i onboardingen ("Kunde inte nå
 * Bolagsverket just nu", körloggen: `token-hämtning misslyckades: 404`):
 *   1. Tokens mintas på PORTAL-värden, inte på gateway-värden. Uppslaget
 *      går mot `gw.api.bolagsverket.se`, men `/oauth2/token` finns bara på
 *      `portal.api.bolagsverket.se`. Den gamla gateway-URL:en gav 404.
 *   2. `identitetsbeteckning` är TOLV siffror (PeOrgNr), inte tio — se
 *      orgNumberIdentity i lib/karin/org-number.ts.
 * Miljön väljs med `BOLAGSVERKET_ENV` (`accept`/`production`), som tar BÅDA
 * värdarna på en gång. Bolagsverket delar ut nycklar till acceptansmiljön
 * först, och en token därifrån avvisas av produktionsgatewayen — värdarna hör
 * ihop parvis och får aldrig sättas var för sig. De två URL-variablerna finns
 * kvar som undantag; sätts de så att värdarna hamnar i olika miljöer stoppas
 * uppslaget av vakten i `endpoints()` i stället för att ge ett obegripligt 401.
 *
 * Fail-soft genomgående, samma disciplin som app/api/onboarding/
 * scrape-website/route.ts: saknade credentials, nätverksfel och
 * oväntade svar ger alla ett typat `{ok:false, reason}` — aldrig ett
 * kastat fel som stoppar onboarding. Varje misslyckande loggar status OCH
 * URL: utan URL:en i loggen tog 404:an ovan en felsökningsrunda extra.
 */
import { orgNumberIdentity } from '@/lib/karin/org-number'

const SCOPE = 'vardefulla-datamangder:read'

export type BolagsverketEnv = 'accept' | 'production'

/**
 * Värdparet per miljö. Token och uppslag MÅSTE höra ihop: en token från
 * acceptansmiljön avvisas av produktionsgatewayen och tvärtom — ett 401 som
 * inte säger något om vad som är fel. Båda acceptansvärdarna ligger dessutom
 * på samma lastbalanserare hos Bolagsverket, så de hör ihop även i deras ände.
 * Ren funktion — facit i tests/bolagsverket-onboarding.spec.ts.
 */
export function bolagsverketHosts(env: BolagsverketEnv): { tokenUrl: string; apiBaseUrl: string } {
  return env === 'accept'
    ? {
        tokenUrl: 'https://portal-accept2.api.bolagsverket.se/oauth2/token',
        apiBaseUrl: 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1',
      }
    : {
        tokenUrl: 'https://portal.api.bolagsverket.se/oauth2/token',
        apiBaseUrl: 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1',
      }
}

/** `accept` bara när det står uttryckligen — vilken miljö vi är i gissas aldrig. */
export function configuredEnv(value: string | null | undefined): BolagsverketEnv {
  return value?.trim().toLowerCase() === 'accept' ? 'accept' : 'production'
}

/** En värd tillhör acceptansmiljön om den bär `-accept` i namnet. */
function hostEnv(url: string): BolagsverketEnv {
  return /-accept/.test(url) ? 'accept' : 'production'
}

/**
 * Läses per anrop, inte vid modulladdning — annars fryses värdet in i bygget.
 * BOLAGSVERKET_ENV är normalvägen; de två URL-variablerna finns kvar som
 * undantag och är enda sättet att få värdarna att glida isär, därav vakten.
 */
function endpoints(): { tokenUrl: string; apiBaseUrl: string; mismatch: boolean } {
  const parad = bolagsverketHosts(configuredEnv(process.env.BOLAGSVERKET_ENV))
  const tokenUrl = process.env.BOLAGSVERKET_TOKEN_URL || parad.tokenUrl
  const apiBaseUrl = process.env.BOLAGSVERKET_API_BASE_URL || parad.apiBaseUrl
  return { tokenUrl, apiBaseUrl, mismatch: hostEnv(tokenUrl) !== hostEnv(apiBaseUrl) }
}

export interface BolagsverketAddress {
  street: string | null
  postalCode: string | null
  city: string | null
}

export interface BolagsverketCompany {
  name: string | null
  companyForm: string | null
  address: BolagsverketAddress | null
  sniCode: string | null
  description: string | null
}

export type BolagsverketLookupResult =
  | { ok: true; data: BolagsverketCompany }
  | {
      ok: false
      /**
       * `not_authorized` skiljer "nycklarna/miljön är fel" från "tjänsten
       * svarade inte" (`request_failed`). Innan den skillnaden fanns såg alla
       * tre felfallen likadana ut för både användaren och oss.
       */
      reason: 'not_configured' | 'not_authorized' | 'not_found' | 'invalid_response' | 'request_failed' | 'rate_limited'
    }

type TokenResult = { ok: true; accessToken: string } | { ok: false; reason: 'not_authorized' | 'request_failed' }

interface CachedToken {
  accessToken: string
  expiresAtMs: number
}

let cachedToken: CachedToken | null = null

/**
 * Ren. Ingen I/O. 60s marginal — hellre hämta en ny token en aning för
 * tidigt än att skicka ett uppslag med en token som hinner löpa ut under
 * flykten.
 */
export function isTokenValid(token: CachedToken | null, nowMs: number): boolean {
  if (!token) return false
  return token.expiresAtMs - 60_000 > nowMs
}

async function fetchAccessToken(clientId: string, clientSecret: string, url: string): Promise<TokenResult> {
  if (isTokenValid(cachedToken, Date.now())) return { ok: true, accessToken: (cachedToken as CachedToken).accessToken }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: SCOPE,
      }),
    })
    if (!res.ok) {
      // URL:en med i loggen: en 404 här betyder fel VÄRD, inte fel nyckel.
      console.error('[bolagsverket] token-hämtning misslyckades:', res.status, url)
      // 400 invalid_client och 401/403 = nycklarna eller miljön; allt annat = tjänsten.
      return { ok: false, reason: [400, 401, 403].includes(res.status) ? 'not_authorized' : 'request_failed' }
    }
    const json: any = await res.json()
    if (typeof json.access_token !== 'string') {
      console.error('[bolagsverket] token-svaret saknade access_token:', url)
      return { ok: false, reason: 'request_failed' }
    }
    const expiresInSec = typeof json.expires_in === 'number' ? json.expires_in : 300
    cachedToken = { accessToken: json.access_token, expiresAtMs: Date.now() + expiresInSec * 1000 }
    return { ok: true, accessToken: cachedToken.accessToken }
  } catch (err) {
    console.error('[bolagsverket] token-hämtning kastade:', url, err instanceof Error ? err.message : err)
    return { ok: false, reason: 'request_failed' }
  }
}

function extractFirstNamn(namnObj: Record<string, unknown>): string | null {
  const lista = namnObj.organisationsnamnLista
  if (!Array.isArray(lista) || lista.length === 0) return null
  const first = lista[0] as Record<string, unknown>
  return typeof first?.namn === 'string' ? first.namn : null
}

/**
 * Ren. Ingen I/O. Tolkar Bolagsverkets organisations-svar defensivt.
 * `null` om svaret inte innehåller NÅGOT vi känner igen — hellre ge upp
 * än att returnera ett objekt av bara `null`-fält som ser ut som ett
 * lyckat, tomt svar.
 */
export function parseOrganisationResponse(raw: unknown): BolagsverketCompany | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const namnObj = obj.organisationsnamn as Record<string, unknown> | undefined
  const name = namnObj ? extractFirstNamn(namnObj) : null

  const formObj = obj.organisationsform as Record<string, unknown> | undefined
  const companyForm = typeof formObj?.klartext === 'string' ? formObj.klartext : null

  const adresser = obj.postadressOrganisation as Record<string, unknown> | undefined
  const address: BolagsverketAddress | null = adresser
    ? {
        street: typeof adresser.utdelningsadress === 'string' ? adresser.utdelningsadress : null,
        postalCode: typeof adresser.postnummer === 'string' ? adresser.postnummer : null,
        city: typeof adresser.postort === 'string' ? adresser.postort : null,
      }
    : null

  const sniList = obj.naringsgrensindelning as unknown[] | undefined
  const sniCode =
    Array.isArray(sniList) && sniList.length > 0 && typeof (sniList[0] as Record<string, unknown>)?.kod === 'string'
      ? ((sniList[0] as Record<string, unknown>).kod as string)
      : null

  if (!name && !companyForm && !address) return null

  return { name, companyForm, address, sniCode, description: null }
}

/**
 * IO. Hela vägen: saknade credentials → 'not_configured' direkt (ingen
 * nätverksrundtur). Token-fel/nätverksfel/oväntat svar → typat
 * `{ok:false, reason}`. Kastar ALDRIG — onboarding får aldrig stoppas av
 * att Bolagsverket-uppslaget gick fel.
 */
export async function lookupCompany(orgNumber: string): Promise<BolagsverketLookupResult> {
  const clientId = process.env.BOLAGSVERKET_CLIENT_ID
  const clientSecret = process.env.BOLAGSVERKET_CLIENT_SECRET
  if (!clientId || !clientSecret) return { ok: false, reason: 'not_configured' }

  const { tokenUrl, apiBaseUrl, mismatch } = endpoints()
  if (mismatch) {
    // Gå inte ut och hämta en token som gatewayen ändå kommer att avvisa —
    // 401:an hade sett ut som ett nyckelfel i stället för en felkonfiguration.
    console.error('[bolagsverket] token- och uppslagsvärd i olika miljöer:', tokenUrl, apiBaseUrl)
    return { ok: false, reason: 'not_configured' }
  }

  // Tolv siffror (PeOrgNr), inte tio — Bolagsverket avvisar det tiosiffriga.
  const identitetsbeteckning = orgNumberIdentity(orgNumber)
  if (!identitetsbeteckning) return { ok: false, reason: 'not_found' }

  const token = await fetchAccessToken(clientId, clientSecret, tokenUrl)
  if (!token.ok) return { ok: false, reason: token.reason }

  const url = `${apiBaseUrl}/organisationer`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.accessToken}`,
      },
      body: JSON.stringify({ identitetsbeteckning }),
    })

    if (res.status === 429) return { ok: false, reason: 'rate_limited' }
    if (res.status === 404) return { ok: false, reason: 'not_found' }
    if (res.status === 401 || res.status === 403) {
      console.error('[bolagsverket] uppslag nekades:', res.status, url)
      return { ok: false, reason: 'not_authorized' }
    }
    if (!res.ok) {
      console.error('[bolagsverket] uppslag misslyckades:', res.status, url)
      return { ok: false, reason: 'request_failed' }
    }

    const json = await res.json()
    const parsed = parseOrganisationResponse(json)
    if (!parsed) return { ok: false, reason: 'invalid_response' }
    return { ok: true, data: parsed }
  } catch (err) {
    console.error('[bolagsverket] uppslag kastade:', url, err instanceof Error ? err.message : err)
    return { ok: false, reason: 'request_failed' }
  }
}
