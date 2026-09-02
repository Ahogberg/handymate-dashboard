/**
 * Facit: ROT-rätten som en sanning (tasks/plan-rot-ratt.md, 2026-09-02).
 *
 * RENA enhetstester + källskanningar — inga HTTP-anrop, ingen browser, ingen
 * server. Körs isolerat med:
 *   npx playwright test tests/rot-ratt.spec.ts --no-deps --project=chromium
 *
 * Låser tre saker:
 *  1. lib/rot/ratt.ts (bedomAvdrag/arArbeteUtanAvdrag) gissar ALDRIG —
 *     'okant' i stället för en tyst gissning, och 'nej' bär alltid en grund.
 *  2. lib/rot/tabell.ts bär BARA källbelagda rader: räknat oberoende ur
 *     docs/bransch/*.md (samma räknesätt som facit själv använder, så
 *     tabellen inte kan glida från källan), minus de fyra underkända
 *     raderna (El 4/6/7, Allround 3).
 *  3. Inkopplingen i lib/ai-quote-generator.ts frågar alltid modulen —
 *     aldrig en fri `is_rot_eligible: true` — och lib/skv/* är orört.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { bedomAvdrag, arArbeteUtanAvdrag, normaliseraJobbtyp, ROT_TABELL, type Boendeform } from '../lib/rot/ratt'
import { rotRutFranSanning } from '../lib/quotes/generated-to-quote-items'

const REPO_ROOT = path.resolve(__dirname, '..')
const BRANSCH_DIR = path.join(REPO_ROOT, 'docs', 'bransch')

// De fyra raderna den mekaniska kontrollen underkände
// (docs/bransch/granskning/MEKANISK_KONTROLL_2026-09-02.md) — ska INTE
// finnas i ROT_TABELL under några omständigheter.
const UNDERKANDA_NAMN = [
  'Elrenovering (dra om el i äldre bostad)',
  'El vid kök-/badrumsrenovering',
  'Montering/byte av eluttag',
  'Reparation av vitvaror i bostaden (tvättmaskin, torktumlare, diskmaskin)',
]

// ── Oberoende radräkning ur docs/bransch/*.md ───────────────────────────
// Samma räknesätt som användes för att bygga lib/rot/tabell.ts, så facit
// inte kan glida från källan: en rad räknas när dess markörkolumn (efter
// att markdown-fetstil **...** strippats) inte innehåller "*" eller "?" och
// innehåller minst ett av ROT/RUT/GT/Nej.
function parseTableRow(line: string): string[] | null {
  if (!line.trim().startsWith('|')) return null
  const cells = line.split('|').map(c => c.trim())
  while (cells.length && cells[0] === '') cells.shift()
  while (cells.length && cells[cells.length - 1] === '') cells.pop()
  if (cells.length < 4) return null
  if (!/^\d+$/.test(cells[0])) return null // hoppar över rubrik-/separatorrader
  return cells
}

function isPlainMarker(raw: string): boolean {
  const stripped = raw.replace(/\*\*/g, '')
  if (stripped.includes('*')) return false
  if (stripped.includes('?')) return false
  return /ROT|RUT|GT|Nej/.test(stripped)
}

function rakaObeasteriskadeRader(): number {
  const files = fs.readdirSync(BRANSCH_DIR).filter(f => f.endsWith('.md'))
  let total = 0
  for (const f of files) {
    const text = fs.readFileSync(path.join(BRANSCH_DIR, f), 'utf8')
    for (const line of text.split('\n')) {
      const cells = parseTableRow(line)
      if (!cells) continue
      const marker = cells[3] || ''
      if (isPlainMarker(marker)) total++
    }
  }
  return total
}

// ── Del 1: bedomAvdrag/arArbeteUtanAvdrag gissar aldrig ─────────────────

test.describe('bedomAvdrag', () => {
  test('känd rad + småhus ⇒ ja med typ, grund och källa', () => {
    const rad = ROT_TABELL.find(r => r.smahus === 'rot')!
    const besked = bedomAvdrag(rad.slug, 'smahus')
    expect(besked.utfall).toBe('ja')
    if (besked.utfall === 'ja') {
      expect(besked.typ).toBe('rot')
      expect(besked.grund.length).toBeGreaterThan(0)
      expect(besked.kalla.length).toBeGreaterThan(0)
    }
  })

  test('känd rad där bostadsratt är okant + boendeform bostadsratt ⇒ okant med fråga', () => {
    const rad = ROT_TABELL.find(r => r.bostadsratt === 'okant')!
    const besked = bedomAvdrag(rad.slug, 'bostadsratt')
    expect(besked.utfall).toBe('okant')
    if (besked.utfall === 'okant') {
      expect(besked.fraga.length).toBeGreaterThan(0)
      expect(besked.fraga).toContain(rad.namn)
    }
  })

  test('boendeform okand på en rad som skiljer sig mellan smahus/bostadsratt ⇒ okant', () => {
    const rad = ROT_TABELL.find(r => r.smahus !== r.bostadsratt)!
    const besked = bedomAvdrag(rad.slug, 'okand')
    expect(besked.utfall).toBe('okant')
    if (besked.utfall === 'okant') {
      expect(besked.fraga).toContain('småhus')
      expect(besked.fraga).toContain('bostadsrätt')
    }
  })

  test('boendeform okand på en rad som INTE skiljer sig ⇒ svarar direkt, frågar inte i onödan', () => {
    const rad = ROT_TABELL.find(r => r.smahus === r.bostadsratt && r.smahus !== 'okant')!
    const besked = bedomAvdrag(rad.slug, 'okand')
    expect(besked.utfall).not.toBe('okant')
  })

  test('okänd slug ⇒ okant, aldrig nej', () => {
    const besked = bedomAvdrag('den-har-jobbtypen-finns-inte', 'smahus')
    expect(besked.utfall).toBe('okant')
    if (besked.utfall === 'okant') {
      expect(besked.fraga.length).toBeGreaterThan(0)
    }
  })

  test('nej-rad ⇒ nej med icke-tom grund', () => {
    const rad = ROT_TABELL.find(r => r.smahus === 'inget')!
    const besked = bedomAvdrag(rad.slug, 'smahus')
    expect(besked.utfall).toBe('nej')
    if (besked.utfall === 'nej') {
      expect(besked.grund.length).toBeGreaterThan(0)
      expect(besked.kalla.length).toBeGreaterThan(0)
    }
  })

  test('ALDRIG nej av databrist: varje nej-utfall i hela tabellen har en icke-tom grund', () => {
    const boendeformer: Boendeform[] = ['smahus', 'bostadsratt', 'okand']
    let nejCount = 0
    for (const rad of ROT_TABELL) {
      for (const boendeform of boendeformer) {
        const besked = bedomAvdrag(rad.slug, boendeform)
        if (besked.utfall === 'nej') {
          nejCount++
          expect(besked.grund.trim().length, `${rad.slug} (${boendeform}) saknar grund`).toBeGreaterThan(0)
          expect(besked.kalla.trim().length, `${rad.slug} (${boendeform}) saknar källa`).toBeGreaterThan(0)
        }
      }
    }
    // Facit ska faktiskt pröva några nej-utfall, inte bara loopa tomt.
    expect(nejCount).toBeGreaterThan(0)
  })

  test('okänd jobbtyp ger aldrig nej — bara okant', () => {
    for (const boendeform of ['smahus', 'bostadsratt', 'okand'] as Boendeform[]) {
      const besked = bedomAvdrag('helt-okand-slug-xyz', boendeform)
      expect(besked.utfall).toBe('okant')
    }
  })
})

test.describe('arArbeteUtanAvdrag', () => {
  test('true för en rad som aldrig ger ROT (t.ex. felsökning/service)', () => {
    const rad = ROT_TABELL.find(r => r.smahus === 'inget')!
    expect(arArbeteUtanAvdrag(rad.slug)).toBe(true)
  })

  test('false för en rad som ger ROT', () => {
    const rad = ROT_TABELL.find(r => r.smahus === 'rot')!
    expect(arArbeteUtanAvdrag(rad.slug)).toBe(false)
  })

  test('false för en okänd jobbtyp — inte en gissning om "utan avdrag"', () => {
    expect(arArbeteUtanAvdrag('helt-okand-slug-xyz')).toBe(false)
  })
})

// ── Del 2: tabellen är källbelagd, inte större än underlaget ────────────

test.describe('ROT_TABELL', () => {
  test('varje rad har grund och kalla icke-tomma, och granskad: true', () => {
    for (const rad of ROT_TABELL) {
      expect(rad.grund.trim().length, `${rad.slug} saknar grund`).toBeGreaterThan(0)
      expect(rad.kalla.trim().length, `${rad.slug} saknar kalla`).toBeGreaterThan(0)
      expect(rad.granskad, `${rad.slug} är inte granskad`).toBe(true)
    }
  })

  test('varje rad har unik slug', () => {
    const slugs = ROT_TABELL.map(r => r.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  test('de fyra underkända raderna (El 4/6/7, Allround 3) finns INTE med', () => {
    const namn = ROT_TABELL.map(r => r.namn)
    for (const underkand of UNDERKANDA_NAMN) {
      expect(namn, `"${underkand}" ska vara underkänd och inte stå med`).not.toContain(underkand)
    }
  })

  test('bostadsratt gissas aldrig till samma som smahus utan belägg — RUT/service-rader undantagna', () => {
    // De enda rader där bostadsratt är satt till ett konkret värde (inte
    // 'okant') SKA vara antingen RUT-rader (dokumenterat boendeformsoberoende,
    // se kommentaren i tabell.ts) eller rader med en uttrycklig
    // bostadsrätt-motivering i grund-texten.
    for (const rad of ROT_TABELL) {
      if (rad.bostadsratt === 'okant') continue
      const harBostadsrattsord = /bostadsrätt|BRF|gemensam egendom|ägarlägenhet/i.test(rad.grund)
      const arRut = rad.smahus === 'rut'
      const arUniverselltNej = rad.smahus === 'inget' && rad.bostadsratt === 'inget'
      expect(
        harBostadsrattsord || arRut || arUniverselltNej,
        `${rad.slug}: bostadsratt=${rad.bostadsratt} men grund nämner varken bostadsrätt/BRF eller är RUT/universellt nej — kontrollera att det inte är en gissning`,
      ).toBe(true)
    }
  })

  test('antal rader = obeasteriskade rader i branschfilerna minus de fyra underkända', () => {
    const kallantal = rakaObeasteriskadeRader()
    expect(kallantal, 'oväntat antal källrader — har docs/bransch/*.md ändrats?').toBeGreaterThan(0)
    expect(ROT_TABELL.length).toBe(kallantal - 4)
  })
})

// ── Del 3: inkopplingen frågar alltid modulen, SKV-lagret är orört ──────

test.describe('Inkoppling', () => {
  const aiQuoteGeneratorSrc = fs.readFileSync(path.join(REPO_ROOT, 'lib', 'ai-quote-generator.ts'), 'utf8')

  test('ai-quote-generator.ts frågar bedomAvdrag', () => {
    expect(aiQuoteGeneratorSrc).toContain('bedomAvdrag(')
    expect(aiQuoteGeneratorSrc).toMatch(/from ['"]@\/lib\/rot\/ratt['"]/)
  })

  test('ai-quote-generator.ts sätter aldrig is_rot_eligible: true fritt — bara via bedömningen', () => {
    // Käll-skanning: en fri `is_rot_eligible: true` i källkoden vore exakt
    // det gamla pengafelet (booleanen fri per rad, ingen sanning bakom).
    // Vår inkoppling skriver alltid en variabel/uttryck (isRotEligible),
    // aldrig den bokstavliga strängen "is_rot_eligible: true".
    expect(aiQuoteGeneratorSrc).not.toContain('is_rot_eligible: true')
    expect(aiQuoteGeneratorSrc).not.toContain('is_rut_eligible: true')
  })

  test('lib/skv/* är orört: ingen import av lib/rot i SKV-lagret', () => {
    const skvDir = path.join(REPO_ROOT, 'lib', 'skv')
    const files = fs.readdirSync(skvDir).filter(f => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const src = fs.readFileSync(path.join(skvDir, f), 'utf8')
      // OBS: matchar "lib/rot/" med trailing slash, inte t.ex. det redan
      // befintliga och orelaterade lib/rot-rut.ts.
      expect(src, `${f} importerar lib/rot/ — SKV-lagret ska vara orört`).not.toMatch(/from ['"].*lib\/rot\//)
    }
  })

  test('app/api/rot-payment/* är orört: ingen import av lib/rot', () => {
    const dir = path.join(REPO_ROOT, 'app', 'api', 'rot-payment')
    if (!fs.existsSync(dir)) return
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap(entry => {
        const p = path.join(d, entry.name)
        return entry.isDirectory() ? walk(p) : [p]
      })
    const files = walk(dir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8')
      expect(src, `${f} importerar lib/rot/ — rot-payment ska vara orört`).not.toMatch(/from ['"].*lib\/rot\//)
    }
  })
})

// ── Del 5: uppslaget träffar fritext, och okänt blir aldrig ett tyst nej ──
// De två fynden vid granskningen av bygget (2026-09-02): (1) kallarna har
// bara `project.job_type`/`quote.job_type` — fri text, aldrig våra slugs —
// så utan normaliserat uppslag hade tabellen aldrig träffat i skarp drift;
// (2) om 'okant' hade nollställt is_rot_eligible hade VARJE offert vi inte
// kan belägga tappat ROT, vilket är ett lika stort påstående som att sätta
// det. Båda är facit nu.

test.describe('Uppslag på fritext', () => {
  test('radens namn träffar samma rad som dess slug', () => {
    const rad = ROT_TABELL[0]
    const viaSlug = bedomAvdrag(rad.slug, 'smahus')
    const viaNamn = bedomAvdrag(rad.namn, 'smahus')
    expect(viaNamn).toEqual(viaSlug)
  })

  test('versaler, blanksteg och avslutande skiljetecken spelar ingen roll', () => {
    const rad = ROT_TABELL[0]
    expect(bedomAvdrag(`  ${rad.namn.toUpperCase()}.  `, 'smahus')).toEqual(bedomAvdrag(rad.slug, 'smahus'))
  })

  test('normaliseraJobbtyp är stabil och tom sträng ger tom nyckel', () => {
    expect(normaliseraJobbtyp('  Byte AV  Elcentral ')).toBe('byte-av-elcentral')
    expect(normaliseraJobbtyp('')).toBe('')
    expect(normaliseraJobbtyp('   ')).toBe('')
  })

  test('en benämning som finns i flera branscher ger okant, aldrig en gissad rad', () => {
    const perNamn = new Map<string, Set<string>>()
    for (const rad of ROT_TABELL) {
      const nyckel = normaliseraJobbtyp(rad.namn)
      if (!perNamn.has(nyckel)) perNamn.set(nyckel, new Set())
      perNamn.get(nyckel)!.add(rad.slug)
    }
    const flertydiga = Array.from(perNamn.entries()).filter(([, slugs]) => slugs.size > 1)
    for (const [nyckel] of flertydiga) {
      const besked = bedomAvdrag(nyckel, 'smahus')
      expect(besked.utfall, `${nyckel} är flertydig och får inte besvaras`).toBe('okant')
    }
  })

  test('tom jobbtyp ⇒ okant, aldrig nej', () => {
    for (const boendeform of ['smahus', 'bostadsratt', 'okand'] as Boendeform[]) {
      expect(bedomAvdrag('', boendeform).utfall).toBe('okant')
    }
  })
})

test.describe('Sanningen når den sparade raden', () => {
  const labor = { quantity: 1, unit: 'tim', unitPrice: 500, type: 'labor' as const, description: 'Arbete' }

  test('belagt ja ⇒ raden blir ROT även om modellen föreslog något annat', () => {
    expect(rotRutFranSanning({ ...labor, is_rot_eligible: true, is_rut_eligible: false }, 'none')).toBe('rot')
    expect(rotRutFranSanning({ ...labor, is_rot_eligible: false, is_rut_eligible: true }, 'none')).toBe('rut')
  })

  test('belagt ja på en materialrad ger ändå ingen avdragstyp', () => {
    expect(rotRutFranSanning({ ...labor, type: 'material', is_rot_eligible: true, is_rut_eligible: false }, 'rot')).toBeNull()
  })

  test('belagt nej ⇒ ingen avdragstyp, även om modellen föreslog ROT', () => {
    expect(rotRutFranSanning({ ...labor, is_rot_eligible: false, is_rut_eligible: false }, 'rot')).toBeNull()
  })

  test('okänt ⇒ modellens förslag avgör precis som förut (inget tyst nej)', () => {
    expect(rotRutFranSanning({ ...labor }, 'rot')).toBe('rot')
    expect(rotRutFranSanning({ ...labor }, 'rut')).toBe('rut')
    expect(rotRutFranSanning({ ...labor }, 'none')).toBeNull()
  })

  test('generatorn nollställer aldrig avdraget vid okant — den ställer en fråga', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'lib', 'ai-quote-generator.ts'), 'utf8').replace(/\r\n/g, '\n')
    expect(src).toContain('item.avdragsFraga = rotBesked.fraga')
    // Grenen för okant får inte skriva flaggorna alls.
    const gren = src.slice(src.indexOf('const applyRotSanning'), src.indexOf('applyRotSanning(items)'))
    const okantGren = gren.slice(gren.indexOf('} else {'))
    expect(okantGren).not.toContain('is_rot_eligible')
    expect(okantGren).not.toContain('is_rut_eligible')
  })

  test('bron använder rotRutFranSanning, inte legacy-mappningen direkt', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'lib', 'quotes', 'generated-to-quote-items.ts'), 'utf8')
    expect(src).toContain('rotRutFranSanning(item, suggestedDeductionType)')
  })

  test('editor-interna avdragsfält strippas innan quote_items POSTas', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'dashboard', 'quotes', '_shared', 'buildQuotePayload.ts'), 'utf8')
    expect(src).toContain('avdrags_fraga')
    expect(src).toContain('avdrags_utan_avdrag')
  })
})
