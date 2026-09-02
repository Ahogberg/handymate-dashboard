/**
 * Facit: Företagsskannern (pass 1a, 2026-09-02, tasks/plan-foretagsskannern.md).
 * Browserlöst — rena enhetstester på lib/foretagsskannern/skanna.ts plus
 * källskanning av sidan, StepImportData-inkopplingen och spar-rutten.
 *
 * Körs: npx playwright test tests/foretagsskannern.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  HANDOFF_KEY,
  byggFynd,
  skannaFakturor,
  skannaKundlista,
} from '../lib/foretagsskannern/skanna'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test.describe('skannaKundlista', () => {
  test('5 rader, 2 utan telefon, 1 dubblett (070-1234567 vs +46701234567) ⇒ exakta tal', () => {
    const csv = [
      'Namn,Telefon,E-post',
      'Anna Andersson,070-1234567,anna@example.com',
      'Bertil Berg,+46701234567,bertil@example.com',
      'Cecilia Ceder,,cecilia@example.com',
      'David Dag,,david@example.com',
      'Erik Ek,0709999999,erik@example.com',
    ].join('\n')

    const r = skannaKundlista(csv)
    expect(r.kunder).toBe(5)
    expect(r.utanTelefon).toBe(2)
    expect(r.utanEpost).toBe(0)
    expect(r.dubbletter).toBe(1)
    expect(r.exempelNamn).toEqual(['Anna Andersson', 'Bertil Berg', 'Cecilia Ceder'])
  })

  test('tom fil ⇒ nollor, ingen krasch', () => {
    const r = skannaKundlista('')
    expect(r).toEqual({ kunder: 0, utanTelefon: 0, utanEpost: 0, dubbletter: 0, exempelNamn: [] })
  })

  test('dubblett på e-post räknas också, oberoende av telefon', () => {
    const csv = [
      'Namn,Telefon,E-post',
      'Anna Andersson,0701111111,samma@example.com',
      'Bertil Berg,0702222222,SAMMA@example.com',
    ].join('\n')
    expect(skannaKundlista(csv).dubbletter).toBe(1)
  })
})

test.describe('skannaFakturor', () => {
  const NOW = new Date('2026-09-02T00:00:00.000Z')

  test('Fortnox-liknande rubriker ⇒ öppna/förfallna/belopp exakt', () => {
    const csv = [
      'Fakturanummer,Förfallodatum,Belopp,Betald,Kund',
      'INV-1,2020-01-01,1000,Nej,Kund A', // obetald, förfallen
      'INV-2,2099-01-01,2000,Nej,Kund B', // obetald, INTE förfallen (framtida datum)
      'INV-3,2020-01-01,3000,Ja,Kund C', // betald — räknas i fakturor, inte i öppna/förfallna
      'INV-4,2020-06-15,abc,Nej,Kund D', // ogiltigt belopp — hela raden ignoreras
    ].join('\n')

    const r = skannaFakturor(csv, NOW)
    expect(r).not.toBeNull()
    expect(r!.fakturor).toBe(3)
    expect(r!.oppna).toBe(2)
    expect(r!.forfallna).toBe(1)
    expect(r!.forfalletBelopp).toBe(1000)
    const forvantatDagar = Math.floor((NOW.getTime() - new Date('2020-01-01').getTime()) / (24 * 60 * 60 * 1000))
    expect(r!.aldstaForfallnaDagar).toBe(forvantatDagar)
  })

  test('okända rubriker ⇒ null ("kunde inte läsa fakturafilen")', () => {
    const csv = ['Foo,Bar,Baz', '1,2,3'].join('\n')
    expect(skannaFakturor(csv, NOW)).toBeNull()
  })

  test('status-kolumnen kan själv säga "förfallen" utan tolkbart datum', () => {
    const csv = [
      'Invoice,Amount,Status',
      'INV-1,500,Overdue',
    ].join('\n')
    const r = skannaFakturor(csv, NOW)
    expect(r).not.toBeNull()
    expect(r!.forfallna).toBe(1)
    expect(r!.forfalletBelopp).toBe(500)
    expect(r!.aldstaForfallnaDagar).toBe(0) // inget tolkbart datum — gissar aldrig ett tal
  })

  test('tom fil ⇒ null', () => {
    expect(skannaFakturor('', NOW)).toBeNull()
  })
})

test.describe('byggFynd', () => {
  const NOW = new Date('2026-09-02T00:00:00.000Z')

  test('bara sanna rader, texterna innehåller talen', () => {
    const kund = { kunder: 5, utanTelefon: 2, utanEpost: 0, dubbletter: 1, exempelNamn: ['Anna', 'Bertil', 'Cecilia'] }
    const faktura = { fakturor: 3, oppna: 2, forfallna: 1, forfalletBelopp: 1000, aldstaForfallnaDagar: 2436 }
    const rows = byggFynd(kund, faktura, NOW)

    const byKey = Object.fromEntries(rows.map(r => [r.key, r]))
    expect(Object.keys(byKey).sort()).toEqual(['dubbletter', 'fakturor_forfallna', 'fakturor_oppna', 'kunder', 'utanTelefon'].sort())
    expect(byKey.kunder.text).toContain('5')
    expect(byKey.utanTelefon.text).toContain('2')
    expect(byKey.dubbletter.text).toContain('1')
    expect(byKey.fakturor_oppna.text).toContain('2')
    expect(byKey.fakturor_forfallna.text).toContain('1')
    expect(byKey.fakturor_forfallna.text).toContain(faktura.forfalletBelopp.toLocaleString('sv-SE'))
    // Uppföljningen berättar vad teamet gör — aldrig tom för en rad som visas.
    for (const row of rows) expect(row.uppfoljning.length).toBeGreaterThan(0)
  })

  test('tomt underlag ⇒ []', () => {
    const kund = { kunder: 0, utanTelefon: 0, utanEpost: 0, dubbletter: 0, exempelNamn: [] }
    expect(byggFynd(kund, null, NOW)).toEqual([])
  })

  test('utan fakturafil (null) visas bara kundfynden', () => {
    const kund = { kunder: 3, utanTelefon: 0, utanEpost: 1, dubbletter: 0, exempelNamn: ['A', 'B', 'C'] }
    const rows = byggFynd(kund, null, NOW)
    expect(rows.map(r => r.key)).toEqual(['kunder', 'utanEpost'])
  })
})

test.describe('sidan (app/foretagsskannern/page.tsx)', () => {
  const src = read('app/foretagsskannern/page.tsx')

  test('ingen fetch av filinnehåll till servern — enda fetch är spar-rutten', () => {
    const fetchAnrop = src.match(/fetch\(/g) ?? []
    expect(fetchAnrop.length).toBe(1)
    expect(src).toContain("fetch('/api/foretagsskannern/spar'")
  })

  test('lovar att inget skickas — och menar det', () => {
    expect(src).toContain('skickas ingenstans')
  })

  test('handoffen till onboardingen: skrivUnderlag + router.push med via=skanner', () => {
    expect(src).toContain('skrivUnderlag(')
    expect(src).toContain("router.push('/registrera?via=skanner')")
  })

  test('handoff-nyckeln kommer från skanna.ts, inte en egen sträng i sidan', () => {
    const lib = read('lib/foretagsskannern/skanna.ts')
    expect(lib).toContain(`HANDOFF_KEY = '${HANDOFF_KEY}'`)
    expect(HANDOFF_KEY).toBe('hm_foretagsskannern_underlag')
  })

  test('ingen auth-import — sidan är publik', () => {
    expect(src).not.toMatch(/getAuthenticatedBusiness/)
  })
})

test.describe('StepImportData — handoff-inkoppling', () => {
  const src = read('app/onboarding/components/StepImportData.tsx')

  test('läser lasOchRensaUnderlag och postar till samma /api/customers/import som CSV-vägen', () => {
    expect(src).toContain("from '@/lib/foretagsskannern/skanna'")
    expect(src).toContain('lasOchRensaUnderlag(')
    expect(src).toContain("fetch('/api/customers/import'")
    // Fortnox-vägen ska stå orörd.
    expect(src).toContain('connectFortnox')
    expect(src).toContain('runFortnoxImport')
  })
})

test.describe('spar-rutten', () => {
  const src = read('app/api/foretagsskannern/spar/route.ts')

  test('fail-closed IP-tak + honeypot, ingen tenant-grind (rutten är publik)', () => {
    expect(src).toContain('checkPublicRateLimitDb(')
    expect(src).toContain('_hp')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
  })

  test('inventariet i facit-route-auth-inventory.spec.ts är uppdaterat', () => {
    const inventering = read('tests/facit-route-auth-inventory.spec.ts')
    expect(inventering).toContain("'foretagsskannern/spar':")
    expect(inventering.match(/^\s*'foretagsskannern\/spar',\s*$/m)).toBeTruthy()
  })
})

test.describe('CI-inkoppling', () => {
  test('facit-namnet finns i test:contracts (package.json) och contracts.yml', () => {
    // "Finns", inte "står sist": flera pass läggs till samma lista samma dag.
    const pkg = JSON.parse(read('package.json'))
    const script: string = pkg.scripts['test:contracts']
    expect(script).toContain('tests/foretagsskannern.spec.ts')

    const yaml = fs.readFileSync(path.join(ROOT, '..', '.github', 'workflows', 'contracts.yml'), 'utf8')
    expect(yaml).toContain('tests/foretagsskannern.spec.ts')
  })
})
