/**
 * Facit för Platsbanken som prospektkälla (2026-09-03).
 *
 * Källan och kvalitetsmåttet är samma sak: en firma som annonserar efter
 * hantverkare växer. Raderna uppfyller importgrindens källkrav genom sin
 * konstruktion — source_name, source_url och source_checked_at sätts av
 * mappningen, inte av en människa efteråt.
 *
 * Testas mot samma riktiga svar som rekryteringssignalen
 * (tests/fixtures/jobtech-elektriker.json), där Jönköpings kommun och SkiStar
 * ligger sida vid sida — precis den blandning sållningen måste klara.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  arOffentligOrgnummer,
  legalFormFranOrgnummer,
  traffarTillProspekt,
} from '../lib/launch-desk/platsbanken-kalla'
import type { PlatsbankenTraff } from '../lib/launch-desk/rekryteringssignal'

const fixtur = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'fixtures/jobtech-elektriker.json'), 'utf8'),
) as { hits: PlatsbankenTraff[] }
const NU = new Date('2026-09-04T08:00:00+02:00')
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8')
/** Källskanningar ska läsa KOD, inte kommentarer. Båda filerna dokumenterar
 *  uttryckligen vad de INTE gör ("application_contacts läses aldrig", "inget
 *  internt anrop till /api/admin/launch/accounts") — och en naiv sökning
 *  fastnade på just de meningarna. Dokumentationen ska stå kvar; testet får
 *  anpassa sig. */
const kod = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')

test.describe('gruppsiffran i organisationsnumret', () => {
  test('2 = offentlig — verifierat mot Jönköpings kommun i riktig data', () => {
    expect(arOffentligOrgnummer('2120000530')).toBe(true)
    expect(arOffentligOrgnummer('5560936949')).toBe(false)
  })

  test('bolagsform härleds ur numret', () => {
    expect(legalFormFranOrgnummer('5560936949')).toBe('limited_company')
    expect(legalFormFranOrgnummer('7696000000')).toBe('association')
    expect(legalFormFranOrgnummer('9696000000')).toBe('trading_partnership')
  })

  test('personnummerliknande nummer blir unknown, inte en gissning', () => {
    // En enskild firma har inget eget organisationsnummer — innehavarens
    // personnummer används, och det går inte att skilja från en myndighet på
    // siffran ensam. Importgrinden stoppar då raden för kall kontakt, vilket
    // är rätt: en enskild firma är en fysisk person.
    expect(legalFormFranOrgnummer('8501011234')).toBe('unknown')
    expect(legalFormFranOrgnummer('okänt')).toBe('unknown')
  })
})

test.describe('traffarTillProspekt — mot riktig Platsbanken-data', () => {
  test('offentlig sektor sållas bort, näringslivet blir prospekt', () => {
    const { prospekt, bortsorterade } = traffarTillProspekt(fixtur.hits, { nu: NU })
    expect(bortsorterade.offentliga).toBe(1)          // Jönköpings kommun
    expect(prospekt).toHaveLength(1)                   // SkiStar
    expect(prospekt[0].company_name).toBe('SkiStar Aktiebolag')
    expect(prospekt[0].org_number).toBe('5560936949')
    expect(prospekt[0].legal_form).toBe('limited_company')
  })

  test('källkravet uppfylls av mappningen — inte av en människa efteråt', () => {
    const { prospekt } = traffarTillProspekt(fixtur.hits, { nu: NU })
    const rad = prospekt[0]
    expect(rad.source_name).toContain('Platsbanken')
    expect(rad.source_url).toContain('arbetsformedlingen.se/platsbanken/annonser/')
    expect(new Date(rad.source_checked_at).getTime()).toBe(NU.getTime())
    expect(rad.legal_form).not.toBe('unknown')
  })

  test('kommun och län följer med från annonsen', () => {
    const { prospekt } = traffarTillProspekt(fixtur.hits, { nu: NU })
    expect(prospekt[0].municipality).toBe('Åre')
    expect(prospekt[0].county).toBe('Jämtlands län')
  })

  test('samma firma två gånger ger ett prospekt', () => {
    const dubbelt = [...fixtur.hits, { ...fixtur.hits[1], id: 'annan-annons' }]
    const { prospekt, bortsorterade } = traffarTillProspekt(dubbelt, { nu: NU })
    expect(prospekt).toHaveLength(1)
    expect(bortsorterade.dubbletter).toBe(1)
  })

  test('taket håller — listan får aldrig växa förbi vad någon hinner ringa', () => {
    const manga = Array.from({ length: 40 }, (_, i) => ({
      ...fixtur.hits[1],
      id: `a${i}`,
      employer: { ...fixtur.hits[1].employer, organization_number: `55609369${String(i).padStart(2, '0')}` },
    }))
    const { prospekt } = traffarTillProspekt(manga, { nu: NU, tak: 10 })
    expect(prospekt).toHaveLength(10)
  })

  test('borttagna annonser och rader utan orgnummer räknas bort, inte tyst', () => {
    const skrap: PlatsbankenTraff[] = [
      { ...fixtur.hits[1], id: 'x', removed: true },
      { id: 'y', employer: { name: 'Utan nummer AB' } },
      {},
    ]
    const { prospekt, bortsorterade } = traffarTillProspekt(skrap, { nu: NU })
    expect(prospekt).toHaveLength(0)
    expect(bortsorterade.borttagnaAnnonser).toBe(1)
    expect(bortsorterade.utanOrgnummer).toBe(2)
  })

  test('nyaste annonsen vinner när samma firma har flera', () => {
    const { prospekt } = traffarTillProspekt([
      { ...fixtur.hits[1], id: 'gammal', publication_date: '2026-07-01T09:00:00', webpage_url: 'https://x/gammal' },
      { ...fixtur.hits[1], id: 'ny', publication_date: '2026-09-02T09:00:00', webpage_url: 'https://x/ny' },
    ], { nu: NU })
    expect(prospekt[0].source_url).toBe('https://x/ny')
  })
})

test.describe('personuppgifter lämnas kvar i annonsen', () => {
  const modul = kod('lib/launch-desk/platsbanken-kalla.ts')

  test('application_contacts läses aldrig — de numren är publicerade för rekrytering', () => {
    // Fixturens första annons har "Roy Karlsson, 036-105728, Enhetschef".
    // Att flytta det till en säljlista vore att återanvända en persons
    // uppgifter för ett annat ändamål än de publicerades för.
    expect(modul).not.toContain('application_contacts')
    const { prospekt } = traffarTillProspekt(fixtur.hits, { nu: NU })
    for (const rad of prospekt) {
      expect(rad.primary_contact_name ?? null).toBeNull()
      expect(rad.primary_contact_phone ?? null).toBeNull()
      expect(rad.primary_contact_email ?? null).toBeNull()
    }
  })

  test('kontaktgrunden är publik företagsuppgift, aldrig en yrkesroll', () => {
    const { prospekt } = traffarTillProspekt(fixtur.hits, { nu: NU })
    expect(prospekt[0].contact_basis).toBe('public_business_contact')
  })
})

test.describe('rutten är en källa, inte en skrivare', () => {
  const rutt = kod('app/api/admin/launch/kallor/platsbanken/route.ts')
  const sida = read('app/admin/launch/page.tsx')

  test('adminspärrad och force-dynamic', () => {
    expect(rutt).toContain('isAdmin(request)')
    expect(rutt).toContain("export const dynamic = 'force-dynamic'")
  })

  test('rutten skriver ingenting — inga insert, update eller upsert', () => {
    expect(rutt).not.toMatch(/\.insert\(|\.update\(|\.upsert\(/)
  })

  test('inget internt HTTP-anrop till importrutten', () => {
    // Första utkastet anropade /api/admin/launch/accounts över HTTP med
    // vidarebefordrade cookies. Skört och onödigt — klienten har redan vägen.
    expect(rutt).not.toContain('/api/admin/launch/accounts')
  })

  test('taket är hårt och går inte att kringgå via body', () => {
    expect(rutt).toContain('Math.min(Number(body?.tak)')
    expect(rutt).toContain('TAK_PER_KORNING')
  })

  test('klienten lägger prospekten i samma importflöde som CSV', () => {
    expect(sida).toContain('hamtaFranPlatsbanken')
    expect(sida).toContain("fetch('/api/admin/launch/kallor/platsbanken'")
    expect(sida).toContain('setImportRows(data.prospekt')
  })

  test('förhandsvisningen säger uttryckligen att inget är skrivet än', () => {
    expect(sida).toContain('Inget är skrivet än')
  })
})
