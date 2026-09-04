/**
 * Facit för Pass C — veckorapporten och "sedan du var här senast"
 * (2026-09-04).
 *
 * Bakgrund: docs/audits/AUTOPILOT_REVISION_2026-09-04.md, avsnitt 6 och 7.
 * Plan: tasks/plan-autopilot-C-rapport.md.
 *
 * Källskanning + rena enhetstester, ingen browser — kommentarer strippas
 * innan mönster söks så en dokumentationskommentar aldrig ger en falsk
 * träff (samma helper som tests/autopilot-utgang.spec.ts).
 *
 * Körs: npx playwright test tests/autopilot-rapport.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import type { WeeklyValue } from '../lib/weekly-value'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

/** Strippar // och /* *\/ -kommentarer (inte innehållet i strängar/mallsträngar). */
function utanKommentarer(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const veckorapportLib = read('lib/rapport/veckorapport.ts')
const veckorapportLibRen = utanKommentarer(veckorapportLib)
const cronRuttFinns = fs.existsSync(path.join(ROOT, 'app/api/cron/veckorapport/route.ts'))
const cronRutt = cronRuttFinns ? read('app/api/cron/veckorapport/route.ts') : ''
const cronRuttRen = utanKommentarer(cronRutt)
const vercelJson = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
const senastSedd = read('lib/jarvis/senast-sedd.ts')
const senastSeddRen = utanKommentarer(senastSedd)
const jarvisHome = read('components/jarvis/JarvisHome.tsx')
const jarvisHomeRen = utanKommentarer(jarvisHome)
const skottUtanDig = read('components/jarvis/home/SkottUtanDig.tsx')
const skottUtanDigRen = utanKommentarer(skottUtanDig)
const dygnsdigest = read('lib/jarvis/dygnsdigest.ts')

function tomWeeklyValue(overrides: Partial<WeeklyValue> = {}): WeeklyValue {
  return {
    range_days: 7,
    confirmed_kr: 0,
    confirmed_items: [],
    captured_count: 0,
    captured_kr: 0,
    calls_captured: 0,
    time_minutes: 0,
    time_hours: 0,
    autonomous_count: 0,
    ...overrides,
  }
}

test.describe('Del 1 — lib/rapport/veckorapport.ts: byggVeckorapportSms', () => {
  test('en känd WeeklyValue ger en känd, förutsägbar sträng', async () => {
    const { byggVeckorapportSms } = await import('../lib/rapport/veckorapport')
    const v = tomWeeklyValue({
      confirmed_items: [
        { label: 'Faktura 1001 betald', amount: 5000, agent: 'karin', dagar: 3 },
        { label: 'Faktura 1002 betald', amount: 3000, agent: 'karin', dagar: 1 },
        { label: 'Offert accepterad: Takbyte', amount: 12000, agent: 'daniel', dagar: 5 },
      ],
      confirmed_kr: 0,
      calls_captured: 3,
    })
    const sms = byggVeckorapportSms(v, 2)
    expect(sms).toBe(
      'Din vecka med Handymate: Karin bevakade 2 fakturor, Daniel följde upp 1 offert, Lisa fångade 3 samtal. 2 förslag väntar på dig. /Matte',
    )
  })

  test('en agent utan händelser nämns inte', async () => {
    const { byggVeckorapportSms } = await import('../lib/rapport/veckorapport')
    const v = tomWeeklyValue({
      confirmed_items: [{ label: 'Faktura 1001 betald', amount: 5000, agent: 'karin', dagar: 3 }],
      calls_captured: 0,
    })
    const sms = byggVeckorapportSms(v, 1)
    expect(sms).not.toContain('Daniel')
    expect(sms).not.toContain('Lisa')
    expect(sms).toContain('Karin bevakade 1 faktura')
  })

  test('noll väntande kort ⇒ ingen "väntar"-mening', async () => {
    const { byggVeckorapportSms } = await import('../lib/rapport/veckorapport')
    const v = tomWeeklyValue({ calls_captured: 5 })
    const sms = byggVeckorapportSms(v, 0)
    expect(sms).not.toContain('väntar')
    expect(sms).not.toContain('förslag')
  })

  test('confirmed_kr 0 ⇒ ingen kronsumma i SMS:et', async () => {
    const { byggVeckorapportSms } = await import('../lib/rapport/veckorapport')
    const v = tomWeeklyValue({ calls_captured: 2, confirmed_kr: 0 })
    const sms = byggVeckorapportSms(v, 0)
    expect(sms).not.toContain('kr')
  })

  test('confirmed_kr > 0 ⇒ kronsumman visas med sv-SE-gruppering', async () => {
    const { byggVeckorapportSms } = await import('../lib/rapport/veckorapport')
    const v = tomWeeklyValue({ calls_captured: 1, confirmed_kr: 48000 })
    const sms = byggVeckorapportSms(v, 0)
    // sv-SE-gruppering använder icke-brytande mellanslag (U+00A0), inte ett
    // vanligt blanksteg — bygg det förväntade värdet med samma
    // toLocaleString i stället för att hårdkoda tecknet fel.
    expect(sms).toContain(`${(48000).toLocaleString('sv-SE')} kr bekräftat`)
  })

  test('längd ≤ 320 tecken för ett rimligt maxfall (två SMS-delar)', async () => {
    const { byggVeckorapportSms } = await import('../lib/rapport/veckorapport')
    const v = tomWeeklyValue({
      confirmed_items: [
        ...Array.from({ length: 9 }, (_, i) => ({ label: `Faktura ${1000 + i} betald`, amount: 1000, agent: 'karin', dagar: 2 })),
        ...Array.from({ length: 9 }, (_, i) => ({ label: `Offert accepterad: Jobb ${i}`, amount: 2000, agent: 'daniel', dagar: 4 })),
      ],
      confirmed_kr: 48000,
      calls_captured: 40,
    })
    const sms = byggVeckorapportSms(v, 9)
    expect(sms.length).toBeLessThanOrEqual(320)
  })

  test('riktiga å/ä/ö i källan — inga unicode-escapes', () => {
    expect(veckorapportLib).toMatch(/[åäö]/)
    expect(veckorapportLib).not.toMatch(/\\u00e[5-6]|\\u00f6/)
  })

  test('bara agent+etikett-matchande rader räknas — "hellre missad än falsk"', async () => {
    const { byggVeckorapportSms } = await import('../lib/rapport/veckorapport')
    // Karin-kort som (hypotetiskt) skulle attribuera en offert räknas INTE
    // som en faktura — filtret är agent OCH etikett, inte agent ensam.
    const v = tomWeeklyValue({
      confirmed_items: [{ label: 'Offert accepterad: Konstigt fall', amount: 1000, agent: 'karin', dagar: 1 }],
    })
    const sms = byggVeckorapportSms(v, 0)
    expect(sms).not.toContain('Karin')
  })
})

test.describe('Del 1 — lib/rapport/veckorapport.ts: harVeckobevis + isoVeckaNyckel', () => {
  test('harVeckobevis är false när inget hänt', async () => {
    const { harVeckobevis } = await import('../lib/rapport/veckorapport')
    expect(harVeckobevis(tomWeeklyValue())).toBe(false)
  })

  test('harVeckobevis är true så snart en agent-rad eller ett samtal finns', async () => {
    const { harVeckobevis } = await import('../lib/rapport/veckorapport')
    expect(harVeckobevis(tomWeeklyValue({ calls_captured: 1 }))).toBe(true)
    expect(harVeckobevis(tomWeeklyValue({
      confirmed_items: [{ label: 'Faktura 1 betald', amount: 100, agent: 'karin', dagar: 0 }],
    }))).toBe(true)
  })

  test('isoVeckaNyckel: känt datum ⇒ känd ISO-vecka', async () => {
    const { isoVeckaNyckel } = await import('../lib/rapport/veckorapport')
    // Fredag 2026-09-04 ligger i ISO-vecka 36, 2026.
    expect(isoVeckaNyckel(new Date('2026-09-04T14:00:00Z'))).toBe('2026-W36')
  })

  test('isoVeckaNyckel: årsskiftet hanteras (isoår ≠ kalenderår)', async () => {
    const { isoVeckaNyckel } = await import('../lib/rapport/veckorapport')
    // 2027-01-01 är en fredag i ISO-vecka 53, 2026 (torsdagen i samma vecka
    // ligger i december).
    expect(isoVeckaNyckel(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53')
  })

  test('veckorapport.ts är rena funktioner — ingen I/O', () => {
    expect(veckorapportLibRen).not.toMatch(/from '@\/lib\/supabase'/)
    expect(veckorapportLibRen).not.toMatch(/\.from\('/)
    expect(veckorapportLibRen).not.toMatch(/fetch\(/)
  })
})

test.describe('Del 1 — cron/veckorapport', () => {
  test('rutten finns', () => {
    expect(cronRuttFinns, 'app/api/cron/veckorapport/route.ts saknas').toBe(true)
  })

  test('verifierar cron-hemligheten', () => {
    expect(cronRuttRen).toContain("from '@/lib/cron/verify-secret'")
    expect(cronRuttRen).toContain('verifyCronSecret(request)')
  })

  test('hämtar konton via hamtaKontonMedAktivtTeam', () => {
    expect(cronRuttRen).toContain("from '@/lib/billing/aktiva-konton'")
    expect(cronRuttRen).toContain('hamtaKontonMedAktivtTeam(')
  })

  test('respekterar tyst tid', () => {
    expect(cronRuttRen).toContain("from '@/lib/notifications/tyst-tid'")
    expect(cronRuttRen).toContain('arTystTid(')
  })

  test('pausade agenter (agents_globally_paused) är tysta', () => {
    expect(cronRuttRen).toContain('agents_globally_paused')
    expect(cronRuttRen).toMatch(/agents_globally_paused\s*===\s*true/)
  })

  test('hoppar vid noll bevis och noll väntande kort — INNAN sändning', () => {
    expect(cronRuttRen).toContain('harVeckobevis(')
    const villkorIdx = cronRuttRen.indexOf('!harVeckobevis(v)')
    const sendIdx = cronRuttRen.indexOf('sendSmsViaElks(')
    expect(villkorIdx).toBeGreaterThan(-1)
    expect(sendIdx).toBeGreaterThan(-1)
    expect(villkorIdx).toBeLessThan(sendIdx)
  })

  test('dedupe: en rad per konto och ISO-vecka i automation_activity', () => {
    expect(cronRuttRen).toContain("from('automation_activity')")
    expect(cronRuttRen).toContain("automation_type', 'veckorapport'")
    // .contains('metadata', { vecka }) i stället för .eq('metadata->>vecka', …)
    // — samma JSONB-innehållsfråga som getWeeklyValue redan använder
    // (lib/weekly-value.ts, .contains('context', …)), och en riktig kolumn
    // (`metadata`) i stället för ett ->>-uttryck som tests/column-
    // contract.spec.ts kolumnparser inte känner igen för filtermetoder.
    expect(cronRuttRen).toContain("contains('metadata', { vecka: veckaNyckel })")
  })

  test('dedupe-uppslaget körs FÖRE getWeeklyValue (spar en beräkning)', () => {
    const dedupeIdx = cronRuttRen.indexOf("contains('metadata'")
    const weeklyIdx = cronRuttRen.indexOf('getWeeklyValue(')
    expect(dedupeIdx).toBeGreaterThan(-1)
    expect(weeklyIdx).toBeGreaterThan(-1)
    expect(dedupeIdx).toBeLessThan(weeklyIdx)
  })

  test('skickar till ägarens telefon (business_config.phone_number), recipient/purpose internal', () => {
    expect(cronRuttRen).toContain('biz?.phone_number')
    expect(cronRuttRen).toMatch(/recipient:\s*'internal'/)
    expect(cronRuttRen).toMatch(/purpose:\s*'internal'/)
  })

  test('SMS-texten byggs av byggVeckorapportSms, skickas via sendSmsViaElks', () => {
    expect(cronRuttRen).toContain("from '@/lib/rapport/veckorapport'")
    expect(cronRuttRen).toContain('byggVeckorapportSms(')
    expect(cronRuttRen).toContain("from '@/lib/sms-send'")
    expect(cronRuttRen).toContain('sendSmsViaElks(')
  })

  test('ett misslyckat SMS loggas som status failed, ALDRIG som skickat', () => {
    const idx = cronRuttRen.indexOf("automation_type: 'veckorapport'")
    expect(idx, 'automation_activity-inserten hittades inte').toBeGreaterThan(-1)
    const block = cronRuttRen.slice(idx, idx + 500)
    expect(block).toMatch(/status:\s*r\.success\s*\?\s*'success'\s*:\s*'failed'/)
    expect(block).not.toMatch(/status:\s*'success'(?!\s*:)/) // ingen ovillkorlig 'success'
  })

  test('status är ett giltigt värde för automation_activity (CHECK-kolumnen)', () => {
    expect(cronRuttRen).not.toMatch(/status:\s*'auto'/)
  })
})

test.describe('Del 1 — vercel.json: veckorapporten på fredag', () => {
  test('finns exakt en cron-rad för veckorapport', () => {
    const rader = vercelJson.crons.filter(c => c.path === '/api/cron/veckorapport')
    expect(rader).toHaveLength(1)
  })

  test('schemat kör fredagar (dag-of-week 5), Hobby-plan-säkert (en gång/dag)', () => {
    const rad = vercelJson.crons.find(c => c.path === '/api/cron/veckorapport')
    expect(rad, 'cron-raden saknas i vercel.json').toBeTruthy()
    expect(rad!.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* 5$/)
  })

  test('kolliderar inte med någon befintlig schemarad', () => {
    const scheman = vercelJson.crons.map(c => c.schedule)
    const vartSchema = vercelJson.crons.find(c => c.path === '/api/cron/veckorapport')!.schedule
    const kollisioner = scheman.filter(s => s === vartSchema)
    expect(kollisioner, `schemat ${vartSchema} krockar med en annan rutt`).toHaveLength(1)
  })
})

test.describe('Del 1 — cron-auth-taket och route-auth-inventeringen', () => {
  test('tests/cron-auth.spec.ts räknar med den nya rutten: totalt = ägda + 1', () => {
    const cronAuth = read('tests/cron-auth.spec.ts')
    const tal = Array.from(cronAuth.matchAll(/toHaveLength\((\d+)\)/g)).map(m => Number(m[1]))
    expect(tal).toHaveLength(2)
    expect(tal[0] - tal[1]).toBe(1)
  })

  test('facit-route-auth-inventory har höjt eller behållit taket för utan-standardgrind', () => {
    const inv = read('tests/facit-route-auth-inventory.spec.ts')
    expect(inv).toMatch(/toBeLessThanOrEqual\(14[4-9]\)/)
  })
})

test.describe('Del 2 — lib/jarvis/senast-sedd.ts: fönstrets startpunkt', () => {
  test('ingen sparad tidsstämpel ⇒ 24h-fallback (dagens beteende)', async () => {
    const { digestFonsterStartMs } = await import('../lib/jarvis/senast-sedd')
    const nu = Date.parse('2026-09-04T12:00:00Z')
    expect(digestFonsterStartMs(nu, null)).toBe(nu - 24 * 3600_000)
  })

  test('nyligen sedd (< 24h) ⇒ golvet på 24h, inte kortare', async () => {
    const { digestFonsterStartMs } = await import('../lib/jarvis/senast-sedd')
    const nu = Date.parse('2026-09-04T12:00:00Z')
    const senastSedd = nu - 2 * 3600_000 // 2h sedan
    expect(digestFonsterStartMs(nu, senastSedd)).toBe(nu - 24 * 3600_000)
  })

  test('3 dagar sedan ⇒ fönstret sträcker sig 3 dagar bakåt', async () => {
    const { digestFonsterStartMs } = await import('../lib/jarvis/senast-sedd')
    const nu = Date.parse('2026-09-04T12:00:00Z')
    const senastSedd = nu - 3 * 24 * 3600_000
    expect(digestFonsterStartMs(nu, senastSedd)).toBe(senastSedd)
  })

  test('mer än 7 dagar sedan ⇒ tak på 7 dagar', async () => {
    const { digestFonsterStartMs } = await import('../lib/jarvis/senast-sedd')
    const nu = Date.parse('2026-09-04T12:00:00Z')
    const senastSedd = nu - 30 * 24 * 3600_000
    expect(digestFonsterStartMs(nu, senastSedd)).toBe(nu - 7 * 24 * 3600_000)
  })

  test('klockskev (senastSedd i framtiden) ⇒ 24h-fallback, kastar inte', async () => {
    const { digestFonsterStartMs } = await import('../lib/jarvis/senast-sedd')
    const nu = Date.parse('2026-09-04T12:00:00Z')
    expect(digestFonsterStartMs(nu, nu + 1000)).toBe(nu - 24 * 3600_000)
  })
})

test.describe('Del 2 — lib/jarvis/senast-sedd.ts: SkottUtanDig-rubriken', () => {
  test('0-1 dygn ⇒ "sedan i går" (oförändrad ordalydelse)', async () => {
    const { skottUtanDigRubrik } = await import('../lib/jarvis/senast-sedd')
    const nu = Date.parse('2026-09-04T12:00:00Z')
    expect(skottUtanDigRubrik(nu, nu - 24 * 3600_000)).toBe('Skött utan dig sedan i går')
  })

  test('2-6 dygn ⇒ "sedan i <veckodag>"', async () => {
    const { skottUtanDigRubrik } = await import('../lib/jarvis/senast-sedd')
    const nu = Date.parse('2026-09-04T12:00:00Z') // fredag
    const fonsterStart = nu - 3 * 24 * 3600_000 // tisdag
    const rubrik = skottUtanDigRubrik(nu, fonsterStart)
    expect(rubrik).toMatch(/^Skött utan dig sedan i (söndags|måndags|tisdags|onsdags|torsdags|fredags|lördags)$/)
    expect(rubrik).not.toContain('i går')
  })

  test('taket (7 dygn) ⇒ exakt formulering med dagantal, ingen veckodagsgissning', async () => {
    const { skottUtanDigRubrik } = await import('../lib/jarvis/senast-sedd')
    const nu = Date.parse('2026-09-04T12:00:00Z')
    const fonsterStart = nu - 7 * 24 * 3600_000
    expect(skottUtanDigRubrik(nu, fonsterStart)).toBe('Skött utan dig sedan du var här senast (7 dagar)')
  })

  test('rubriken ljuger aldrig: gapDygn i rubriktexten matchar det faktiska fönstret', async () => {
    const { skottUtanDigRubrik } = await import('../lib/jarvis/senast-sedd')
    const nu = Date.parse('2026-09-04T12:00:00Z')
    const fonsterStart = nu - 7 * 24 * 3600_000
    const rubrik = skottUtanDigRubrik(nu, fonsterStart)
    const m = /\((\d+) dagar\)/.exec(rubrik)
    expect(m).toBeTruthy()
    expect(Number(m![1])).toBe(7)
  })

  test('rena funktioner — ingen I/O, inget DOM/localStorage i lib-filen själv', () => {
    expect(senastSeddRen).not.toMatch(/localStorage/)
    expect(senastSeddRen).not.toMatch(/from '@\/lib\/supabase'/)
    expect(senastSeddRen).not.toMatch(/fetch\(/)
  })
})

test.describe('Del 2 — JarvisHome + SkottUtanDig: fönstret kopplas in på riktigt', () => {
  test('JarvisHome importerar senast-sedd-hjälparna', () => {
    expect(jarvisHomeRen).toContain("from '@/lib/jarvis/senast-sedd'")
    expect(jarvisHomeRen).toContain('digestFonsterStartMs(')
    expect(jarvisHomeRen).toContain('skottUtanDigRubrik(')
  })

  test('läser localStorage FÖRE den skriver (annars ser fönstret bara "nu")', () => {
    const getIdx = jarvisHomeRen.indexOf('localStorage.getItem(SENAST_SEDD_KEY)')
    const setIdx = jarvisHomeRen.indexOf('localStorage.setItem(SENAST_SEDD_KEY')
    expect(getIdx).toBeGreaterThan(-1)
    expect(setIdx).toBeGreaterThan(-1)
    expect(getIdx).toBeLessThan(setIdx)
  })

  test('byggDygnsdigest anropas med ett `from` byggt av digestFonsterStartMs, inte bara `nu`', () => {
    const idx = jarvisHomeRen.indexOf('byggDygnsdigest({')
    expect(idx).toBeGreaterThan(-1)
    const block = jarvisHomeRen.slice(idx, idx + 200)
    expect(block).toContain('from: new Date(dygnsFonsterStartMs)')
  })

  test('SkottUtanDig får en `titel`-prop byggd av fönstret, inte en fri hårdkodad sträng', () => {
    expect(jarvisHomeRen).toMatch(/<SkottUtanDig\s+rader=\{dygnsRader\}\s+titel=\{skottUtanDigTitel\}\s*\/>/)
  })

  test('SkottUtanDig.tsx: titel är en prop med fallback, ingen ovillkorlig hårdkodad rubrik kvar i JSX', () => {
    expect(skottUtanDigRen).toContain('titel = ')
    expect(skottUtanDigRen).toContain('{titel}')
    // Den gamla ovillkorliga h3-texten ("Skött utan dig sedan i går" som
    // fast JSX-innehåll) ska vara borta — bara kvar som default-parametern.
    expect(skottUtanDigRen).not.toMatch(/<h3[^>]*>\s*Skött utan dig sedan i går\s*<\/h3>/)
  })
})

test.describe('Del 2 — dygnsdigest.ts: `from`-fältet finns redan (Owner Absence V1) och rörs inte', () => {
  test('byggDygnsdigest accepterar ett valfritt `from` som ersätter DIGEST_TIMMAR-bakåträkningen', () => {
    expect(dygnsdigest).toContain('from?: Date')
    expect(dygnsdigest).toMatch(/input\.from\s*\?\s*input\.from\.getTime\(\)/)
  })

  test('DIGEST_TIMMAR (default-fönstret) är oförändrat 24 — tests/dygnsdigest.spec.ts ska fortsätta gälla', () => {
    expect(dygnsdigest).toContain('export const DIGEST_TIMMAR = 24')
  })
})

test.describe('CI-inkoppling', () => {
  test('facit-namnet finns i test:contracts (package.json) och contracts.yml — i BÅDA', () => {
    // Inte "sist i listan": den invarianten blev röd så fort nästa pass
    // (agent-tillstand, ata-utkast-sparas) kopplade in sina facit efter det
    // här, precis som autopilot-utgang.spec.ts en gång hårdkodade cron-taket.
    // Det som ska gälla är att specen körs i CI och lokalt — inte platsen.
    const pkg = JSON.parse(read('package.json'))
    const script: string = pkg.scripts['test:contracts']
    expect(script).toContain('tests/autopilot-rapport.spec.ts')

    const yamlPath = path.join(ROOT, '..', '.github', 'workflows', 'contracts.yml')
    const yaml = fs.readFileSync(yamlPath, 'utf8')
    expect(yaml).toContain('tests/autopilot-rapport.spec.ts')
  })
})
