/**
 * FACIT — components/jarvis/home/MatteHero.tsx (Etapp E: Hero-integrationen,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * Källkodsskanning, samma idiom som tests/uppdragsrad.spec.ts och
 * tests/mission-truth-guard.spec.ts. Etapp E gör heron till EN Matte-yta med
 * två lägen: utan aktivt uppdrag bär den dagsbeskedet + Uppdragsradens band;
 * med ett aktivt uppdrag ÄR heron uppdraget — rubrik, statistik och
 * progressdelar (aldrig en klassöverskridande summa).
 *
 * Körs: npx playwright test tests/matte-hero.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const heroSrc = fs.readFileSync(path.join(ROOT, 'components', 'jarvis', 'home', 'MatteHero.tsx'), 'utf8')
const homeSrc = fs.readFileSync(path.join(ROOT, 'components', 'jarvis', 'JarvisHome.tsx'), 'utf8')

test.describe('MatteHero — aktivt uppdrag ersätter dagsbeskedet (Etapp E)', () => {
  test('läser useMission() själv — delad context, inga extra props tråds genom JarvisHome', () => {
    expect(heroSrc).toContain("import { useMission } from '@/lib/mission/MissionProvider'")
    expect(heroSrc).toContain('useMission()')
  })

  test('rubriken blir "Uppdrag: " i mission-läget, byggd med samma facit som Uppdragsrad använde', () => {
    expect(heroSrc).toContain('Uppdrag: ')
    expect(heroSrc).toContain('buildMissionHeadline')
  })

  test('sub-raden importerar den delade progress-parts-facit-funktionen i stället för att bygga den lokalt', () => {
    expect(heroSrc).toContain("from '@/lib/mission/progress-parts'")
    expect(heroSrc).toContain('progressParts(')
  })

  test('progressdelarna radas upp punktseparerat (join med \' · \')', () => {
    expect(heroSrc).toContain("' · '")
  })

  test('progress.per_class summeras aldrig lokalt i heron — bara progressParts() läser klassbeloppen', () => {
    // MatteHero har sedan tidigare en legitim .reduce( för NBA-kandidaternas
    // beloppssumma (summaKr, en ENDA sanningskälla — inte en mission-
    // klassöverskridande summa) — den bannlysningen hör hemma i
    // progress-parts.ts (facit: tests/progress-parts.spec.ts), inte här.
    // Vaktposten här är smalare och exakt: ingen kod i filen adderar ihop
    // per_class-fälten själv.
    expect(heroSrc).not.toMatch(/per_class\[[^\]]*\]\s*\+/)
    expect(heroSrc).not.toContain('verified_paid_kr +')
  })

  test('inga bannade hopslagna kronfält (samma exakta namn som mission-truth-guard.spec.ts)', () => {
    for (const banned of ['totalKr', 'grandTotal', 'total_kr']) {
      expect(heroSrc.includes(banned), `MatteHero.tsx innehåller "${banned}"`).toBe(false)
    }
  })

  test('tar emot uppdragBand som slot-prop för Uppdragsradens band', () => {
    expect(heroSrc).toContain('uppdragBand')
  })

  test('gap_kr visas som "kr kvar till målet" eller "målet nått" i statistikytan — Etapp D-facit återanvänt', () => {
    expect(heroSrc).toContain('kr kvar till målet')
    expect(heroSrc).toContain('målet nått')
  })

  test('Etapp I: kontaktmål visas som "kunder kvar till målet" i statistikytan, aldrig kr/timmar', () => {
    expect(heroSrc).toContain('kunder kvar till målet')
    expect(heroSrc).toContain("missionGoalType === 'contact'")
  })
})

test.describe('JarvisHome.tsx — Uppdragsrad flyttad in i heron som band (Etapp E)', () => {
  test('MatteHero får uppdragBand-prop byggd av missionSurfaceAllowed + Uppdragsrad', () => {
    expect(homeSrc).toContain('uppdragBand={missionSurfaceAllowed ? <Uppdragsrad suggestions={missionSuggestions} /> : null}')
  })

  test('den gamla syskon-raden under MatteHero finns inte längre', () => {
    expect(homeSrc).not.toContain('{missionSurfaceAllowed && <Uppdragsrad suggestions={missionSuggestions} />}')
  })

  test('Uppdragsrad förekommer bara en gång i filen — som prop-värde, inte som eget syskon', () => {
    const occurrences = homeSrc.match(/<Uppdragsrad/g) || []
    expect(occurrences.length).toBe(1)
  })
})

test.describe('MatteHero — absenceBand-slot (Owner Absence V1, Etapp Å; diskret-flytt 2026-08-18)', () => {
  const absenceBandSrc = fs.readFileSync(
    path.join(ROOT, 'components', 'jarvis', 'home', 'AbsenceBand.tsx'), 'utf8',
  )
  const jobbkompisenSrc = fs.readFileSync(
    path.join(ROOT, 'components', 'Jobbkompisen.tsx'), 'utf8',
  )

  test('tar emot absenceBand som slot-prop, men renderar den BAR — ingen wrapper-ram i heron', () => {
    expect(heroSrc).toContain('absenceBand')
    // Andreas 2026-08-18: vilo-knappen förlängde heron. Bandet renderar null
    // i vardagen och äger sin EGEN avdelarram — en wrapper i heron hade
    // lämnat en tom ramrad kvar. uppdragBand behåller sin wrapper (den
    // renderar alltid innehåll).
    expect(heroSrc).not.toContain('{absenceBand &&')
    const uppdragBlock = heroSrc.slice(heroSrc.indexOf('{uppdragBand &&'), heroSrc.indexOf('{uppdragBand &&') + 200)
    expect(uppdragBlock).toContain("border-t border-white/10 pt-4")
  })

  test('JarvisHome monterar AbsenceBand ovillkorligt (komponenten sköter sin egen 401/403-degradering)', () => {
    expect(homeSrc).toContain("import { AbsenceBand } from '@/components/jarvis/home/AbsenceBand'")
    expect(homeSrc).toContain('absenceBand={<AbsenceBand />}')
  })

  test('vilo-läget renderar ingenting i heron — bandet finns bara som aktiv status eller återkomstrapport', () => {
    // Bandets ternary slutar i null, aldrig i en vilo-knapp. Texten
    // "Jag är borta en period" får inte förekomma som bandinnehåll —
    // den lever vidare enbart som aria-label/title på utlösarikonen.
    const bandStart = absenceBandSrc.indexOf('export function AbsenceBand()')
    const bandEnd = absenceBandSrc.indexOf('export function AbsenceTrigger()')
    const bandBody = absenceBandSrc.slice(bandStart, bandEnd)
    expect(bandBody).toContain(': null}')
    expect(bandBody).not.toContain('Jag är borta en period')
  })

  test('bandets synliga lägen äger sin egen avdelarram (border-t) — flyttad från heron', () => {
    const bandStart = absenceBandSrc.indexOf('export function AbsenceBand()')
    const bandEnd = absenceBandSrc.indexOf('export function AbsenceTrigger()')
    const bandBody = absenceBandSrc.slice(bandStart, bandEnd)
    expect(bandBody).toContain('border-t border-white/10 pt-4')
  })

  test('utlösaren är en diskret ikon i Mattes panelhuvud, ägar-grindad via samma 401/403-degradering', () => {
    expect(absenceBandSrc).toContain('export function AbsenceTrigger()')
    expect(jobbkompisenSrc).toContain("import { AbsenceTrigger } from '@/components/jarvis/home/AbsenceBand'")
    expect(jobbkompisenSrc).toContain('<AbsenceTrigger />')
    // Triggern öppnar inställningsmodalen, aldrig chatten eller panelen.
    const triggerBody = absenceBandSrc.slice(absenceBandSrc.indexOf('export function AbsenceTrigger()'))
    expect(triggerBody).toContain('setShowSettings(true)')
    expect(triggerBody).toContain('AbsenceSettingsModal')
  })
})
