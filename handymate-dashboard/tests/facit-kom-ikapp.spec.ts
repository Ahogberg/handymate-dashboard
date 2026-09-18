import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Facit: kedjan jobbtyp → upplägg måste gå att laga för BEFINTLIGA företag.
 *
 * ═══ VARFÖR REGELN FINNS ═══
 *
 * Mätt 2026-09-18 efter Andreas klickprov: 26 av 29 företag saknade helt
 * jobbtyper, och 17 av 34 jobbtyper hos riktiga kunder hade inget upplägg —
 * ett tryck på dem ledde ingenstans.
 *
 * Ingen av de sakerna berodde på en tabbe. Alla tre mekanismerna fanns
 * (ensureOnboardingJobTypes, JOBBTYP_FOR_MALL, jobTypeStarters). De bor bara
 * inuti seedQuoteTemplates, som körs vid onboardingens finalize — så ett
 * företag som onboardade i juli fick aldrig något som skrevs i september.
 *
 * ═══ VARFÖR DET HÄR FACIT FINNS ═══
 *
 * Det som rasar är inte en rad kod utan en FÖRBINDELSE: att seedarens
 * förbättringar går att nå för någon som redan finns. Provet vaktar därför
 * tre leder i den kedjan, var och en med sin egen rot i mätningen ovan.
 *
 * VAD DET INTE GÖR: det läser inte produktionen. Ett kontraktstest i CI kan
 * inte säga om en kund ligger efter i dag — den frågan svarar rutten själv
 * på i torrkörning. Att låtsas att CI vaktar produktionsdata hade varit ett
 * sämre facit än inget.
 *
 * Kör: npx playwright test tests/facit-kom-ikapp.spec.ts --no-deps
 */

const ROOT = path.resolve(__dirname, '..')
const las = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
/** Kommentarer beskriver ofta just det som vaktas — mät på koden. */
const kod = (p: string) =>
  las(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const RUTT = 'app/api/admin/kom-ikapp/route.ts'
const SEED = 'lib/seed-defaults.ts'

test('kom-ikapp-vägen finns och anropar den RIKTIGA seedaren', () => {
  const rutt = kod(RUTT)
  // Ingen egen kopia av mallarna. Driftar de isär får kunden ett annat
  // upplägg ur backfillen än ur onboardingen, och ingen märker det.
  // ANROPET, inte namnet: importraden ensam räcker för en toContain, och en
  // fil kan importera en funktion utan att någonsin köra den. Mutationen som
  // ersatte anropet med en tom stubbe överlevde tills provet krävde `await`.
  expect(rutt, 'seedQuoteTemplates importeras men anropas inte').toMatch(/await\s+seedQuoteTemplates\(/)
  expect(rutt, 'rutten har fått en egen mall-lista i stället för seedarens')
    .not.toMatch(/JOBBTYP_FOR_MALL|default_items\s*:/)
})

test('kom-ikapp kräver admin och skriver inget utan uttryckligt val', () => {
  const rutt = kod(RUTT)
  expect(rutt).toContain('isAdmin')
  expect(rutt).toContain('Unauthorized')
  // dryRun måste vara PÅ som default. `body.dryRun === true` hade vänt
  // betydelsen: ett tomt anrop mot alla konton hade då skrivit skarpt.
  expect(rutt).toMatch(/dryRun\s*=\s*body\.dryRun\s*!==\s*false/)
})

test('seedaren bär fortfarande alla tre mekanismerna kom-ikapp lutar sig mot', () => {
  const seed = kod(SEED)
  // Faller någon av dem ur seedQuoteTemplates blir kom-ikapp en tom gest:
  // den kör, svarar 200, och kunden står kvar med jobbtyper som inte leder
  // någonstans.
  // Ordgränsen är inte pedanteri: en mutation som döpte om anropet till
  // jobTypeStartersBorta( gled igenom ett toContain, eftersom den längre
  // strängen innehåller den kortare.
  expect(seed, 'jobbtyperna säkras inte längre').toMatch(/\bensureOnboardingJobTypes\(/)
  expect(seed, 'jobbtyper utan upplägg får inte längre startrader').toMatch(/\bjobTypeStarters\(/)
})

test('startraderna pekar på jobbtypen — annars syns de aldrig i remsan', () => {
  const startare = kod('lib/onboarding/template-articles.ts')
  const del = startare.slice(startare.indexOf('export function jobTypeStarters'))
  expect(del).toContain('job_type_slug')
  expect(del).toContain('job_type_name')
  // Ett upplägg utan slug hamnar under "Övriga upplägg" i stället för under
  // sin jobbtyp, och då är hela poängen borta.
  expect(del).toMatch(/slugsWithTemplate\.has\(slug\)/)
})

test('torrkörningen rapporterar luckan, inte bara att den kört', () => {
  const rutt = kod(RUTT)
  // Utan de här siffrorna kan ingen svara på "ligger någon efter?" — och det
  // är den frågan CI inte kan ställa åt oss.
  expect(rutt).toContain('foretag_utan_jobbtyper')
  expect(rutt).toContain('jobbtyper_utan_upplagg')
})
