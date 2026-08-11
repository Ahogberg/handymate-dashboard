/**
 * Facit för Jarvis-hemmets tre rena funktioner (2026-08-08).
 *
 * Vyn själv testas med ögat — men logiken under den ska inte behöva det:
 * tidslinjens tolkning av krocksträngar, nyhetsradernas åtgärder och
 * närvarobandets härledning är alla rena och därför facit-bara.
 *
 * ═══ DEN VIKTIGASTE ═══
 *
 * `parseKonflikter` läser ett format som genereras i lib/approve-actions.ts.
 * Den kopplingen är avsiktlig men skör: ändras formatet där ska tidslinjen
 * rita INGENTING och kortet falla tillbaka på beskrivningen — aldrig visa
 * fel klockslag. Testet nedan låser båda halvorna.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/jarvis-hem.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { parseKonflikter, minuterFranIso } from '../components/jarvis/ScheduleTimeline'
import { nyhetsAtgard } from '../lib/jarvis/news-actions'
import { TEAM } from '../lib/agents/team'

const ROOT = path.resolve(__dirname, '..')

test.describe('tidslinjen tolkar krockarna', () => {
  test('läser formatet lib/approve-actions.ts faktiskt skriver', () => {
    // Exakt strängen produktionskoden bygger: `Schema: ${title} (HH:MM-HH:MM)`
    const block = parseKonflikter(['Schema: Ekbacken 3 (09:00-12:00)'])
    expect(block).toHaveLength(1)
    expect(block[0].titel).toBe('Ekbacken 3')
    expect(block[0].startMin).toBe(9 * 60)
    expect(block[0].slutMin).toBe(12 * 60)
  })

  test('klarar flera krockar och tankstreck', () => {
    const block = parseKonflikter([
      'Schema: Ekbacken 3 (09:00-12:00)',
      'Bokning: Norén service (13:30–14:15)',
    ])
    expect(block).toHaveLength(2)
    expect(block[1].startMin).toBe(13 * 60 + 30)
    expect(block[1].slutMin).toBe(14 * 60 + 15)
  })

  test('trasig indata ger inga block — aldrig gissade tider', () => {
    // Hellre ingen tidslinje än en som visar fel klockslag: kortet faller då
    // tillbaka på beskrivningen, som alltid är sann.
    expect(parseKonflikter(['Schema: utan tider'])).toEqual([])
    expect(parseKonflikter(['Schema: Bakvänt (12:00-09:00)'])).toEqual([])
    expect(parseKonflikter(null)).toEqual([])
    expect(parseKonflikter(undefined)).toEqual([])
    expect(parseKonflikter([null as any, 42 as any])).toEqual([])
  })

  test('producentens format är oförändrat', () => {
    // Går den här sönder har någon ändrat strängen i approve-actions utan att
    // röra parsern — och tidslinjen hade tystnat utan att något blivit rött.
    const kalla = fs.readFileSync(path.join(ROOT, 'lib/approve-actions.ts'), 'utf8')
    expect(kalla, 'krocksträngens format har ändrats').toContain('${cStart}-${cEnd}')
  })

  test('minuterFranIso ger noll vid ogiltigt datum', () => {
    expect(minuterFranIso(null)).toBeNull()
    expect(minuterFranIso('inte ett datum')).toBeNull()
    expect(minuterFranIso(undefined)).toBeNull()
  })
})

test.describe('nyhetsraderna har en väg vidare', () => {
  test('varje agent i teamet har en åtgärd', () => {
    // Kärntestet: en nyhetsrad utan väg vidare är en återvändsgränd, och det
    // var precis felet — bara Lisa hade en länk.
    const utan = TEAM.filter(a => !nyhetsAtgard(a.id)).map(a => a.id)
    expect(utan, 'agenter vars nyhetsrader saknar åtgärd').toEqual([])
  })

  test('relaterat objekt vinner över agentens standardåtgärd', () => {
    const a = nyhetsAtgard('lisa', { typ: 'quote', id: 'q_1' })
    expect(a?.href).toBe('/dashboard/quotes/q_1')
    expect(a?.label).toBe('Öppna offerten')
  })

  test('halvt relaterat objekt faller tillbaka på agenten', () => {
    // Typ utan id skulle ge /dashboard/quotes/undefined — en trasig länk är
    // värre än ingen.
    expect(nyhetsAtgard('lisa', { typ: 'quote', id: null })?.href).toBe('/dashboard/calls')
    expect(nyhetsAtgard('lisa', { typ: null, id: 'q_1' })?.href).toBe('/dashboard/calls')
  })

  test('okänd agent ger ingen åtgärd', () => {
    expect(nyhetsAtgard('finns-inte')).toBeNull()
    expect(nyhetsAtgard(null)).toBeNull()
  })
})

// Närvarobandet (byggNarvaro) städades bort i Tur 4 etapp 6 — bevakningen
// (tests/bevakning.spec.ts) och dygnsdigesten (tests/dygnsdigest.spec.ts)
// äger numera de ytorna.

test.describe('skrivradens chips delegerar till Matte', () => {
  // Omgjorda 2026-08-11 (Andreas UX-fynd): chipsen navigerade till formulär-
  // sidor trots att de sitter under Matte-inputen. Nu öppnar de Jobbkompisen
  // med en påbörjad mening. href behålls som dokumenterad kanonisk sida per
  // ärende — en flyttad sida ska fortfarande bli röd HÄR.
  const { SKRIVRAD_CHIPS } = require('../components/jarvis/SkrivRad')

  test('varje chip-href motsvarar en existerande page.tsx', () => {
    for (const chip of SKRIVRAD_CHIPS) {
      const sida = path.join(ROOT, 'app', chip.href.replace(/^\//, ''), 'page.tsx')
      expect(fs.existsSync(sida), `${chip.label} pekar på ${chip.href} — men ${sida} finns inte`).toBe(true)
    }
  })

  test('varje chip bär en påbörjad mening som slutar öppet', () => {
    for (const chip of SKRIVRAD_CHIPS) {
      expect(typeof chip.prompt, `${chip.label} saknar prompt`).toBe('string')
      expect(chip.prompt.length, `${chip.label} har tom prompt`).toBeGreaterThan(5)
      expect(chip.prompt.endsWith(' '), `${chip.label}s prompt ska sluta med mellanslag — hantverkaren fyller i resten`).toBe(true)
    }
  })

  test('chipsen är de fyra vanligaste ärendena — inte en meny', () => {
    expect(SKRIVRAD_CHIPS).toHaveLength(4)
    const labels = SKRIVRAD_CHIPS.map((c: any) => c.label)
    expect(labels).toEqual(['Ny offert', 'Boka in ett jobb', 'Skicka en faktura', 'SMS till en kund'])
  })

  test('klick fyller Matte-chatten — ingen navigering', () => {
    const skrivrad = fs.readFileSync(path.join(ROOT, 'components/jarvis/SkrivRad.tsx'), 'utf8')
    expect(skrivrad, 'chipsen renderas som Link igen — de ska delegera till Matte').toContain('onChip?.(chip.prompt)')
    const hem = fs.readFileSync(path.join(ROOT, 'components/jarvis/JarvisHome.tsx'), 'utf8')
    expect(hem).toContain('setPendingPrompt(prompt)')
  })

  test('ytan växlar läge på beslutströskeln — samma tröskel som bevakningen', () => {
    const s = fs.readFileSync(path.join(ROOT, 'components/jarvis/JarvisHome.tsx'), 'utf8')
    expect(s).toContain('stor={beslut <= 1}')
    // Pill-markupen bor i komponenten nu — inte kvar duplicerad i ytan.
    expect(s).not.toContain('Skriv till teamet — eller tryck.')
  })
})

test.describe('profilbilderna når fram', () => {
  test('AgentPersona bär avatar', () => {
    const kalla = fs.readFileSync(path.join(ROOT, 'components/dashboard/agentPersonas.ts'), 'utf8')
    expect(kalla, 'avatar utelämnad ur AgentPersona igen').toContain('avatar: a.avatar')
  })

  test('varje agent i teamet har en bild', () => {
    const utan = TEAM.filter(a => !a.avatar).map(a => a.id)
    expect(utan, 'agenter utan porträtt — de faller till initialer').toEqual([])
  })

  test('AgentAvatar faller tillbaka på initialer', () => {
    // Utan fallback blir en trasig bild-URL en tom cirkel, vilket läses som
    // ett fel i produkten.
    const kalla = fs.readFileSync(path.join(ROOT, 'components/agents/AgentAvatar.tsx'), 'utf8')
    expect(kalla).toContain('onError')
    expect(kalla).toContain('agent.initials')
  })
})
