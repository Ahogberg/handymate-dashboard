/**
 * Facit: leverantörsfel når hantverkaren på svenska — aldrig 46elks råtext
 * (2026-08-27). Bevisat i prod: "SMS:et stoppades (Not enough credits on
 * your account to send this SMS)" i hemmets kvitto. Andreas: "Absolut inte
 * engelska felmeddelanden."
 *
 *   npx playwright test tests/facit-sms-klarsprak.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { klassaElksFel, elksFelKlarsprak, ELKS_FEL_VAR_SAK } from '../lib/sms/klarsprak'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

test('klassningen känner igen de fel vi faktiskt sett', () => {
  expect(klassaElksFel('Not enough credits on your account to send this SMS', 403)).toBe('saldo')
  expect(klassaElksFel('Invalid to number', 400)).toBe('nummer')
  expect(klassaElksFel('Unauthorized', 401)).toBe('auth')
  expect(klassaElksFel('credentials', 401)).toBe('auth')
  expect(klassaElksFel('fetch exception', null)).toBe('natverk')
  expect(klassaElksFel('Internal error', 503)).toBe('natverk')
  expect(klassaElksFel('something odd', 400)).toBe('okant')
})

test('varje klass ger en svensk mening — ingen engelska, inget om VÅRT konto eller krediter', () => {
  for (const raw of ['Not enough credits on your account to send this SMS', 'Invalid to number', 'Unauthorized', 'fetch exception', 'x']) {
    const text = elksFelKlarsprak(raw, 400)
    expect(text).toMatch(/[åäö]/)
    expect(text).not.toMatch(/credit|account|invalid|unauthori|not enough|error/i)
    expect(text.length).toBeGreaterThan(20)
  }
  // Saldo är vår sak — texten pekar inte hantverkaren mot något hen inte kan lösa
  expect(elksFelKlarsprak('Not enough credits', 403)).toContain('Handymate har larmats')
  expect(ELKS_FEL_VAR_SAK).toEqual(['saldo', 'auth'])
})

test('strypunkten returnerar klarspråk, loggar råtexten, larmar oss vid saldo/auth', () => {
  const s = kod('lib/sms-send.ts')
  expect(s).toContain("import { elksFelKlarsprak, klassaElksFel, ELKS_FEL_VAR_SAK } from './sms/klarsprak'")
  expect(s).toContain('felTillHantverkaren = elksFelKlarsprak(errorMsg, status)')
  expect(s).toContain('error: success ? undefined : (felTillHantverkaren ?? errorMsg),')
  // Råtexten går fortfarande till sms_log
  expect(s).toContain('error_message: errorMsg || null,')
  // Driftlarm bara för klasser som är vår sak
  expect(s).toContain('if (ELKS_FEL_VAR_SAK.includes(klass)) {')
  expect(s).toContain("await rapporteraTystFel(supabase, businessId, `sms:leverantorsfel-${klass}`, errorMsg || `HTTP ${status}`, { status, to: phone })")
  // fetch-undantag och saknade uppgifter översätts också
  expect(s).toContain("felTillHantverkaren = elksFelKlarsprak('credentials', 401)")
  expect(s).toContain('felTillHantverkaren = elksFelKlarsprak(errorMsg, null)')
})

test('hemmets kvitto-banner dubblerar inte punkten', () => {
  const s = kod('components/jarvis/JarvisHome.tsx')
  expect(s).toContain("const orsak = orsakRaw.replace(/[.\\s]+$/, '')")
})

test('påminnelseleveransen skickar den svenska meningen vidare som den är — ingen "SMS:et stoppades (råtext)"-inpackning', () => {
  const s = kod('lib/invoice-reminder-send.ts')
  expect(s).not.toContain('SMS:et stoppades (')
  // Backslashen måste överleva: "[.\\s]" i JS-strängen = [.\s] i koden. En
  // sed-körning åt upp den en gång (2026-08-27) och facitet matchade felet.
  expect(s).toContain("? smsFel.replace(/[.\\s]+$/, '')")
  expect(s).not.toContain('[.s]+$')
})
