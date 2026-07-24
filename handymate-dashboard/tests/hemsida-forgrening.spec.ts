/**
 * Hemsida-förgreningen — facit-tester för de rena hjälpfunktionerna i
 * lib/onboarding/website-scrape.ts (URL-normalisering + SSRF-skyddet).
 * Rena funktioner, ingen nätverk/DB.
 *
 * Körs: npx playwright test tests/hemsida-forgrening.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  normalizeWebsiteUrl,
  isPrivateOrReservedIp,
  isBlockedHostname,
  htmlToExtractableText,
  parseExtractionJson,
  SCRAPE_MAX_TEXT_CHARS,
} from '../lib/onboarding/website-scrape'

test.describe('normalizeWebsiteUrl', () => {
  test('lägger till https:// när schema saknas', () => {
    const r = normalizeWebsiteUrl('www.andreasbygg.se')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.url).toBe('https://www.andreasbygg.se/')
      expect(r.hostname).toBe('www.andreasbygg.se')
    }
  })

  test('behåller angivet http-schema', () => {
    const r = normalizeWebsiteUrl('http://andreasbygg.se')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url.startsWith('http://')).toBe(true)
  })

  test('trimmar whitespace', () => {
    const r = normalizeWebsiteUrl('  andreasbygg.se  ')
    expect(r.ok).toBe(true)
  })

  test('tom sträng ger fel, ingen krasch', () => {
    const r = normalizeWebsiteUrl('')
    expect(r.ok).toBe(false)
  })

  test('bara whitespace ger fel', () => {
    const r = normalizeWebsiteUrl('   ')
    expect(r.ok).toBe(false)
  })

  test('ogiltig sträng ger tydligt fel, ingen krasch', () => {
    const r = normalizeWebsiteUrl('***inte en url***')
    expect(r.ok).toBe(false)
  })

  test('blockerar icke-http(s)-scheman (ftp)', () => {
    const r = normalizeWebsiteUrl('ftp://files.example.com')
    expect(r.ok).toBe(false)
  })

  test('blockerar javascript:-schema', () => {
    const r = normalizeWebsiteUrl('javascript:alert(1)')
    expect(r.ok).toBe(false)
  })

  test('blockerar file:-schema', () => {
    const r = normalizeWebsiteUrl('file:///etc/passwd')
    expect(r.ok).toBe(false)
  })
})

test.describe('isBlockedHostname — SSRF-skydd, strängnivå', () => {
  test('blockerar localhost', () => {
    expect(isBlockedHostname('localhost')).toBe(true)
  })

  test('blockerar .local (mDNS)', () => {
    expect(isBlockedHostname('minserver.local')).toBe(true)
  })

  test('blockerar 127.0.0.1 skriven som hostnamn', () => {
    expect(isBlockedHostname('127.0.0.1')).toBe(true)
  })

  test('blockerar 0.0.0.0', () => {
    expect(isBlockedHostname('0.0.0.0')).toBe(true)
  })

  test('blockerar IPv6-loopback [::1]', () => {
    expect(isBlockedHostname('[::1]')).toBe(true)
  })

  test('släpper igenom publikt domännamn', () => {
    expect(isBlockedHostname('andreasbygg.se')).toBe(false)
  })

  test('släpper igenom publik IP', () => {
    expect(isBlockedHostname('93.184.216.34')).toBe(false)
  })
})

test.describe('isPrivateOrReservedIp — SSRF-skydd, DNS-upplösta IP:er', () => {
  test('blockerar 127.0.0.0/8', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true)
  })

  test('blockerar 10.0.0.0/8', () => {
    expect(isPrivateOrReservedIp('10.1.2.3')).toBe(true)
  })

  test('blockerar 172.16.0.0/12 (hela intervallet 16–31)', () => {
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true)
    expect(isPrivateOrReservedIp('172.15.0.1')).toBe(false) // utanför intervallet
    expect(isPrivateOrReservedIp('172.32.0.1')).toBe(false) // utanför intervallet
  })

  test('blockerar 192.168.0.0/16', () => {
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true)
  })

  test('blockerar 169.254.0.0/16 (link-local / cloud metadata)', () => {
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true)
  })

  test('blockerar IPv6 loopback ::1', () => {
    expect(isPrivateOrReservedIp('::1')).toBe(true)
  })

  test('blockerar IPv6 ULA fc00::/7', () => {
    expect(isPrivateOrReservedIp('fd00::1')).toBe(true)
  })

  test('blockerar IPv4-mappad IPv6 för privat IP', () => {
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true)
  })

  test('släpper igenom publik IPv4', () => {
    expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false)
  })
})

test.describe('htmlToExtractableText', () => {
  test('tar bort script/style/nav/footer och taggar', () => {
    const html = `
      <html><head><style>.a{color:red}</style></head>
      <body>
        <nav>Meny länkar här</nav>
        <script>alert('x')</script>
        <h1>Andreas Bygg AB</h1>
        <p>Vi bygger kök &amp; badrum.</p>
        <footer>© 2026</footer>
      </body></html>`
    const text = htmlToExtractableText(html)
    expect(text).toContain('Andreas Bygg AB')
    expect(text).toContain('Vi bygger kök & badrum.')
    expect(text).not.toContain('Meny länkar')
    expect(text).not.toContain('alert')
    expect(text).not.toContain('2026')
    expect(text).not.toContain('<')
  })

  test('kortar till SCRAPE_MAX_TEXT_CHARS', () => {
    const html = '<p>' + 'a'.repeat(50_000) + '</p>'
    const text = htmlToExtractableText(html)
    expect(text.length).toBeLessThanOrEqual(SCRAPE_MAX_TEXT_CHARS)
  })
})

test.describe('parseExtractionJson — gissar aldrig', () => {
  test('parsar rent JSON', () => {
    const r = parseExtractionJson('{"business_name":"Andreas Bygg AB","org_number":null,"description":null,"services":["Kök","Badrum"],"phone":null,"email":null,"address":null,"service_area":"Stockholm","opening_hours":null}')
    expect(r?.business_name).toBe('Andreas Bygg AB')
    expect(r?.services).toEqual(['Kök', 'Badrum'])
    expect(r?.org_number).toBeNull()
  })

  test('parsar JSON inbäddat i markdown-block', () => {
    const r = parseExtractionJson('```json\n{"business_name":"X","org_number":null,"description":null,"services":null,"phone":null,"email":null,"address":null,"service_area":null,"opening_hours":null}\n```')
    expect(r?.business_name).toBe('X')
  })

  test('trasigt JSON ger null, ingen krasch', () => {
    const r = parseExtractionJson('inte json alls')
    expect(r).toBeNull()
  })

  test('tom sträng ger null', () => {
    const r = parseExtractionJson('')
    expect(r).toBeNull()
  })

  test('saknade fält blir null, inte gissade värden', () => {
    const r = parseExtractionJson('{}')
    expect(r?.business_name).toBeNull()
    expect(r?.org_number).toBeNull()
    expect(r?.services).toBeNull()
  })

  test('tom services-array normaliseras till null', () => {
    const r = parseExtractionJson('{"services":[]}')
    expect(r?.services).toBeNull()
  })
})
