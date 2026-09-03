import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (file: string) => fs
  .readFileSync(path.join(ROOT, file), 'utf8')
  .replace(/\r\n/g, '\n')

test.describe('Lanseringslöften — publik text får aldrig ligga före beviset', () => {
  test('köpflödet lovar ingen gratis provperiod', () => {
    const comparison = read('app/jamfor/page.tsx')
    expect(comparison).not.toMatch(/Testa Handymate gratis/i)
    expect(comparison).not.toMatch(/Alla plattformar erbjuder tester/i)
    expect(comparison).not.toContain('Prisintervall: {plan.range} kr/mån')
    expect(comparison).toContain('Kom igång med Handymate')
  })

  test('obevisade externa integrationer visas inte som fullt lanserade', () => {
    const comparison = read('app/jamfor/page.tsx')
    for (const claim of [
      'Lisa fångar missade samtal och återkopplar via SMS',
      'Automatiska SMS-svar till kunder',
      'AI skapar offertutkast från samtal',
      'Google Kalender',
      'Gmail',
    ]) {
      const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(comparison).toMatch(new RegExp(`name: '${escaped}', handymate: 'partial'`))
    }

    const lisaLanding = read('app/slipp-administrationen/page.tsx')
    expect(lisaLanding).not.toContain('Nya och missade samtal blir kund, lead och affär')
    expect(lisaLanding).toContain('När telefonkanalen är aktiverad och verifierad')
  })

  test('jämförelsen gör inga absoluta unik- eller saknaspåståenden', () => {
    const comparison = read('app/jamfor/page.tsx')
    expect(comparison).not.toContain('Handymate är det enda systemet')
    expect(comparison).not.toContain("s === 'none' ? 'Saknas'")
    expect(comparison).toContain('Ej verifierat publikt')
  })

  test('onboarding och migrering beskrivs utan obevisade tids- och omfattningslöften', () => {
    const comparison = read('app/jamfor/page.tsx')
    expect(comparison).toContain("name: 'Guidad onboarding'")
    expect(comparison).not.toContain('Onboarding på 15 minuter')
    expect(comparison).not.toContain('De flesta är igång inom 24 timmar')
    expect(comparison).not.toContain('migrera kunder, offerter och projektdata')
  })

  test('löfte–bevis-registret är underordnat de två auktoritativa launch-dokumenten', () => {
    const matrix = read('docs/launch/LAUNCH_PROMISE_PROOF_MATRIX.md')
    expect(matrix).toContain('docs/launch/GO_NO_GO.md')
    expect(matrix).toContain('docs/launch/LAUNCH_TEST_SUITE.md')
    expect(matrix).toContain('inte en tredje lanseringschecklista')
    expect(matrix).toContain('BEVISAT I KOD')
    expect(matrix).toContain('KRÄVER SKARPBEVIS')
    expect(matrix).toContain('DOLT TILLS BEVISAT')
  })
})
