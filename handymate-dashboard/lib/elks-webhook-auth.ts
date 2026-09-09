import { createHash, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import { rapporteraTillSentry } from '@/lib/observability/sentry'

/**
 * Autentisering av inkommande webhooks från 46elks.
 *
 * Bakgrund (2026-09-09, telefonprovet). Den tidigare implementationen
 * verifierade en HMAC i headern `X-46elks-Signature`. Den headern finns inte:
 * 46elks dokumenterade webhook postar `direction`, `callid`, `from`, `to` och
 * `created` som form-urlencoded, utan autentiseringssteg. Produktionsloggen
 * sa `[elks-signature] Ingen X-46elks-Signature header i webhook` på varje
 * anrop. Följden var att ALLA åtta grindade rutter svarade 401 i elva dagar:
 * inkommande samtal, inkommande SMS, hälsning, medgivande, inspelning och
 * utgående-callbackarna. Noll samtal fångades. Noll SMS togs emot — någonsin.
 * Och avslaget skrev bara `console.error`, så ingenting larmade.
 *
 * Eftersom anropet inte bär någon hemlighet av sig själv är URL:en det enda
 * stället en delad hemlighet kan bo — och vi äger varje URL 46elks anropar
 * (`voice_start` och `sms_url` på numret, plus `whenhangup`, `next`,
 * `recordcall` och `play` som vi själva returnerar). Därför: en hemlighet i
 * frågesträngen, jämförd i konstant tid.
 *
 * Det här är svagare än en signatur över kroppen — en hemlighet i en URL kan
 * hamna i loggar hos mellanhänder. Det är ändå ojämförligt starkare än i dag
 * (ingen autentisering alls, via ELKS_SKIP_SIGNATURE) och det är det starkaste
 * som är möjligt med den payload 46elks faktiskt skickar. Finns en riktig
 * signaturmekanism hos dem att slå på, ersätt den här modulen med den.
 *
 * Migrering utan avbrott: `ELKS_SKIP_SIGNATURE=true` fortsätter släppa igenom.
 * Ordningen är (1) deploya det här, (2) sätt ELKS_WEBHOOK_SECRET, (3) uppdatera
 * numrens voice_start/sms_url med `?k=<hemlighet>`, (4) ta bort skip-flaggan.
 * Mellan steg 1 och 4 fungerar båda vägarna.
 */

export const ELKS_HEMLIGHET_PARAM = 'k'

export type ElksWebhookVerdikt =
  | { ok: true; via: 'hemlighet' | 'skip_flagga' }
  | { ok: false; skal: 'hemlighet_saknas_i_miljon' | 'ingen_nyckel_i_url' | 'fel_nyckel' }

function hemlighet(): string | null {
  const v = process.env.ELKS_WEBHOOK_SECRET
  return v && v.length >= 16 ? v : null
}

/** Konstant tid oavsett längd: jämför hashar, inte råa strängar. */
function likaHemligheter(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Verifierar ett inkommande 46elks-anrop. Kastar aldrig.
 *
 * Skip-flaggan kontrolleras FÖRE hemligheten, så en miljö mitt i migreringen
 * inte kan låsa ut sig själv genom en halvsatt hemlighet.
 */
export function verifieraElksWebhook(request: NextRequest): ElksWebhookVerdikt {
  if (process.env.ELKS_SKIP_SIGNATURE === 'true') return { ok: true, via: 'skip_flagga' }

  const forvantad = hemlighet()
  if (!forvantad) return { ok: false, skal: 'hemlighet_saknas_i_miljon' }

  const given = request.nextUrl.searchParams.get(ELKS_HEMLIGHET_PARAM)
  if (!given) return { ok: false, skal: 'ingen_nyckel_i_url' }
  if (!likaHemligheter(given, forvantad)) return { ok: false, skal: 'fel_nyckel' }

  return { ok: true, via: 'hemlighet' }
}

/**
 * Larmar när ett anrop avvisas.
 *
 * Hela poängen med den här modulen: elva dagars total tystnad var möjlig
 * eftersom avslaget bara nådde konsolen. Ett avvisat samtalsanrop är per
 * definition ett tappat kundsamtal och ska aldrig vara tyst. Hemligheten
 * loggas aldrig — bara skälet och vilken rutt det gällde.
 */
export function larmaAvvisadElksWebhook(rutt: string, verdikt: ElksWebhookVerdikt): void {
  if (verdikt.ok) return
  console.error('[elks-webhook] avvisade anrop', { rutt, skal: verdikt.skal })
  rapporteraTillSentry({
    meddelande: `tyst_fel/elks_webhook_avvisad`,
    niva: 'error',
    tags: { kalla: 'elks_webhook_avvisad', rutt, skal: verdikt.skal },
    extra: { rutt, skal: verdikt.skal },
  })
}

/**
 * Lägger hemligheten på en callback-adress vi lämnar till 46elks.
 *
 * Varje adress vi returnerar i ett call action-svar (`whenhangup`, `next`,
 * `recordcall`, `play`, `ivr`) anropas av 46elks och går därför genom samma
 * grind. Utan hemligheten 401:ar den mitt i ett pågående samtal, vilket är
 * värre än att aldrig svara. Saknas hemligheten i miljön returneras adressen
 * oförändrad — då gäller skip-flaggan, och att lägga på en tom nyckel skulle
 * bara göra felsökningen svårare.
 */
export function medElksHemlighet(url: string): string {
  const h = hemlighet()
  if (!h) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${ELKS_HEMLIGHET_PARAM}=${encodeURIComponent(h)}`
}
