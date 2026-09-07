/**
 * Facit: "Så ser dina kunder dig" (Inställningar → Företag → kundvy).
 *
 * Sidan lovar att det ägaren ser är det kunden får. Det håller bara om
 * förhandsvisningen byggs av SAMMA byggare som sändvägarna, om rollgrinden
 * sitter på båda API-rutterna, och om ROT-texten förblir preliminär.
 * Rena enhetstester på lib/branding/kundvy + textkontrakt på filerna.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  ACCENT_PRESETS,
  accentVarning,
  bokningSms,
  contrastVsWhite,
  KUNDVY_TOUCHPOINTS,
  omdomeSms,
  parseHexInput,
  readyCount,
  readyRows,
  smsSignatur,
} from '../lib/branding/kundvy'
import { SETTINGS_AREAS } from '../lib/settings/areas'

const ROOT = path.join(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test.describe('kundvy — redo-mätaren', () => {
  test('tomt konto: bara accentfärgen är på plats, och varje tom rad pekar dit den fylls i', () => {
    const rows = readyRows({})
    expect(rows).toHaveLength(7)
    expect(readyCount(rows)).toEqual({ klara: 1, totalt: 7 })
    const accent = rows.find((r) => r.id === 'accent')!
    expect(accent.done).toBe(true)
    expect(accent.value).toBe('Teal (standard)')
    for (const r of rows.filter((x) => !x.done)) {
      expect(r.action, `${r.id} saknar åtgärd`).toBeTruthy()
      // Logotypen fylls i på sidan själv; allt annat länkar till rätt flik.
      if (r.id !== 'logo') expect(r.href, `${r.id} saknar länk`).toMatch(/^\/dashboard\/settings\?tab=/)
    }
  })

  test('fullt konto: 7 av 7, och egen färg skrivs ut som hex', () => {
    const rows = readyRows({
      logo_url: 'https://x.supabase.co/storage/v1/object/public/logos/biz_1/logo.png?t=1',
      accent_color: '#1e3a8a',
      swish_number: '123 456 78 90',
      bankgiro: '5555-5555',
      org_number: '556677-8899',
      public_phone: '070-123 45 67',
      contact_email: 'info@ekstrombygg.se',
      google_review_url: 'https://g.page/r/abc/review',
    })
    expect(readyCount(rows)).toEqual({ klara: 7, totalt: 7 })
    expect(rows.find((r) => r.id === 'logo')!.value).toBe('logo.png')
    expect(rows.find((r) => r.id === 'accent')!.value).toBe('Egen färg #1E3A8A')
    expect(rows.find((r) => r.id === 'kontakt')!.value).toBe('info@ekstrombygg.se · 070-123 45 67')
  })
})

test.describe('kundvy — accentfärg', () => {
  test('alla sex förvalen klarar vit text (≥ 4,5:1)', () => {
    for (const p of ACCENT_PRESETS) {
      expect(contrastVsWhite(p.hex), p.namn).toBeGreaterThanOrEqual(4.5)
      expect(accentVarning(p.hex)).toBeNull()
    }
  })

  test('ljus färg ger en varning, aldrig ett stopp', () => {
    const v = accentVarning('#FDE68A')
    expect(v).toContain('Vit text blir svår att läsa')
    expect(contrastVsWhite('#FFFFFF')).toBeCloseTo(1, 5)
    expect(contrastVsWhite('#000000')).toBeCloseTo(21, 5)
  })

  test('hex-inmatning tål # eller inte, gemener och mellanslag', () => {
    expect(parseHexInput(' 0f766e ')).toBe('#0F766E')
    expect(parseHexInput('#1E3A8A')).toBe('#1E3A8A')
    expect(parseHexInput('#fff')).toBeNull()
    expect(parseHexInput('teal')).toBeNull()
  })
})

test.describe('kundvy — kontaktpunkterna', () => {
  test('sju punkter i kundens ordning, unika id:n, 1–7', () => {
    expect(KUNDVY_TOUCHPOINTS.map((t) => t.nr)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(new Set(KUNDVY_TOUCHPOINTS.map((t) => t.id)).size).toBe(7)
    // Bokningsbekräftelse och omdömesförfrågan är SMS på riktigt — inte mail.
    expect(KUNDVY_TOUCHPOINTS.find((t) => t.id === 'bokning')!.kind).toBe('sms')
    expect(KUNDVY_TOUCHPOINTS.find((t) => t.id === 'omdome')!.kind).toBe('sms')
    expect(KUNDVY_TOUCHPOINTS.filter((t) => t.kind === 'email').map((t) => t.id)).toEqual(['offertmail', 'faktura'])
  })

  test('SMS-texterna slutar med firmans signatur och nämner firmanamnet', () => {
    expect(smsSignatur('Ekström Bygg').trim()).toBe('//Ekström Bygg')
    const b = bokningSms('Ekström Bygg')
    expect(b).toContain('Ekström Bygg')
    expect(b.trimEnd().endsWith('//Ekström Bygg')).toBe(true)
    const o = omdomeSms('Ekström Bygg', null)
    expect(o).toContain('Ekström Bygg')
    expect(o).toContain('Anna')
  })
})

test.describe('kundvy — textkontrakt', () => {
  test('förhandsvisningen byggs av samma byggare som sändvägarna', () => {
    const src = read('lib/branding/kundvy-preview.ts')
    expect(src).toContain("from '@/lib/quotes/quote-email'")
    expect(src).toContain("from '@/lib/invoices/send-invoice'")
    expect(src).toContain('buildQuoteEmailHtml(')
    expect(src).toContain('buildInvoiceEmailHtml(')
    // Offertsändvägen använder samma byggare — inte en egen HTML-kopia.
    const send = read('app/api/quotes/send/route.ts')
    expect(send).toContain('buildQuoteEmailHtml(')
    expect(send).toContain('brandingFromConfig(business)')
  })

  test('båda API-rutterna är ägare/admin-grindade och force-dynamic', () => {
    for (const rel of ['app/api/settings/kundvy/preview/route.ts', 'app/api/settings/kundvy/testmail/route.ts']) {
      const src = read(rel)
      expect(src, rel).toContain("export const dynamic = 'force-dynamic'")
      expect(src, rel).toContain('isOwnerOrAdmin(')
      expect(src, rel).not.toContain('requirePermission')
    }
    // Testmailet går ALDRIG till någon annan än den inloggade.
    const testmail = read('app/api/settings/kundvy/testmail/route.ts')
    expect(testmail).toContain('currentUser.email')
    expect(testmail).not.toMatch(/body\.(to|email)/)
  })

  test('sidan är ägare/admin-gated och länkad från inställningsnavet', () => {
    const page = read('app/dashboard/settings/kundvy/page.tsx')
    expect(page).toContain("router.replace('/dashboard/settings')")
    expect(page).toContain('isDemoBusinessId(')
    const entry = SETTINGS_AREAS.flatMap((a) => a.groups.flatMap((g) => g.entries)).find((e) => e.href === '/dashboard/settings/kundvy')
    expect(entry).toBeTruthy()
    expect(entry!.ownerOnly).toBe(true)
    expect(entry!.label).toBe('Så ser dina kunder dig')
  })

  test('ROT är preliminärt — ingen "dras automatiskt" i kundvy-filerna', () => {
    const files = [
      'lib/branding/kundvy.ts',
      'lib/branding/kundvy-preview.ts',
      'lib/quotes/quote-email.ts',
      'components/settings/kundvy/mocks.tsx',
      'app/dashboard/settings/kundvy/page.tsx',
    ]
    for (const rel of files) {
      expect(read(rel), rel).not.toMatch(/dras automatiskt/i)
    }
    expect(read('components/settings/kundvy/mocks.tsx')).toContain('preliminärt')
  })
})
