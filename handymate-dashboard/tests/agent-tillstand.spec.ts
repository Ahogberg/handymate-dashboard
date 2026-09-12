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
import { execSync } from 'child_process'
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
    daniel: { smsAutoEnabled: true, smsQuoteFollowup: true, handelser24h: 0, vantandeKort: 0 },
    karin: { harFakturadata: true, handelser24h: 0, vantandeKort: 0 },
    lars: { handelser24h: 0, vantandeKort: 0 },
    hanna: { harTidigareKunder: true, smsAutoEnabled: true, handelser24h: 0, vantandeKort: 0 },
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

test.describe('Daniel — automatiska uppföljningar (INGET nummerkrav)', () => {
  test('ett tomt assigned_phone_number får ALDRIG göra Daniel oaktiverad', () => {
    // Rättning 2026-09-10. Grinden krävde ett tilldelat nummer. Men
    // app/api/cron/quote-follow-up läser assigned_phone_number BARA för
    // SMS-signaturen (buildSmsSuffix tål null) och skickar uppföljningar
    // ändå. Mot databasen hade 25 av 29 konton inget nummer — inklusive
    // båda de betalande — så remsan sa "koppla telefonnumret" medan
    // uppföljningarna faktiskt gick ut. Indata bär därför inte ens fältet:
    // en framtida hand kan inte råka grinda på det igen.
    const daniel = baslinje().daniel as unknown as Record<string, unknown>
    expect(Object.keys(daniel), 'harNummer finns kvar i Daniels indata').not.toContain('harNummer')
    expect(harledAgentTillstand(baslinje()).daniel.tillstand).toBe('bevakar')
  })

  for (const [falt, varde] of [['smsAutoEnabled', false], ['smsQuoteFollowup', false]] as const) {
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

test.describe('Hanna — tidigare kunder + automatiska SMS', () => {
  test('ingen bekräftad tidigare kund → behover_aktiveras', () => {
    const indata = baslinje()
    indata.hanna.harTidigareKunder = false
    const rad = harledAgentTillstand(indata).hanna
    expect(rad.tillstand).toBe('behover_aktiveras')
    expect(rad.rad).toMatch(/^Hanna är redo\./)
  })

  test('grinden vilar inte på kundsegment — det är en prislistefunktion', () => {
    // Rättning 2026-09-10. Grinden krävde kunder med segment_id. Ingen av
    // Hannas vägar (hanna-outbound, kapacitet-fyllnad, proactive-care) läser
    // segment_id för att välja kandidater, och ingenting seedar segment: 28
    // av 29 konton hade noll, så Hanna var permanent oaktiverad medan
    // cronen skapade riktiga återaktiveringskort. Fältet är borta ur indata
    // så grinden inte kan återuppstå av misstag.
    const hanna = baslinje().hanna as unknown as Record<string, unknown>
    expect(Object.keys(hanna), 'harKundsegment finns kvar i Hannas indata').not.toContain('harKundsegment')
  })

  test('sms_auto_enabled av → behover_aktiveras trots tidigare kunder', () => {
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
    const start = ren.indexOf("from('call_recording')", ren.indexOf('lisaSamtalNagonsinRes'))
    const block = ren.slice(start, ren.indexOf('])', start))
    expect(block).toContain("eq('source', 'phone')")
    expect(block).toContain("eq('direction', 'inbound')")
    expect(block).toContain("count: 'exact', head: true")
    expect(block).not.toContain('sinceIso')
    expect(block).not.toContain('.gte(')
  })

  test('beviset räknas i en tabell som samtalsvägen FAKTISKT skriver', () => {
    // 2026-09-10, provsamtalet. Grinden räknade agent_runs med trigger_type
    // 'phone_call'. Efter två fångade samtal på Nordström El samma förmiddag:
    // noll rader i agent_runs för Lisa — noll någonsin — men båda samtalen låg
    // i call_recording. Enda skrivaren av agent_runs('lisa','phone_call') i
    // hela koden är demoseedaren. Grinden gick alltså bara att uppfylla på ett
    // påhittat konto.
    //
    // Det här provet är lärdomen, inte bara rättningen: signalen en
    // aktiveringsgrind vilar på måste ha en skrivare i produktionskod. Annars
    // är grinden död oavsett hur rimlig den ser ut i en kodgranskning.
    const rutt = read('app/api/dashboard/team-activity/route.ts')
    const grindStart = rutt.indexOf('LISAS AKTIVERINGSGRIND')
    expect(grindStart, 'hittade inte aktiveringsgrindens block').toBeGreaterThan(-1)
    const tabell = /from\('([a-z_]+)'\)/.exec(rutt.slice(grindStart))
    expect(tabell, 'hittade inte vilken tabell beviset räknas i').toBeTruthy()
    const namn = tabell![1]

    // Vem skriver den? Sök i hela app/ och lib/, kräv insert/upsert efter
    // from(), och räkna bort demo-, seed- och fixturvägar — de bevisar
    // ingenting om ett riktigt kundkonto.
    const kandidater = execSync(
      `grep -rl "from('${namn}')" --include=*.ts app lib || true`,
      { cwd: ROOT, encoding: 'utf8' },
    ).split('\n').filter(Boolean)

    const skrivare = kandidater.filter(f => {
      if (/demo|seed|fixture/i.test(f)) return false
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
      // insert/upsert ska stå i samma kedja som from('<tabell>')
      return new RegExp(`from\\('${namn}'\\)[\\s\\S]{0,400}?\\.(insert|upsert)\\(`).test(src)
    })

    expect(skrivare.length, `ingen produktionsväg skriver ${namn} — grinden kan aldrig uppfyllas på ett riktigt konto`)
      .toBeGreaterThan(0)
    // Och den vägen ska vara samtalsvägen, inte något annat som råkar skriva.
    expect(skrivare.some(f => f.includes('api/voice')), `${namn} skrivs inte av samtalsvägen: ${skrivare.join(', ')}`).toBe(true)
  })

  test('Hannas grind räknar kunder med last_job_date — samma kolumn hon arbetar ur', () => {
    // Rättning 2026-09-10, den GENERALISERADE lärdomen. Facit vaktade redan
    // att en grinds signal måste ha en SKRIVARE i produktionskod (se provet
    // om call_recording ovan). Hanna visade att det inte räcker: segment_id
    // har en skrivare (prislistesidan), men ingen av Hannas vägar LÄSER den
    // för att välja kandidater. En grind måste vila på en signal agentens
    // eget arbete faktiskt läser.
    expect(ren, 'Hannas grind räknar inte last_job_date').toMatch(
      /from\('customer'\)[\s\S]{0,400}?not\('last_job_date', 'is', null\)/,
    )
    expect(ren, 'segment_id används fortfarande som Hannas signal').not.toContain("'segment_id'")

    // Och kolumnen ska vara den Hannas egen väg läser.
    const pool = read('lib/customers/quiet-customer.ts')
    expect(pool, 'quiet-customer läser inte last_job_date — grinden pekar fel').toContain('last_job_date')
    const hanna = read('lib/agents/hanna-outbound.ts')
    expect(hanna, 'hanna-outbound hämtar inte sina kandidater ur quiet-customer').toContain('fetchQuietCustomers')
  })

  test('Daniels indata bär inget nummerfält — cronen kräver inget nummer', () => {
    // Rättning 2026-09-10. quote-follow-up läser assigned_phone_number bara
    // för SMS-signaturen (buildSmsSuffix tål null). Kravet gjorde att remsan
    // sa "koppla telefonnumret" på 25 av 29 konton medan uppföljningarna gick
    // ut. Provet läser BÅDE indatablocket här och cronen: skulle cronen en
    // dag faktiskt kräva ett nummer spricker det senare påståendet i stället.
    const danielBlock = ren.slice(ren.indexOf('daniel: {'), ren.indexOf("karin: { harFakturadata"))
    expect(danielBlock, 'harNummer skickas fortfarande in för Daniel').not.toContain('harNummer')

    const cron = read('app/api/cron/quote-follow-up/route.ts')
    const nummerRader = cron.split('\n').filter(r => r.includes('assigned_phone_number'))
    expect(nummerRader.length, 'cronen läser inte numret alls längre — provet är inaktuellt').toBeGreaterThan(0)
    // Varje förekomst ska vara select:en eller signaturbygget — aldrig ett
    // villkor som hoppar över företaget.
    for (const rad of nummerRader) {
      expect(rad, `cronen grindar på numret: ${rad.trim()}`).toMatch(/\.select\(|buildSmsSuffix/)
    }
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

test.describe('en avslutad körning får aldrig påstå att den pågår', () => {
  // 2026-09-12. `agent_runs.status` bar DEFAULT 'running' sedan den första
  // agent-migrationen. Raden skrivs dock alltid EFTER att körningen är klar,
  // och samtliga insert-ställen sätter status uttryckligen. Mätt i
  // produktion: 1362 rader, alla 'completed' — defaulten hade aldrig
  // använts. Kvar var bara risken: en insert som glömmer fältet hade fått
  // raden att påstå PÅGÅR i all evighet, alltså exakt samma slags lögn som
  // den gröna Standby-remsan. Utan default blir samma rad NULL.
  //
  // Skanningen görs på koden UTAN kommentarer — den här filens egna
  // kommentarer nämner DEFAULT 'running', och ett facit som faller på sin
  // egen prosa är inget facit (lärdomen från 2026-09-11).
  test("CREATE-filen ger inte status någon DEFAULT", () => {
    const ren = utanKommentarer(read('sql/agent_tables.sql'))
    const skapa = ren.slice(ren.indexOf('CREATE TABLE IF NOT EXISTS agent_runs'))
    const tabell = skapa.slice(0, skapa.indexOf(');'))
    const statusrad = tabell.split('\n').find(rad => /^\s*status\s+TEXT/i.test(rad))
    expect(statusrad, 'hittade ingen status-kolumn i agent_runs').toBeTruthy()
    expect(statusrad!.toUpperCase()).not.toContain('DEFAULT')
  })

  test('varje insert i agent_runs sätter status uttryckligen', () => {
    const filer = execSync(`grep -rl "from('agent_runs')" --include=*.ts app lib || true`, { cwd: ROOT })
      .toString().trim().split('\n').filter(Boolean)
    expect(filer.length, 'ingen fil skriver agent_runs — skanningen mäter inget').toBeGreaterThan(0)
    let inserts = 0
    for (const fil of filer) {
      const ren = utanKommentarer(read(fil))
      // Gå på varje from('agent_runs') och pröva bara dem där .insert(
      // följer DIREKT — annars fångar skanningen en select här och en
      // orelaterad insert hundra rader längre ner.
      const nyckel = "from('agent_runs')"
      let pos = ren.indexOf(nyckel)
      while (pos !== -1) {
        const efter = ren.slice(pos + nyckel.length)
        const traff = /^[\s]*\.insert\(\s*([^\s)]*)/.exec(efter)
        if (traff) {
          inserts++
          const argument = traff[1]
          if (argument.startsWith('{')) {
            // Objektlitteral på plats — status ska stå i blocket.
            expect(ren.slice(pos, pos + 900), `insert i ${fil} saknar uttrycklig status`).toMatch(/status:\s*'/)
          } else {
            // insert(variabel): följ variabeln och kräv status på VARJE rad
            // den bär. Annars räckte det att döpa om raderna till en const
            // för att slippa under grinden.
            const namn = argument.replace(/[^\w$]/g, '')
            expect(namn.length, `kunde inte tolka insert-argumentet i ${fil}`).toBeGreaterThan(0)
            const deklaration = ren.indexOf(`const ${namn}`)
            expect(deklaration, `hittade inte ${namn} i ${fil}`).toBeGreaterThan(-1)
            const kropp = ren.slice(deklaration, ren.indexOf('\n  ]', deklaration) + 4 || deklaration + 2000)
            // run_id är radens primärnyckel — varje RAD bär den, medan
            // nästlade objekt (trigger_data: {}) inte gör det. Så skiljs
            // raderna från sitt innehåll utan att parsa TypeScript.
            const rader = (kropp.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [])
              .filter(rad => rad.includes('run_id'))
            expect(rader.length, `${namn} i ${fil} bär inga rader att pröva`).toBeGreaterThan(0)
            for (const rad of rader) {
              expect(rad, `en rad i ${namn} (${fil}) saknar uttrycklig status`).toMatch(/status:\s*'/)
            }
          }
        }
        pos = ren.indexOf(nyckel, pos + 1)
      }
    }
    expect(inserts, 'hittade inga insert-block att pröva').toBeGreaterThan(0)
  })
})
