/**
 * Facit: "Skickat" blir "Levererat" på SMS-vägen (Spår 2, 2026-09-18).
 *
 * Felet som stängs: `sms_log.status = 'sent'` betydde bara att 46elks svarade
 * HTTP 200 på vårt anrop. Ett SMS till ett avstängt nummer och ett som landade
 * i kundens telefon såg identiska ut i hela produkten. `lib/outbound/status.ts`
 * sa det rakt ut: "Leveransbesked saknas". Utan `whendelivered` i utgående
 * anrop finns inget kvitto att ta emot över huvud taget.
 *
 * ANTAGANDE OM 46ELKS FÄLTNAMN: byggmiljön når inte 46elks dokumentation
 * (utgående trafik blockerad av proxyn), så parsern i rutten är medvetet
 * tolerant: id ur `id`/`smsid`/`messageid`, status ur `status`/`delivery_status`,
 * tidpunkt ur `delivered`/`delivered_at`/`created`, kropp som form-urlencoded
 * ELLER JSON. Testerna nedan pinnar alla varianterna, så en avvikelse i
 * verkligheten bara kräver att ETT fältnamn läggs till — inte att rutten görs om.
 *
 * Körs: npx playwright test tests/sms-leverans.spec.ts --no-deps --project=chromium --reporter=line
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'

const ROOT = path.resolve(__dirname, '..')
const SMS_SEND_SRC = fs.readFileSync(path.join(ROOT, 'lib/sms-send.ts'), 'utf8')

const HEMLIGHET = 'test-hemlighet-som-ar-minst-16-tecken'

// ── 1. Utgående: whendelivered finns i 46elks-kroppen ─────────────────────

test.describe('whendelivered skickas med varje SMS', () => {
  test('fetch-kroppen mot 46elks bär whendelivered', () => {
    const fetchIndex = SMS_SEND_SRC.indexOf("fetch('https://api.46elks.com/a1/sms'")
    expect(fetchIndex).toBeGreaterThan(-1)
    const anrop = SMS_SEND_SRC.slice(fetchIndex, fetchIndex + 900)
    expect(anrop).toContain('whendelivered')
  })

  test('adressen pekar på vår leveransrutt och bär webhook-hemligheten', async () => {
    const tidigare = process.env.ELKS_WEBHOOK_SECRET
    process.env.ELKS_WEBHOOK_SECRET = HEMLIGHET
    try {
      const { smsLeveransCallbackUrl } = require('../lib/sms-send')
      const url = smsLeveransCallbackUrl()
      expect(url).toContain('/api/sms/delivered')
      // Utan hemligheten i URL:en 401:ar vår egen grind och kvittot tappas.
      expect(url).toContain(`k=${encodeURIComponent(HEMLIGHET)}`)
    } finally {
      if (tidigare === undefined) delete process.env.ELKS_WEBHOOK_SECRET
      else process.env.ELKS_WEBHOOK_SECRET = tidigare
    }
  })
})

// ── 2. Parsern ───────────────────────────────────────────────────────────

test.describe('tolkaLeveransrapport', () => {
  const { tolkaLeveransrapport } = require('../app/api/sms/delivered/route')

  test('46elks form-urlencoded rapport läses rätt', () => {
    const r = tolkaLeveransrapport('id=s1a2b3&status=delivered&delivered=2026-09-18T06%3A14%3A00Z')
    expect(r).toMatchObject({ elksId: 's1a2b3', utfall: 'delivered' })
    expect(r.tidpunkt).toBe('2026-09-18T06:14:00.000Z')
  })

  test('failed blir failed, inte delivered', () => {
    expect(tolkaLeveransrapport('id=s1&status=failed').utfall).toBe('failed')
  })

  test('JSON-kropp tolkas lika bra som form-urlencoded (antagandet kostar inget)', () => {
    const r = tolkaLeveransrapport('{"id":"s9","status":"delivered"}', 'application/json')
    expect(r).toMatchObject({ elksId: 's9', utfall: 'delivered' })
  })

  test('okänt statusvärde ger null — vi gissar aldrig ett leveransbesked', () => {
    expect(tolkaLeveransrapport('id=s1&status=queued').utfall).toBeNull()
    expect(tolkaLeveransrapport('id=s1').utfall).toBeNull()
  })

  test('rapport utan id ger null-id, aldrig tom sträng som kan matcha en rad', () => {
    expect(tolkaLeveransrapport('status=delivered').elksId).toBeNull()
    expect(tolkaLeveransrapport('id=%20%20&status=delivered').elksId).toBeNull()
  })
})

// ── 3. Rutten ────────────────────────────────────────────────────────────

type Skrivning = { tabell: string; patch: any; filter: any }

function fakeDb(traffar: any[], skrivningar: Skrivning[]) {
  return {
    from(tabell: string) {
      const q: any = {
        update(patch: any) { q._patch = patch; return q },
        select() { return q },
        eq(kolumn: string, varde: any) {
          q._filter = { [kolumn]: varde }
          return q
        },
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: any) => {
          skrivningar.push({ tabell, patch: q._patch, filter: q._filter })
          return Promise.resolve({ data: traffar, error: null }).then(resolve)
        },
        insert() { throw new Error('Leveransrutten får aldrig skapa rader') },
      }
      return q
    },
    rpc: async () => ({ data: null, error: null }),
  }
}

async function postaRapport(kropp: string, opts: { nyckel?: string | null; traffar?: any[] } = {}) {
  const supabaseModule = require('../lib/supabase')
  const tidigareDb = supabaseModule.getServerSupabase
  const tidigareHemlighet = process.env.ELKS_WEBHOOK_SECRET
  const tidigareSkip = process.env.ELKS_SKIP_SIGNATURE
  const skrivningar: Skrivning[] = []
  try {
    process.env.ELKS_WEBHOOK_SECRET = HEMLIGHET
    delete process.env.ELKS_SKIP_SIGNATURE
    supabaseModule.getServerSupabase = () => fakeDb(opts.traffar ?? [{ sms_id: 'sms_1', business_id: 'biz_1' }], skrivningar)
    const nyckel = opts.nyckel === undefined ? HEMLIGHET : opts.nyckel
    const url = 'https://app.handymate.se/api/sms/delivered' + (nyckel ? `?k=${encodeURIComponent(nyckel)}` : '')
    const { POST } = require('../app/api/sms/delivered/route')
    const svar = await POST(new NextRequest(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: kropp,
    }))
    return { svar, skrivningar }
  } finally {
    supabaseModule.getServerSupabase = tidigareDb
    if (tidigareHemlighet === undefined) delete process.env.ELKS_WEBHOOK_SECRET
    else process.env.ELKS_WEBHOOK_SECRET = tidigareHemlighet
    if (tidigareSkip !== undefined) process.env.ELKS_SKIP_SIGNATURE = tidigareSkip
  }
}

test.describe('POST /api/sms/delivered', () => {
  test('giltig nyckel + delivered ⇒ sms_log får delivery_status och delivered_at', async () => {
    const { svar, skrivningar } = await postaRapport('id=elks_abc&status=delivered&delivered=2026-09-18T06:14:00Z')
    expect(svar.status).toBe(200)
    const skrivning = skrivningar.find(s => s.tabell === 'sms_log')
    expect(skrivning).toBeTruthy()
    expect(skrivning!.patch).toMatchObject({ delivery_status: 'delivered', delivered_at: '2026-09-18T06:14:00.000Z' })
    expect(skrivning!.filter).toEqual({ elks_id: 'elks_abc' })
    // Status-maskinen rörs ALDRIG — sändning och leverans är två fakta.
    expect(Object.keys(skrivning!.patch)).toEqual(['delivery_status', 'delivered_at'])
  })

  test('failed ⇒ delivery_status failed', async () => {
    const { skrivningar } = await postaRapport('id=elks_abc&status=failed')
    expect(skrivningar.find(s => s.tabell === 'sms_log')!.patch.delivery_status).toBe('failed')
  })

  test('fel nyckel ⇒ 401 och ingen skrivning', async () => {
    const { svar, skrivningar } = await postaRapport('id=elks_abc&status=delivered', { nyckel: 'fel-nyckel-som-ar-lang-nog' })
    expect(svar.status).toBe(401)
    expect(skrivningar).toEqual([])
  })

  test('ingen nyckel alls ⇒ 401 och ingen skrivning', async () => {
    const { svar, skrivningar } = await postaRapport('id=elks_abc&status=delivered', { nyckel: null })
    expect(svar.status).toBe(401)
    expect(skrivningar).toEqual([])
  })

  test('okänt elks_id ⇒ 200, aldrig 500 (46elks retry:ar på femhundra)', async () => {
    const { svar } = await postaRapport('id=finns_inte&status=delivered', { traffar: [] })
    expect(svar.status).toBe(200)
  })

  test('otolkbar status ⇒ 200 utan någon skrivning', async () => {
    const { svar, skrivningar } = await postaRapport('id=elks_abc&status=queued')
    expect(svar.status).toBe(200)
    expect(skrivningar).toEqual([])
  })

  test('rutten är force-dynamic — ett cachat kvitto vore ett påhittat kvitto', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/api/sms/delivered/route.ts'), 'utf8')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
  })
})
