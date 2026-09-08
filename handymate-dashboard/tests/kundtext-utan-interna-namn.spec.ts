/**
 * Kundtext utan interna namn — facit (beslut Andreas 2026-09-08).
 *
 * Projekt-, offert- och momentnamn är hantverkarens egna etiketter
 * ("P1 Solvägen 12 – badrum (tilldelat)", "Knäppa kunden") och ska aldrig
 * interpoleras i SMS till kund. Kortets TITEL (intern) får bära namnet.
 *
 * Samma beslut: ett hemsideförslag får inte publiceras från ett kort utan
 * att sidan visats. Cronen är pausad bakom flagga och Godkänn leder till
 * /dashboard/website i stället för att sätta is_published.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test.describe('Lars och Karins kund-SMS i automation-engine', () => {
  const src = read('lib/project-stages/automation-engine.ts')
  const meddelanden = Array.from(src.matchAll(/message: `([^`]*)`/g)).map(m => m[1])

  test('inget kundmeddelande interpolerar projektnamn', () => {
    expect(meddelanden.length).toBeGreaterThanOrEqual(3)
    for (const m of meddelanden) {
      expect(m, m).not.toMatch(/\$\{projectName\}|\$\{project\.name\}|\$\{quote(Title|\.title)\}/)
    }
  })
  test('de generiska formuleringarna är på plats', () => {
    expect(src).toContain('Vi har mottagit er signerade offert. Vi återkommer snart med startdatum.')
    expect(src).toContain('Vi har nu startat arbetet hos dig. Följ projektets framsteg i din portal.')
  })
  test('titlarna (interna) får fortfarande bära projektnamnet', () => {
    expect(src).toMatch(/title: `Lars: SMS — jobb startat \(\$\{projectName\}\)`/)
  })
})

test('milstolpe-SMS till kund nämner varken projekt- eller momentnamn', () => {
  const src = read('app/api/projects/[id]/milestones/route.ts')
  const m = src.match(/message: `Hej\$\{firstName[^`]*`/)
  expect(m, 'kund-SMS:et hittades inte').toBeTruthy()
  expect(m![0]).not.toMatch(/\$\{milestoneName\}|\$\{project\.name\}/)
  expect(m![0]).toContain('Ett delmoment i ditt projekt är nu klart')
})

test.describe('hemsideförslaget publicerar inte från kortet', () => {
  test('cronen är pausad bakom HEMSIDA_FORSLAG_ENABLED', () => {
    const src = read('app/api/cron/hemsida-forslag/route.ts')
    const grind = src.indexOf("process.env.HEMSIDA_FORSLAG_ENABLED !== 'true'")
    const forstaFraga = src.indexOf(".from('business_config')")
    expect(grind).toBeGreaterThan(0)
    expect(grind).toBeLessThan(forstaFraga)
    expect(src).not.toContain('sidan blir då synlig för alla på internet')
  })
  test('Godkänn sätter inte is_published — leder till hemsidesidan', () => {
    const src = read('app/api/approvals/[id]/route.ts')
    const start = src.indexOf("case 'publish_microsite'")
    const slut = src.indexOf("case 'egenkontroll_foto'")
    const gren = src.slice(start, slut)
    expect(gren).not.toMatch(/is_published: true/)
    expect(gren).toContain("navigate_to: '/dashboard/website'")
    expect(gren).toContain('published: false')
  })
})
