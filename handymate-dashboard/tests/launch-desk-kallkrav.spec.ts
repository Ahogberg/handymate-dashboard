/**
 * Facit för källkravet vid prospektimport (2026-09-03).
 *
 * Tidigare krävdes bara företagsnamn. Två hål, båda verifierade före fixen:
 *
 *  1. En rad utan `source_checked_at` fällde HELA importen. Rutten byggde
 *     `new Date(new Date('').getTime() + 180 dagar).toISOString()`, vilket
 *     kastar RangeError: Invalid time value — utan att säga vilken rad eller
 *     vilket fält som saknades. Med en handbyggd CSV är det en irriterande
 *     kväll; med en automatiserad källa en tyst blockerare varje gång en
 *     källa byter kolumnnamn.
 *  2. `source_name: ''` uppfyller kolumnens NOT NULL — tom sträng är inte
 *     null. En rad helt utan källhänvisning kunde landa i basen och se
 *     komplett ut. Det är den efterlevnadsskuld fältet finns för att
 *     förhindra: hundra rader går att städa, tiotusen gör det inte.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { granskaLaunchCsv, parseLaunchCsv } from '../lib/launch-desk/csv'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

// Rubrikerna MÅSTE matcha HEADER_ALIASES i lib/launch-desk/csv.ts. Ett
// första utkast skrev "kontaktgrund" — som inte är ett alias — så
// contact_basis blev tomt och inkommande-fallet föll. Testets fel, inte
// kodens; men det visar varför rubriknamnen är värda att skriva av exakt.
const HUVUD = 'företag;bolagsform;källa;kontrolldatum;kontaktkälla'
const csv = (...rader: string[]) => [HUVUD, ...rader].join('\n')
const IGAR = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

test.describe('granskaLaunchCsv — källkravet', () => {
  test('en komplett rad går igenom', () => {
    const { giltiga, avvisade } = granskaLaunchCsv(csv(`Firman AB;AB;Bolagsverket;${IGAR};kallt`))
    expect(avvisade).toHaveLength(0)
    expect(giltiga).toHaveLength(1)
    expect(giltiga[0].company_name).toBe('Firman AB')
  })

  test('utan källa avvisas raden med skäl', () => {
    const { giltiga, avvisade } = granskaLaunchCsv(csv(`Firman AB;AB;;${IGAR};kallt`))
    expect(giltiga).toHaveLength(0)
    expect(avvisade[0].skal).toContain('Källa saknas')
    expect(avvisade[0].namn).toBe('Firman AB')
  })

  test('utan kontrolldatum avvisas raden — det var raden som kraschade importen', () => {
    const { giltiga, avvisade } = granskaLaunchCsv(csv('Firman AB;AB;Bolagsverket;;kallt'))
    expect(giltiga).toHaveLength(0)
    expect(avvisade[0].skal).toContain('Kontrolldatum saknas')
  })

  test('otolkbart kontrolldatum avvisas och citeras tillbaka', () => {
    const { avvisade } = granskaLaunchCsv(csv('Firman AB;AB;Bolagsverket;i förrgår;kallt'))
    expect(avvisade[0].skal).toContain('i förrgår')
  })

  test('kontrolldatum i framtiden är alltid ett skrivfel', () => {
    const framtid = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const { giltiga, avvisade } = granskaLaunchCsv(csv(`Firman AB;AB;Bolagsverket;${framtid};kallt`))
    expect(giltiga).toHaveLength(0)
    expect(avvisade[0].skal).toContain('framtiden')
  })

  test('okänd bolagsform stoppar KALL kontakt — enskild firma är en fysisk person', () => {
    const { giltiga, avvisade } = granskaLaunchCsv(csv(`Firman AB;;Bolagsverket;${IGAR};kallt`))
    expect(giltiga).toHaveLength(0)
    expect(avvisade[0].skal).toContain('Bolagsform okänd')
  })

  test('okänd bolagsform är OK vid inkommande förfrågan — då har de hört av sig själva', () => {
    const { giltiga } = granskaLaunchCsv(csv(`Firman AB;;Webbformulär;${IGAR};inkommande`))
    expect(giltiga).toHaveLength(1)
  })

  test('radnumret pekar på rätt rad i filen, rubrikraden inräknad', () => {
    const { avvisade } = granskaLaunchCsv(csv(
      `Ett AB;AB;Bolagsverket;${IGAR};kallt`,
      `Två AB;AB;;${IGAR};kallt`,
    ))
    expect(avvisade[0].rad).toBe(3)
    expect(avvisade[0].namn).toBe('Två AB')
  })

  test('en trasig rad stoppar inte de giltiga', () => {
    const { giltiga, avvisade } = granskaLaunchCsv(csv(
      `Ett AB;AB;Bolagsverket;${IGAR};kallt`,
      `Två AB;AB;;${IGAR};kallt`,
      `Tre AB;AB;Bolagsverket;${IGAR};kallt`,
    ))
    expect(giltiga).toHaveLength(2)
    expect(avvisade).toHaveLength(1)
  })

  test('parseLaunchCsv är kvar och släpper bara igenom giltiga rader', () => {
    const rader = parseLaunchCsv(csv(
      `Ett AB;AB;Bolagsverket;${IGAR};kallt`,
      'Två AB;AB;;;kallt',
    ))
    expect(rader).toHaveLength(1)
  })
})

test.describe('rutten är den riktiga gränsen, inte parsern', () => {
  const rutt = read('app/api/admin/launch/accounts/route.ts')

  test('rutten validerar källan själv — en handskriven POST går förbi parsern', () => {
    expect(rutt).toContain('kallaSaknas')
    expect(rutt).toContain('source_checked_at')
  })

  test('valideringen körs FÖRE retention_review_at räknas ut', () => {
    expect(rutt.indexOf('const kallfel = kallaSaknas(account)'))
      .toBeLessThan(rutt.indexOf('retention_review_at'))
  })

  test('avvisade rader rapporteras tillbaka, inte tyst bortkastade', () => {
    expect(rutt).toContain('ogiltiga')
    expect(rutt).toMatch(/duplicates, blocked, ogiltiga/)
  })
})

test.describe('Launch Desk visar skälen före importen', () => {
  const sida = read('app/admin/launch/page.tsx')

  test('filväljaren granskar i stället för att bara parsa', () => {
    expect(sida).toContain('granskaLaunchCsv(')
  })

  test('avvisade rader listas med radnummer och skäl', () => {
    expect(sida).toContain('avvisadeRader')
    expect(sida).toContain('tas inte med')
    expect(sida).toContain('rad.skal')
  })
})
