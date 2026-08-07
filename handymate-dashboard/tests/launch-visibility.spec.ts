/**
 * Facit för lanseringssynligheten (2026-08-07, etapp 1).
 *
 * ═══ VAD SOM SKYDDAS ═══
 *
 * Två axlar som ser lika ut men betyder olika saker:
 *
 * - `featureGate` (lib/feature-gates.ts) = "ingår inte i din plan" → hänglås + uppsälj
 * - `launchGate` (lib/launch-visibility.ts) = "vi har inte skeppat det" → dold eller
 *   "Kommer snart"
 *
 * `Utskick (Leads)` låg tidigare bakom `featureGate: 'leads_outbound'` och visades
 * därför med hänglås och texten "Ingår i Business". Funktionen är inte klar — kunden
 * kunde alltså uppgradera och ändå inte få något. Det testet nedan låser är att den
 * posten aldrig glider tillbaka till plan-axeln.
 *
 * Det andra som låses är att **döljandet inte är kosmetiskt**: en dold funktion måste
 * grindas på routen också, annars räcker en sparad URL för att hamna i en halvfärdig vy.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/launch-visibility.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  LAUNCH_GATES,
  launchState,
  isLaunchHidden,
  isComingSoon,
  launchGateForPath,
  COMING_SOON_LABEL,
} from '../lib/launch-visibility'

const ROOT = path.resolve(__dirname, '..')
const läs = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('de två axlarna hålls isär', () => {
  test('Utskick ligger på launchGate, aldrig på featureGate', () => {
    // Regressionstestet för det falska löftet.
    const sidebar = läs('components/Sidebar.tsx')
    const raden = sidebar.split('\n').find(r => r.includes("/dashboard/marketing/leads"))
    expect(raden, 'Utskick-raden hittades inte').toBeTruthy()
    expect(raden, 'Utskick får inte ligga bakom en planbaserad grind').not.toContain('featureGate')
    expect(raden).toContain("launchGate: 'leads_outbound'")
  })

  test('"Kommer snart" och hänglås är ömsesidigt uteslutande i renderingen', () => {
    // Båda renderingsställena — toppnivåpost och undermenypost — måste välja
    // markeringen FÖRE låset, annars kan en post visa båda.
    const sidebar = läs('components/Sidebar.tsx')
    // Leta på JSX-renderingen, inte på variabeldeklarationen — `const Wrapper =
    // kommerSnart ? ...` matchar annars först och säger inget om markeringen.
    for (const flagga of ['{kommerSnart ? (', '{barnKommerSnart ? (']) {
      const i = sidebar.indexOf(flagga)
      expect(i, `${flagga} saknas — renderingen har ändrats`).toBeGreaterThan(-1)
      const efter = sidebar.slice(i, i + 400)
      // Källkoden renderar identifieraren, inte strängvärdet — leta på den.
      expect(efter, `${flagga} måste välja markeringen före låset`).toContain('COMING_SOON_LABEL')
      expect(efter.indexOf('COMING_SOON_LABEL'), `${flagga}: låset kommer före markeringen`)
        .toBeLessThan(efter.includes('<Lock') ? efter.indexOf('<Lock') : Number.MAX_SAFE_INTEGER)
    }
  })

  test('inget lanseringsvärde utanför de två tillåtna', () => {
    for (const [nyckel, värde] of Object.entries(LAUNCH_GATES)) {
      expect(['hidden', 'soon'], `${nyckel} har ogiltigt tillstånd`).toContain(värde)
    }
  })
})

test.describe('döljandet är inte kosmetiskt', () => {
  test('varje dold funktion grindas också på routen', () => {
    // Att bara ta bort menylänken lämnar sparade URL:er öppna. Alla nycklar utom
    // rena UI-knappar måste ha minst en grindad sökväg.
    const grindade = new Set(
      ['/dashboard/website', '/dashboard/settings/website-widget', '/dashboard/vehicles',
       '/dashboard/planning/inventory', '/dashboard/settings/pricelist', '/dashboard/orders',
       '/dashboard/subcontractors', '/dashboard/settings/inventory',
       '/dashboard/settings/system-health', '/dashboard/marketing/leads']
        .map(p => launchGateForPath(p))
        .filter(Boolean) as string[],
    )
    const saknas = Object.keys(LAUNCH_GATES).filter(k => !grindade.has(k))
    expect(saknas, 'Nycklar utan grindad route — en sparad URL kommer förbi').toEqual([])
  })

  test('grinden gäller även "Kommer snart", inte bara dolda', () => {
    // En markering som går att klicka sig förbi vore samma osanning som hänglåset
    // den ersatte.
    expect(launchGateForPath('/dashboard/marketing/leads')).toBe('leads_outbound')
    expect(isComingSoon('leads_outbound')).toBe(true)
  })

  test('undersökvägar grindas, inte bara exakt träff', () => {
    expect(launchGateForPath('/dashboard/vehicles/42')).toBe('vehicles')
    expect(launchGateForPath('/dashboard/orders/new')).toBe('wholesaler')
  })

  test('fria vägar släpps igenom', () => {
    for (const p of ['/dashboard', '/dashboard/quotes', '/dashboard/settings', '/dashboard/karin']) {
      expect(launchGateForPath(p), `${p} ska inte grindas`).toBeNull()
    }
  })

  test('middleware läser grinden', () => {
    expect(läs('middleware.ts')).toContain('launchGateForPath')
  })
})

test.describe('grossistens ingångar utanför menyn', () => {
  test('offertskaparens "Sök grossist" är grindad', () => {
    // Codex poäng: en dold meny med kvarvarande knapp är sämre än att inte dölja alls.
    const f = läs('app/dashboard/quotes/_shared/QuoteItemsSection.tsx')
    expect(f).toContain("isLaunchHidden('wholesaler')")
  })

  test('projektvyns grossistmodal är grindad', () => {
    const f = läs('app/dashboard/projects/[id]/page.tsx')
    expect(f).toContain("isLaunchHidden('wholesaler')")
  })
})

test.describe('uppslaget', () => {
  test('okänd nyckel är fri, inte dold', () => {
    // Ett fallback till "dold" hade kunnat radera funktioner av misstag.
    expect(launchState('finns-inte')).toBeNull()
    expect(isLaunchHidden('finns-inte')).toBe(false)
    expect(isComingSoon('finns-inte')).toBe(false)
  })

  test('tomt och null ger fri väg', () => {
    for (const v of [undefined, null, '']) {
      expect(isLaunchHidden(v)).toBe(false)
      expect(isComingSoon(v)).toBe(false)
    }
  })
})

test.describe('inställningshubben', () => {
  test('mobilmenyn slänger inte längre bort länkposterna', () => {
    // Regressionstestet för mobilbristen: HELA gruppen Försäljning, sju av tio under
    // Drift och Bolagsprofil var oåtkomliga på telefon.
    const f = läs('app/dashboard/settings/page.tsx')
    expect(f, 'filtret som dolde länkposterna är tillbaka').not.toContain("!t.id.startsWith('_link_')")
  })

  test('hubben läser samma lanseringsnyckel som menyn', () => {
    const f = läs('app/dashboard/settings/page.tsx')
    expect(f).toContain('launchGateForPath')
  })
})
