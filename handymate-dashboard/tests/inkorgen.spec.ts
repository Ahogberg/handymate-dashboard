/**
 * Facit för Inkorgen — en plats för allt som kommer in (2026-08-09).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * Allt som en kund skickar in landade på fyra ytor, varav TRE inte fanns i
 * sidomenyn:
 *
 *   /dashboard/sms-inbox   SMS            ← enda i menyn
 *   /dashboard/calls       flikbehållare  ← inte i menyn
 *   /dashboard/inbox       samtal+förslag ← inte i menyn
 *   /dashboard/ai-inbox    radvis kopia   ← inte i menyn
 *
 * Transkript och åtgärdsförslag från inkommande samtal gick alltså bara att nå
 * genom att skriva URL:en själv. Arbetet fanns — det var osynligt.
 *
 *   npx playwright test tests/inkorgen.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const finns = (p: string) => fs.existsSync(path.join(ROOT, p))
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const kod = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

test.describe('en inkorg i menyn, inte fyra utanför den', () => {
  test('sidomenyn har exakt EN inkorgspost, och den pekar på Inkorgen', () => {
    const s = kod('components/Sidebar.tsx')
    const inkorgsposter = (s.match(/href: '\/dashboard\/(inkorg|sms-inbox|calls|inbox|ai-inbox)'/g) || [])
    expect(inkorgsposter, `flera inkorgar i menyn: ${inkorgsposter.join(', ')}`).toHaveLength(1)
    expect(s).toContain("href: '/dashboard/inkorg'")
    expect(s).toContain("label: 'Inkorg'")
  })

  test('menyn markeras som aktiv även på de gamla adresserna', () => {
    // Annars ser hantverkaren ingen markering när han landar via ett bokmärke.
    const s = kod('components/Sidebar.tsx')
    const i = s.indexOf("href: '/dashboard/inkorg'")
    const rad = s.slice(i, i + 400)
    for (const gammal of ['/dashboard/sms-inbox', '/dashboard/calls', '/dashboard/inbox']) {
      expect(rad, `${gammal} saknas i paths`).toContain(gammal)
    }
  })

  test('alla fyra flikarna finns och laddas lazy', () => {
    const s = read('app/dashboard/inkorg/page.tsx')
    for (const flik of ['SMS', 'Samtal', 'E-post', 'Historik']) {
      expect(s, `fliken ${flik} saknas`).toContain(`label: '${flik}'`)
    }
    // Samtalsfliken är 934 rader med egna Supabase-anrop. Att ladda den när
    // man bara ville läsa ett SMS vore att betala för fyra sidor.
    const dynamiska = (s.match(/dynamic\(\(\) => import\(/g) || []).length
    expect(dynamiska, 'någon flik laddas inte lazy').toBe(4)
  })
})

test.describe('inga bokmärken dör', () => {
  test('/dashboard/calls omdirigerar och tar med fliken', () => {
    const s = kod('app/dashboard/calls/page.tsx')
    expect(s).toContain('/dashboard/inkorg')
    expect(s).toContain('router.replace')
    expect(s, 'tab-parametern tappas i omdirigeringen').toContain("searchParams?.get('tab')")
  })

  test('de gamla fliknycklarna översätts i stället för att tystna', () => {
    // /dashboard/calls?tab=inbox ska landa på Samtal, inte på SMS.
    const s = read('app/dashboard/inkorg/page.tsx')
    expect(s).toContain('LEGACY_TAB')
    expect(s).toContain("inbox: 'samtal'")
    expect(s).toContain("history: 'historik'")
  })

  test('SMS-sidan finns kvar som egen adress', () => {
    // Den är både flikinnehåll och en fungerande direktlänk.
    expect(finns('app/dashboard/sms-inbox/page.tsx')).toBe(true)
  })
})

test.describe('kopian är borta', () => {
  test('ai-inbox finns inte kvar', () => {
    // 804 rader som var en nästan radvis kopia av samtalsflikens
    // förslagsvy. Två ytor som visar samma data glider isär — samma
    // felklass som fyra kopior av TEAM.
    expect(finns('app/dashboard/ai-inbox')).toBe(false)
  })

  test('ingenting länkar dit längre', () => {
    const träffar: string[] = []
    const gå = (dir: string) => {
      let poster
      try { poster = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }) } catch { return }
      for (const f of poster) {
        const rel = `${dir}/${f.name}`
        if (f.isDirectory()) {
          if (f.name === 'node_modules' || f.name === '.next') continue
          gå(rel)
        } else if (/\.tsx?$/.test(f.name)) {
          if (kod(rel).includes('/dashboard/ai-inbox')) träffar.push(rel)
        }
      }
    }
    for (const rot of ['app', 'components', 'lib']) gå(rot)
    expect(träffar, `länkar kvar till borttagen sida: ${träffar.join(', ')}`).toEqual([])
  })
})

test.describe('aktiv flik går att läsa', () => {
  test('vit text på nästan vit botten är borta', () => {
    // Gamla flikbehållaren hade `bg-[#F0FDFA] text-white` på aktiv flik —
    // etiketten var osynlig på den flik man faktiskt stod på.
    const s = kod('app/dashboard/inkorg/page.tsx')
    expect(s).not.toContain('text-white')
    expect(s).toContain('text-primary-800')
    // Tumzon på mobil — hantverkare använder telefon på bygget.
    expect(s).toContain('min-h-[44px]')
  })
})
