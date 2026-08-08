/**
 * Facit för Mattes säkerhetsgränser (Codex orkestreringsaudit, 2026-08-08).
 *
 * Fyra fynd, alla verifierade mot koden innan de lagades:
 *
 * 1. MatteChatModal skickade utan require_confirm_external — samma Matte
 *    kunde SMS:a kunder direkt eller kräva bekräftelse beroende på vilken
 *    yta man skrev i. Gränsen får aldrig bero på dörren man kom in genom.
 * 2. En muterande GET-testrutte (api/test/agent-handoff) kunde skapa och
 *    ändra handoffdata i en riktig tenant.
 * 3. executeHandoff kastade bort DB-fel och kunde returnera ok:true utan
 *    att current_agent_id ändrats — nästa meddelande gick till fel agent.
 * 4. Handoff-taket var ett livstidsfält: efter tre historiska byten var
 *    tråden permanent blockerad. Loop-skydd ska stoppa spiraler i stunden,
 *    inte åldras in i tråden.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/matte-safety.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('bekräftelsegränsen är yta-oberoende', () => {
  test('båda chatytorna begär extern bekräftelse', () => {
    for (const yta of ['components/Jobbkompisen.tsx', 'components/MatteChatModal.tsx']) {
      expect(read(yta), `${yta} saknar require_confirm_external`).toContain('require_confirm_external')
    }
  })

  test('modalen hanterar bekräftelsekortet — flaggan utan UI vore N3-felklassen', () => {
    // Utan hantering skulle sändningen tyst utebli medan Matte säger
    // "skickar nu" — påstådd leverans utan verifierad, igen.
    const s = read('components/MatteChatModal.tsx')
    expect(s).toContain('pending_confirmation')
    expect(s).toContain("confirm: { token }")
    expect(s).toContain('Avbryt')
  })
})

test.describe('den muterande testrutten är borta', () => {
  test('api/test/agent-handoff finns inte', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/api/test/agent-handoff'))).toBe(false)
  })
})

test.describe('handoff-persistensen ljuger inte', () => {
  const s = read('lib/agent/handoff.ts')

  test('tråduppdateringens fel läses och ger persist_failed', () => {
    expect(s).toContain('updateErr')
    expect(s).toContain("refused_reason: 'persist_failed'")
  })

  test('auditinsertens fel läses', () => {
    expect(s).toContain('auditErr')
  })

  test('taket räknas i ett 24h-fönster ur auditloggen, inte livstidsfältet', () => {
    expect(s).toContain("gte('created_at'")
    expect(s, 'livstidsgrinden är tillbaka').not.toMatch(/if \(\(thread\.handoff_count \|\| 0\) >= MAX_HANDOFFS_PER_THREAD\)/)
  })

  test('kan räkningen inte göras nekas handoffen — aldrig fail-open', () => {
    expect(s).toContain('countErr')
    const i = s.indexOf('countErr')
    const efter = s.slice(i, i + 900)
    expect(efter).toContain("refused_reason: 'max_handoffs_reached'")
  })
})
