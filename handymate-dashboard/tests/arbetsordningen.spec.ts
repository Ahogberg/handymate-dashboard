import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Facit för arbetsordningen (2026-09-17).
 *
 * AGENTS.md och .claude/skills/ finns för att reglerna ska laddas av sig
 * själva i stället för att minnas. Då måste de också hålla ihop: en skill som
 * AGENTS.md hänvisar till men som inte finns är en regel ingen får, och en
 * SKILL.md utan triggerbeskrivning laddas aldrig automatiskt.
 *
 * Det här testet vaktar strukturen, inte innehållet — utom där innehållet är
 * ett konkret kommando eller en sökväg som måste stämma med repot, för en
 * instruktion som pekar fel är värre än ingen instruktion.
 */

const ROOT = path.resolve(__dirname, '..')
const SKILLS = path.join(ROOT, '.claude/skills')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const agents = fs.readFileSync(path.resolve(ROOT, '..', 'AGENTS.md'), 'utf8')

const FORVANTADE = ['facit', 'databasen-ar-facit', 'starta-ratt', 'ui-bevis']

function frontmatter(namn: string) {
  const text = read(`.claude/skills/${namn}/SKILL.md`)
  const m = text.match(/^---\n([\s\S]*?)\n---\n/)
  if (!m) throw new Error(`${namn}: SKILL.md saknar frontmatter`)
  const fält: Record<string, string> = {}
  for (const rad of m[1].split('\n')) {
    const i = rad.indexOf(':')
    if (i > 0) fält[rad.slice(0, i).trim()] = rad.slice(i + 1).trim()
  }
  return { fält, kropp: text.slice(m[0].length) }
}

test.describe('arbetsordningen laddar sig själv', () => {
  test('varje skill har namn som matchar mappen och en trigger som säger NÄR', () => {
    for (const namn of FORVANTADE) {
      const { fält } = frontmatter(namn)
      expect(fält.name, `${namn}: name ska matcha mappnamnet`).toBe(namn)
      // Beskrivningen är det enda som avgör om skillen laddas. En rubrik
      // ("Regler för tester") triggar ingenting — den måste säga när.
      expect(fält.description?.length ?? 0, `${namn}: description saknas`).toBeGreaterThan(80)
      expect(fält.description, `${namn}: description säger inte NÄR den gäller`).toMatch(/Använd (vid|när|i)/)
    }
  })

  test('inga skills utanför listan, och ingen tom mapp', () => {
    const mappar = fs.readdirSync(SKILLS).filter(n => fs.statSync(path.join(SKILLS, n)).isDirectory())
    expect(mappar.sort()).toEqual([...FORVANTADE].sort())
    for (const namn of mappar) expect(fs.existsSync(path.join(SKILLS, namn, 'SKILL.md')), `${namn} saknar SKILL.md`).toBe(true)
  })

  test('AGENTS.md hänvisar bara till skills som finns, och nämner alla fyra', () => {
    for (const namn of FORVANTADE) expect(agents, `AGENTS.md nämner inte ${namn}`).toContain(namn)
    // Varje `bakåtcitat-namn` i AGENTS.md som ser ut som en skill ska finnas.
    for (const m of Array.from(agents.matchAll(/`([a-z][a-z0-9-]{3,})`/g))) {
      const ord = m[1]
      if (!/^(facit|databasen-ar-facit|starta-ratt|ui-bevis)$/.test(ord)) continue
      expect(FORVANTADE).toContain(ord)
    }
    expect(agents).toContain('handymate-dashboard/.claude/skills/')
  })

  test('kommandon och sökvägar i instruktionerna pekar på något som finns', () => {
    const allt = [agents, ...FORVANTADE.map(n => frontmatter(n).kropp)].join('\n')
    // Varje repo-relativ sökväg som nämns ska existera.
    for (const m of Array.from(allt.matchAll(/`((?:tests|lib|sql|app|components|scripts|docs|tasks)\/[A-Za-z0-9._/-]+)`/g))) {
      const rel = m[1]
      if (rel.includes('*') || rel.endsWith('/')) continue
      expect(fs.existsSync(path.join(ROOT, rel)), `instruktionerna pekar på ${rel} som inte finns`).toBe(true)
    }
    // Kontraktskommandot ska heta det det heter.
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts['test:contracts'], 'test:contracts saknas').toBeTruthy()
    expect(allt).toContain('npm run test:contracts')
    // Chromium-sökvägen i ui-bevis måste finnas i den här miljön.
    const chrome = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
    expect(frontmatter('ui-bevis').kropp).toContain(chrome)
    expect(fs.existsSync(chrome), `${chrome} saknas — rätta ui-bevis`).toBe(true)
  })

  test('ui-bevis räknar rätt antal ui-specar och preview-helpers', () => {
    const kropp = frontmatter('ui-bevis').kropp
    const uiSpecar = fs.readdirSync(path.join(ROOT, 'tests')).filter(n => n.endsWith('.ui.spec.ts'))
    const medBreddprov = uiSpecar.filter(n => read(`tests/${n}`).includes('scrollWidth'))
    // Siffror i en instruktion ruttnar. Faller det här: uppdatera texten,
    // inte testet. (Första utkastet av den här raden var ett tomt påstående
    // efter en .slice(0,0) — precis vad facit-skillen varnar för.)
    expect(kropp, `${medBreddprov.length} av ${uiSpecar.length} ui-specar har breddprovet`).toContain(`${medBreddprov.length} av ${uiSpecar.length}`)
    for (const helper of ['relief-preview', 'job-standard-preview', 'first-value-preview', 'followup-preview', 'planning-start-preview']) {
      expect(kropp, `${helper} nämns inte`).toContain(helper.replace('-preview', ''))
      expect(fs.existsSync(path.join(ROOT, `tests/helpers/${helper}.ts`)), `${helper}.ts finns inte`).toBe(true)
    }
  })

  test('facit-skillen bär den regel som gör den till en regel', () => {
    const kropp = frontmatter('facit').kropp
    // Utan mutationssteget är skillen bara en uppmaning att skriva tester.
    expect(kropp).toMatch(/[Mm]utera koden, inte testet/)
    expect(kropp).toContain('assert a in s')
    expect(kropp).toContain('feature-test-parity')
    expect(kropp).toContain('git status --short')
  })

  test('CLAUDE.md pekar på arbetsordningen så den inte blir en glömd fil', () => {
    // Att ordet "AGENTS.md" förekommer någonstans räcker inte — hänvisningen
    // ska stå överst, som ett blockcitat, och namnge alla fyra skills. (Det
    // första utkastet kollade bara toContain('AGENTS.md') och överlevde att
    // rubriken togs bort.)
    const claude = read('CLAUDE.md')
    const inledning = claude.slice(0, 1200)
    expect(inledning, 'hänvisningen till AGENTS.md står inte överst').toMatch(/^> \*\*Arbetsordningen står i `AGENTS\.md`\*\*/m)
    expect(inledning).toContain('.claude/skills/')
    for (const namn of FORVANTADE) expect(inledning, `CLAUDE.md nämner inte ${namn} i inledningen`).toContain(namn)
  })
})
