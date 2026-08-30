/**
 * Facit för leverantörsstopp-härdningen (P0 2026-08-31: Anthropic-
 * krediterna tog slut fredag lunch, alla kunder fick generiska fel i två
 * dygn, ingen larmades — samma mönster som 46elks-saldot).
 *
 * Körs utan browser/session:
 *   npx playwright test tests/provider-outage.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  classifyProviderOutage,
  alertProviderOutageThrottled,
  __resetOutageAlertThrottleForTest,
  PROVIDER_OUTAGE_REPLY,
} from '../lib/ai/provider-outage'

const ROOT = path.resolve(__dirname, '..')

// Det VERKLIGA felet, ordagrant ur prod 2026-08-31 (req_011CeZmaEwTbTNNkPZcgjXnd).
const VERKLIGA_KREDITFELET =
  'Anthropic 400: {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CeZmaEwTbTNNkPZcgjXnd"}'

test.describe('klassificeringen känner igen kreditstoppet — och inget annat', () => {
  test('det verkliga prod-felet klassas som credit', () => {
    expect(classifyProviderOutage(new Error(VERKLIGA_KREDITFELET))).toBe('credit')
  })

  test('vanliga fel låtsas ALDRIG vara leverantörsstopp', () => {
    for (const fel of [
      new Error('TypeError: Cannot read properties of null'),
      new Error('fetch failed'),
      new Error('Anthropic 429: rate limited'),
      // 'credit balance' UTAN leverantörsnamnet → ska inte klassas.
      new Error('OpenAI 400: credit balance too low'),
      null,
      undefined,
      'strängfel',
    ]) {
      expect(classifyProviderOutage(fel), String(fel)).toBeNull()
    }
  })

  test('kundtexten är ärlig — inte "Något gick fel"', () => {
    expect(PROVIDER_OUTAGE_REPLY).toContain('tillfälligt otillgänglig')
    expect(PROVIDER_OUTAGE_REPLY).not.toContain('Något gick fel')
  })
})

test.describe('larmet är throttlat och okastbart', () => {
  const grönEnv = {
    ELKS_API_USER: 'u',
    ELKS_API_PASSWORD: 'p',
    HANDYMATE_SUPPORT_ALERT_PHONES: '+46700000001',
  }

  function fakeFetchSomRaknar(rakning: { n: number }): typeof fetch {
    return (async () => {
      rakning.n++
      return { ok: true } as Response
    }) as typeof fetch
  }

  test('första anropet larmar, andra inom en timme gör det INTE', async () => {
    __resetOutageAlertThrottleForTest()
    const rakning = { n: 0 }
    // Startar en bra bit efter epoken — throttlefältet initieras till 0,
    // så en fejkklocka nära 1970 hade sett ut som "nyss larmat".
    let klockan = 10 * 60 * 60 * 1000

    const forsta = await alertProviderOutageThrottled('credit', {
      env: grönEnv, fetchImpl: fakeFetchSomRaknar(rakning), now: () => klockan,
    })
    expect(forsta.attempted).toBe(true)
    expect(forsta.delivery?.delivered).toBe(true)
    expect(rakning.n).toBe(1)

    klockan += 59 * 60 * 1000 // 59 min senare — inom fönstret
    const andra = await alertProviderOutageThrottled('credit', {
      env: grönEnv, fetchImpl: fakeFetchSomRaknar(rakning), now: () => klockan,
    })
    expect(andra.attempted).toBe(false)
    expect(rakning.n).toBe(1)

    klockan += 2 * 60 * 1000 // 61 min efter första — fönstret passerat
    const tredje = await alertProviderOutageThrottled('credit', {
      env: grönEnv, fetchImpl: fakeFetchSomRaknar(rakning), now: () => klockan,
    })
    expect(tredje.attempted).toBe(true)
    expect(rakning.n).toBe(2)
  })

  test('saknade credentials fäller aldrig anropet — ärlig failure i stället', async () => {
    __resetOutageAlertThrottleForTest()
    const resultat = await alertProviderOutageThrottled('credit', {
      env: {}, now: () => 5_000_000,
    })
    expect(resultat.attempted).toBe(true)
    expect(resultat.delivery?.delivered).toBe(false)
    expect(resultat.delivery?.failure).toBe('missing_credentials')
  })
})

test.describe('routen använder härdningen — diagnosraden är borta', () => {
  const källa = fs.readFileSync(
    path.join(ROOT, 'app/api/matte/chat/route.ts'),
    'utf8',
  )

  test('debug_error-diagnosen är bortriven', () => {
    expect(källa).not.toContain('debug_error')
  })

  test('catchen klassificerar och larmar via härdningen', () => {
    expect(källa).toContain('classifyProviderOutage(error)')
    expect(källa).toContain('alertProviderOutageThrottled')
    expect(källa).toContain('PROVIDER_OUTAGE_REPLY')
  })
})
