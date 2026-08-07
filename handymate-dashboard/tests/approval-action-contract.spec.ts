/**
 * Facit för godkännande-kontraktet (N5, 2026-08-07).
 *
 * ═══ FELET SOM VAKTAS ═══
 *
 * Exekveringens `default:`-gren gissade fram ett SMS ur payloaden:
 *
 *     const smsMessage = pl.message || pl.suggested_sms || pl.sms_text
 *     const smsTo = pl.to || pl.customer_phone || pl.entity?.phone
 *
 * Fanns båda **skickades ett riktigt SMS till kunden** — för en korttyp ingen
 * skrivit en hanterare för. Fanns de inte returnerades "Godkänt utan specifik
 * åtgärd", en tyst nollhandling som såg ut som att något hänt.
 *
 * Elva av producenternas korttyper hamnade där, bland dem `manual_project_create`
 * (ett reparationskort som aldrig skulle prata med kunden) och `missad_intakt`
 * (som intäktsåtervinningen bygger på).
 *
 * Det viktigaste testet i filen är **varje producenttyp är klassad**. Går det
 * sönder har någon skeppat ett kort som kön inte vet vad den ska göra med.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/approval-action-contract.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  ACTION_CONTRACT,
  classify,
  mayExecute,
  nonExecutableResult,
  type ActionClass,
} from '../lib/approvals/action-contract'

const ROOT = path.resolve(__dirname, '..')
const RUTT = fs.readFileSync(path.join(ROOT, 'app/api/approvals/[id]/route.ts'), 'utf8')

/**
 * Rutten utan kommentarer.
 *
 * Kommentaren i default-grenen citerar den gamla gissningen ordagrant för att
 * förklara vad som rättades. Utan strippningen matchar testerna sin egen
 * dokumentation och blir röda av fel skäl.
 */
const KOD = RUTT
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter(r => !r.trim().startsWith('//'))
  .join('\n')

/** Alla `approval_type: '...'` som produkten faktiskt skapar. */
function producentTyper(): string[] {
  const ut = new Set<string>()
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue
        walk(p)
      } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
        const s = fs.readFileSync(p, 'utf8')
        for (const m of Array.from(s.matchAll(/approval_type:\s*'([a-z_]+)'/g))) ut.add(m[1])
      }
    }
  }
  walk(path.join(ROOT, 'app'))
  walk(path.join(ROOT, 'lib'))
  return Array.from(ut).sort()
}

/** Typer som har en egen `case` i exekveringen. */
function hanteradeTyper(): Set<string> {
  return new Set(
    Array.from(RUTT.matchAll(/^\s{6}case '([a-z_]+)':/gm)).map(m => m[1]),
  )
}

test.describe('ingen typ är oklassad', () => {
  test('varje producenttyp finns i kontraktet', () => {
    // Kärntestet. Skeppar någon ett nytt kort utan att säga vad ett godkännande
    // ska göra går det inte att godkänna — och det ska synas här, inte i prod.
    const oklassade = producentTyper().filter(t => !classify(t))
    expect(oklassade, 'korttyper utan klassning — lägg till dem i ACTION_CONTRACT').toEqual([])
  })

  test('varje utförande typ har en egen hanterare', () => {
    // Klassad som EXECUTABLE_ACTION utan `case` betyder att kortet failar
    // stängt vid klick. Bättre än att gissa, men det ska aldrig skeppas.
    const hanterade = hanteradeTyper()
    const utanHanterare = Object.entries(ACTION_CONTRACT)
      .filter(([t, k]) => k === 'EXECUTABLE_ACTION' && !hanterade.has(t))
      .map(([t]) => t)
    expect(utanHanterare, 'klassade som utförande men saknar gren i rutten').toEqual([])
  })

  test('inget klassvärde utanför de fyra', () => {
    const tillatna: ActionClass[] = ['INFORMATIONAL', 'ACKNOWLEDGEMENT', 'REVIEW_REQUIRED', 'EXECUTABLE_ACTION']
    for (const [t, k] of Object.entries(ACTION_CONTRACT)) {
      expect(tillatna, `${t} har ett ogiltigt klassvärde`).toContain(k)
    }
  })
})

test.describe('gissningen är borta', () => {
  test('rutten letar inte längre efter SMS-fält i default', () => {
    expect(KOD, 'SMS-gissningen är tillbaka').not.toContain('pl.suggested_sms || pl.sms_text')
    expect(KOD).not.toContain("pl.to || pl.customer_phone")
  })

  test('den tysta nollhandlingen är borta', () => {
    expect(KOD, '"Godkänt utan specifik åtgärd" är tillbaka').not.toContain('Godkänt utan specifik åtgärd')
  })

  test('default-grenen slår upp klassen i stället', () => {
    const i = KOD.lastIndexOf('default: {')
    expect(i).toBeGreaterThan(-1)
    const gren = KOD.slice(i, i + 2000)
    expect(gren).toContain('classify(approval_type)')
    expect(gren, 'okänd typ måste failas stängt').toContain('throw new Error')
  })
})

test.describe('de tidigare hemlösa typerna', () => {
  test('missad_intakt kräver granskning, utför aldrig', () => {
    // Grinden för intäktsåtervinningen: ett fynd är ett förslag att titta på,
    // aldrig en faktura som skickas.
    expect(classify('missad_intakt')).toBe('REVIEW_REQUIRED')
    expect(mayExecute('missad_intakt')).toBe(false)
  })

  test('manual_project_create utför aldrig något', () => {
    // Ett reparationskort för ett misslyckat projektskapande. Det bar SMS-fält
    // i payloaden och kunde därför skicka ett meddelande till kunden.
    expect(mayExecute('manual_project_create')).toBe(false)
  })

  test('karin_deadline är ett intygande, inte en åtgärd', () => {
    // Samma semantik som lib/karin/handled-store.ts: "jag har sett den",
    // aldrig "den är inlämnad".
    expect(classify('karin_deadline')).toBe('ACKNOWLEDGEMENT')
  })

  test('de som skickade SMS via gissningen har nu riktiga hanterare', () => {
    const hanterade = hanteradeTyper()
    for (const t of ['scheduled_review_request', 'yearly_followup']) {
      expect(hanterade.has(t), `${t} skulle faila stängt och tappa ett fungerande flöde`).toBe(true)
    }
  })
})

test.describe('uppslaget', () => {
  test('okänd typ ger null, aldrig en gissning', () => {
    expect(classify('finns-inte')).toBeNull()
    expect(classify(null)).toBeNull()
    expect(classify('')).toBeNull()
    expect(mayExecute('finns-inte')).toBe(false)
  })

  test('svaret för ett icke-utförande kort säger att inget skickades', () => {
    for (const t of ['agent_insight', 'karin_deadline', 'missad_intakt']) {
      const r = nonExecutableResult(t)
      expect(r.executed).toBe(false)
      expect(r.note.length).toBeGreaterThan(10)
    }
  })

  test('texterna är på svenska och utan tekniska termer', () => {
    // CLAUDE.md: inga engelska termer eller ord som "payload" i UI.
    for (const t of Object.keys(ACTION_CONTRACT)) {
      const n = nonExecutableResult(t).note
      expect(n, `${t}: teknisk term i kundvänd text`).not.toMatch(/payload|webhook|token|agent run/i)
    }
  })
})
