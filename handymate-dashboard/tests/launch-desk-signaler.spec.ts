/**
 * Facit: Webbplatssignaler i Launch Desk (pass 1b,
 * tasks/plan-launch-desk-signaler.md).
 *
 * Rena enhetstester för lib/launch-desk/signaler.ts (ingen nätverk, ingen
 * AI) + källskanning av signaler-rutterna och brief.ts som låser att:
 *  - SSRF-skyddet (isBlockedHostname/isPrivateOrReservedIp) faktiskt
 *    används i kedjan från isAdmin-grindad rutt till hämtningen,
 *  - brief_source_snapshot MERGAS (inte skrivs över) när signaler sparas,
 *  - brief-prompten öppnar med den starkaste signalen och citerar den, och
 *    kostnadsmätningen bara sker när HANDYMATE_HOUSE_BUSINESS_ID är satt.
 *
 * Körs: npx playwright test tests/launch-desk-signaler.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { harledSignaler, valjOppning, type GtmSignal } from '../lib/launch-desk/signaler'
import { htmlToExtractableText } from '../lib/onboarding/website-scrape'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n')

const NOW = new Date('2026-09-02T10:00:00Z')

function fromHtml(html: string) {
  return { text: htmlToExtractableText(html), html }
}

test.describe('harledSignaler — en signal per fixtur, alltid med citat', () => {
  test('ingen_bokning: inga bokningsord, inget formulär, men ett kontaktcitat', () => {
    const { text, html } = fromHtml('<html><body><p>Ring oss på 08-123 456 om du vill veta mer.</p></body></html>')
    const signals = harledSignaler(text, html, NOW)
    const signal = signals.find(s => s.key === 'ingen_bokning')
    expect(signal, JSON.stringify(signals)).toBeTruthy()
    expect(signal!.evidence.toLowerCase()).toContain('ring oss')
    expect(signal!.styrka).toBe(2)
  })

  test('sida MED bokningsformulär ger aldrig ingen_bokning', () => {
    const { text, html } = fromHtml('<html><body><form><input name="datum" /></form><p>Ring oss på 08-123 456.</p></body></html>')
    const signals = harledSignaler(text, html, NOW)
    expect(signals.find(s => s.key === 'ingen_bokning')).toBeUndefined()
  })

  test('sida med bokningsord ger aldrig ingen_bokning', () => {
    const { text, html } = fromHtml('<html><body><p>Boka tid direkt online. Ring oss på 08-123 456.</p></body></html>')
    const signals = harledSignaler(text, html, NOW)
    expect(signals.find(s => s.key === 'ingen_bokning')).toBeUndefined()
  })

  test('bara_telefon: telefonnummer utan e-post och utan formulär', () => {
    const { text, html } = fromHtml('<html><body><p>Vill du bygga om? Slå en signal på 08-987 654 32.</p></body></html>')
    const signals = harledSignaler(text, html, NOW)
    const signal = signals.find(s => s.key === 'bara_telefon')
    expect(signal, JSON.stringify(signals)).toBeTruthy()
    expect(signal!.evidence).toMatch(/0\d[\d\s-]{5,}/)
    expect(signal!.styrka).toBe(2)
  })

  test('bara_telefon uteblir när e-post också finns', () => {
    const { text, html } = fromHtml('<html><body><p>Ring 08-987 654 32 eller maila info@example.se.</p></body></html>')
    const signals = harledSignaler(text, html, NOW)
    expect(signals.find(s => s.key === 'bara_telefon')).toBeUndefined()
  })

  test('svarstid: anger svarstid inom ett dygn', () => {
    const { text, html } = fromHtml('<html><body><p>Vi svarar inom 24 timmar på alla förfrågningar.</p></body></html>')
    const signal = harledSignaler(text, html, NOW).find(s => s.key === 'svarstid')
    expect(signal).toBeTruthy()
    expect(signal!.evidence.toLowerCase()).toContain('svarar inom')
    expect(signal!.styrka).toBe(1)
  })

  test('gammalt_artal: copyright-år äldre än två år tillbaka', () => {
    const { text, html } = fromHtml('<html><body><footer>© 2020 Andreas Bygg AB</footer></body></html>')
    // OBS: htmlToExtractableText tar bort <footer>-innehåll (samma regel som
    // scrape-website) — testa mot brödtext istället för footer.
    const { text: bodyText, html: bodyHtml } = fromHtml('<html><body><p>© 2020 Andreas Bygg AB. Alla rättigheter förbehållna.</p></body></html>')
    void text; void html
    const signal = harledSignaler(bodyText, bodyHtml, NOW).find(s => s.key === 'gammalt_artal')
    expect(signal, bodyText).toBeTruthy()
    expect(signal!.evidence).toContain('2020')
    expect(signal!.styrka).toBe(1)
  })

  test('färskt årtal (i år) ger ingen gammalt_artal-signal', () => {
    const { text, html } = fromHtml('<html><body><p>© 2026 Andreas Bygg AB.</p></body></html>')
    expect(harledSignaler(text, html, NOW).find(s => s.key === 'gammalt_artal')).toBeUndefined()
  })

  test('sasong: semesterstängt nämns', () => {
    const { text, html } = fromHtml('<html><body><p>Vi har semesterstängt vecka 28-31.</p></body></html>')
    const signal = harledSignaler(text, html, NOW).find(s => s.key === 'sasong')
    expect(signal).toBeTruthy()
    expect(signal!.evidence.toLowerCase()).toContain('semesterstängt')
    expect(signal!.styrka).toBe(1)
  })

  test('anstaller: söker personal, styrka 3', () => {
    const { text, html } = fromHtml('<html><body><p>Vi söker fler skickliga hantverkare till vårt team.</p></body></html>')
    const signal = harledSignaler(text, html, NOW).find(s => s.key === 'anstaller')
    expect(signal).toBeTruthy()
    expect(signal!.styrka).toBe(3)
  })

  test('rot_nämns: rotavdrag nämns', () => {
    const { text, html } = fromHtml('<html><body><p>Vi hjälper dig med rotavdrag för alla renoveringar.</p></body></html>')
    const signal = harledSignaler(text, html, NOW).find(s => s.key === 'rot_nämns')
    expect(signal).toBeTruthy()
    expect(signal!.evidence.toLowerCase()).toContain('rotavdrag')
  })

  test('recensioner: omdömen nämns', () => {
    const { text, html } = fromHtml('<html><body><p>Vi har många fina omdömen från nöjda kunder.</p></body></html>')
    const signal = harledSignaler(text, html, NOW).find(s => s.key === 'recensioner')
    expect(signal).toBeTruthy()
  })

  test('tjanster: 3-8 tjänsteord ger signal, evidence är ett citat ur texten', () => {
    const { text, html } = fromHtml('<html><body><p>Vi utför bygg, måleri och golv i hela Stockholm.</p></body></html>')
    const signal = harledSignaler(text, html, NOW).find(s => s.key === 'tjanster')
    expect(signal).toBeTruthy()
    expect(text).toContain(signal!.evidence.replace('…', '').trim().slice(0, 10))
  })

  test('under 3 tjänsteord ger ingen tjanster-signal', () => {
    const { text, html } = fromHtml('<html><body><p>Vi utför bygg i hela Stockholm.</p></body></html>')
    expect(harledSignaler(text, html, NOW).find(s => s.key === 'tjanster')).toBeUndefined()
  })

  test('ingen signal utan citat — generisk text utan träffar ger tom lista', () => {
    const { text, html } = fromHtml('<html><body><p>Vi är ett anrikt bygg. Historien om Andreas Bygg AB.</p></body></html>')
    const signals = harledSignaler(text, html, NOW)
    expect(signals).toEqual([])
  })

  test('varje härledd signal har ett icke-tomt citat', () => {
    const { text, html } = fromHtml(`<html><body><p>
      Vi svarar inom 24 timmar. © 2020 Andreas Bygg AB. Semesterstängt v.28.
      Vi söker personal. Rotavdrag ingår. Omdömen på Google. Ring oss på 08-123 456.
      Vi utför bygg, måleri, golv och kakel.
    </p></body></html>`)
    const signals = harledSignaler(text, html, NOW)
    expect(signals.length).toBeGreaterThan(0)
    for (const signal of signals) {
      expect(signal.evidence.trim().length, signal.key).toBeGreaterThan(0)
    }
  })
})

test.describe('valjOppning — starkast styrka vinner, annars dokumenterad ordning', () => {
  test('styrka 3 väljs före styrka 2', () => {
    const signaler: GtmSignal[] = [
      { key: 'ingen_bokning', label: 'Ingen bokning', evidence: 'x', styrka: 2 },
      { key: 'anstaller', label: 'Anställer', evidence: 'y', styrka: 3 },
    ]
    expect(valjOppning(signaler)?.key).toBe('anstaller')
  })

  test('oavgjort styrka bryts av den dokumenterade ordningen (svarstid före sasong)', () => {
    const signaler: GtmSignal[] = [
      { key: 'sasong', label: 'Säsong', evidence: 'x', styrka: 1 },
      { key: 'svarstid', label: 'Svarstid', evidence: 'y', styrka: 1 },
    ]
    expect(valjOppning(signaler)?.key).toBe('svarstid')
  })

  test('tom lista ger null', () => {
    expect(valjOppning([])).toBeNull()
  })
})

test.describe('källskanning — signaler-rutten och signaler-runnern', () => {
  const routeFile = 'app/api/admin/launch/accounts/[id]/signaler/route.ts'
  const runnerFile = 'lib/launch-desk/signaler-runner.ts'
  const batchFile = 'app/api/admin/launch/signaler/batch/route.ts'
  const combined = [routeFile, runnerFile].map(read).join('\n')

  test('rutten är superadmin-grindad', () => {
    expect(read(routeFile)).toContain('isAdmin(request)')
    expect(read(batchFile)).toContain('isAdmin(request)')
  })

  test('SSRF-skyddet (isBlockedHostname/isPrivateOrReservedIp) används i kedjan', () => {
    expect(combined).toContain('isBlockedHostname')
    expect(combined).toContain('isPrivateOrReservedIp')
    expect(combined).toContain('fetchWebsiteWithSsrfGuard')
  })

  test('bara kontots EGEN website hämtas — ingen katalog- eller söktjänst-URL byggs', () => {
    expect(combined).not.toMatch(/google\.com\/search|bing\.com\/search|hitta\.se|eniro\.se|allabolag\.se/i)
  })

  test('brief_source_snapshot MERGAS — andra nycklar skrivs aldrig över', () => {
    expect(combined).toContain('existingSnapshot')
    expect(combined).toMatch(/\.\.\.existingSnapshot/)
  })

  test('rutten svarar 200 med ok:false + tom signals-snapshot när hämtningen misslyckas — aldrig 500', () => {
    const route = read(routeFile)
    expect(route).not.toMatch(/status:\s*500.*fetchResult|fetchResult.*status:\s*500/s)
    expect(combined).toContain('ok: false')
  })

  test('batch-rutten kör högst 25 konton i imported/qualified', () => {
    const batch = read(batchFile)
    expect(batch).toContain('.slice(0, 25)')
    expect(batch).toContain("'imported'")
    expect(batch).toContain("'qualified'")
    expect(batch).toContain('isAdmin(request)')
  })

  test('route.ts exporterar bara handlers och dynamic', () => {
    const exportsNamed = Array.from(read(routeFile).matchAll(/^export (?:async function|const) (\w+)/gm)).map(m => m[1])
    expect(exportsNamed.every(name => ['POST', 'GET', 'PATCH', 'DELETE', 'dynamic'].includes(name)), exportsNamed.join(',')).toBe(true)
  })
})

test.describe('brief.ts läser signalerna', () => {
  const brief = read('lib/launch-desk/brief.ts')

  test('snapshoten innehåller signals', () => {
    expect(brief).toContain('signals')
    expect(brief).toContain('lasHardleddaSignaler')
  })

  test('prompten instruerar modellen att öppna med signalen och aldrig hitta på', () => {
    expect(brief.toLowerCase()).toContain('öppna med')
    expect(brief.toLowerCase()).toContain('aldrig hitta på')
    expect(brief).toContain('valjOppning')
  })

  test('kostnadsmätningen sker bara när HANDYMATE_HOUSE_BUSINESS_ID (HUS_BUSINESS_ID) är satt', () => {
    expect(brief).toContain('HANDYMATE_HOUSE_BUSINESS_ID')
    expect(brief).toContain('HUS_BUSINESS_ID')
    expect(brief).toMatch(/if\s*\(HUS_BUSINESS_ID\)\s*\{[\s\S]*?meterDirectLlmCall\(/)
  })

  test('mätningen är fail-soft (fångar eget fel, stoppar aldrig briefen)', () => {
    const meterBlock = brief.slice(brief.indexOf('if (HUS_BUSINESS_ID)'), brief.indexOf('const text = data?.content'))
    expect(meterBlock).toContain('try')
    expect(meterBlock).toContain('catch')
  })

  test('HANDYMATE_HOUSE_BUSINESS_ID är dokumenterad i .env.local.example', () => {
    expect(read('.env.local.example')).toMatch(/^HANDYMATE_HOUSE_BUSINESS_ID=/m)
  })
})

test.describe('GtmAccount-typen bär brief_source_snapshot', () => {
  test('typen har fältet (frivilligt, ingen migration)', () => {
    expect(read('lib/launch-desk/types.ts')).toContain('brief_source_snapshot?: Record<string, unknown>')
  })
})
