import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { bedomNummer } from '../lib/phone/bedom-nummer'

// Facit för nummerverifieringen.
//
// 2026-09-09: 46elks återkallade sex av åtta nummer när saldot tog slut, och
// produkten fortsatte påstå att telefonen var kopplad. Ingenting kontrollerade
// någonsin om ett köpt nummer var kvar. Två konton hade dessutom ett påhittat
// nummer som aldrig existerat, och det nummer som allokerades för hand samma
// kväll saknade voice_start — 46elks svarade badsource och kunden hörde
// tystnad.
//
// Fallen nedan är just de utfall vi faktiskt såg.

const RAD = { assigned_phone_number: '+46766867759' }
const VAG = '/api/voice/incoming'
const OK_KROPP = { active: 'yes', number: '+46766867759', voice_start: 'https://app.handymate.se/api/voice/incoming?k=x' }

test('återkallat nummer nollställs', () => {
  // Nordström El: numret var köpt, 46elks tog det tillbaka.
  expect(bedomNummer(RAD, { status: 404, kropp: null }, VAG).utfall).toBe('nollstallt')
  expect(bedomNummer(RAD, { status: 200, kropp: { ...OK_KROPP, active: 'no' } }, VAG).utfall).toBe('nollstallt')
})

test('nummer som inte är vårt nollställs', () => {
  const dom = bedomNummer(RAD, { status: 200, kropp: { ...OK_KROPP, number: '+46700000001' } }, VAG)
  expect(dom.utfall).toBe('nollstallt')
  expect(dom.detalj).toContain('+46700000001')
})

test('tillfälligt fel nollställer ALDRIG — en störning får inte koppla bort telefonen', () => {
  for (const status of [0, 429, 500, 502, 503]) {
    const dom = bedomNummer(RAD, { status, kropp: null }, VAG)
    expect(dom.utfall, `status ${status} får inte nollställa`).toBe('kontroll_misslyckades')
  }
})

test('nummer utan voice_start larmar men nollställs inte', () => {
  // Det manuellt allokerade numret 2026-09-09: fanns hos 46elks, ringde ingen.
  // Att nollställa hade dolt att numret finns och kostar pengar.
  expect(bedomNummer(RAD, { status: 200, kropp: { active: 'yes', number: RAD.assigned_phone_number } }, VAG).utfall)
    .toBe('webhook_fel')
  const fel = bedomNummer(RAD, { status: 200, kropp: { ...OK_KROPP, voice_start: 'https://example.invalid/annat' } }, VAG)
  expect(fel.utfall).toBe('webhook_fel')
  expect(fel.detalj).toContain('example.invalid')
})

test('ett friskt nummer ger ok', () => {
  expect(bedomNummer(RAD, { status: 200, kropp: OK_KROPP }, VAG).utfall).toBe('ok')
})

test('bara utfallet nollstallt rör databasen', () => {
  const src = readFileSync(join(__dirname, '../app/api/cron/phone-number-verify/route.ts'), 'utf8')
  // Nollställningen ska sitta i EN gren, och den grenen ska vara nollstallt.
  const nollstallningar = src.match(/assigned_phone_number: null/g) || []
  expect(nollstallningar.length, 'fler än en nollställning — vilken gren gäller?').toBe(1)
  const gren = src.slice(src.indexOf("if (dom.utfall === 'nollstallt')"), src.indexOf("else if (dom.utfall === 'webhook_fel')"))
  expect(gren, 'nollställningen ligger utanför nollstallt-grenen').toContain('assigned_phone_number: null')
})

test('varje avvikelse larmar', () => {
  const src = readFileSync(join(__dirname, '../app/api/cron/phone-number-verify/route.ts'), 'utf8')
  for (const kalla of ['nummer_aterkallat', 'nummer_webhook_fel', 'nummer_kan_ej_verifieras']) {
    expect(src, `${kalla} larmar inte — tystnaden var hela problemet`).toContain(kalla)
  }
})
