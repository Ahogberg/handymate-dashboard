/**
 * Facit för fakturakällornas markering (2026-08-09, projektauditen P0-4).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * Sex rutter markerade tidrapporter, material och ÄTA som fakturerade i
 * separata anrop som kunde lyckas/misslyckas oberoende — ofta utan
 * felkontroll och ibland utan tenantfilter. Halvläget är den farligaste
 * dataklassen: en omärkt ÄTA dubbeldebiteras; en märkt rad utan faktura
 * faktureras aldrig.
 *
 * Nu: EN väg (lib/invoices/mark-sources.ts) — transaktionell RPC (sql/v104)
 * när den finns, ärlig fallback annars. Det här facitet är SPÄRRHAKEN:
 * listan över direktmarkerare får bara krympa.
 *
 *   npx playwright test tests/fakturakallorna.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const kod = (p: string) =>
  read(p)
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

const VAGEN = 'lib/invoices/mark-sources.ts'

/**
 * Filer som får sätta invoiced/invoiced_at direkt. Får BARA krympa.
 */
const TILLATNA_DIREKTMARKERARE: Record<string, string> = {
  [VAGEN]: 'den delade vägen själv (fallbacken när v104 inte är körd)',
  'lib/demo/seed-demo-account.ts': 'demokontots manus seedar färdiga lägen',
  'app/api/invoices/[id]/credit/route.ts': 'kreditering ÅTERSTÄLLER markeringar — motsatt riktning',
  'app/api/time-entry/bulk/route.ts':
    'manuell "fakturerad utanför systemet" — en attestering utan faktura att allokera mot',
}

test('ingen ny direktmarkerare av fakturakällor', () => {
  const träffar: string[] = []
  const mönster = /\.update\((?:(?!\)\s*$)[\s\S]){0,200}?invoiced(_at)?:/
  const gå = (dir: string) => {
    let poster
    try { poster = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }) } catch { return }
    for (const f of poster) {
      const rel = `${dir}/${f.name}`
      if (f.isDirectory()) {
        if (f.name === 'node_modules' || f.name === '.next') continue
        gå(rel)
        continue
      }
      if (!/\.tsx?$/.test(f.name)) continue
      const s = kod(rel)
      // Markeringen: en update som sätter invoiced/invoiced_at till sant/nu.
      if (/update\(\{[^}]*invoiced: true/.test(s) || /update\(\{[^}]*status: 'invoiced'/.test(s)) {
        träffar.push(rel)
      }
    }
  }
  for (const rot of ['app', 'lib']) gå(rot)
  const okända = träffar.filter(f => !(f in TILLATNA_DIREKTMARKERARE))
  expect(
    okända,
    `nya direktmarkerare — gå via markInvoiceSources: ${okända.join(', ')}`
  ).toEqual([])
})

test.describe('den delade vägen', () => {
  test('RPC:n är primärvägen; fallbacken är aldrig tyst', () => {
    const s = kod(VAGEN)
    const rpc = s.indexOf("rpc('mark_invoice_sources'")
    const fallback = s.indexOf('icke-atomisk')
    expect(rpc, 'RPC:n anropas inte').toBeGreaterThan(-1)
    expect(fallback, 'fallbacken varnar inte').toBeGreaterThan(rpc)
    expect(s).toContain('HALVLÄGE MÖJLIGT')
  })

  test('en källa kan aldrig stjälas från en annan faktura', () => {
    // Både RPC:n och fallbacken villkorar på "ingen faktura, eller samma".
    const sql = read('sql/v104_fakturakallor_atomiskt.sql')
    expect(sql).toContain('invoice_id IS NULL OR invoice_id = p_invoice_id')
    const s = kod(VAGEN)
    expect(s).toContain('invoice_id.is.null,invoice_id.eq.')
  })

  test('ÄTA får bara bli fakturerad från lagliga statusar — samma som livscykeln', () => {
    const sql = read('sql/v104_fakturakallor_atomiskt.sql')
    expect(sql).toContain("status IN ('approved', 'signed')")
    // Korsläs mot matrisen: exakt de statusar som får gå till invoiced.
    const { ATA_TRANSITIONS } = require('../lib/ata/lifecycle')
    const lagliga = (Object.keys(ATA_TRANSITIONS) as string[])
      .filter(fran => (ATA_TRANSITIONS[fran] as readonly string[]).includes('invoiced'))
      .sort()
    expect(lagliga).toEqual(['approved', 'signed'])
  })

  test('RPC:n är serverns — klienter får inte exekvera den', () => {
    const sql = read('sql/v104_fakturakallor_atomiskt.sql')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.mark_invoice_sources')
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.mark_invoice_sources[^;]*TO service_role/)
  })
})

test.describe('alla sex ställena går genom vägen', () => {
  const STALLEN = [
    'app/api/invoices/from-project/route.ts',
    'app/api/invoices/from-time-entries/route.ts',
    'app/api/invoices/route.ts',
    'app/api/invoices/auto-generate/route.ts',
    'app/api/projects/[id]/create-final-invoice/route.ts',
    'lib/projects/auto-invoice-on-complete.ts',
  ]
  for (const fil of STALLEN) {
    test(`${fil} använder markInvoiceSources`, () => {
      expect(kod(fil)).toContain('markInvoiceSources(')
    })
  }
})
