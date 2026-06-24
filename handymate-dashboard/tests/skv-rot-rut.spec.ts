/**
 * Skatteverket ROT/RUT — enhetstester för XML-byggaren + valideringslagret.
 *
 * Körs med Playwright test-runnern (redan i projektet), men dessa är RENA
 * enhetstester: inga HTTP-anrop, ingen browser, ingen server. Kör isolerat med:
 *   npx playwright test tests/skv-rot-rut.spec.ts
 *
 * Täcker det som annars skulle ge en AVVISAD fil hos Skatteverket: hela kronor
 * (aldrig öre/decimaler), BetaltBelopp-matematik, ROT/RUT aldrig i samma fil,
 * BRF kontra småhus ömsesidigt uteslutande, schablonarbete, escaping, samt varje
 * valideringsregel (positiv + negativ). Slutlig XSD-kontroll sker i Skatteverkets
 * e-tjänst (filkontroll innan inlämning).
 */

import { test, expect } from '@playwright/test'
import { buildSkvXml, kronor, escapeXml, type SkvArende } from '../lib/skv/rot-rut-xml'
import { validateInvoiceForSkv, type SkvValidationInput } from '../lib/skv/validate-rot-request'

// ── Fixtures ─────────────────────────────────────────────────────────────
// Giltigt 12-siffrigt personnummer (Luhn ok), född 1985-06-15 → vuxen.
const PNR_ADULT = '198506151235'
// Giltigt personnummer (Luhn ok), född 2015-06-15 → minderårig vid betalning 2025.
const PNR_MINOR = '201506151230'
const ORG_NR = '556036-0793'

function rotArende(overrides: Partial<SkvArende> = {}): SkvArende {
  return {
    kopare: PNR_ADULT,
    betalningsDatum: '2025-06-20',
    prisForArbete: 10000,
    begartBelopp: 3000,
    fakturaNr: '1001',
    categoryCode: 'El',
    antalTimmar: 8,
    materialkostnad: 500,
    fastighetsbeteckning: 'Gården 1:23',
    ...overrides,
  }
}

function validInput(overrides: Partial<SkvValidationInput> = {}): SkvValidationInput {
  return {
    invoice: {
      invoice_id: 'i1',
      invoice_number: '1001',
      status: 'paid',
      paid_at: '2025-06-20',
      rot_rut_type: 'rot',
      rot_work_cost: 10000,
      rot_deduction: 3000,
      rot_hours: 8,
      rot_work_category: 'El',
      rot_property_type: 'smahus',
      rot_property_designation: 'Gården 1:23',
    },
    customerPersonalNumber: PNR_ADULT,
    businessOrgNumber: ORG_NR,
    taxYear: 2025,
    alreadyRequestedThisYearKr: 0,
    ...overrides,
  }
}

/** Plocka ut innehållet i en specifik XML-tagg ur den genererade strängen. */
function tagValue(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<ns2:${tag}>([^<]*)</ns2:${tag}>`))
  return m ? m[1] : null
}

// ── kronor() — hela kronor, aldrig öre/decimaler ──────────────────────────
test.describe('kronor()', () => {
  test('avrundar till heltal', () => {
    expect(kronor(3749.6)).toBe(3750)
    expect(kronor(1200.4)).toBe(1200)
    expect(kronor(4000)).toBe(4000)
    expect(kronor(0.5)).toBe(1) // Math.round: .5 → uppåt
  })
  test('hanterar null/undefined som 0', () => {
    expect(kronor(null)).toBe(0)
    expect(kronor(undefined)).toBe(0)
  })
})

// ── escapeXml() — XML-säker text ──────────────────────────────────────────
test.describe('escapeXml()', () => {
  test('escapar samtliga fem specialtecken', () => {
    expect(escapeXml(`A & B <c> "d" 'e'`)).toBe('A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;')
  })
  test('null/undefined blir tom sträng', () => {
    expect(escapeXml(null as unknown as string)).toBe('')
    expect(escapeXml(undefined as unknown as string)).toBe('')
  })
})

// ── buildSkvXml() — ROT ───────────────────────────────────────────────────
test.describe('buildSkvXml — ROT', () => {
  test('bygger RotBegaran med korrekta namespaces, aldrig RutBegaran', () => {
    const xml = buildSkvXml({ requestType: 'rot', namnPaBegaran: 'Test', arenden: [rotArende()] })
    expect(xml).toContain('<ns2:RotBegaran>')
    expect(xml).toContain('</ns2:RotBegaran>')
    expect(xml).not.toContain('RutBegaran')
    expect(xml).toContain('xmlns:ns1="http://xmls.skatteverket.se/se/skatteverket/ht/begaran/6.0"')
    expect(xml).toContain('xmlns:ns2="http://xmls.skatteverket.se/se/skatteverket/ht/komponent/begaran/6.0"')
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  })

  test('BetaltBelopp = PrisForArbete − BegartBelopp, alla i hela kronor', () => {
    const xml = buildSkvXml({ requestType: 'rot', namnPaBegaran: 'Test', arenden: [rotArende()] })
    expect(tagValue(xml, 'PrisForArbete')).toBe('10000')
    expect(tagValue(xml, 'BegartBelopp')).toBe('3000')
    expect(tagValue(xml, 'BetaltBelopp')).toBe('7000')
  })

  test('decimaler avrundas — aldrig decimaltecken i beloppstaggar', () => {
    const xml = buildSkvXml({
      requestType: 'rot',
      namnPaBegaran: 'Test',
      arenden: [rotArende({ prisForArbete: 9999.6, begartBelopp: 3000.4, materialkostnad: 499.7 })],
    })
    expect(tagValue(xml, 'PrisForArbete')).toBe('10000')
    expect(tagValue(xml, 'BegartBelopp')).toBe('3000')
    expect(tagValue(xml, 'BetaltBelopp')).toBe('7000') // 10000 − 3000
    expect(tagValue(xml, 'Materialkostnad')).toBe('500')
    // Ingen punkt/komma i något beloppselement
    expect(xml).not.toMatch(/<ns2:(PrisForArbete|BegartBelopp|BetaltBelopp|Materialkostnad)>[^<]*[.,]/)
  })

  test('NamnPaBegaran trunkeras till 16 tecken', () => {
    const xml = buildSkvXml({ requestType: 'rot', namnPaBegaran: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', arenden: [rotArende()] })
    expect(tagValue(xml, 'NamnPaBegaran')).toBe('ABCDEFGHIJKLMNOP') // 16 tecken
  })

  test('FakturaNr trunkeras till 20 tecken', () => {
    const xml = buildSkvXml({
      requestType: 'rot',
      namnPaBegaran: 'Test',
      arenden: [rotArende({ fakturaNr: '123456789012345678901234567890' })],
    })
    expect(tagValue(xml, 'FakturaNr')).toBe('12345678901234567890') // 20 tecken
  })

  test('småhus → Fastighetsbeteckning, aldrig BRF-fält', () => {
    const xml = buildSkvXml({ requestType: 'rot', namnPaBegaran: 'Test', arenden: [rotArende()] })
    expect(xml).toContain('<ns2:Fastighetsbeteckning>Gården 1:23</ns2:Fastighetsbeteckning>')
    expect(xml).not.toContain('LagenhetsNr')
    expect(xml).not.toContain('BrfOrgNr')
  })

  test('BRF → LagenhetsNr + BrfOrgNr, aldrig Fastighetsbeteckning', () => {
    const xml = buildSkvXml({
      requestType: 'rot',
      namnPaBegaran: 'Test',
      arenden: [rotArende({ fastighetsbeteckning: undefined, brfOrgNr: '769612345', lagenhetsNr: '1101' })],
    })
    expect(xml).toContain('<ns2:LagenhetsNr>1101</ns2:LagenhetsNr>')
    expect(xml).toContain('<ns2:BrfOrgNr>769612345</ns2:BrfOrgNr>')
    expect(xml).not.toContain('Fastighetsbeteckning')
  })

  test('icke-schablon innehåller AntalTimmar + Materialkostnad', () => {
    const xml = buildSkvXml({ requestType: 'rot', namnPaBegaran: 'Test', arenden: [rotArende()] })
    expect(xml).toContain('<ns2:AntalTimmar>8</ns2:AntalTimmar>')
    expect(xml).toContain('<ns2:Materialkostnad>500</ns2:Materialkostnad>')
    expect(xml).toContain('<ns2:El>')
  })

  test('ett Arenden-element per ärende', () => {
    const xml = buildSkvXml({
      requestType: 'rot',
      namnPaBegaran: 'Test',
      arenden: [rotArende(), rotArende({ fakturaNr: '1002' }), rotArende({ fakturaNr: '1003' })],
    })
    const count = (xml.match(/<ns2:Arenden>/g) || []).length
    expect(count).toBe(3)
  })

  test('escaping appliceras på fält (t.ex. fakturanr med &)', () => {
    const xml = buildSkvXml({ requestType: 'rot', namnPaBegaran: 'Test', arenden: [rotArende({ fakturaNr: 'A&B' })] })
    expect(xml).toContain('<ns2:FakturaNr>A&amp;B</ns2:FakturaNr>')
  })
})

// ── buildSkvXml() — RUT + schablon ────────────────────────────────────────
test.describe('buildSkvXml — RUT', () => {
  test('bygger RutBegaran, aldrig RotBegaran', () => {
    const xml = buildSkvXml({
      requestType: 'rut',
      namnPaBegaran: 'Test',
      arenden: [rotArende({ categoryCode: 'Stadning', fastighetsbeteckning: undefined })],
    })
    expect(xml).toContain('<ns2:RutBegaran>')
    expect(xml).not.toContain('RotBegaran')
  })

  test('schablonkategori → <Utfort>true</Utfort>, ingen AntalTimmar/Materialkostnad', () => {
    const xml = buildSkvXml({
      requestType: 'rut',
      namnPaBegaran: 'Test',
      arenden: [rotArende({ categoryCode: 'TransportTillForsaljning', fastighetsbeteckning: undefined, antalTimmar: 5, materialkostnad: 100 })],
    })
    expect(xml).toContain('<ns2:TransportTillForsaljning>')
    expect(xml).toContain('<ns2:Utfort>true</ns2:Utfort>')
    expect(xml).not.toContain('AntalTimmar')
    expect(xml).not.toContain('Materialkostnad')
  })
})

// ── validateInvoiceForSkv() — positiva fall ───────────────────────────────
test.describe('validateInvoiceForSkv — giltiga fall', () => {
  test('komplett ROT-faktura är giltig och ger normaliserade värden', () => {
    const r = validateInvoiceForSkv(validInput())
    expect(r.errors).toEqual([])
    expect(r.valid).toBe(true)
    expect(r.normalized).toBeTruthy()
    expect(r.normalized?.type).toBe('rot')
    expect(r.normalized?.personnummer12).toBe(PNR_ADULT)
    expect(r.normalized?.prisForArbete).toBe(10000)
    expect(r.normalized?.begartBelopp).toBe(3000)
    expect(r.normalized?.category).toBe('El')
    expect(r.normalized?.fastighetsbeteckning).toBe('Gården 1:23')
  })

  test('giltig BRF-faktura', () => {
    const r = validateInvoiceForSkv(validInput({
      invoice: {
        ...validInput().invoice,
        rot_property_type: 'bostadsratt',
        rot_brf_org_number: '769612345',
        rot_apartment_number: '1101',
      },
    }))
    expect(r.errors).toEqual([])
    expect(r.valid).toBe(true)
    expect(r.normalized?.brfOrgNr).toBe('769612345')
    expect(r.normalized?.lagenhetsNr).toBe('1101')
  })

  test('RUT-schablon kräver inte timmar', () => {
    const r = validateInvoiceForSkv(validInput({
      invoice: {
        invoice_id: 'i2',
        invoice_number: '2001',
        status: 'paid',
        paid_at: '2025-06-20',
        rot_rut_type: 'rut',
        rut_work_cost: 5000,
        rut_deduction: 2500,
        rot_hours: 0,
        rot_work_category: 'TransportTillForsaljning',
      },
    }))
    expect(r.errors).toEqual([])
    expect(r.valid).toBe(true)
    expect(r.normalized?.type).toBe('rut')
  })
})

// ── validateInvoiceForSkv() — negativa fall (en regel per test) ───────────
test.describe('validateInvoiceForSkv — varje regel', () => {
  const err = (input: SkvValidationInput) => validateInvoiceForSkv(input).errors.join(' | ')

  test('saknar ROT/RUT-typ', () => {
    expect(err(validInput({ invoice: { ...validInput().invoice, rot_rut_type: null } }))).toContain('ROT/RUT-typ')
  })
  test('ej betald', () => {
    expect(err(validInput({ invoice: { ...validInput().invoice, status: 'sent' } }))).toContain('inte betald')
  })
  test('saknar betalningsdatum', () => {
    expect(err(validInput({ invoice: { ...validInput().invoice, paid_at: null } }))).toContain('betalningsdatum')
  })
  test('saknar personnummer', () => {
    expect(err(validInput({ customerPersonalNumber: null }))).toContain('personnummer saknas')
  })
  test('10-siffrigt personnummer ger varning, inte fel', () => {
    const r = validateInvoiceForSkv(validInput({ customerPersonalNumber: '8506151235' }))
    expect(r.warnings.join(' ')).toContain('10-siffrigt')
    expect(r.errors.join(' ')).not.toContain('personnummer')
  })
  test('fel personnummerlängd', () => {
    expect(err(validInput({ customerPersonalNumber: '123' }))).toContain('fel format')
  })
  test('ogiltig kontrollsiffra', () => {
    expect(err(validInput({ customerPersonalNumber: '198506151234' }))).toContain('kontrollsiffra')
  })
  test('saknar org-nr', () => {
    expect(err(validInput({ businessOrgNumber: null }))).toContain('organisationsnummer saknas')
  })
  test('köpare = utförare', () => {
    expect(err(validInput({ businessOrgNumber: PNR_ADULT }))).toContain('samma nummer')
  })
  test('köpare under 18 år', () => {
    expect(err(validInput({ customerPersonalNumber: PNR_MINOR }))).toContain('minst 18 år')
  })
  test('betalningsdatum i framtiden', () => {
    expect(err(validInput({ invoice: { ...validInput().invoice, paid_at: '2099-01-01' }, taxYear: 2099 }))).toContain('framtiden')
  })
  test('skatteår matchar inte betalningsdatum', () => {
    expect(err(validInput({ taxYear: 2024 }))).toContain('matchar inte valt skatteår')
  })
  test('arbetskostnad noll', () => {
    expect(err(validInput({ invoice: { ...validInput().invoice, rot_work_cost: 0 } }))).toContain('Arbetskostnad')
  })
  test('begärt avdrag noll', () => {
    expect(err(validInput({ invoice: { ...validInput().invoice, rot_deduction: 0 } }))).toContain('Begärt avdrag saknas')
  })
  test('begärt avdrag ≥ arbetskostnad', () => {
    expect(err(validInput({ invoice: { ...validInput().invoice, rot_deduction: 10000 } }))).toContain('större än')
  })
  test('årstak överskrids inkl. tidigare begärt', () => {
    expect(err(validInput({ alreadyRequestedThisYearKr: 48000 }))).toContain('årstaket')
  })
  test('saknar kategori', () => {
    expect(err(validInput({ invoice: { ...validInput().invoice, rot_work_category: null } }))).toContain('Arbetskategori saknas')
  })
  test('okänd kategori', () => {
    expect(err(validInput({ invoice: { ...validInput().invoice, rot_work_category: 'Hittepa' } }))).toContain('Okänd arbetskategori')
  })
  test('kategorityp matchar inte fakturatyp (RUT-kategori på ROT-faktura)', () => {
    expect(err(validInput({ invoice: { ...validInput().invoice, rot_work_category: 'Stadning' } }))).toContain('RUT-kategori')
  })
  test('saknar timmar (icke-schablon)', () => {
    expect(err(validInput({ invoice: { ...validInput().invoice, rot_hours: 0 } }))).toContain('timmar saknas')
  })
  test('timmar över 999', () => {
    expect(err(validInput({ invoice: { ...validInput().invoice, rot_hours: 1000 } }))).toContain('999')
  })
  test('ROT småhus saknar fastighetsbeteckning', () => {
    expect(err(validInput({
      invoice: { ...validInput().invoice, rot_property_designation: null },
      customerPropertyDesignation: null,
    }))).toContain('Fastighetsbeteckning saknas')
  })
  test('ROT BRF saknar org-nr', () => {
    expect(err(validInput({
      invoice: { ...validInput().invoice, rot_property_type: 'bostadsratt', rot_brf_org_number: null, rot_apartment_number: '1101' },
    }))).toContain('organisationsnummer saknas')
  })
  test('ROT BRF saknar lägenhetsnummer', () => {
    expect(err(validInput({
      invoice: { ...validInput().invoice, rot_property_type: 'bostadsratt', rot_brf_org_number: '769612345', rot_apartment_number: null },
    }))).toContain('lägenhetsnummer saknas')
  })
  test('ROT BRF lägenhetsnummer inte 4 siffror', () => {
    expect(err(validInput({
      invoice: { ...validInput().invoice, rot_property_type: 'bostadsratt', rot_brf_org_number: '769612345', rot_apartment_number: '11' },
    }))).toContain('4 siffror')
  })
})
