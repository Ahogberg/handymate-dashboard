/**
 * Bolagsverket "värdefulla datamängder"-klient (2026-08-15).
 *
 * VERIFIERAT 2026-09-18 mot Bolagsverkets officiella OpenAPI-fil
 * ("VärdefullaDatamängder v1", devportal → Download Swagger). Fram till dess
 * var både anropets payload och svarets fältnamn en välgrundad gissning, och
 * gissningen var fel på varje punkt som räknades:
 *
 *   1. `identitetsbeteckning` är TIO siffror för ett organisationsnummer och
 *      TOLV bara för ett personnummer (enskild näringsidkare). Koden satte
 *      `16` framför alla tio — se orgNumberIdentity i lib/karin/org-number.ts.
 *   2. Svaret är `{ organisationer: [ … ] }`, inte ett platt objekt. Tolkningen
 *      läste varje fält en nivå för högt och hade aldrig hittat ett företag.
 *   3. Adressen ligger under `postadressOrganisation.postadress`, inte direkt
 *      under `postadressOrganisation`.
 *   4. Näringsgrenen heter `naringsgrenOrganisation.sni`, inte
 *      `naringsgrensindelning`.
 *   5. En `identitetsbeteckning` kan bära FLERA organisationer — en enskild
 *      näringsidkare får ett `namnskyddslopnummer` per firma på samma
 *      personnummer, och Bolagsverkets eget exempel returnerar två.
 *   6. `organisationsnamnLista` blandar företagsnamn, särskilt företagsnamn och
 *      namn på främmande språk; `[0]` är inte nödvändigtvis firmanamnet.
 *
 * Tidigare verifierat 2026-09-17 mot deras "Connection establishment guide"
 * v1.01: värdarna, `POST /organisationer`, grant type, `Content-Type`,
 * nycklarna i kroppen (inte Basic auth), `Bearer`-prefixet och `expires_in`.
 *
 * Testmiljön accept2 tar bara vissa organisationsnummer (anvisningens §6.1).
 *
 * RÄTTAT 2026-09-17 efter skarpt fel i onboardingen ("Kunde inte nå
 * Bolagsverket just nu", körloggen: `token-hämtning misslyckades: 404`):
 * tokens mintas på PORTAL-värden, inte på gateway-värden. Uppslaget går mot
 * `gw.api.bolagsverket.se`, men `/oauth2/token` finns bara på
 * `portal.api.bolagsverket.se`. Den gamla gateway-URL:en gav 404.
 * Miljön väljs med `BOLAGSVERKET_ENV` (`accept`/`production`), som tar BÅDA
 * värdarna på en gång. En token från acceptansmiljön avvisas av
 * produktionsgatewayen — värdarna hör ihop parvis och får aldrig sättas var för
 * sig. De två URL-variablerna finns kvar som undantag; sätts de så att värdarna
 * hamnar i olika miljöer stoppas uppslaget av vakten i `endpoints()` i stället
 * för att ge ett obegripligt 401.
 *
 * DIAGNOSTIK 2026-09-18 efter att samma uppslag gav 401 i stället för 404:
 * statusen ensam räcker inte. OAuth-felsvaret bär en `error`-kod, och
 * Bolagsverkets eget felsvar följer RFC 7807 med `instance`, `code`, `source`
 * och `requestId` — allt loggas nu. `title`/`detail` loggas MEDVETET inte: de
 * är fritext som kan bära tillbaka det vi skickade in, och för en enskild firma
 * är det ett personnummer. Nycklarna maskas ur token-felet (Bolagsverket ekar
 * tillbaka client_id i `invalid_client`) och trimmas innan de skickas.
 *
 * Fail-soft genomgående, samma disciplin som app/api/onboarding/
 * scrape-website/route.ts: saknade credentials, nätverksfel och
 * oväntade svar ger alla ett typat `{ok:false, reason}` — aldrig ett
 * kastat fel som stoppar onboarding. Varje misslyckande loggar status OCH
 * URL: utan URL:en i loggen tog 404:an ovan en felsökningsrunda extra.
 */
import { randomUUID } from 'crypto'
import { orgNumberIdentity } from '@/lib/karin/org-number'

/**
 * Båda scopen, mellanslagsseparerade, precis som anslutningsanvisningens
 * exempel (§5.1). Anvisningen är uttrycklig: "the API resources are also
 * protected by scopes which must be declared in the request when fetching a
 * token. If they are not present in the token, subsequent calls to the APIs
 * resources using that token will fail." `read` räcker för /organisationer och
 * `ping` för /isalive — vi hämtar båda i samma token, som exemplet gör, hellre
 * än att servera en token som saknar det anropet behöver.
 */
const SCOPE = 'vardefulla-datamangder:read vardefulla-datamangder:ping'

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
  /** Värden token mintades mot. En acceptans-token duger inte mot produktion. */
  tokenUrl: string
}

let cachedToken: CachedToken | null = null

/**
 * Ren. Ingen I/O. 60s marginal — hellre hämta en ny token en aning för
 * tidigt än att skicka ett uppslag med en token som hinner löpa ut under
 * flykten.
 *
 * URL:en är med i jämförelsen: byter BOLAGSVERKET_ENV under en varm lambda
 * hade den gamla miljöns token annars serverats mot den nya gatewayen, och
 * svaret blivit ett 401 som inte säger något om varför.
 */
export function isTokenValid(token: CachedToken | null, nowMs: number, tokenUrl: string): boolean {
  if (!token) return false
  if (token.tokenUrl !== tokenUrl) return false
  return token.expiresAtMs - 60_000 > nowMs
}

/**
 * Felsvarets kropp, truncerad och maskad. OAuth-fel bär en maskinläsbar
 * `error`-kod som är hela skillnaden mellan "fel nyckel" och "fel miljö" —
 * utan den står det bara `401` i körloggen och nästa runda blir en gissning
 * till. Kastar aldrig: ett trasigt felsvar får inte bli ett nytt fel ovanpå
 * det vi försöker läsa.
 *
 * MASKNINGEN är inte teoretisk. Bolagsverkets `invalid_client`-svar lyder
 * ordagrant "A valid OAuth client could not be found for client_id: …" —
 * nyckeln kommer alltså tillbaka i felet och hade annars hamnat i Vercels
 * körlogg. Secreten maskas också, för säkerhets skull.
 */
async function errorBody(res: Response, ...hemligheter: string[]): Promise<string> {
  try {
    const text = (await res.text()).slice(0, 300)
    return hemligheter.filter(Boolean).reduce((t, h) => t.split(h).join('***'), text)
  } catch {
    return '(kunde inte läsa svarskroppen)'
  }
}

/**
 * Bolagsverkets felsvar följer RFC 7807 — samma `ApiError`-kontrakt i hela
 * deras API-familj (bekräftat i Dokument-API:ts OpenAPI 2026-09-18, och
 * felkoderna där bär prefixet `urn:hb-kb-api:` som inte är Dokument-specifikt).
 * Fälten som intresserar oss är rena maskinkoder:
 *   instance  client.not-found | client.validation | client.not-supported | …
 *   code      leverantörens egen felkod, t.ex. FM130
 *   source    vilket FÄLT som var fel, t.ex. identitetsbeteckning
 *   requestId det Bolagsverkets support frågar efter när man hör av sig
 * plus `kod` ur valideringsmeddelanden/meddelanden.
 *
 * `title` och `detail` läses MEDVETET inte: de är fritext som kan bära
 * tillbaka det vi skickade in, och för en enskild firma är det ett
 * personnummer. Koderna räcker för att veta vad som gick fel. Kastar aldrig.
 */
export function apiErrorCodes(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '(inget läsbart felsvar)'
  const o = raw as Record<string, any>
  const koder = [...(o.valideringsmeddelanden || []), ...(o.meddelanden || [])]
    .map((m: any) => m?.kod)
    .filter((k: unknown): k is string => typeof k === 'string')
  const delar = [
    typeof o.instance === 'string' ? o.instance : null,
    typeof o.code === 'string' ? `kod=${o.code}` : null,
    typeof o.source === 'string' ? `fält=${o.source}` : null,
    koder.length ? `meddelandekoder=${koder.join('/')}` : null,
    typeof o.requestId === 'string' ? `requestId=${o.requestId}` : null,
  ].filter(Boolean)
  return delar.length ? delar.join(' ') : `(inga felkoder, fält: ${topLevelKeys(raw)})`
}

/** Felsvarets JSON, eller null. Kastar aldrig — ett trasigt felsvar är inte ett nytt fel. */
async function errorJson(res: Response): Promise<unknown> {
  try {
    return JSON.parse((await res.text()).slice(0, 4000))
  } catch {
    return null
  }
}

/**
 * Bara NYCKELNAMNEN ur ett svar vi inte kände igen — aldrig värdena. Det är
 * exakt vad som behövs för att laga tolkningen eller känna igen accept2:s
 * avvisningssvar, och det kan aldrig läcka en enskild firmas personuppgifter
 * till körloggen. Ren, ingen I/O.
 */
export function topLevelKeys(raw: unknown): string {
  if (Array.isArray(raw)) return `array(${raw.length})`
  if (!raw || typeof raw !== 'object') return raw === null ? 'null' : typeof raw
  return Object.keys(raw as Record<string, unknown>).join(',') || '(inga fält)'
}

async function fetchAccessToken(clientId: string, clientSecret: string, url: string): Promise<TokenResult> {
  if (isTokenValid(cachedToken, Date.now(), url)) return { ok: true, accessToken: (cachedToken as CachedToken).accessToken }

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
      // KROPPEN med: statusen ensam skiljer inte fel nyckel (`invalid_client`)
      // från saknat scope i prenumerationen (`invalid_scope`) från fel anrop
      // (`unsupported_grant_type`) — alla tre kommer som 400/401. Hemligheten
      // skickas men ekas aldrig tillbaka; request-kroppen loggas aldrig.
      console.error('[bolagsverket] token-hämtning misslyckades:', res.status, url, await errorBody(res, clientId, clientSecret))
      // 400 invalid_client och 401/403 = nycklarna eller miljön; allt annat = tjänsten.
      return { ok: false, reason: [400, 401, 403].includes(res.status) ? 'not_authorized' : 'request_failed' }
    }
    const json: any = await res.json()
    if (typeof json.access_token !== 'string') {
      console.error('[bolagsverket] token-svaret saknade access_token:', url)
      return { ok: false, reason: 'request_failed' }
    }
    const expiresInSec = typeof json.expires_in === 'number' ? json.expires_in : 300
    cachedToken = { accessToken: json.access_token, expiresAtMs: Date.now() + expiresInSec * 1000, tokenUrl: url }
    return { ok: true, accessToken: cachedToken.accessToken }
  } catch (err) {
    console.error('[bolagsverket] token-hämtning kastade:', url, err instanceof Error ? err.message : err)
    return { ok: false, reason: 'request_failed' }
  }
}

/** Svaret bär epok-millisekunder; vi läser inga datum ut i profilen än. */
type Block = Record<string, any> | null | undefined

/**
 * Vilken organisation svaret handlar om.
 *
 * En `identitetsbeteckning` kan bära FLERA organisationer: en enskild
 * näringsidkare får ett `namnskyddslopnummer` per firma på samma personnummer,
 * och Bolagsverkets eget svarsexempel returnerar två. Vi väljer den som inte är
 * avregistrerad — en avvecklad firma är sällan den kunden håller på att
 * registrera hos oss. Finns ingen aktiv tas den första, för att ge något
 * hellre än inget.
 *
 * Ren. Ingen I/O.
 */
export function valdOrganisation(organisationer: unknown[]): Record<string, any> | null {
  const giltiga = organisationer.filter((o): o is Record<string, any> => !!o && typeof o === 'object')
  if (giltiga.length === 0) return null
  return giltiga.find(o => !o.avregistreradOrganisation?.avregistreringsdatum) ?? giltiga[0]
}

/**
 * Företagsnamnet, inte vilket namn som helst.
 *
 * `organisationsnamnLista` blandar `FORETAGSNAMN`, `SARSKILT_FORETAGSNAMN` och
 * `FORETAGSNAMN_PA_FRAMMANDE_SPRAK` — Bolagsverkets exempel returnerar alla tre
 * för samma bolag, och ordningen är inte garanterad meningsbärande. Att ta
 * `[0]` kunde alltså fylla onboardingen med "Bicycle expert" i stället för
 * "Cykelbolaget AB". Vi tar `FORETAGSNAMN` och faller tillbaka på första
 * posten med ett namn.
 *
 * Ren. Ingen I/O.
 */
export function foretagsnamn(namnBlock: Block): string | null {
  const lista = namnBlock?.organisationsnamnLista
  if (!Array.isArray(lista)) return null
  const poster = lista.filter((p: any) => p && typeof p.namn === 'string' && p.namn.trim())
  const primart = poster.find((p: any) => p.organisationsnamntyp?.kod === 'FORETAGSNAMN')
  return (primart ?? poster[0])?.namn?.trim() ?? null
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Ren. Ingen I/O. Tolkar Bolagsverkets organisations-svar.
 *
 * VERIFIERAT 2026-09-18 mot deras OpenAPI för Värdefulla datamängder
 * (`OrganisationerSvar`) och båda svarsexemplen — aktiebolag och enskild
 * näringsidkare. Före det läste den här funktionen fälten på fel nivå rakt
 * igenom: svaret är `{ organisationer: [ … ] }`, inte ett platt objekt, och
 * adressen ligger under `postadressOrganisation.postadress`, inte direkt under
 * `postadressOrganisation`. Näringsgrenen heter `naringsgrenOrganisation.sni`,
 * inte `naringsgrensindelning`. Inget av det hade gett ett företag.
 *
 * Varje block bär ett eget `fel` och en `dataproducent` (Bolagsverket eller
 * SCB) — när en uppgiftskälla fallerar kommer blocket tomt, och då blir fältet
 * `null` av sig självt. Ingen särskild hantering behövs, men det är därför
 * enskilda fält kan saknas i ett i övrigt lyckat svar.
 *
 * `null` om svaret inte innehåller NÅGOT vi känner igen — hellre ge upp än att
 * returnera ett objekt av bara `null`-fält som ser ut som ett lyckat, tomt svar.
 */
export function parseOrganisationResponse(raw: unknown): BolagsverketCompany | null {
  if (!raw || typeof raw !== 'object') return null
  const organisationer = (raw as Record<string, unknown>).organisationer
  if (!Array.isArray(organisationer)) return null

  const org = valdOrganisation(organisationer)
  if (!org) return null

  const name = foretagsnamn(org.organisationsnamn)
  const companyForm = text(org.organisationsform?.klartext)

  const post = org.postadressOrganisation?.postadress
  const street = text(post?.utdelningsadress)
  const postalCode = text(post?.postnummer)
  const city = text(post?.postort)
  const address: BolagsverketAddress | null =
    street || postalCode || city ? { street, postalCode, city } : null

  const sni = org.naringsgrenOrganisation?.sni
  const sniCode = Array.isArray(sni) ? text(sni[0]?.kod) : null

  // Verksamhetsbeskrivningen kommer med radbrytningar och inledande blanksteg
  // i Bolagsverkets eget exempel ("\n       HANDEL MED SKOR.") — trimmas.
  const description = text(org.verksamhetsbeskrivning?.beskrivning)

  if (!name && !companyForm && !address) return null

  return { name, companyForm, address, sniCode, description }
}

/**
 * IO. Hela vägen: saknade credentials → 'not_configured' direkt (ingen
 * nätverksrundtur). Token-fel/nätverksfel/oväntat svar → typat
 * `{ok:false, reason}`. Kastar ALDRIG — onboarding får aldrig stoppas av
 * att Bolagsverket-uppslaget gick fel.
 */
export async function lookupCompany(orgNumber: string): Promise<BolagsverketLookupResult> {
  // Trimmade: ett avslutande radbryte i en inklistrad hemlighet ger ett 401
  // som ser ut som fel nyckel och inte syns någonstans i Vercels gränssnitt.
  const clientId = process.env.BOLAGSVERKET_CLIENT_ID?.trim()
  const clientSecret = process.env.BOLAGSVERKET_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return { ok: false, reason: 'not_configured' }

  const { tokenUrl, apiBaseUrl, mismatch } = endpoints()
  if (mismatch) {
    // Gå inte ut och hämta en token som gatewayen ändå kommer att avvisa —
    // 401:an hade sett ut som ett nyckelfel i stället för en felkonfiguration.
    console.error('[bolagsverket] token- och uppslagsvärd i olika miljöer:', tokenUrl, apiBaseUrl)
    return { ok: false, reason: 'not_configured' }
  }

  // Tio siffror för ett organisationsnummer, tolv för ett personnummer —
  // Bolagsverkets OpenAPI och båda anropsexemplen säger samma sak.
  const identitetsbeteckning = orgNumberIdentity(orgNumber)
  if (!identitetsbeteckning) return { ok: false, reason: 'not_found' }

  const token = await fetchAccessToken(clientId, clientSecret, tokenUrl)
  if (!token.ok) return { ok: false, reason: token.reason }

  const url = `${apiBaseUrl}/organisationer`
  const requestId = randomUUID()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.accessToken}`,
        // Dokumenterad i deras OpenAPI: klientgenererat id som kommer tillbaka
        // som `requestId` i felsvaret. Det är det Bolagsverkets support frågar
        // efter, och utan det kan vi inte peka på ett enskilt anrop.
        'X-Request-Id': requestId,
      },
      body: JSON.stringify({ identitetsbeteckning }),
    })

    if (res.status === 429) return { ok: false, reason: 'rate_limited' }
    if (res.status === 404) {
      // En 404 kan vara "företaget finns inte" (`client.not-found`) ELLER fel
      // sökväg — exakt den tvetydighet som kostade en felsökningsrunda i
      // september. Felkoden skiljer dem åt.
      console.error('[bolagsverket] inget företag på uppslaget:', url, requestId, apiErrorCodes(await errorJson(res)))
      return { ok: false, reason: 'not_found' }
    }
    if (res.status === 401 || res.status === 403) {
      console.error('[bolagsverket] uppslag nekades:', res.status, url, requestId, apiErrorCodes(await errorJson(res)))
      return { ok: false, reason: 'not_authorized' }
    }
    if (!res.ok) {
      // 400 här betyder `client.validation` med `source` = fältet som var fel.
      // Det är svaret på om identitetsbeteckning ska vara tio eller tolv siffror.
      console.error('[bolagsverket] uppslag misslyckades:', res.status, url, requestId, apiErrorCodes(await errorJson(res)))
      return { ok: false, reason: 'request_failed' }
    }

    const json = await res.json()
    const parsed = parseOrganisationResponse(json)
    if (!parsed) {
      // Utan det här är `invalid_response` blint. Nyckelnamnen säger om det är
      // accept2:s uppräkning av tillåtna testnummer (§6.1) eller ett riktigt
      // företagssvar vars fältnamn vi gissat fel på — och bara namnen, så en
      // enskild firmas uppgifter aldrig hamnar i körloggen.
      console.error('[bolagsverket] svaret gick inte att tolka:', url, requestId, 'fält:', topLevelKeys(json))
      return { ok: false, reason: 'invalid_response' }
    }
    return { ok: true, data: parsed }
  } catch (err) {
    console.error('[bolagsverket] uppslag kastade:', url, err instanceof Error ? err.message : err)
    return { ok: false, reason: 'request_failed' }
  }
}
