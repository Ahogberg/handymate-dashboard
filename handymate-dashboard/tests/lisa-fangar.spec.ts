/**
 * Facit: "Lisa fångar, hon svarar aldrig" + "dygnet runt är ett löfte, inte
 * ett faktum" (WOW_GENOMLYSNING_2026-09-05, avsnitt 2.C).
 *
 * ═══ BAKGRUND ═══
 *
 * Lisa tar emot samtal och sms — hon återkopplar, fångar, bevakar. Hon
 * "svarar" eller "besvarar" aldrig i telefon: det ordvalet lovar ett
 * mänskligt telefonsamtal ingen agent för. Samtidigt lovade flera ställen
 * "dygnet runt" för ett löfte som i verkligheten styrs av
 * respects_work_hours/night_mode-grinden i automation-engine.ts och av
 * call_handling_mode i app/api/voice/incoming/route.ts (human_work_hours:
 * utanför arbetstid går samtalet till agenten, INNANFÖR arbetstid ringer det
 * hos hantverkaren själv — och natt-läget kan tysta uppföljnings-SMS). Sex
 * ställen bar den ena eller båda lögnerna (företagsskannen, genomgången,
 * bevakningen, onboardingens telefon- och betalsteg); två av dem hade redan
 * facit som LÅSTE de gamla, felaktiga strängarna (tests/anvandartaket.spec.ts
 * höll delvis kvar via en delsträng som klarar sig oförändrad, medan
 * tests/bevakning.spec.ts:96 mätte exakt den gamla frasen och är uppdaterat
 * i samma lagning som denna fil).
 *
 * ═══ REGELN ═══
 *
 * Inget av /Lisa (svarar|besvarar)/ eller /dygnet runt/ får förekomma i
 * KODEN (kommentarer undantagna — de beskriver ofta just det fynd som
 * lagades) under lib/, app/ eller components/. Tre kvarvarande träffar är
 * medvetet allowlistade nedan, med motivering per rad — de beskriver INTE
 * Lisas telefonlöfte:
 *
 *  - lib/knowledge-defaults.ts: exempeltext för en LÅSSMEDS egen jourtjänst
 *    ("ring OSS dygnet runt") — kundens egna ord om sitt eget företag i en
 *    ifyllnadsmall, inte ett Handymate/Lisa-löfte.
 *  - app/dashboard/agent/page.tsx: rubriken över teamsidan syftar på att
 *    AGENTMOTORN (cron/automation-engine) körs kontinuerligt i bakgrunden,
 *    inte på ett specifikt telefonsvars-löfte — enskilda utgående
 *    kundåtgärder är fortfarande arbetstids-grindade.
 *  - app/dashboard/website/page.tsx: beskriver STOREFRONT-CHATBOTEN (en
 *    fristående funktion, klient-JS på kundens egen hemsida) — den har
 *    ingen respects_work_hours-grind, till skillnad från telefonlinjen.
 *
 * Körs: npx playwright test tests/lisa-fangar.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['lib', 'app', 'components']

const FORBIDDEN: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Lisa svarar/besvarar i telefon', pattern: /Lisa (svarar|besvarar)\b/ },
  { name: '"dygnet runt"', pattern: /dygnet runt/ },
]

// file:rad → motivering. Endast rader som INTE beskriver Lisas telefonlöfte
// hör hemma här — allt annat ska lagas, inte tystas.
const ALLOWLIST: Record<string, string> = {
  'lib/knowledge-defaults.ts:125':
    'Exempeltext för en låssmeds EGEN jourtjänst i en ifyllnadsmall ("ring oss dygnet runt") — kundens löfte om sitt eget företag, inte Handymates/Lisas.',
  'app/dashboard/agent/page.tsx:1161':
    'Rubrik om att agentmotorn (cron/automation-engine) körs kontinuerligt i bakgrunden — inget specifikt telefonsvars-löfte. Enskilda kundåtgärder är fortsatt arbetstids-grindade.',
  'app/dashboard/website/page.tsx:393':
    'Beskriver storefront-chatboten (klient-JS på kundens egen hemsida) — en annan funktion än telefonlinjen, utan respects_work_hours-grind.',
}

/** Kommentarerna beskriver ofta just det fynd som lagades — mät på koden. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .split('\n')
    .map((line) => {
      const i = line.indexOf('//')
      return i === -1 ? line : line.slice(0, i)
    })
    .join('\n')
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue
      walk(p, out)
    } else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) {
      out.push(p)
    }
  }
  return out
}

test.describe('Lisa fångar — hon svarar aldrig; "dygnet runt" bara när det är sant', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))

  test('källskanningen faktiskt genomsöker lib/, app/ och components/', () => {
    expect(files.length, 'källskanningen hittade inga filer — sökvägarna har flyttat').toBeGreaterThan(50)
  })

  test('ingen /Lisa (svarar|besvarar)/ eller /dygnet runt/ utanför kommentarer och allowlistan', () => {
    const traffar: string[] = []

    for (const abs of files) {
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/')
      const raw = fs.readFileSync(abs, 'utf8')
      const kod = stripComments(raw)
      const rader = kod.split('\n')

      rader.forEach((rad, idx) => {
        for (const { pattern } of FORBIDDEN) {
          if (pattern.test(rad)) {
            const nyckel = `${rel}:${idx + 1}`
            if (!ALLOWLIST[nyckel]) {
              traffar.push(`${nyckel}: ${rad.trim()}`)
            }
          }
        }
      })
    }

    expect(traffar, traffar.join('\n')).toEqual([])
  })

  test('allowlistan är exakt — inga överblivna eller obefintliga poster', () => {
    // Om en allowlistad rad har städats bort (t.ex. att texten flyttat eller
    // lagats) ska posten tas bort härifrån — annars tystar den framtida
    // ändringar på FEL rad utan att någon märker det.
    for (const [nyckel, motivering] of Object.entries(ALLOWLIST)) {
      expect(motivering.length, `${nyckel} saknar motivering`).toBeGreaterThan(10)
      const [rel, radStr] = nyckel.split(':')
      const abs = path.join(ROOT, rel)
      expect(fs.existsSync(abs), `${nyckel} allowlistad men filen finns inte längre — ta bort posten`).toBe(true)
      const kod = stripComments(fs.readFileSync(abs, 'utf8'))
      const rad = kod.split('\n')[Number(radStr) - 1] || ''
      const traffar = FORBIDDEN.some(({ pattern }) => pattern.test(rad))
      expect(traffar, `${nyckel} allowlistad men träffar inte längre mönstret — ta bort posten (radnumret har glidit eller strängen är redan lagad)`).toBe(true)
    }
  })
})
