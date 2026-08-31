/**
 * Regressionsprov (holistisk slutgranskning, offertskaparen-design-polish,
 * 2026-09-01) — "exakt EN Spara/Skicka-yta synlig per brytpunkt".
 *
 * Fas B (2026-08-31) införde mobilens fasta bottenfält (QuoteBuilderBottomBar)
 * och gjorde SAMTIDIGT headerns egen knappgrupp (QuoteBuilderHeader.tsx)
 * `hidden lg:flex` — annars visas två Spara/Skicka-knappuppsättningar
 * samtidigt under `lg` (exakt den dubbla Skicka-knappen som fick tas bort
 * 2026-08-06, se kodkommentar i QuoteBuilder.tsx). Det här villkorsparet gick
 * sönder EN GÅNG under Fas B:s eget granskningspass och fick repareras
 * (0e6b4de1, "åtgärda granskningsfynd i Fas B-bottenfältet") — men ingen
 * automatiserad test bevakade paret framåt. Det här provet är den
 * bevakningen: källskanning (husets facit-stil, se tests/quotes-mer-i-
 * flodet.spec.ts) av båda filerna, ingen mount/render.
 *
 *   npx playwright test tests/quote-builder-single-cta-surface.spec.ts --no-deps
 */
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const QUOTES_DIR = path.join(__dirname, '..', 'app', 'dashboard', 'quotes')
const HEADER = fs.readFileSync(path.join(QUOTES_DIR, '_shared', 'QuoteBuilderHeader.tsx'), 'utf8')
const BOTTOM_BAR = fs.readFileSync(path.join(QUOTES_DIR, '_shared', 'QuoteBuilderBottomBar.tsx'), 'utf8')

test.describe('Headerns knappgrupp (desktop) är hidden lg:flex', () => {
  test('Spara utkast/Skicka offert-knapparnas wrapper har klassen "hidden lg:flex"', () => {
    // Isolera wrapper-<div>:en runt knapparna: den som direkt föregås av
    // kommentaren om `hidden lg:flex` och innehåller onSaveDraft/onSendQuote.
    const saveDraftIdx = HEADER.indexOf('onClick={onSaveDraft}')
    expect(saveDraftIdx, 'Spara utkast-knappen hittades inte i QuoteBuilderHeader.tsx').toBeGreaterThan(-1)

    // Wrapper-diven är den senaste `<div className="..."` FÖRE knappen.
    const wrapperStart = HEADER.lastIndexOf('<div className="hidden lg:flex', saveDraftIdx)
    expect(
      wrapperStart,
      'ingen <div className="hidden lg:flex..."> hittades direkt runt Spara/Skicka-knapparna — ' +
        'headerns knappgrupp måste vara dold under lg (annars krockar den med bottenfältet, se docblock)',
    ).toBeGreaterThan(-1)

    // Sätt bevisligen "on"/uppspårat: mellan wrapper-start och knappen finns
    // ingen stängande </div> som skulle innebära att knappen ligger UTANFÖR
    // den wrappern.
    const between = HEADER.slice(wrapperStart, saveDraftIdx)
    const opens = (between.match(/<div/g) || []).length
    const closes = (between.match(/<\/div>/g) || []).length
    expect(opens - closes, 'Spara-knappen ligger inte kvar inuti hidden lg:flex-wrappern').toBeGreaterThan(0)
  })

  test('Skicka offert-knappen ligger i SAMMA hidden lg:flex-wrapper som Spara utkast', () => {
    const sendQuoteIdx = HEADER.indexOf('onClick={onSendQuote}')
    const saveDraftIdx = HEADER.indexOf('onClick={onSaveDraft}')
    const wrapperStart = HEADER.lastIndexOf('<div className="hidden lg:flex', saveDraftIdx)
    expect(sendQuoteIdx).toBeGreaterThan(wrapperStart)

    // Hitta wrapperns matchande stängande tagg genom att räkna djup
    // (robust mot radbrytningsstil, CRLF/LF) i stället för att leta efter
    // en exakt whitespace-sträng: varje `<div` ökar djupet, varje `</div>`
    // minskar det — wrapperns egen stängning är taggen där djupet först
    // återgår till 0 efter starttaggen.
    const openTagEnd = HEADER.indexOf('>', wrapperStart) + 1
    const rest = HEADER.slice(openTagEnd)
    const tagPattern = /<div[\s>]|<\/div>/g
    let depth = 1
    let match: RegExpExecArray | null
    let wrapperEnd = -1
    while ((match = tagPattern.exec(rest))) {
      if (match[0].startsWith('</div>')) {
        depth--
        if (depth === 0) {
          wrapperEnd = openTagEnd + match.index
          break
        }
      } else {
        depth++
      }
    }
    expect(wrapperEnd, 'hittade inte wrapperns matchande stängande tagg').toBeGreaterThan(-1)
    expect(sendQuoteIdx).toBeLessThan(wrapperEnd)
  })

  test('"Spara som mall" ligger UTANFÖR hidden lg:flex-paret (egen hidden sm:inline-flex, se docblock)', () => {
    // Medveten skillnad, dokumenterad i QuoteBuilderHeader.tsx: "Spara som
    // mall" saknar en bottenfälts-motsvarighet och ska därför INTE gates på
    // lg — bara Spara utkast/Skicka-paret ska. Ett nollbevis mot att någon
    // av misstag sveper in den i samma lg-gate.
    const templateIdx = HEADER.indexOf('onClick={onSaveTemplate}')
    const draftWrapperStart = HEADER.lastIndexOf('<div className="hidden lg:flex', HEADER.indexOf('onClick={onSaveDraft}'))
    expect(templateIdx, 'Spara som mall-knappen hittades inte').toBeGreaterThan(-1)
    expect(templateIdx).toBeLessThan(draftWrapperStart)
  })
})

test.describe('Bottenfältet (mobil) är lg:hidden', () => {
  test('QuoteBuilderBottomBar.tsx:s rot-div har klassen "lg:hidden"', () => {
    const rootDivIdx = BOTTOM_BAR.indexOf('return (')
    const nextDiv = BOTTOM_BAR.indexOf('<div', rootDivIdx)
    const classNameMatch = BOTTOM_BAR.slice(nextDiv, nextDiv + 400).match(/className="([^"]*)"/)
    expect(classNameMatch, 'hittade ingen className på rot-diven').not.toBeNull()
    expect(classNameMatch![1]).toContain('lg:hidden')
    // "fixed inset-x-0 bottom-0" hör ihop med lg:hidden-kontraktet: baren
    // ska vara fastsatt i botten NÄR den är synlig, inte bara dold korrekt.
    expect(classNameMatch![1]).toContain('fixed')
    expect(classNameMatch![1]).toContain('bottom-0')
  })

  test('Spara utkast/Skicka offert-knapparna finns i samma fil, inte gated bakom ytterligare ett lg:-villkor', () => {
    expect(BOTTOM_BAR).toContain('onClick={onSaveDraft}')
    expect(BOTTOM_BAR).toContain('onClick={onSendQuote}')
    // Knapparnas EGEN rot-div ska inte ha någon "lg:"-klass — de ärver
    // dolt/synligt enbart från den yttre lg:hidden-diven (testat ovan), en
    // andra oberoende lg-gate här hade kunnat divergera från den.
    const buttonsRootIdx = BOTTOM_BAR.indexOf('<div className="relative flex items-stretch gap-2">')
    expect(buttonsRootIdx).toBeGreaterThan(-1)
    expect(BOTTOM_BAR.slice(buttonsRootIdx, buttonsRootIdx + 60)).not.toContain('lg:')
  })
})

test.describe('Ingen tredje Spara/Skicka-yta smugit sig in', () => {
  test('exakt en onClick={onSaveDraft} och en onClick={onSendQuote} per fil', () => {
    for (const [label, source] of [['QuoteBuilderHeader.tsx', HEADER], ['QuoteBuilderBottomBar.tsx', BOTTOM_BAR]] as const) {
      const draftMatches = source.match(/onClick=\{onSaveDraft\}/g) || []
      const sendMatches = source.match(/onClick=\{onSendQuote\}/g) || []
      expect(draftMatches.length, `${label}: förväntade exakt 1 Spara utkast-knapp`).toBe(1)
      expect(sendMatches.length, `${label}: förväntade exakt 1 Skicka offert-knapp`).toBe(1)
    }
  })
})
