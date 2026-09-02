/**
 * Facit för ÄTA-dokumentet + fällorna runt livscykeln (2026-09-02,
 * sprinten "ÄTA + byggdagbok-granskning", Etapp A–C).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * Livscykeln (lib/ata/lifecycle.ts) var solid men DÖRRARNA runt den var
 * trasiga: send-routen satte `sent` utan att fråga matrisen och utan
 * business_id på UPDATE:n; signeringsvägen lät ett utkast signeras; SMS:ets
 * fallback-länk var ett JSON-svar; "Kopiera länk" i projektsidan byggde en
 * URL som inte fanns (/sign/ata/…); kunden såg rå engelsk status utan rader,
 * moms och ROT; tre olika definitioner av "avtalad ÄTA" i ekonomin; rader
 * nycklade `description` i stället för `name` blev namnlösa och räknades
 * till 0. Inget ÄTA-dokument (PDF) fanns.
 *
 *   npx playwright test tests/ata-dokumentet.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  ATA_STATUSES,
  ATA_TRANSITIONS,
  ATA_AVTALADE_STATUSAR,
  ATA_FAKTURERBARA_STATUSAR,
  arAvtaladAta,
  type AtaStatus,
} from '../lib/ata/lifecycle'
import { ATA_STATUS_LABELS, ATA_KUND_STATUS_LABELS, ataKundStatusLabel } from '../lib/ata/labels'
import { beraknaAtaSummor } from '../lib/ata/totals'
import { normaliseraAtaRader, harNamnlosRadMedPris } from '../lib/ata/items'

const ROOT = path.resolve(__dirname, '..')
const kod = (p: string) =>
  fs.readFileSync(path.join(ROOT, p), 'utf8')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')
const finns = (p: string) => fs.existsSync(path.join(ROOT, p))

// ─── Etapp B: dörrarna runt livscykeln ────────────────────────────────────

test.describe('send-routen respekterar livscykeln', () => {
  const s = () => kod('app/api/ata/[id]/send/route.ts')

  test('frågar canTransitionAta innan status sätts till sent', () => {
    expect(s()).toMatch(/canTransitionAta\(ata\.status,\s*'sent'\)/)
  })

  test('UPDATE:n är låst till företaget', () => {
    const src = s()
    const upd = src.indexOf(".update(")
    expect(upd, 'ingen UPDATE i send-routen').toBeGreaterThan(-1)
    const efter = src.slice(upd, upd + 600)
    expect(efter).toContain(".eq('business_id'")
  })

  test('JSON-fallbacken till /api/ata/sign/{token} är borta — utan kund blir det 400', () => {
    const src = s()
    expect(src).not.toContain('/api/ata/sign/${')
    expect(src).toContain('ÄTA:n saknar kund — koppla en kund till projektet först')
  })

  test('har en GET (förhandsvisning) och en POST, båda force-dynamic', () => {
    const src = s()
    expect(src).toContain("export const dynamic = 'force-dynamic'")
    expect(src).toMatch(/export async function GET\(/)
    expect(src).toMatch(/export async function POST\(/)
    expect(src).toContain('byggAtaSms')
  })
})

test.describe('signeringsvägen', () => {
  test('kunden kan bara signera/avböja det som faktiskt är skickat', () => {
    const src = kod('app/api/ata/sign/[token]/route.ts')
    // draft → signed var möjligt via länken innan hantverkaren skickat.
    expect(src).toMatch(/canTransitionAta\(ata\.status,\s*malStatus\)/)
    expect(src).toMatch(/malStatus\s*=\s*action\s*===\s*'decline'\s*\?\s*'declined'\s*:\s*'signed'/)
  })

  test('GET ger kunden vat_rate, rader och summor', () => {
    const src = kod('app/api/ata/sign/[token]/route.ts')
    expect(src).toContain('vat_rate')
    expect(src).toContain('beraknaAtaSummor')
  })
})

test('godkännande-exekveraren skriver name-fältet så raden inte blir namnlös', () => {
  expect(kod('app/api/approvals/[id]/route.ts')).toMatch(/name:\s*qi\.description/)
})

test.describe('changes-routen', () => {
  const s = () => kod('app/api/projects/[id]/changes/route.ts')

  test('skapar via skapaAta — samma väg som /api/ata', () => {
    expect(s()).toContain('skapaAta(')
  })

  test('felsträngar till hantverkaren är svenska', () => {
    // 'Unauthorized' (401) är API-konvention i hela kodbasen och når aldrig UI:t.
    const src = s()
    expect(src).not.toMatch(/error:\s*'(Invalid|Failed|Missing|Not found|Project not found|Change not found)/)
  })
})

// ─── Etapp A: en sanning för "avtalad" ───────────────────────────────────

test.describe('avtalad ÄTA räknas likadant överallt', () => {
  test('projekt-GET, ekonomiberäkningen använder arAvtaladAta', () => {
    expect(kod('app/api/projects/[id]/route.ts')).toContain('arAvtaladAta(')
    expect(kod('lib/projects/compute-economics.ts')).toContain('arAvtaladAta(')
  })

  test('slutfaktura + fakturautkast hämtar ATA_FAKTURERBARA_STATUSAR', () => {
    expect(kod('app/api/projects/[id]/create-final-invoice/route.ts')).toContain('ATA_FAKTURERBARA_STATUSAR')
    expect(kod('lib/invoices/project-invoice-draft.ts')).toContain('ATA_FAKTURERBARA_STATUSAR')
  })

  test('listorna är konsistenta med övergångsmatrisen', () => {
    const kanNa = (s: AtaStatus, mal: AtaStatus[], sett = new Set<AtaStatus>()): boolean => {
      if (mal.includes(s)) return true
      if (sett.has(s)) return false
      sett.add(s)
      return ATA_TRANSITIONS[s].some(n => kanNa(n, mal, sett))
    }
    // Från draft/pending/sent kan man OCKSÅ nå invoiced — men de är inte
    // avtalade än, eftersom kunden fortfarande kan säga nej någonstans på
    // vägen. Avtalad = kan nå invoiced OCH kan aldrig mer nå ett nej.
    const forvantade = ATA_STATUSES.filter(
      s => kanNa(s, ['invoiced']) && !kanNa(s, ['rejected', 'declined']),
    )
    expect([...ATA_AVTALADE_STATUSAR].sort()).toEqual([...forvantade].sort())

    // Fakturerbar = avtalad men inte redan fakturerad.
    expect([...ATA_FAKTURERBARA_STATUSAR].sort())
      .toEqual(ATA_AVTALADE_STATUSAR.filter(s => s !== 'invoiced').sort())

    expect(arAvtaladAta('signed')).toBe(true)
    expect(arAvtaladAta('sent')).toBe(false)
    expect(arAvtaladAta('rejected')).toBe(false)
  })
})

// ─── Etapp A: libs ────────────────────────────────────────────────────────

test('beraknaAtaSummor: 2 × 1000 ROT-berättigat, 25 % moms', () => {
  const s = beraknaAtaSummor(
    [{ name: 'Arbete', quantity: 2, unit: 'tim', unit_price: 1000, is_rot_eligible: true }],
    25,
    'addition',
  )
  expect(s.delsumma).toBe(2000)
  expect(s.moms).toBe(500)
  expect(s.totalt).toBe(2500)
  expect(s.rotTyp).toBe('rot')
  expect(s.rotAvdrag).toBe(750)
  expect(s.attBetala).toBe(1750)
})

test('beraknaAtaSumor: avdrag visas negativt men totalen i DB är positiv', () => {
  const s = beraknaAtaSummor([{ name: 'Mindre', quantity: 1, unit: 'st', unit_price: 500 }], 25, 'removal')
  expect(s.totalt).toBeLessThan(0)
})

test('etiketterna täcker varje status i ATA_STATUSES — både hantverkare och kund', () => {
  for (const st of ATA_STATUSES) {
    expect(ATA_STATUS_LABELS[st], `saknar etikett för ${st}`).toBeTruthy()
    expect(ATA_KUND_STATUS_LABELS[st], `saknar kundetikett för ${st}`).toBeTruthy()
    expect(ATA_STATUS_LABELS[st]).not.toMatch(/^[a-z]+$/) // inte rå engelsk status
  }
  expect(ataKundStatusLabel('sent')).toBe('Att signera')
})

test('rader nycklade description blir namngivna, namnlös rad med pris fångas', () => {
  const rader = normaliseraAtaRader([{ description: 'Extra eluttag', quantity: 2, unit_price: 800 }])
  expect(rader[0].name).toBe('Extra eluttag')
  expect(harNamnlosRadMedPris([{ name: '', quantity: 1, unit: 'st', unit_price: 100 }])).toBe(true)
  expect(harNamnlosRadMedPris([{ name: 'X', quantity: 1, unit: 'st', unit_price: 100 }])).toBe(false)
})

test('migrationen v195 fryser momsen på ÄTA:n och kopplar dokument till ÄTA', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'sql/v195_ata_dokumentet.sql'), 'utf8')
  expect(sql).toContain('vat_rate')
  expect(sql).toMatch(/project_document[\s\S]*change_id/)
})

// ─── Etapp C: dokumentet + ytorna ────────────────────────────────────────

test.describe('ÄTA-dokumentet (PDF)', () => {
  test('hantverkarens rutt kräver see_financials och är låst till företaget', () => {
    expect(finns('app/api/ata/[id]/pdf/route.ts')).toBe(true)
    const src = kod('app/api/ata/[id]/pdf/route.ts')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
    expect(src).toContain("hasPermission(currentUser, 'see_financials')")
    expect(src).toContain(".eq('business_id'")
    expect(src).toContain('generateAtaPDF')
  })

  test('kundens rutt vägrar utkast', () => {
    expect(finns('app/api/ata/sign/[token]/pdf/route.ts')).toBe(true)
    const src = kod('app/api/ata/sign/[token]/pdf/route.ts')
    expect(src).toMatch(/status === 'draft'/)
    expect(src).toMatch(/status === 'pending'/)
    expect(src).toContain('generateAtaPDF')
  })
})

test.describe('portalen', () => {
  test('API:t ger kunden summor + svensk etikett', () => {
    const src = kod('app/api/portal/[token]/projects/route.ts')
    expect(src).toContain('beraknaAtaSummor')
    expect(src).toContain('ataKundStatusLabel')
    // driftlaget.spec.ts:127-130 — sign_token bara för skickade
    expect(src).toContain("sign_token: a.status === 'sent' ? a.sign_token : null")
  })

  test('kundvyn visar rader, moms, ROT-avdrag och PDF-länk', () => {
    const src = kod('app/portal/[token]/components/PortalProjectDetail.tsx')
    expect(src).toContain('ataKundStatusLabel')
    expect(src).toContain('rotAvdrag')
    expect(src).toContain('pdf_url')
  })
})

test.describe('projektsidan', () => {
  const s = () => kod('app/dashboard/projects/[id]/page.tsx')

  test('den döda länken /sign/ata/ och "kommer snart" är borta', () => {
    const src = s()
    expect(src).not.toContain('/sign/ata/')
    expect(src).not.toContain('kommer snart')
  })

  test('skickar via SendAtaDialog (bekräftelse med mottagare + text)', () => {
    const src = s()
    expect(src).toContain('SendAtaDialog')
    expect(src).toContain('<AtaCard')
    expect(src).toContain('<ChangeModal')
    expect(src).toContain('invoice-preview')
  })

  test('ChangeModal fångar namnlösa rader och läser gamla description-rader', () => {
    const src = kod('components/projects/ata/ChangeModal.tsx')
    expect(src).toMatch(/item\.name\s*\|\|\s*item\.description/)
    expect(src).toContain('saknar namn')
    expect(src).toContain('Skapa & skicka')
  })

  test('AtaCard visar åtgärder utan expandering och ÄTA-dokumentet', () => {
    const src = kod('components/projects/ata/AtaCard.tsx')
    expect(src).toContain('/api/ata/${')
    expect(src).toContain('/pdf')
    expect(src).toContain('ataRadNamn')
    expect(src).toContain('change_id')
  })

  test('ekonomikortets "Ny ÄTA" är kopplad', () => {
    expect(kod('components/projects/ProjectEconomicsCard.tsx')).toContain('onNewAta={onNewAta}')
    expect(s()).toContain('onNewAta=')
  })
})
