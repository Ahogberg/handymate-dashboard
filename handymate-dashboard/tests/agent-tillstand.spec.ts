/**
 * Facit för "Sann agentstatus" (tasks/plan-sann-agentstatus.md).
 *
 * Kärnfelet det här facit vaktar mot: agentremsan på Översikt visade fem
 * hårdkodade "bevakar"-texter helt ogrindat — en agent utan telefonnummer,
 * utan påslagna automationer eller under den globala pausen såg IDENTISK ut
 * mot en riktigt aktiverad, arbetande agent (samma gröna "Standby").
 *
 * Två delar:
 *  1. Rena enhetstester på lib/agents/agent-tillstand.ts — härledningen,
 *     ingen DB, samma stil som tests/bevakning.spec.ts och
 *     lib/onboarding/channel-health.ts.
 *  2. Källskanning (kommentarer strippas innan mönster söks, samma helper
 *     som tests/autopilot-rapport.spec.ts) som förbjuder de fem gamla
 *     ogrindade idle-strängarna i team-activity-rutten, kräver att
 *     agents_globally_paused selectas där, och kräver en icke-grön gren
 *     för `behover_aktiveras` i TeamActivityStrip.
 *
 * Körs: npx playwright test tests/agent-tillstand.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  harledAgentTillstand,
  type AgentId,
  type AgentTillstandIndata,
} from '../lib/agents/agent-tillstand'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

/** Strippar // och /* *\/ -kommentarer (inte innehållet i strängar/mallsträngar). */
function utanKommentarer(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** En fullt aktiverad, tyst (ingen aktivitet, inga väntande kort) baslinje — varje test muterar bara det som prövas. */
function baslinje(): AgentTillstandIndata {
  return {
    agentsGloballyPaused: false,
    lisa: { harNummer: true, telefonVerifierad: true, handelser24h: 0, vantandeKort: 0 },
    daniel: { harNummer: true, smsAutoEnabled: true, smsQuoteFollowup: true, handelser24h: 0, vantandeKort: 0 },
    karin: { harFakturadata: true, handelser24h: 0, vantandeKort: 0 },
    lars: { handelser24h: 0, vantandeKort: 0 },
    hanna: { harKundsegment: true, smsAutoEnabled: true, handelser24h: 0, vantandeKort: 0 },
  }
}

test.describe('pausad vinner alltid — före allt annat', () => {
  test('agents_globally_paused ger ALLA fem agenterna pausad, även med full aktivitet', () => {
    const indata = baslinje()
    indata.agentsGloballyPaused = true
    indata.lisa.handelser24h = 5
    indata.daniel.vantandeKort = 3
    const ut = harledAgentTillstand(indata)
    for (const agent of ['lisa', 'daniel', 'karin', 'lars', 'hanna'] as AgentId[]) {
      expect(ut[agent].tillstand, agent).toBe('pausad')
      expect(ut[agent].rad, agent).toMatch(/pausad/i)
    }
  })

  test('en oaktiverad agent under paus visas ändå som pausad, inte behöver_aktiveras', () => {
    const indata = baslinje()
    indata.agentsGloballyPaused = true
    indata.lisa.telefonVerifierad = false
    expect(harledAgentTillstand(indata).lisa.tillstand).toBe('pausad')
  })
})

test.describe('Lisa — nummer + verifierat provsamtal', () => {
  test('saknar nummer → behover_aktiveras med den exakta lovade texten', () => {
    const indata = baslinje()
    indata.lisa.harNummer = false
    const rad = harledAgentTillstand(indata).lisa
    expect(rad.tillstand).toBe('behover_aktiveras')
    expect(rad.rad).toBe('Lisa är redo. Verifiera telefonen så kan hon börja fånga missade samtal.')
  })

  test('har nummer men inget verifierat provsamtal → behover_aktiveras', () => {
    const indata = baslinje()
    indata.lisa.telefonVerifierad = false
    expect(harledAgentTillstand(indata).lisa.tillstand).toBe('behover_aktiveras')
  })

  test('nummer + verifierat, ingen aktivitet → bevakar, aldrig "svarar"', () => {
    const rad = harledAgentTillstand(baslinje()).lisa
    expect(rad.tillstand).toBe('bevakar')
    expect(rad.rad).not.toMatch(/svarar/i)
    expect(rad.rad).toMatch(/fångar/i)
  })

  test('händelser senaste dygnet → arbetar, med Lisa som FÅNGAR aldrig svarar', () => {
    const indata = baslinje()
    indata.lisa.handelser24h = 4
    const rad = harledAgentTillstand(indata).lisa
    expect(rad.tillstand).toBe('arbetar')
    expect(rad.rad).toContain('4')
    expect(rad.rad).not.toMatch(/svarar/i)
    expect(rad.rad).toMatch(/[Ff]ångade/)
  })

  test('väntande kort vinner över arbetar-signalen', () => {
    const indata = baslinje()
    indata.lisa.handelser24h = 4
    indata.lisa.vantandeKort = 1
    expect(harledAgentTillstand(indata).lisa.tillstand).toBe('behover_dig')
  })
})

test.describe('Daniel — automatiska uppföljningar + nummer', () => {
  for (const [falt, varde] of [['harNummer', false], ['smsAutoEnabled', false], ['smsQuoteFollowup', false]] as const) {
    test(`saknar ${falt} → behover_aktiveras`, () => {
      const indata = baslinje()
      ;(indata.daniel as any)[falt] = varde
      const rad = harledAgentTillstand(indata).daniel
      expect(rad.tillstand).toBe('behover_aktiveras')
      expect(rad.rad).toMatch(/^Daniel är redo\./)
    })
  }

  test('allt uppfyllt, ingen aktivitet → bevakar', () => {
    expect(harledAgentTillstand(baslinje()).daniel.tillstand).toBe('bevakar')
  })

  test('händelser senaste dygnet → arbetar med antalet i texten', () => {
    const indata = baslinje()
    indata.daniel.handelser24h = 2
    const rad = harledAgentTillstand(indata).daniel
    expect(rad.tillstand).toBe('arbetar')
    expect(rad.rad).toContain('2')
  })
})

test.describe('Karin — fakturadata', () => {
  test('ingen fakturadata → behover_aktiveras', () => {
    const indata = baslinje()
    indata.karin.harFakturadata = false
    const rad = harledAgentTillstand(indata).karin
    expect(rad.tillstand).toBe('behover_aktiveras')
    expect(rad.rad).toMatch(/^Karin är redo\./)
  })

  test('fakturadata finns, ingen aktivitet → bevakar', () => {
    expect(harledAgentTillstand(baslinje()).karin.tillstand).toBe('bevakar')
  })
})

test.describe('Lars — ingen aktiveringsgrind', () => {
  test('Lars bevakar även med allt annat i indata tomt/false', () => {
    const indata = baslinje()
    const rad = harledAgentTillstand(indata).lars
    expect(rad.tillstand).toBe('bevakar')
  })

  test('händelser senaste dygnet → arbetar', () => {
    const indata = baslinje()
    indata.lars.handelser24h = 3
    const rad = harledAgentTillstand(indata).lars
    expect(rad.tillstand).toBe('arbetar')
    expect(rad.rad).toContain('3')
  })

  test('väntande kort → behover_dig', () => {
    const indata = baslinje()
    indata.lars.vantandeKort = 1
    expect(harledAgentTillstand(indata).lars.tillstand).toBe('behover_dig')
  })
})

test.describe('Hanna — kundsegment + automatiska SMS', () => {
  test('inget kundsegment → behover_aktiveras', () => {
    const indata = baslinje()
    indata.hanna.harKundsegment = false
    const rad = harledAgentTillstand(indata).hanna
    expect(rad.tillstand).toBe('behover_aktiveras')
    expect(rad.rad).toMatch(/^Hanna är redo\./)
  })

  test('sms_auto_enabled av → behover_aktiveras trots kundsegment', () => {
    const indata = baslinje()
    indata.hanna.smsAutoEnabled = false
    expect(harledAgentTillstand(indata).hanna.tillstand).toBe('behover_aktiveras')
  })

  test('allt uppfyllt, ingen aktivitet → bevakar', () => {
    expect(harledAgentTillstand(baslinje()).hanna.tillstand).toBe('bevakar')
  })
})

test.describe('inga tekniska termer i någon rad', () => {
  test('ingen COPY-rad läcker flaggnamn, tabellnamn eller andra interna termer', () => {
    const forbjudna = [/automation/i, /flagga/i, /webhook/i, /payload/i, /database/i, /sql/i, /token/i]
    for (const scenario of [
      baslinje(),
      { ...baslinje(), agentsGloballyPaused: true },
      { ...baslinje(), lisa: { ...baslinje().lisa, harNummer: false } },
    ]) {
      const ut = harledAgentTillstand(scenario)
      for (const agent of Object.keys(ut) as AgentId[]) {
        for (const re of forbjudna) {
          expect(ut[agent].rad, `${agent}: ${ut[agent].rad}`).not.toMatch(re)
        }
      }
    }
  })
})

test.describe('källskanning — team-activity-rutten', () => {
  const rutt = read('app/api/dashboard/team-activity/route.ts')
  const ren = utanKommentarer(rutt)

  test('de fem gamla ogrindade idle-strängarna finns inte kvar som fallback-text', () => {
    const forbjudna = [
      'Vakar över telefonen — kopplar samtal, tar meddelanden och SMS:ar vid missat',
      'Bevakar offert-pipeline — följer upp automatiskt',
      'Håller koll på fakturor och betalningar',
      'Bevakar bokningar och projektstatus',
      'Förbereder kampanjer — spanar efter nya leads',
    ]
    for (const sträng of forbjudna) {
      expect(ren, sträng).not.toContain(sträng)
    }
  })

  test('agents_globally_paused selectas i rutten (kill-switchen läses, inte bara importeras)', () => {
    expect(ren).toMatch(/\.select\(['"][^'"]*agents_globally_paused[^'"]*['"]\)/)
  })

  test('onboarding_data selectas — Lisas verifierade provsamtal kräver det', () => {
    expect(ren).toMatch(/\.select\(['"][^'"]*onboarding_data[^'"]*['"]\)/)
  })

  test('Lisa räknas som verifierad även av ett RIKTIGT fångat samtal — inte bara provsamtalet', () => {
    // Mot databasen 2026-09-04: inget av de åtta kontona med nummer hade
    // onboarding_data.test_call.called_at — inte demokontot med ett riktigt
    // samtal, inte de betalande. Grindad enbart på provsamtalet hade Lisa
    // visat "Verifiera telefonen" på varenda konto, även där hon bevisligen
    // jobbat. Ett riktigt samtal är starkare bevis än ett provsamtal.
    expect(ren).toMatch(/telefonVerifierad = Boolean\(testCall\?\.called_at\) \|\| lisaSamtalNagonsin > 0/)
    // Räkningen måste vara UTAN tidsfönster — agentRuns-selecten är bara 24 h.
    const start = ren.indexOf("from('agent_runs')", ren.indexOf('lisaSamtalNagonsinRes'))
    const block = ren.slice(start, ren.indexOf('])', start))
    expect(block).toContain("eq('agent_id', 'lisa')")
    expect(block).toContain("eq('trigger_type', 'phone_call')")
    expect(block).toContain("count: 'exact', head: true")
    expect(block).not.toContain('sinceIso')
    expect(block).not.toContain('.gte(')
  })

  test('automation_settings selectas med de tre verifierade kolumnerna', () => {
    expect(ren).toContain(".from('automation_settings')")
    expect(ren).toContain('sms_auto_enabled')
    expect(ren).toContain('sms_quote_followup')
    expect(ren).toContain('sms_day_before_reminder')
  })

  test('varje agentpost i svaret bär ett tillstand-fält härlett ur harledAgentTillstand', () => {
    expect(ren).toContain("from '@/lib/agents/agent-tillstand'")
    expect(ren).toContain('harledAgentTillstand(')
    expect(ren).toMatch(/tillstand:\s*t\.tillstand/)
  })

  test('veckosammanfattningen är inte längre hårdkodad true — grindas på assigned_phone_number', () => {
    expect(ren).not.toContain('veckosammanfattning: true')
    expect(ren).toContain('veckosammanfattning: harNummer')
  })

  test('flaggorna läses med cronens semantik: "inte uttryckligen av", inte "uttryckligen på"', () => {
    // Fyndet 2026-09-04: noll konton i produktionen har en
    // automation_settings-rad. Cronen (app/api/cron/quote-follow-up/route.ts)
    // behandlar saknad rad som PÅ (`enabled` startar true och sänks bara av
    // ett uttryckligt false). Med `=== true` här hade remsan sagt "Daniel
    // behöver aktiveras" på varenda konto medan uppföljningarna faktiskt
    // skickades — samma sorts lögn som passet skulle ta bort, fast tvärtom.
    // Läsningen är fortfarande defensiv (`autoSettings?.x`), aldrig ett
    // direkt `.data.sms_auto_enabled` som kastar på null.
    expect(ren).toContain('autoSettings?.sms_auto_enabled !== false')
    expect(ren).toContain('autoSettings?.sms_quote_followup !== false')
    expect(ren).toContain('autoSettings?.sms_day_before_reminder !== false')
    expect(ren).not.toContain('autoSettings?.sms_auto_enabled === true')
  })
})

test.describe('källskanning — TeamActivityStrip renderar icke-grönt för behover_aktiveras/pausad', () => {
  const src = read('components/TeamActivityStrip.tsx')
  const ren = utanKommentarer(src)

  test('behover_aktiveras får en amber-etikett "Behöver aktiveras", aldrig grön Standby', () => {
    expect(ren).toContain("'behover_aktiveras'")
    expect(ren).toContain('Behöver aktiveras')
    // Etiketten (badge-span, den SISTA träffen — den första är dot-titeln)
    // ligger i en amber-klass, aldrig den gröna emerald-familjen.
    const badgePos = ren.lastIndexOf('Behöver aktiveras')
    const block = ren.slice(badgePos - 250, badgePos)
    expect(block).toMatch(/amber/)
    expect(block).not.toMatch(/emerald/)
  })

  test('pausad får en grå etikett "Pausad", aldrig grön Standby', () => {
    expect(ren).toContain("'pausad'")
    expect(ren).toContain('Pausad')
    const badgePos = ren.lastIndexOf('Pausad')
    const block = ren.slice(badgePos - 250, badgePos)
    expect(block).toMatch(/gray/)
    expect(block).not.toMatch(/emerald/)
  })

  test('dot-färgen grenar på tillstand — pausad/behover_aktiveras kan aldrig färgas emerald', () => {
    const dotBlock = ren.slice(ren.indexOf('rounded-full border-2 border-white'), ren.indexOf('rounded-full border-2 border-white') + 400)
    expect(dotBlock).toMatch(/pausad/)
    expect(dotBlock).toMatch(/behover_aktiveras/)
  })
})
