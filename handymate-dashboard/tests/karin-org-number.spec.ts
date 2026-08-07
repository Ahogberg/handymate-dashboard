/**
 * Facit för organisationsnummer (2026-08-07).
 *
 * Onboardingen har hittills bara kontrollerat längden — ett feltryck i en
 * siffra passerade rakt igenom, trots att numret ska slå upp företaget hos
 * Bolagsverket och står på varje faktura.
 *
 * Testnumren nedan är konstruerade så att Luhn-summan går jämnt ut, inte
 * hämtade från riktiga företag.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/karin-org-number.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  normalizeOrgNumber,
  formatOrgNumber,
  isValidOrgNumber,
  orgNumberCompanyForm,
  checkOrgNumber,
} from '../lib/karin/org-number'

/** Bygger ett giltigt tiosiffrigt nummer genom att räkna fram kontrollsiffran. */
function medKontrollsiffra(nio: string): string {
  let summa = 0
  for (let i = 0; i < 9; i++) {
    let n = Number(nio[i])
    if (i % 2 === 0) {
      n *= 2
      if (n > 9) n -= 9
    }
    summa += n
  }
  return nio + String((10 - (summa % 10)) % 10)
}

/** Aktiebolag: börjar på 5, tredje siffran minst 2. */
const GILTIGT_AB = medKontrollsiffra('556123456')

test.describe('normalisering och format', () => {
  test('bindestreck och mellanslag ignoreras', () => {
    expect(normalizeOrgNumber('556677-8899')).toBe('5566778899')
    expect(normalizeOrgNumber('55 66 77 88 99')).toBe('5566778899')
  })

  test('sekelprefix strippas i visningen', () => {
    // 16 framför är giltigt men står aldrig på en faktura.
    expect(formatOrgNumber('165566778899')).toBe('556677-8899')
  })

  test('formateras med bindestreck efter sex siffror', () => {
    expect(formatOrgNumber('5566778899')).toBe('556677-8899')
  })

  test('ogiltig längd lämnas orörd i stället för att stympas', () => {
    // Att kapa till tio siffror hade dolt att användaren skrivit fel.
    expect(formatOrgNumber('12345')).toBe('12345')
  })
})

test.describe('KONTROLLSIFFRAN — det längdkontrollen missade', () => {
  test('ett konstruerat giltigt nummer godkänns', () => {
    expect(isValidOrgNumber(GILTIGT_AB)).toBe(true)
  })

  test('en ändrad siffra underkänns', () => {
    // Hela poängen: ett feltryck ska fastna.
    const trasigt = GILTIGT_AB.slice(0, 4) + String((Number(GILTIGT_AB[4]) + 1) % 10) + GILTIGT_AB.slice(5)
    expect(isValidOrgNumber(trasigt)).toBe(false)
  })

  test('två omkastade siffror underkänns oftast', () => {
    // Luhn fångar alla enkla transpositioner utom 09/90.
    const a = GILTIGT_AB
    const kastat = a.slice(0, 3) + a[4] + a[3] + a.slice(5)
    if (a[3] !== a[4]) {
      expect(isValidOrgNumber(kastat)).toBe(false)
    }
  })

  test('för få eller för många siffror underkänns', () => {
    for (const n of ['', '123', '12345678901', '556677889']) {
      expect(isValidOrgNumber(n), n).toBe(false)
    }
  })

  test('bokstäver underkänns', () => {
    expect(isValidOrgNumber('55667788AB')).toBe(false)
  })

  test('null och undefined kraschar inte', () => {
    expect(isValidOrgNumber(null)).toBe(false)
    expect(isValidOrgNumber(undefined)).toBe(false)
  })
})

test.describe('bolagsformen ligger i numret', () => {
  test('femman ger aktiebolag', () => {
    // Första siffran 5 = aktiebolag. En fråga mindre i onboardingen.
    expect(orgNumberCompanyForm('5566778899')).toBe('ab')
  })

  test('sjuan ger ekonomisk förening', () => {
    expect(orgNumberCompanyForm('7696778899')).toBe('ekonomisk_forening')
  })

  test('nian ger handelsbolag', () => {
    expect(orgNumberCompanyForm('9696778899')).toBe('hb')
  })

  test('ett personnummer läses som enskild firma', () => {
    // Enskild firma har inget eget organisationsnummer utan använder
    // innehavarens personnummer — tredje siffran är då en månadssiffra.
    expect(orgNumberCompanyForm('8501012345')).toBe('ef')
  })

  test('okänd siffra ger null, inte en gissning', () => {
    // Fyran används inte som juridisk form. Då frågar vi hellre än antar.
    expect(orgNumberCompanyForm('4566778899')).toBeNull()
  })

  test('ogiltigt format ger null', () => {
    expect(orgNumberCompanyForm('abc')).toBeNull()
    expect(orgNumberCompanyForm(null)).toBeNull()
  })
})

test.describe('svaret till användaren', () => {
  test('tomt fält säger vad som saknas', () => {
    const r = checkOrgNumber('')
    expect(r.valid).toBe(false)
    expect(r.error).toContain('organisationsnummer')
  })

  test('fel längd säger hur det ska se ut', () => {
    // Ett exempel i felmeddelandet är mer värt än en regel.
    expect(checkOrgNumber('12345').error).toContain('556677-8899')
  })

  test('fel kontrollsiffra säger VAD som är fel', () => {
    const trasigt = GILTIGT_AB.slice(0, 9) + String((Number(GILTIGT_AB[9]) + 1) % 10)
    const r = checkOrgNumber(trasigt)
    expect(r.valid).toBe(false)
    expect(r.error).toContain('Kontrollsiffran')
  })

  test('giltigt nummer ger format och bolagsform på en gång', () => {
    const r = checkOrgNumber(GILTIGT_AB)
    expect(r.valid).toBe(true)
    expect(r.error).toBe('')
    expect(r.formatted).toContain('-')
    expect(r.companyForm).toBe('ab')
  })

  test('felmeddelandena är på svenska och utan tekniska ord', () => {
    for (const n of ['', '12345', '5566778890']) {
      const e = checkOrgNumber(n).error
      if (!e) continue
      expect(/\b(luhn|mod|checksum|invalid|error)\b/i.test(e), e).toBe(false)
    }
  })
})
