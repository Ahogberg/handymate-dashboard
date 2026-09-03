/**
 * Förkravssonden och lanseringsprovets infrastruktur.
 *
 *   npx playwright test tests/launch-preflight.spec.ts --project=chromium
 *
 * Rena funktioner + källskanning — ingen webbläsare, inget nätverk.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  sammanstall,
  kontrolleraResend,
  type PreflightStation,
} from '../lib/launch/preflight'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const station = (over: Partial<PreflightStation> = {}): PreflightStation => ({
  key: 'x',
  grind: 'Grind A',
  label: 'X',
  status: 'klar',
  orsak: '',
  ...over,
})

test.describe('sammanställningen — okänt är aldrig klart', () => {
  test('alla klara ⇒ redo att starta', () => {
    const r = sammanstall([station(), station()], '2026-09-03T10:00:00Z')
    expect(r.klara).toBe(2)
    expect(r.redoAttStarta).toBe(true)
  })

  test('en blockerad ⇒ inte redo', () => {
    const r = sammanstall([station(), station({ status: 'blockerad' })], '2026-09-03T10:00:00Z')
    expect(r.blockerade).toBe(1)
    expect(r.redoAttStarta).toBe(false)
  })

  test('en OKÄND ⇒ inte redo — en kontroll som inte gick att göra är inget godkännande', () => {
    const r = sammanstall([station(), station({ status: 'okand' })], '2026-09-03T10:00:00Z')
    expect(r.okanda).toBe(1)
    expect(r.redoAttStarta, 'okänt läge får aldrig räknas som redo').toBe(false)
  })

  test('tom lista räknas som redo bara om den verkligen är tom', () => {
    const r = sammanstall([], '2026-09-03T10:00:00Z')
    expect(r.klara + r.blockerade + r.okanda).toBe(0)
  })
})

test.describe('Resend-kontrollen', () => {
  const svar = (status: number, body: unknown): typeof fetch =>
    (async () => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => '' })) as unknown as typeof fetch

  test('verifierad domän ⇒ klar', async () => {
    const s = await kontrolleraResend(
      svar(200, { data: [{ name: 'handymate.se', status: 'verified' }] }),
      { RESEND_API_KEY: 'x', RESEND_DOMAIN: 'handymate.se' },
    )
    expect(s.status).toBe('klar')
  })

  test('overifierad domän ⇒ blockerad, med status i orsaken', async () => {
    const s = await kontrolleraResend(
      svar(200, { data: [{ name: 'handymate.se', status: 'pending' }] }),
      { RESEND_API_KEY: 'x', RESEND_DOMAIN: 'handymate.se' },
    )
    expect(s.status).toBe('blockerad')
    expect(s.orsak).toContain('pending')
  })

  test('domänen saknas helt ⇒ blockerad', async () => {
    const s = await kontrolleraResend(
      svar(200, { data: [{ name: 'annan.se', status: 'verified' }] }),
      { RESEND_API_KEY: 'x', RESEND_DOMAIN: 'handymate.se' },
    )
    expect(s.status).toBe('blockerad')
  })

  test('avvisad nyckel ⇒ blockerad; oväntat svar ⇒ OKÄND, aldrig klar', async () => {
    expect((await kontrolleraResend(svar(401, {}), { RESEND_API_KEY: 'x' })).status).toBe('blockerad')
    expect((await kontrolleraResend(svar(503, {}), { RESEND_API_KEY: 'x' })).status).toBe('okand')
  })

  test('saknad nyckel ⇒ blockerad utan att nätverket ens rörs', async () => {
    let anropad = false
    const spion = (async () => { anropad = true; return { status: 200, ok: true, json: async () => ({}) } }) as unknown as typeof fetch
    const s = await kontrolleraResend(spion, {})
    expect(s.status).toBe('blockerad')
    expect(anropad).toBe(false)
  })
})

test.describe('Stripe-läget — testnyckel i prod är inte klart', () => {
  const src = kod('lib/launch/preflight.ts')

  test('livemode:false blockerar, oavsett att credit-watch säger ok', () => {
    // Första skarpa körningen 2026-09-03 visade att prod kör en TESTNYCKEL.
    // credit-watch svarar 'ok' (nyckeln fungerar ju) — rätt för drift, fel för
    // ett lanseringsprov. Gränsen måste ligga i sonden.
    expect(src).toContain("r.key === 'stripe_key' && r.detail?.livemode === false")
    expect(src).toContain('return blockerad'.replace('blockerad', "'blockerad'"))
  })

  test('orsaken säger vad som ska göras, inte bara att det är fel', () => {
    expect(src).toContain('TESTNYCKEL')
    expect(src).toContain('Byt till live-nyckeln före lansering')
    expect(src).toContain('orsak: orsakFor(r)')
  })
})

test.describe('källskanning — sonden bygger på credit-watch, inte vid sidan av', () => {
  const src = kod('lib/launch/preflight.ts')

  test('återanvänder kreditbevakningen i stället för att skriva om 46elks/Stripe', () => {
    expect(src).toContain("from '@/lib/observability/credit-watch'")
    expect(src).toContain('korKreditbevakning(')
    // Ingen egen 46elks- eller Stripe-implementation här
    expect(src).not.toContain('api.46elks.com')
    expect(src).not.toContain('api.stripe.com')
  })

  test('återanvänder bucket-listan ur readiness i stället för en egen kopia', () => {
    expect(src).toContain('REQUIRED_STORAGE_BUCKETS')
  })

  test('46elks-varning räknas som BLOCKERAD för ett prov som ska skicka SMS', () => {
    expect(src).toContain("r.key === 'elks_balance' ? 'blockerad' : 'okand'")
  })

  test('en kontroll som credit-watch inte returnerade blir okänd, inte klar', () => {
    expect(src).toContain('Kreditbevakningen returnerade ingen kontroll')
  })

  test('sonden är läsande — den skickar aldrig SMS eller mejl', () => {
    expect(src).not.toMatch(/\/a1\/sms|\/a1\/calls/)
    expect(src).not.toContain('sendSmsViaElks')
    expect(src).not.toContain('sendEmail')
  })

  test('rutten är adminspärrad och dynamisk', () => {
    const r = kod('app/api/admin/launch-preflight/route.ts')
    expect(r).toContain('isAdmin(request)')
    expect(r).toContain('status: 403')
    expect(r).toContain("export const dynamic = 'force-dynamic'")
  })
})

test.describe('färskkontoprovet — isolerat och torrt som standard', () => {
  const spec = kod('tests/launch/fresh-account.launch.spec.ts')
  const config = kod('playwright.config.ts')

  test('skarp körning kräver en uttrycklig flagga', () => {
    expect(spec).toContain("process.env.LAUNCH_PROOF_LIVE === '1'")
    expect(spec).toContain('test.skip(true, ')
  })

  test('provet plockas INTE upp av standardprojekten', () => {
    // Både filmönstret och katalogen är undantagna på toppnivå — annars hade
    // chromium och mobile kört fyra riktiga kontoregistreringar i produktion.
    expect(config).toContain('/.*\\.launch\\.spec\\.ts/')
    expect(config).toContain('tests[\\\\/]launch[\\\\/]')
  })

  test('eget projekt med blank session — provet ärver inte testanvändarens', () => {
    const block = config.slice(config.indexOf("name: 'launch-proof'"))
    expect(block).toContain("testDir: './tests/launch'")
    expect(block).toContain('storageState: { cookies: [], origins: [] }')
  })

  test('betalgrinden provas i rätt riktning: finalize måste ge 402', () => {
    expect(spec).toContain('res.status() !== 402')
    expect(spec).toContain('betalgrinden läcker')
  })

  test('genomgången får inte visa fynd på ett konto utan import', () => {
    expect(spec).toContain('på ett nytt konto utan import')
  })

  test('det som inte kan bevisas maskinellt skrivs som MANUELL, aldrig PASS', () => {
    expect(spec).toContain('MANUELLA_STATIONER')
    expect(spec).toContain('BEGRIPLIGHET')
    expect(spec).toContain('aldrig bokföras som PASS')
    // Riktigt kortköp och fysisk push får aldrig passera maskinellt
    expect(spec).toContain('Skarpt kortköp')
    expect(spec).toContain('fysisk iPhone')
  })
})

test.describe('bevisprotokollet', () => {
  test('generatorn läser stationerna ur testsviten i stället för en egen lista', () => {
    const s = kod('scripts/launch-evidence.mjs')
    expect(s).toContain('LAUNCH_TEST_SUITE.md')
    expect(s).toContain('### (\\d+\\.\\d+)')
  })

  test('den vägrar skriva över ett befintligt protokoll', () => {
    const s = kod('scripts/launch-evidence.mjs')
    expect(s).toContain('Ett bevisprotokoll skrivs aldrig över')
    expect(s).toContain('process.exit(1)')
  })

  test('den varnar när ingen tagg låser SHA:n', () => {
    const s = kod('scripts/launch-evidence.mjs')
    expect(s).toContain('Ingen tagg pekar på den här committen')
    expect(s).toContain('git describe --tags --exact-match')
  })

  test('protokollet öppnar stationerna som EJ KÖRD, aldrig som PASS', () => {
    const s = kod('scripts/launch-evidence.mjs')
    expect(s).toContain('Status: EJ KÖRD')
    // Backticks är escapade i generatorns template literal
    expect(s).toContain('räknas **aldrig** som')
  })

  test('npm-skriptet finns', () => {
    const p = JSON.parse(kod('package.json')) as { scripts: Record<string, string> }
    expect(p.scripts['evidence:new']).toContain('launch-evidence.mjs')
  })

  test('README beskriver SHA-låsningen och rollerna', () => {
    const r = kod('docs/launch/evidence/README.md')
    expect(r).toContain('git tag -a release-prov-')
    expect(r).toContain('Den som utför ett prov godkänner det inte själv')
    expect(r.toLowerCase()).toContain('kall testperson')
  })
})
