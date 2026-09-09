import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

// Facit för 46elks webhookgrind.
//
// 2026-09-10. Bakgrund: den gamla grinden verifierade en HMAC i headern
// `X-46elks-Signature`. Headern finns inte i 46elks dokumenterade webhook.
// Produktionsloggen sa "Ingen X-46elks-Signature header i webhook" på varje
// anrop, och alla åtta rutter svarade 401 i elva dagar: noll samtal fångade,
// noll inkommande SMS någonsin. Avslaget skrev bara console.error, så
// ingenting larmade. Två befintliga facit intygade samtidigt att signaturen
// "kontrolleras före allt annat" — de vaktade buggen.
//
// Det här facit provar tre saker som var och en hade fångat felet:
// grinden ska vara den som kan släppa igenom ett riktigt anrop, avslaget ska
// larma, och varje adress vi lämnar till 46elks ska bära hemligheten.

const ROT = join(__dirname, '..')
const las = (p: string) => readFileSync(join(ROT, p), 'utf8')

const GRINDADE_RUTTER = [
  'app/api/sms/incoming/route.ts',
  'app/api/voice/consent/route.ts',
  'app/api/voice/greeting/route.ts',
  'app/api/voice/incoming/route.ts',
  'app/api/voice/missed/route.ts',
  'app/api/voice/outbound/route.ts',
  'app/api/voice/outbound/hangup/route.ts',
  'app/api/voice/recording/route.ts',
]

test('alla åtta rutter använder grinden och larmar vid avslag', () => {
  for (const rutt of GRINDADE_RUTTER) {
    const s = las(rutt)
    expect(s, `${rutt} saknar webhookgrind`).toContain('verifieraElksWebhook')
    expect(s, `${rutt} avvisar tyst — elva dagars tystnad började så`)
      .toContain('larmaAvvisadElksWebhook')
  }
})

test('den gamla signaturmekanismen används inte längre', () => {
  for (const rutt of GRINDADE_RUTTER) {
    expect(las(rutt), `${rutt} använder headern 46elks aldrig skickar`)
      .not.toContain('verifyElksSignature')
  }
})

test('varje adress vi lämnar till 46elks bär hemligheten', () => {
  // Missas en enda 401:ar den MITT I ett pågående samtal, vilket är värre än
  // att aldrig svara: kunden hör tystnad efter att ha blivit kopplad.
  const falt = ['whenhangup', 'recordcall', 'next', 'voice_start', 'sms_url', 'ivr']
  const filer = [
    'app/api/voice/incoming/route.ts',
    'app/api/voice/consent/route.ts',
    'app/api/voice/outbound/route.ts',
    'app/api/voice/outbound/start/route.ts',
    'lib/phone/purchase-number.ts',
    'app/api/phone/provision/route.ts',
  ]
  // Detektionen får INTE bero på hur raden är formaterad. Ett tidigare utkast
  // krävde `${` direkt efter kolon, och missade därför en rad där hemligheten
  // tagits bort men en parentes lagts till — mutationsprovet gick igenom.
  // Nu: raden räknas som en utlämnad adress så snart den nämner ett fält OCH
  // en av våra webhook-sökvägar.
  let granskade = 0
  for (const fil of filer) {
    for (const rad of las(fil).split('\n')) {
      if (!/\/api\/(voice|sms)\//.test(rad)) continue
      const traff = falt.find(f => new RegExp(`["']?\\b${f}\\b["']?\\s*:`).test(rad))
      if (!traff) continue
      granskade++
      expect(rad.includes('medElksHemlighet'),
        `${fil}: ${traff} lämnas till 46elks utan hemlighet — det anropet 401:ar mitt i samtalet\n  ${rad.trim()}`
      ).toBe(true)
    }
  }
  // Skyddar mot att detektionen tystnar helt om formatteringen ändras.
  expect(granskade, 'inga utlämnade adresser hittades — detektionen är trasig')
    .toBeGreaterThanOrEqual(12)
})

test('grinden faller stängt utan hemlighet, och skip-flaggan är den enda genvägen', () => {
  const s = las('lib/elks-webhook-auth.ts')
  expect(s).toMatch(/ELKS_SKIP_SIGNATURE === 'true'/)
  expect(s, 'utan hemlighet i miljön måste grinden neka, inte släppa igenom')
    .toMatch(/if \(!forvantad\) return \{ ok: false/)
  expect(s, 'jämförelsen måste vara konstant i tid').toContain('timingSafeEqual')
})

test('hemligheten loggas aldrig', () => {
  const s = las('lib/elks-webhook-auth.ts')
  // Larmet får bära rutt och skäl — aldrig nyckeln, varken den givna eller
  // den förväntade. En hemlighet i en logg är en hemlighet som läckt.
  const larmBlock = s.slice(s.indexOf('export function larmaAvvisadElksWebhook'))
  expect(larmBlock).not.toMatch(/given|forvantad|ELKS_WEBHOOK_SECRET/)
})
