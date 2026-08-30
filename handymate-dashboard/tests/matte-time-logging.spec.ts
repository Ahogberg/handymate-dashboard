/**
 * Facit för röstens tidsregistrering (Matte Mobile Voice V1, 2026-08-30).
 *
 * "Logga fyra timmar för mig på det här projektet" är den första skarpa
 * skrivningen hantverkaren gör med rösten, och den har tre sätt att bli fel
 * som alla ser rätt ut i en demo:
 *
 *   1. FEL PERSON. `mig` fick förut betyda "bokningens tilldelade person,
 *      annars enda aktiva användaren, annars ingen" — en fallback-kedja som
 *      var byggd för telefontriggade körningar utan inloggad användare. I en
 *      flermansfirma landade tiden då på fel person eller ingen alls.
 *   2. PÅHITTADE KLOCKSLAG. Verktyget krävde start_time och end_time, men
 *      hantverkaren säger "fyra timmar" — inte "07:00 till 11:00". Modellen
 *      fyllde i klockslag som aldrig sagts.
 *   3. DUBBELREGISTRERING. Bekräftelse-token:en är giltig i 15 minuter och
 *      kan användas fler gånger; ett dubbeltryck skrev två tidrader.
 *
 * Facit mäter på KODEN (samma teknik som tests/voice-boundaries.spec.ts) —
 * tidsregistrering går inte att köra utan databas i CI.
 *
 *   npx playwright test tests/matte-time-logging.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/** Kommentarerna beskriver ofta just det fynd som lagades — mät på koden. */
const kod = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

/** Bara kroppen i logTime — routern är 3 500 rader och ordningsfacit nedan
 *  måste mäta inuti rätt funktion, inte råka träffa ett annat verktyg. */
function logTimeKropp(): string {
  const s = kod('app/api/agent/trigger/tool-router.ts')
  const start = s.indexOf('async function logTime(')
  expect(start, 'logTime hittades inte i tool-router').toBeGreaterThan(-1)
  const nasta = s.indexOf('\nasync function ', start + 10)
  return s.slice(start, nasta === -1 ? undefined : nasta)
}

test.describe('1. "mig" är den autentiserade användaren', () => {
  test('logTime tar emot verktygskontexten och använder dess businessUserId', () => {
    const s = kod('app/api/agent/trigger/tool-router.ts')
    expect(s, 'logTime anropas utan context — då finns ingen inloggad identitet')
      .toContain('logTime(supabase, businessId, input, context)')
    expect(logTimeKropp()).toContain('context.businessUserId')
  })

  test('en levande chatt utan känd användare skriver hellre inget alls', () => {
    // triggerSource 'user' = dashboard-/mobilchatt med session. Saknas
    // användaren där är något fel — gissa aldrig fram en person.
    const kropp = logTimeKropp()
    const vakt = kropp.indexOf("context.triggerSource === 'user' && !context.businessUserId")
    expect(vakt, 'ingen vakt mot okänd användare i en levande chatt').toBeGreaterThan(-1)
    expect(kropp.indexOf(".from('time_entry')"), 'raden skrivs före vakten').toBeGreaterThan(vakt)
  })

  test('användaren verifieras mot företaget innan tiden skrivs', () => {
    const kropp = logTimeKropp()
    const kontroll = kropp.indexOf("from('business_users')")
    expect(kontroll, 'ingen tenantkontroll av användaren').toBeGreaterThan(-1)
    expect(kropp).toContain("eq('is_active', true)")
    expect(kropp.indexOf('.insert(')).toBeGreaterThan(kontroll)
  })
})

test.describe('2. inga påhittade klockslag', () => {
  test('duration_minutes räcker — start och slut är valfria', () => {
    const defs = read('app/api/agent/trigger/tool-definitions.ts')
    const i = defs.indexOf('name: "log_time"')
    expect(i).toBeGreaterThan(-1)
    const block = defs.slice(i, i + 1200)
    expect(block).toContain('duration_minutes')
    expect(block, 'required får inte tvinga fram klockslag som aldrig sagts')
      .toContain('required: ["duration_minutes"]')
  })

  test('orimliga längder avvisas i stället för att sparas', () => {
    expect(logTimeKropp()).toContain('24 * 60')
  })
})

test.describe('3. samma pass loggas aldrig två gånger', () => {
  test('dubblettkontrollen ligger före insert:en', () => {
    const kropp = logTimeKropp()
    const kontroll = kropp.indexOf('dubblettFonster')
    expect(kontroll, 'inget dubbelregistreringsskydd').toBeGreaterThan(-1)
    expect(kropp.indexOf('.insert(')).toBeGreaterThan(kontroll)
  })

  test('en tidrad utan projekt känns också igen som dubblett', () => {
    // .eq() matchar aldrig NULL i Postgres — utan is()-grenen hade allmän
    // tid (utan projekt) kunnat dubbelregistreras fritt.
    expect(logTimeKropp()).toContain("is('project_id', null)")
  })
})

test.describe('4. tiden passerar ett mänskligt ja i chatten', () => {
  test('log_time gatas av samma bekräftelsemekanism som utskicken', () => {
    const s = kod('lib/agent/external-confirm.ts')
    expect(s).toContain("'log_time'")
    // Token:en verifieras mot den bredare listan — annars vägrar servern
    // att utföra ett kort den själv signerat.
    expect(s).toContain('isConfirmGatedTool(payload.toolName)')
  })

  test('kortets knapp säger Logga, inte Skicka', () => {
    expect(kod('lib/agent/external-confirm.ts')).toContain('confirmLabelForTool')
    for (const yta of ['components/Jobbkompisen.tsx', 'components/MatteChatModal.tsx']) {
      expect(kod(yta), `${yta} hårdkodar knapptexten`).toContain('confirm_label')
    }
  })

  test('bekräftelsevägen bär med sig vem som tryckte', () => {
    // Utförandet sker i en SENARE request än den som visade kortet — utan
    // businessUserId här hade tiden tappat sin person just vid bekräftelsen.
    const s = kod('app/api/matte/chat/route.ts')
    const i = s.indexOf('async function handleConfirmedExternalAction')
    expect(i).toBeGreaterThan(-1)
    expect(s.slice(i, i + 2000)).toContain('businessUserId')
  })
})
