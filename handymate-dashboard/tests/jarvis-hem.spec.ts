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
import { byggNarvaro } from '../lib/jarvis/team-presence'
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

test.describe('närvarobandet hittar aldrig på aktivitet', () => {
  test('en agent utan spår står inte i bandet', () => {
    const rader = byggNarvaro([{ agentId: 'lisa', text: 'Svarade tre samtal', vid: '2026-08-08T06:12:00Z' }])
    expect(rader).toHaveLength(1)
    expect(rader[0].agentId).toBe('lisa')
  })

  test('tomma spår ger tomt band', () => {
    expect(byggNarvaro([])).toEqual([])
    expect(byggNarvaro([{ agentId: '', text: 'x' }])).toEqual([])
    expect(byggNarvaro([{ agentId: 'lisa', text: '' }])).toEqual([])
  })

  test('senaste raden visas, alla räknas', () => {
    const rader = byggNarvaro([
      { agentId: 'karin', text: 'Äldre', vid: '2026-08-08T06:00:00Z' },
      { agentId: 'karin', text: 'Nyare', vid: '2026-08-08T09:00:00Z' },
    ])
    expect(rader[0].senaste).toBe('Nyare')
    expect(rader[0].antal).toBe(2)
  })

  test('ordningen följer teamet, inte aktiviteten', () => {
    // Ett band som hoppar om sig varje morgon går inte att skumma.
    const rader = byggNarvaro([
      { agentId: 'lisa', text: 'a', vid: '2026-08-08T09:00:00Z' },
      { agentId: 'karin', text: 'b', vid: '2026-08-08T06:00:00Z' },
    ])
    const teamOrdning = TEAM.map(a => a.id)
    const iBandet = rader.map(r => r.agentId)
    const forvantad = teamOrdning.filter(id => iBandet.includes(id))
    expect(iBandet).toEqual(forvantad)
  })

  test('okänd agent kommer aldrig med', () => {
    // Bandet itererar TEAM, så ett spår från något som inte är en agent kan
    // aldrig rita ett ansikte utan namn.
    expect(byggNarvaro([{ agentId: 'spöke', text: 'x' }])).toEqual([])
  })
})

test.describe('skrivradens chips pekar på sidor som finns', () => {
  // Etapp 4: chipsen är Link-pills till hårdkodade rutter. En flyttad sida
  // ska bli röd HÄR, inte en död länk i prod. Källskanningen läser chipsens
  // href ur komponenten och kräver motsvarande page.tsx på disk.
  const { SKRIVRAD_CHIPS } = require('../components/jarvis/SkrivRad')

  test('varje chip-href motsvarar en existerande page.tsx', () => {
    for (const chip of SKRIVRAD_CHIPS) {
      const sida = path.join(ROOT, 'app', chip.href.replace(/^\//, ''), 'page.tsx')
      expect(fs.existsSync(sida), `${chip.label} pekar på ${chip.href} — men ${sida} finns inte`).toBe(true)
    }
  })

  test('chipsen är de fyra vanligaste ärendena — inte en meny', () => {
    expect(SKRIVRAD_CHIPS).toHaveLength(4)
    const labels = SKRIVRAD_CHIPS.map((c: any) => c.label)
    expect(labels).toEqual(['Ny offert', 'Boka in ett jobb', 'Skicka en faktura', 'SMS till en kund'])
  })

  test('ytan växlar läge på beslutströskeln — samma tröskel som bevakningen', () => {
    const s = fs.readFileSync(path.join(ROOT, 'components/jarvis/JarvisHome.tsx'), 'utf8')
    expect(s).toContain('<SkrivRad stor={beslut <= 1}')
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
