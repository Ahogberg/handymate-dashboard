/**
 * Facit-tester för referensfoton i kundens offert (idé 6, 2026-08-05).
 *
 * Kärnkravet: vi påstår BARA "liknande jobb" när orden faktiskt överlappar.
 * Utan överlapp visas fotona som "tidigare jobb" — sant — i stället för att
 * antyda en likhet som inte finns. Ett falskt likhetspåstående i ett
 * säljdokument är precis den sortens sak som förstör förtroende när kunden
 * upptäcker det.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/reference-photos.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  meaningfulWords,
  looksSimilar,
  selectReferencePhotos,
  getReferencePhotos,
  MAX_REFERENCE_PHOTOS,
} from '../lib/quotes/reference-photos'

const photo = (projectName: string | null, url = 'https://x/1.jpg', caption: string | null = null) => ({
  url,
  caption,
  projectName,
})

test('publik referensfotohämtning är fail-closed och gör ingen DB-fråga', async () => {
  const supabase = new Proxy({}, {
    get() {
      throw new Error('DB får inte anropas utan publiceringssamtycke')
    },
  })
  await expect(getReferencePhotos(supabase as any, 'biz-1', 'Badrum')).resolves.toBeNull()
})

test.describe('meaningfulWords', () => {
  test('kortord och fyllnadsord räknas inte', () => {
    const words = meaningfulWords('Byte av nytt tak på huset')
    expect(words).not.toContain('av')
    expect(words).not.toContain('på')
    expect(words).not.toContain('byte')
    expect(words).not.toContain('nytt')
    expect(words).toContain('huset')
  })

  test('skiljetecken och versaler stör inte', () => {
    expect(meaningfulWords('Badrumsrenovering, 20 kvm!')).toContain('badrumsrenovering')
  })

  test('tomt värde ger tom lista', () => {
    expect(meaningfulWords(null)).toEqual([])
    expect(meaningfulWords('')).toEqual([])
  })
})

test.describe('looksSimilar — likhet måste vara verklig', () => {
  test('delat meningsbärande ord räknas som likt', () => {
    expect(looksSimilar('Badrumsrenovering Storgatan', 'Badrumsrenovering hos Andersson')).toBe(true)
  })

  test('helt olika jobb är inte likt', () => {
    expect(looksSimilar('Takbyte villa', 'Badrumsrenovering')).toBe(false)
  })

  test('bara fyllnadsord gemensamt räcker inte', () => {
    // "av" och "nytt" är stoppord — de får aldrig skapa en falsk likhet.
    expect(looksSimilar('Byte av nytt kök', 'Byte av nytt tak')).toBe(false)
  })

  test('saknad titel eller projektnamn ger aldrig likhet', () => {
    expect(looksSimilar(null, 'Badrum')).toBe(false)
    expect(looksSimilar('Badrum', null)).toBe(false)
  })
})

test.describe('selectReferencePhotos', () => {
  test('liknande jobb väljs före övriga och rubriken påstår likhet', () => {
    const selection = selectReferencePhotos(
      [photo('Takbyte Lindvägen', 'https://x/tak.jpg'), photo('Badrumsrenovering', 'https://x/bad.jpg')],
      'Badrumsrenovering Storgatan 4',
    )
    expect(selection.photos).toHaveLength(1)
    expect(selection.photos[0].url).toBe('https://x/bad.jpg')
    expect(selection.isSimilar).toBe(true)
    expect(selection.heading).toBe('Liknande jobb vi gjort')
  })

  test('utan likhet visas fotona ändå — men rubriken påstår INTE likhet', () => {
    const selection = selectReferencePhotos(
      [photo('Takbyte Lindvägen'), photo('Fasadmålning')],
      'Badrumsrenovering',
    )
    expect(selection.photos.length).toBeGreaterThan(0)
    expect(selection.isSimilar).toBe(false)
    expect(selection.heading).toBe('Tidigare jobb vi gjort')
  })

  test('högst tre foton — en offert är inte ett bildgalleri', () => {
    const many = Array.from({ length: 10 }, (_, i) => photo('Badrum', `https://x/${i}.jpg`))
    expect(selectReferencePhotos(many, 'Badrum').photos).toHaveLength(MAX_REFERENCE_PHOTOS)
  })

  test('tomma bildtexter normaliseras till null', () => {
    const selection = selectReferencePhotos([photo('Badrum', 'https://x/1.jpg', '   ')], 'Badrum')
    expect(selection.photos[0].caption).toBeNull()
  })

  test('inga kandidater ger inga foton', () => {
    expect(selectReferencePhotos([], 'Badrum').photos).toEqual([])
  })
})
