/**
 * Vakt: inlärningshändelser får aldrig failas tyst igen (spår 1.1, 2026-08-06).
 *
 * ═══ VAD SOM HÄNDE ═══
 *
 * `learning_events.reference_id` var deklarerad `UUID` medan koden skickar
 * TEXT (`appr_<tid>_<slump>`). Postgres avvisade varje insert.
 * `recordLearningEvent` loggade felet och returnerade `{ success: false }` —
 * men anroparen i `approvals/[id]/route.ts` **läste aldrig returvärdet**, och
 * hade dessutom ett tomt `catch {}` med kommentaren "Non-blocking".
 *
 * Resultatet: agentens förslag och hantverkarens svar samlades aldrig in, i
 * månader, utan att någon märkte det. Röret lagades i v78 — men all data före
 * 2026-08-03 är borta för alltid.
 *
 * Det här testet läser produktionskoden som text. Det är trubbigt, men det är
 * den enda formen som fångar just den här felklassen: att ett returvärde
 * IGNORERAS går inte att upptäcka med en vanlig enhetstest, eftersom koden
 * beter sig precis likadant vare sig den bryr sig eller inte.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/learning-event-guard.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const CALLER = path.join(ROOT, 'app', 'api', 'approvals', '[id]', 'route.ts')
const ENGINE = path.join(ROOT, 'lib', 'agent', 'learning-engine.ts')

function read(file: string): string {
  expect(fs.existsSync(file), `${path.relative(ROOT, file)} saknas — vakten pekar fel`).toBe(true)
  return fs.readFileSync(file, 'utf8')
}

test.describe('anroparen kontrollerar att händelsen faktiskt sparades', () => {
  test('returvärdet från recordLearningEvent fångas i en variabel', () => {
    const src = read(CALLER)
    // Ett bart `await recordLearningEvent(...)` utan tilldelning betyder att
    // svaret kastas bort — exakt den gamla buggen.
    const bareCalls = src.match(/^\s*await recordLearningEvent\(/gm) || []
    expect(
      bareCalls.length,
      'recordLearningEvent anropas utan att returvärdet tas emot. Funktionen ' +
        'KASTAR ALDRIG — den returnerar { success, error }. Ignoreras svaret ' +
        'är en misslyckad insert osynlig, vilket är precis hur all ' +
        'inlärningsdata gick förlorad före 2026-08-03.',
    ).toBe(0)
  })

  test('resultatet kontrolleras och larmar när det gick fel', () => {
    const src = read(CALLER)
    expect(
      /!\s*learning\.success|learning\.success\s*===\s*false/.test(src),
      'Ingen kontroll av learning.success i approvals-anroparen',
    ).toBe(true)
    expect(
      /LARM/.test(src),
      'Kontrollen finns men larmar inte synligt — en tyst kontroll är ingen kontroll',
    ).toBe(true)
  })

  test('inget tomt catch runt inlärningen', () => {
    const src = read(CALLER)
    // `} catch {` utan bindning och utan kropp var den ursprungliga formen.
    expect(
      /catch\s*\{\s*\/\/[^\n]*\n\s*\}/.test(src),
      'Ett catch-block som bara innehåller en kommentar sväljer felet. ' +
        'Fånga felet och logga det.',
    ).toBe(false)
  })
})

test.describe('motorn larmar själv', () => {
  test('insert-felet loggas som LARM, inte som en notis', () => {
    const src = read(ENGINE)
    expect(
      /LARM/.test(src),
      'learning-engine loggar insert-fel men utan larmord — raden drunknar i loggen',
    ).toBe(true)
  })

  test('felmeddelandet säger vad som går förlorat', () => {
    // "Insert error" säger vad som hände tekniskt. Det som behövs är vad det
    // KOSTAR: att agentens förslag och hantverkarens svar inte kan mätas.
    const src = read(ENGINE)
    expect(/går förlorade|förloras|tappar/.test(src)).toBe(true)
  })
})

test.describe('SANITY — vakten hade fångat den gamla koden', () => {
  // Det viktigaste testet i filen. En vakt som är grön på både rätt och fel
  // kod skyddar ingenting — och det är svårt att se på en grön svit att den
  // aldrig kunde bli röd. Här matchas mönstren mot den FAKTISKA kod som låg i
  // repot före 2026-08-06.

  const GAMLA_ANROPAREN = `
      if (action === 'approve') {
        await recordLearningEvent(
          business.business_id,
          'approval_accepted',
          params.id,
          'approval',
          agentSuggestion,
          null
        )
      }
    } catch {
      // Non-blocking — learning event failure should not break approval flow
    }
  `

  test('den bara anropet hade upptäckts', () => {
    const bare = GAMLA_ANROPAREN.match(/^\s*await recordLearningEvent\(/gm) || []
    expect(bare.length, 'regexen hittar inte det gamla mönstret — vakten är trasig').toBeGreaterThan(0)
  })

  test('det tomma catch-blocket hade upptäckts', () => {
    expect(/catch\s*\{\s*\/\/[^\n]*\n\s*\}/.test(GAMLA_ANROPAREN)).toBe(true)
  })

  test('den gamla koden saknade success-kontrollen', () => {
    expect(/!\s*learning\.success/.test(GAMLA_ANROPAREN)).toBe(false)
  })

  test('vakten läser rätt filer', () => {
    expect(read(CALLER)).toContain('recordLearningEvent')
    expect(read(ENGINE)).toContain('learning_events')
  })
})
