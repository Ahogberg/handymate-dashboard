/**
 * Facit: F22 ur Codex ÄTA-prov 2026-09-06 (docs/audit/ata-closeout-2026-09-06.md).
 *
 * "Kopiera signeringslänken i stället" var en ren urklippsåtgärd: ÄTA:n
 * förblev utkast, kundportalen (listar bara sent/signed/approved/invoiced)
 * visade ingen ÄTA och pdf_url var låst — fast kunden hade länken. Att
 * kopiera länken är ett utskick där hantverkaren själv levererar: ÄTA:n
 * markeras som skickad, utan SMS, med samma händelse som SMS-vägen.
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.join(__dirname, '..')
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')
const utanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('routen: method=link markerar sent utan SMS och utan telefonnummer', () => {
  const src = utanKommentarer(read('app/api/ata/[id]/send/route.ts'))
  const start = src.indexOf("if (method === 'link') {")
  expect(start).toBeGreaterThan(-1)
  const gren = src.slice(start, src.indexOf('const rawPhone = to || customer.phone_number', start))
  expect(gren).toContain(".update({ status: 'sent', sent_at: sentAt })")
  expect(gren).toContain(".eq('business_id', business.business_id)")
  expect(gren).toContain("'ata_sent'")
  expect(gren).toContain("via: 'link'")
  expect(gren).not.toContain('sendSmsViaElks')
  expect(gren).not.toContain('sent_to_phone')
  // Grenen ligger FÖRE telefonkravet — ingen 400 "Inget telefonnummer" för länkvägen
  expect(start).toBeLessThan(src.indexOf("'Inget telefonnummer att skicka till'"))
})

test('dialogen: urklipp först, sedan POST {method: link}, kvitto per väg', () => {
  const src = utanKommentarer(read('components/projects/ata/SendAtaDialog.tsx'))
  const fn = src.slice(src.indexOf('const kopieraLank'), src.indexOf('return (', src.indexOf('const kopieraLank')))
  expect(fn.indexOf('navigator.clipboard.writeText')).toBeLessThan(fn.indexOf("JSON.stringify({ method: 'link' })"))
  expect(fn).toContain("onSent('link')")
  expect(fn).toContain('Länken är kopierad, men ÄTA:n är kvar som utkast.')
  expect(src).toContain("onSent('sms')")
  expect(src).toContain('markeras ÄTA:n som skickad och blir synlig i kundportalen')
  const sida = utanKommentarer(read('app/dashboard/projects/[id]/page.tsx'))
  expect(sida).toContain("via === 'link' ? 'Länk kopierad. ÄTA:n är markerad som skickad.'")
})

test('portalen listar fortfarande bara sent och senare — därför måste länkvägen sätta sent', () => {
  const src = utanKommentarer(read('app/api/portal/[token]/projects/route.ts'))
  expect(src).toContain(".in('status', ['sent', 'signed', 'approved', 'invoiced'])")
})
