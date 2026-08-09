/**
 * Facit för ÄTA:ns livscykel (2026-08-09, projektauditen P1-6).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * Två rutter skrev ÄTA-status med olika regler: /api/ata/[id] hade en
 * övergångsmatris, /api/projects/[id]/changes accepterade VILKEN status som
 * helst och redigerade belopp/typ i vilket läge som helst — även efter att
 * kunden signerat. Kundens underskrift satt på ett dokument som kunde
 * skrivas om under den.
 *
 *   npx playwright test tests/ata-livscykeln.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { ATA_TRANSITIONS, canTransitionAta, isAtaEditable } from '../lib/ata/lifecycle'

const ROOT = path.resolve(__dirname, '..')
const kod = (p: string) =>
  fs.readFileSync(path.join(ROOT, p), 'utf8')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

const RUTTERNA = ['app/api/ata/[id]/route.ts', 'app/api/projects/[id]/changes/route.ts']

test.describe('en matris, båda rutterna', () => {
  for (const rutt of RUTTERNA) {
    test(`${rutt} frågar den delade livscykeln`, () => {
      const s = kod(rutt)
      expect(s).toContain('canTransitionAta')
      expect(s).toContain('isAtaEditable')
      expect(s, 'en inline-matris har återuppstått').not.toContain('validTransitions')
    })
  }

  test('changes-rutten hämtar nuläget FÖRE valideringen', () => {
    // Utan uppslaget finns inget "from" att validera mot — det var precis
    // så den regellösa maskinen såg ut.
    const s = kod('app/api/projects/[id]/changes/route.ts')
    const uppslag = s.indexOf("select('status')")
    const validering = s.indexOf('canTransitionAta(')
    expect(uppslag).toBeGreaterThan(-1)
    expect(uppslag).toBeLessThan(validering)
  })
})

test.describe('matrisens invarianter', () => {
  test('fakturerad är en ändstation', () => {
    expect(ATA_TRANSITIONS.invoiced).toEqual([])
    expect(canTransitionAta('invoiced', 'draft')).toBe(false)
    expect(canTransitionAta('invoiced', 'approved')).toBe(false)
  })

  test('kundens beslut kan inte skrivas om', () => {
    // declined är slutgiltigt. signed får bara gå FRAMÅT (bokföring/faktura),
    // aldrig tillbaka till något kunden inte sett.
    expect(ATA_TRANSITIONS.declined).toEqual([])
    expect(canTransitionAta('signed', 'draft')).toBe(false)
    expect(canTransitionAta('signed', 'sent')).toBe(false)
    expect(canTransitionAta('signed', 'invoiced')).toBe(true)
  })

  test('innehåll får bara ändras före utskick', () => {
    expect(isAtaEditable('draft')).toBe(true)
    expect(isAtaEditable('pending')).toBe(true)
    for (const låst of ['sent', 'approved', 'signed', 'declined', 'rejected', 'invoiced']) {
      expect(isAtaEditable(låst), `${låst} ska vara låst`).toBe(false)
    }
  })

  test('okänd status failar stängt', () => {
    expect(canTransitionAta('påhittad', 'approved')).toBe(false)
    expect(canTransitionAta(null, 'approved')).toBe(false)
  })

  test('bara lagliga vägar leder till fakturerad', () => {
    const vagar = (Object.keys(ATA_TRANSITIONS) as Array<keyof typeof ATA_TRANSITIONS>)
      .filter(fran => (ATA_TRANSITIONS[fran] as readonly string[]).includes('invoiced'))
    expect(vagar.sort()).toEqual(['approved', 'signed'])
  })
})

test.describe('innehållslåset i den tidigare regellösa rutten', () => {
  test('belopp/typ avvisas med besked när ÄTA:n är låst', () => {
    const s = kod('app/api/projects/[id]/changes/route.ts')
    expect(s).toContain('isAtaEditable(existing.status)')
    expect(s).toContain('Skapa en ny ÄTA')
  })
})
