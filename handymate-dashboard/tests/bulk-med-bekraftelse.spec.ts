import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { bulkEffekt, bulkRubrik, delaUrval, farSammanfattas, BULK_KLASSER } from '../lib/approvals/bulk'
import { ACTION_CONTRACT, classify } from '../lib/approvals/action-contract'
import type { ApprovalReview } from '../lib/approvals/review-contract'

// Facit för bulk med bekräftelse (Andreas 2026-09-18, efter Mercury-läsningen:
// "många rader i ett svep och ett godkännande").
//
// VARFÖR DET HÄR FACITET ÄR STRIKT. Bulk är precis det verktyg som gör det
// lätt att godkänna något man inte läst. Kön hos Bee Service hade 24 kort,
// äldsta från 31 augusti — behovet är verkligt, men priset för en slarvig
// gruppväg är ett SMS till en kund som ingen ville skicka.
//
// Fem påståenden hålls:
//  1. bulk tillåts EXAKT där servern inte kräver granskning — samma
//     klassificering huset redan har, ingen ny klass och ingen ny behörighet,
//  2. ett kort som utför något eller kräver granskning nekas, med skäl,
//  3. en granskning med meddelande, bilaga eller delbeslut får aldrig
//     sammanfattas i en samlad bekräftelse,
//  4. varje kort skickas som SITT EGET beslut genom husets vanliga väg,
//     med sin egen granskningsnyckel,
//  5. planen ändrar ingenting, och det som inte rörs redovisas med skäl.

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const kort = (id: string, approval_type: string, title?: string) => ({ id, approval_type, title })

test.describe('Bulk tillåts exakt där servern inte kräver granskning', () => {
  test('klasserna är husets egna, inte en ny lista', () => {
    expect([...BULK_KLASSER].sort()).toEqual(['ACKNOWLEDGEMENT', 'INFORMATIONAL'])
    // Samma två som review-guard släpper utan granskning. Ändras den raden
    // måste den här listan följa med — därför står påståendet här.
    const guard = read('lib/approvals/review-guard.ts')
    expect(guard).toContain("klass === 'INFORMATIONAL' || klass === 'ACKNOWLEDGEMENT'")
  })

  test('informationella och intygande kort får gå i grupp', () => {
    const ut = delaUrval([
      kort('1', 'karin_deadline', 'Deadline'),
      kort('2', 'monthly_review', 'Månadsrapport'),
      kort('3', 'agent_insight'),
    ], 'approve')
    expect(ut.tillatna.map(k => k.id)).toEqual(['1', '2', '3'])
    expect(ut.nekade).toEqual([])
  })

  test('kort som utför något, kräver granskning eller är okända nekas med skäl', () => {
    const ut = delaUrval([
      kort('1', 'send_sms', 'SMS till kund'),
      kort('2', 'missad_intakt', 'Fakturaunderlag'),
      kort('3', 'nagot_helt_nytt', 'Okänt'),
      kort('4', 'karin_deadline', 'Deadline'),
    ], 'approve')
    expect(ut.tillatna.map(k => k.id)).toEqual(['4'])
    expect(ut.nekade.map(n => n.id)).toEqual(['1', '2', '3'])
    // Skälen ska gå att läsa för en hantverkare, inte vara en klass-sträng.
    expect(ut.nekade[0].skal).toContain('utför något på riktigt')
    expect(ut.nekade[1].skal).toContain('granskas för sig')
    expect(ut.nekade[2].skal).toContain('vet vad den gör')
    for (const n of ut.nekade) {
      expect(n.skal).not.toMatch(/EXECUTABLE|REVIEW_REQUIRED|INFORMATIONAL/)
      expect(n.titel, 'nekat kort utan titel går inte att känna igen').toBeTruthy()
    }
  })

  test('avvisa i grupp har samma snäva urval som godkänn', () => {
    const rader = [kort('1', 'send_sms'), kort('2', 'karin_deadline')]
    expect(delaUrval(rader, 'reject').tillatna.map(k => k.id)).toEqual(['2'])
  })

  test('skjuta upp är inget beslut och gäller varje väntande kort', () => {
    // Granskningsvakten hoppar över snooze helt, och rutten ändrar ingen
    // status — därför är den vida grinden här korrekt och inte slarv.
    expect(read('lib/approvals/review-guard.ts')).toContain("if (body.action === 'snooze') return null")
    const rader = [kort('1', 'send_sms'), kort('2', 'missad_intakt'), kort('3', 'karin_deadline')]
    const ut = delaUrval(rader, 'snooze')
    expect(ut.tillatna).toHaveLength(3)
    expect(ut.nekade).toEqual([])
  })

  test('varje korttyp i huset får ett svar — ingen faller mellan stolarna', () => {
    for (const typ of Object.keys(ACTION_CONTRACT)) {
      const ut = delaUrval([kort('x', typ)], 'approve')
      const klass = classify(typ)
      const forvantat = klass && BULK_KLASSER.includes(klass)
      expect(ut.tillatna.length === 1, `${typ} (${klass}) hamnade fel`).toBe(Boolean(forvantat))
      if (!forvantat) expect(ut.nekade[0].skal, `${typ} nekas utan skäl`).toBeTruthy()
    }
  })
})

test.describe('En granskning som kräver egen handling får inte sammanfattas', () => {
  const bas: ApprovalReview = { title: 'T', effect: 'E', confirmLabel: 'Bekräfta', messages: [] }

  test('ren intern granskning får sammanfattas', () => {
    expect(farSammanfattas(bas)).toBe(true)
  })

  test('meddelande till kund får aldrig sammanfattas', () => {
    expect(farSammanfattas({ ...bas, messages: [{ channel: 'SMS', recipients: ['+46701740001'], text: 'Hej' }] })).toBe(false)
  })

  test('bilaga som ska bockas får aldrig sammanfattas', () => {
    expect(farSammanfattas({ ...bas, attachments: [{ label: 'Bild', url: '/x', kind: 'image' }] })).toBe(false)
  })

  test('delbeslut får aldrig sammanfattas', () => {
    expect(farSammanfattas({ ...bas, choices: [{ id: 'a', label: 'A', description: 'd', defaultSelected: true }] })).toBe(false)
  })

  test('en blockerad granskning utan bekräftelseknapp får aldrig sammanfattas', () => {
    expect(farSammanfattas({ ...bas, confirmLabel: null, blockedReason: 'saknar underlag' })).toBe(false)
    expect(farSammanfattas(null)).toBe(false)
    expect(farSammanfattas(undefined)).toBe(false)
  })
})

test.describe('Grinden rundas inte', () => {
  const klient = read('lib/approvals/bulk-client.ts')

  test('varje kort skickas som sitt eget beslut genom husets väg', () => {
    // postKortbeslut är samma funktion ett klick på ett kort använder, så
    // massutskicksgrinden och behörighetskontrollen gäller varje rad.
    expect(klient).toContain("import { postKortbeslut } from './klient-bekraftelse'")
    expect(klient).toContain('await postKortbeslut(kort.id,')
    // Ingen egen batch-rutt som skulle ha sina egna grindar att glömma.
    expect(klient).not.toMatch(/\/api\/approvals\/bulk/)
    expect(klient).not.toMatch(/method: 'POST'[\s\S]{0,200}action: '(approve|reject)'/)
  })

  test('granskningsnyckeln följer med per kort — aldrig en delad', () => {
    expect(klient).toContain('review_token: kort.token')
    // En nyckel som sparas utanför kortet vore en nyckel som kan råka
    // återanvändas på ett annat kort.
    expect(klient).not.toMatch(/const\s+(delad|gemensam)Token/)
  })

  test('förhandsvisningen ändrar ingenting', () => {
    const fn = klient.slice(klient.indexOf('async function forhandsvisa'), klient.indexOf('function arNekat'))
    expect(fn).toContain("action: 'preview'")
    expect(fn).toContain('decision_action: handling')
    // Inget beslut i steg ett.
    expect(fn).not.toContain('postKortbeslut')
  })

  test('ett kort som kräver egen granskning hoppas över, aldrig bekräftas åt användaren', () => {
    const fn = klient.slice(klient.indexOf('async function forhandsvisa'), klient.indexOf('function arNekat'))
    expect(fn).toContain('farSammanfattas(review)')
    expect(fn).toMatch(/if \(!farSammanfattas\(review\)\)[\s\S]{0,200}skal/)
  })

  test('utförandet är seriellt — ingen kapplöpning mot samma projekt', () => {
    const fn = klient.slice(klient.indexOf('export async function bulkKor'))
    expect(fn).toContain('for (let i = 0;')
    expect(fn).not.toMatch(/Promise\.all/)
  })
})

test.describe('Ytan visar vad som händer och vad som inte händer', () => {
  const src = read('components/approvals/BulkBar.tsx')

  test('bekräftelsen listar varje kort som kommer att röras', () => {
    const block = src.slice(src.indexOf('{plan.klara.length > 0 && ('), src.indexOf('{plan.nekade.length > 0 && ('))
    expect(block).toContain('{k.titel}')
    expect(block).toContain('{k.effekt}')
  })

  test('och varje kort som INTE kommer att röras, med skäl', () => {
    const block = src.slice(src.indexOf('{plan.nekade.length > 0 && ('))
    expect(block).toContain('rörs inte')
    expect(block).toContain('{n.skal}')
    expect(block).toContain('{n.titel}')
  })

  test('antalet grupperbara sägs rakt ut, så ingen tror att kön töms', () => {
    expect(src).toContain('antalGrupperbara')
    expect(src).toMatch(/kan godkännas i grupp/)
    expect(src).toContain("delaUrval(approvals, 'approve')")
  })

  test('planen visas före utförandet — aldrig en knapp som kör direkt', () => {
    // Knapparna förbereder; bara "Bekräfta" utför.
    expect(src).toContain('void forbered(h.key)')
    const utforKnapp = src.slice(src.indexOf('void utfor()'), src.indexOf('</button>', src.indexOf('void utfor()')))
    expect(utforKnapp).toMatch(/Bekräfta \$\{plan\.klara\.length\} kort/)
    // Och listan med kort göms medan planen visas, så man inte ändrar
    // urvalet under bekräftelsen.
    expect(src).toContain('{oppen && !plan && (')
  })

  test('knapparna är mobilvänliga och kön uppdateras efteråt', () => {
    expect((src.match(/min-h-\[44px\]/g) || []).length).toBeGreaterThanOrEqual(4)
    expect(src).toContain('onDone()')
  })

  test('monterad bara i den väntande kön', () => {
    const sida = read('app/dashboard/approvals/page.tsx')
    expect(sida).toContain("activeTab === 'pending' && (")
    expect(sida).toContain('<BulkBar approvals={approvals} onDone={() => void fetchApprovals()} />')
  })
})

test.describe('Texterna är svenska och ärliga', () => {
  test('rubriken räknar korten', () => {
    expect(bulkRubrik('approve', 3)).toBe('Godkänn 3 kort?')
    expect(bulkRubrik('reject', 1)).toBe('Avvisa 1 kort?')
    expect(bulkRubrik('snooze', 7)).toBe('Skjut upp 7 kort?')
  })

  test('effekten lovar aldrig något som inte händer', () => {
    // Inget av de tre alternativen skickar något till en kund — och det
    // sägs, eftersom det är den enda frågan en hantverkare har.
    expect(bulkEffekt('approve', 3)).toContain('Ingenting skickas till någon kund')
    expect(bulkEffekt('reject', 3)).toContain('Ingenting skickas till någon kund')
    expect(bulkEffekt('snooze', 3)).toContain('Inget beslut tas')
    expect(bulkEffekt('snooze', 3)).not.toMatch(/godkän|avvisa/i)
  })
})
