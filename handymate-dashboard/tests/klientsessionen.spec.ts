/**
 * Facit för webbläsarens Supabase-session (2026-08-09).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * Inloggningen sker helt på servern: /login postar till /api/auth, som kör
 * signInWithPassword på en createRouteHandlerClient. Sessionen hamnar därmed i
 * cookies.
 *
 * lib/supabase.ts byggde webbläsarklienten med rå createClient från supabase-js,
 * som lagrar sessionen i localStorage. Den fylldes aldrig. Varje läsning en
 * React-komponent gjorde gick alltså som rollen `anon` — aldrig som den
 * inloggade användaren.
 *
 * Det märktes inte så länge tabellerna hade en villkorslöst öppen policy. v96
 * stängde dörren: REVOKE ALL ... FROM anon på sex tabeller, med policyer bara
 * för `authenticated` och `service_role`. Från den stunden nekades varje
 * klientläsning av dem. Inställningssidan svarade "Kunde inte ladda
 * inställningar"; 27 andra ytor läste tyst tomt.
 *
 * Testet knyter ihop de två filerna så att de inte kan glida isär igen: SQL:en
 * bestämmer vilka tabeller som kräver en inloggad roll, och transporten måste
 * kunna leverera en.
 *
 *   npx playwright test tests/klientsessionen.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const kod = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

const SUPABASE_TS = 'lib/supabase.ts'
const V96 = 'sql/v96_tenant_rls_and_credentials.sql'

/** Tabellerna v96 stänger för anon — lästa ur SQL:en, inte hårdkodade här. */
function tabellerSomKraverInloggning(): string[] {
  const sql = read(V96)
  const i = sql.indexOf('FOREACH target_table IN ARRAY ARRAY[')
  expect(i, 'v96 har skrivits om — härdningslistan hittas inte').toBeGreaterThan(-1)
  const block = sql.slice(i, sql.indexOf(']', i))
  return (block.match(/'([a-z_]+)'/g) || []).map(s => s.replace(/'/g, ''))
}

test.describe('webbläsaren läser som sig själv, inte som anon', () => {
  test('klienten hämtar sessionen ur cookien servern skriver', () => {
    const s = kod(SUPABASE_TS)
    expect(s, 'webbläsarklienten byggs inte med auth-helpers klient').toContain(
      'createClientComponentClient'
    )
    // Rå createClient får finnas kvar för SSR-passet och för service_role,
    // men grenen som gäller i webbläsaren måste vara den sessionsbärande.
    const iWindow = s.indexOf("typeof window === 'undefined'")
    expect(iWindow, 'ingen SSR-gren — då är det oklart vad webbläsaren får').toBeGreaterThan(-1)
    const efterGrenen = s.slice(iWindow)
    expect(
      efterGrenen.indexOf('createClientComponentClient'),
      'webbläsargrenen får inte vara den sessionslösa klienten'
    ).toBeGreaterThan(efterGrenen.indexOf('createClient('))
  })

  test('sessionen lagras inte i localStorage längre', () => {
    // persistSession på en rå createClient är just den localStorage-lagring
    // som aldrig fylldes. Står den kvar är felet tillbaka.
    const s = kod(SUPABASE_TS)
    expect(s, 'localStorage-lagring återinförd').not.toContain('persistSession')
  })
})

test.describe('v96 och transporten hänger ihop', () => {
  test('v96 stänger fortfarande dörren för anon', () => {
    const sql = read(V96)
    expect(sql).toContain('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated')
  })

  test('varje klientyta som läser en stängd tabell går via lib/supabase', () => {
    // En komponent som bygger en egen anon-klient skulle nekas igen utan att
    // någon märker det. Kravet är alltså inte "läs inte" utan "läs genom den
    // klient som faktiskt bär sessionen".
    const tabeller = tabellerSomKraverInloggning()
    expect(tabeller.length, 'härdningslistan tolkades tomt').toBeGreaterThan(3)

    const avvikande: string[] = []
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
        const innehall = read(rel)
        if (!innehall.includes("'use client'")) continue
        if (!tabeller.some(t => innehall.includes(`from('${t}')`))) continue
        const egenKlient = /createClient\(\s*(process\.env\.NEXT_PUBLIC_SUPABASE_URL|supabaseUrl)/.test(innehall)
        if (egenKlient) avvikande.push(rel)
      }
    }
    for (const rot of ['app', 'components']) gå(rot)
    expect(
      avvikande,
      `klientyta bygger egen sessionslös klient mot en RLS-stängd tabell: ${avvikande.join(', ')}`
    ).toEqual([])
  })
})
