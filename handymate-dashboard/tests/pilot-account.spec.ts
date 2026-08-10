/**
 * Kontoskapandets två vägar bär samma rättigheter (2026-08-10).
 *
 * Fyndet bakom provet: /api/admin/create-pilot skapade bara business_config —
 * aldrig någon business_users-rad. Men getCurrentUser (lib/permissions.ts)
 * läser ENBART business_users, så en admin-skapad pilot såg ut att fungera
 * (login, dashboard) och fick sedan 403 på exakt allt som räknas: skicka
 * offert, skicka faktura, godkänna kort. Den värsta sortens fel — osynligt
 * tills piloten står mitt i gyllene vägen.
 *
 * Samma dag: serverhalvan av fSkatt-fixen. Klienten skickar fSkatt sedan
 * 2026-08-07, men registreringsrutten läste aldrig fältet — varje kunds
 * f_skatt_registered blev false oavsett svar, medan fakturor, ROT-underlag
 * och Karins bolagskalender läser den som sanning.
 *
 * Källskanning (fs), ingen DB — pinnarna bevakar att båda halvorna står kvar.
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.join(__dirname, '..')
const las = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8')

test.describe('pilotkontot får samma rättigheter som ett registrerat konto', () => {
  const pilot = () => las('app/api/admin/create-pilot/route.ts')

  test('create-pilot skapar owner-raden i business_users', () => {
    const src = pilot()
    expect(src).toContain(".from('business_users')")
    expect(src, 'piloten måste vara owner — annars 403 på pengavägarna').toContain("role: 'owner'")
    expect(src).toContain('can_create_invoices: true')
    expect(src).toContain('can_see_financials: true')
    expect(src).toContain('accepted_at')
  })

  test('misslyckad owner-rad rullar tillbaka hela kontot — ingen limbo-pilot', () => {
    const src = pilot()
    const efterInsert = src.slice(src.indexOf("businessUserError"))
    expect(efterInsert, 'business_config måste städas bort').toContain(".from('business_config').delete()")
    expect(efterInsert, 'auth-usern måste städas bort').toContain('deleteUser(authData.user.id)')
  })
})

test.describe('registreringsrutten tappar inte svaren från steg 1', () => {
  const auth = () => las('app/api/auth/route.ts')

  test('fSkatt läses och persisteras — men aldrig som gissning', () => {
    const src = auth()
    expect(src, 'fSkatt måste destruktureras ur registreringsdatan').toMatch(/const \{[^}]*fSkatt[^}]*\} = data/)
    expect(src, 'persisteras bara när svaret är en boolean').toContain("typeof fSkatt === 'boolean' ? { f_skatt_registered: fSkatt } : {}")
  })

  test('secondary_branches följer med — filtrerat mot primärbranschen', () => {
    const src = auth()
    expect(src).toContain('secondary_branches = cleanSecondary')
    expect(src, 'DB-constrainten: primärbranschen får inte ingå').toContain("s !== branch")
  })

  test('saknad migrationskolumn stryks och inserten görs om — registreringen dör inte', () => {
    const src = auth()
    expect(src).toContain('VANTANDE_MIGRATIONSKOLUMNER')
    expect(src, 'v93-kolumnen måste stå i skyddslistan tills migrationen är körd').toContain("'secondary_branches'")
    expect(src).toContain('delete businessInsert[kolumn]')
  })
})
