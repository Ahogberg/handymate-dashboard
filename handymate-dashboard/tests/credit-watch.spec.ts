/**
 * Facit för lib/observability/credit-watch.ts — kreditbevakningens bedömare
 * och körning, utan nät (injicerad fetch/env/dbProbe).
 *
 * Låser: exakta gränser, att "kunde inte kontrollera" aldrig blir ok, att
 * Anthropics kreditstopp klassas som error (inte warn), att 46elks-saldot
 * räknas om från 1/10000-enheter, och att stale-fönstret är 26 h.
 *
 * Körs: npx playwright test tests/credit-watch.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  arFarsk,
  bedomAnthropicSvar,
  bedomElksSaldo,
  bedomStripeSvar,
  korKreditbevakning,
  lasElksMinSek,
  sammanfattaKreditlage,
  CREDIT_WATCH_ELKS_MIN_SEK_DEFAULT,
  CREDIT_WATCH_STALE_HOURS,
  ELKS_BALANCE_DIVISOR,
  CREDIT_WATCH_CHECK_KEYS,
} from '../lib/observability/credit-watch'

test.describe('bedomElksSaldo', () => {
  test('räknar om från 1/10000-enheter och jämför mot gränsen', () => {
    const r = bedomElksSaldo({ balance: 150 * ELKS_BALANCE_DIVISOR, currency: 'SEK' }, 300)
    expect(r.status).toBe('warn')
    expect(r.detail.balance_sek).toBe(150)
    expect(r.summary).toContain('150 kr')
    expect(r.summary).toContain('300 kr')
  })

  test('över gränsen är ok', () => {
    const r = bedomElksSaldo({ balance: 1000 * ELKS_BALANCE_DIVISOR }, 300)
    expect(r.status).toBe('ok')
    expect(r.detail.balance_raw).toBe(1000 * ELKS_BALANCE_DIVISOR)
  })

  test('exakt på gränsen är ok (under = warn)', () => {
    expect(bedomElksSaldo({ balance: 300 * ELKS_BALANCE_DIVISOR }, 300).status).toBe('ok')
    expect(bedomElksSaldo({ balance: 300 * ELKS_BALANCE_DIVISOR - 1 }, 300).status).toBe('warn')
  })

  test('otolkbart saldo blir warn, aldrig ok', () => {
    expect(bedomElksSaldo({}, 300).status).toBe('warn')
    expect(bedomElksSaldo(null, 300).status).toBe('warn')
    expect(bedomElksSaldo({ balance: 'abc' }, 300).status).toBe('warn')
  })

  test('gränsen läses ur env med default', () => {
    expect(lasElksMinSek({})).toBe(CREDIT_WATCH_ELKS_MIN_SEK_DEFAULT)
    expect(lasElksMinSek({ CREDIT_WATCH_ELKS_MIN_SEK: '500' })).toBe(500)
    expect(lasElksMinSek({ CREDIT_WATCH_ELKS_MIN_SEK: 'nej' })).toBe(CREDIT_WATCH_ELKS_MIN_SEK_DEFAULT)
    expect(lasElksMinSek({ CREDIT_WATCH_ELKS_MIN_SEK: '-1' })).toBe(CREDIT_WATCH_ELKS_MIN_SEK_DEFAULT)
  })
})

test.describe('bedomAnthropicSvar', () => {
  test('200 = ok', () => {
    expect(bedomAnthropicSvar(200, '{"id":"msg"}').status).toBe('ok')
  })

  test('kreditstopp (400 + "credit balance") = ERROR, inte warn', () => {
    const r = bedomAnthropicSvar(400, '{"error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}')
    expect(r.status).toBe('error')
    expect(r.detail.reason).toBe('credit_exhausted')
    expect(r.summary).toContain('SLUT')
  })

  test('401/403 = error invalid_key', () => {
    expect(bedomAnthropicSvar(401, '').detail.reason).toBe('invalid_key')
    expect(bedomAnthropicSvar(401, '').status).toBe('error')
    expect(bedomAnthropicSvar(403, '').status).toBe('error')
  })

  test('429 och 5xx = warn (driftstörning, inte vårt fel)', () => {
    expect(bedomAnthropicSvar(429, '').status).toBe('warn')
    expect(bedomAnthropicSvar(529, '').status).toBe('warn')
    expect(bedomAnthropicSvar(500, '').status).toBe('warn')
  })

  test('annat 400 (inte kredit) = warn med kropp för felsökning', () => {
    const r = bedomAnthropicSvar(400, '{"error":{"message":"model not found"}}')
    expect(r.status).toBe('warn')
    expect(r.detail.reason).toBe('unexpected')
  })
})

test.describe('bedomStripeSvar', () => {
  test('200 live = ok; 200 testläge = ok men säger det', () => {
    expect(bedomStripeSvar(200, { livemode: true }).summary).not.toContain('TESTLÄGE')
    expect(bedomStripeSvar(200, { livemode: false }).summary).toContain('TESTLÄGE')
    expect(bedomStripeSvar(200, { livemode: false }).status).toBe('ok')
  })

  test('401 = error invalid_key', () => {
    const r = bedomStripeSvar(401, { error: {} })
    expect(r.status).toBe('error')
    expect(r.detail.reason).toBe('invalid_key')
  })

  test('annat = warn', () => {
    expect(bedomStripeSvar(500, null).status).toBe('warn')
  })
})

test.describe('sammanfattaKreditlage + arFarsk', () => {
  test('error vinner över warn vinner över ok', () => {
    const ok = { key: 'database' as const, status: 'ok' as const, summary: '', detail: {} }
    const warn = { key: 'elks_balance' as const, status: 'warn' as const, summary: '', detail: {} }
    const err = { key: 'anthropic_credit' as const, status: 'error' as const, summary: '', detail: {} }
    expect(sammanfattaKreditlage([ok]).overall).toBe('ok')
    expect(sammanfattaKreditlage([ok, warn]).overall).toBe('warn')
    expect(sammanfattaKreditlage([ok, warn, err]).overall).toBe('error')
    expect(sammanfattaKreditlage([ok, warn, err]).errors).toEqual([err])
    expect(sammanfattaKreditlage([ok, warn, err]).warnings).toEqual([warn])
  })

  test('stale-fönstret är exakt 26 timmar', () => {
    const now = Date.parse('2026-09-01T10:00:00Z')
    expect(CREDIT_WATCH_STALE_HOURS).toBe(26)
    expect(arFarsk(new Date(now - 25 * 3600_000).toISOString(), now)).toBe(true)
    expect(arFarsk(new Date(now - 27 * 3600_000).toISOString(), now)).toBe(false)
    expect(arFarsk('inte-ett-datum', now)).toBe(false)
  })
})

test.describe('korKreditbevakning — injicerad fetch', () => {
  const env = {
    ELKS_API_USER: 'u',
    ELKS_API_PASSWORD: 'p',
    ANTHROPIC_API_KEY: 'sk-ant',
    STRIPE_SECRET_KEY: 'sk_live',
  }

  function fakeFetch(map: Record<string, { status: number; body: unknown }>): typeof fetch {
    const calls: string[] = []
    const f = (async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      const hit = Object.entries(map).find(([k]) => url.includes(k))
      if (!hit) throw new Error(`oväntad url ${url}`)
      const { status, body } = hit[1]
      const text = typeof body === 'string' ? body : JSON.stringify(body)
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => JSON.parse(text),
        text: async () => text,
      } as unknown as Response
    }) as unknown as typeof fetch
    ;(f as unknown as { calls: string[] }).calls = calls
    return f
  }

  test('alla fyra kontroller körs, i fast ordning, med rätt bedömning', async () => {
    const fetchImpl = fakeFetch({
      '46elks.com/a1/me': { status: 200, body: { balance: 120 * ELKS_BALANCE_DIVISOR, currency: 'SEK' } },
      'api.anthropic.com': { status: 400, body: { error: { message: 'Your credit balance is too low to access the Anthropic API.' } } },
      'api.stripe.com/v1/balance': { status: 200, body: { livemode: true } },
    })
    const results = await korKreditbevakning({ fetchImpl, env, dbProbe: async () => true })
    expect(results.map(r => r.key)).toEqual([...CREDIT_WATCH_CHECK_KEYS])
    expect(results.map(r => r.status)).toEqual(['ok', 'warn', 'error', 'ok'])
    expect(sammanfattaKreditlage(results).overall).toBe('error')
    // Anthropic-proben är ett riktigt men minimalt anrop.
    const calls = (fetchImpl as unknown as { calls: string[] }).calls
    expect(calls.some(u => u.includes('api.anthropic.com/v1/messages'))).toBe(true)
  })

  test('saknade nycklar blir error not_configured, inte tyst hopp', async () => {
    const fetchImpl = fakeFetch({})
    const results = await korKreditbevakning({ fetchImpl, env: {}, dbProbe: async () => true })
    expect(results.filter(r => r.key !== 'database').every(r => r.status === 'error' && r.detail.reason === 'not_configured')).toBe(true)
  })

  test('nätfel i en probe blir warn för just den, resten körs vidare', async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('46elks')) throw new Error('ECONNRESET')
      const body = url.includes('anthropic') ? '{"id":"msg"}' : '{"livemode":true}'
      return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body } as unknown as Response
    }) as unknown as typeof fetch
    const results = await korKreditbevakning({ fetchImpl, env, dbProbe: async () => true })
    expect(results.find(r => r.key === 'elks_balance')?.status).toBe('warn')
    expect(results.find(r => r.key === 'elks_balance')?.detail.reason).toBe('probe_failed')
    expect(results.find(r => r.key === 'anthropic_credit')?.status).toBe('ok')
    expect(results.find(r => r.key === 'stripe_key')?.status).toBe('ok')
  })

  test('46elks 401 = error (SMS och telefoni nere)', async () => {
    const fetchImpl = fakeFetch({
      '46elks.com/a1/me': { status: 401, body: 'Unauthorized' },
      'api.anthropic.com': { status: 200, body: { id: 'msg' } },
      'api.stripe.com/v1/balance': { status: 200, body: { livemode: true } },
    })
    const results = await korKreditbevakning({ fetchImpl, env, dbProbe: async () => true })
    expect(results.find(r => r.key === 'elks_balance')?.status).toBe('error')
  })

  test('databasen som inte svarar är error', async () => {
    const fetchImpl = fakeFetch({
      '46elks.com/a1/me': { status: 200, body: { balance: 999 * ELKS_BALANCE_DIVISOR } },
      'api.anthropic.com': { status: 200, body: { id: 'msg' } },
      'api.stripe.com/v1/balance': { status: 200, body: { livemode: true } },
    })
    const results = await korKreditbevakning({ fetchImpl, env, dbProbe: async () => false })
    expect(results.find(r => r.key === 'database')?.status).toBe('error')
  })
})
