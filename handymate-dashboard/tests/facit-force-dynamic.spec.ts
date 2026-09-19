import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Facit: en GET-rutt som läser auth via en helper MÅSTE ha force-dynamic.
 *
 * ═══ VARFÖR REGELN FINNS ═══
 *
 * getAuthenticatedBusiness, getCurrentUser och getPartnerTokenFromRequest
 * läser `request.headers` direkt — inte `cookies()`/`headers()` från
 * next/headers. Next statiska analys ser bara route-filens EGEN kod, inte vad
 * en importerad funktion gör. Utan `export const dynamic = 'force-dynamic'`
 * behandlas rutten därför som statisk (Full Route Cache), och på en URL utan
 * urskiljande query-parametrar kan första svaret efter deploy frysas och
 * serveras till ALLA företag oavsett vem som frågar.
 *
 * Hittades 2026-08-22: Fortnox-integrationsstatus visade "Ej kopplad" trots
 * skarpt kopplad i databasen. Sveptes över 85 rutter samma dag.
 *
 * ═══ VARFÖR DET HÄR FACIT FINNS ═══
 *
 * Regeln stod i CLAUDE.md men vaktades av ingenting. 2026-09-18 hade 83 nya
 * eller ändrade GET-rutter hunnit tappa den igen. En regel som bara står
 * skriven är en regel som ruttnar — därför det här provet.
 *
 * Dessutom kostar varje sådan rutt BYGGTID: Next kör den vid bygget för att
 * producera det statiska svaret. Lokalt misslyckas databasanropet direkt
 * (ingen nätutgång) och kostar ingenting; i byggmiljön är det ett riktigt
 * anrop. Det är en trolig förklaring till att bygget slog i Vercels
 * 45-minuterstak medan det tog tre minuter lokalt.
 *
 * Kör: npx playwright test tests/facit-force-dynamic.spec.ts --no-deps
 */

const ROOT = path.resolve(__dirname, '..')
const API = path.join(ROOT, 'app', 'api')

/** Helpers som läser request direkt och därför är osynliga för Next analys. */
const HELPERS = /getAuthenticatedBusiness|getCurrentUser|getPartnerTokenFromRequest/
const GET = /export (async )?function GET\b/

function rutter(dir: string, ut: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) rutter(p, ut)
    else if (e.name === 'route.ts') ut.push(p)
  }
  return ut
}

const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, '/')

test('varje GET-rutt som läser auth via en helper har force-dynamic', () => {
  const saknar = rutter(API)
    .filter(f => {
      const kod = fs.readFileSync(f, 'utf8')
      return GET.test(kod) && HELPERS.test(kod) && !kod.includes('export const dynamic')
    })
    .map(rel)
  // Ingen tillåten-lista. En rutt som läser auth per anrop kan aldrig vara
  // statisk — det finns inget fall där undantaget är rätt, bara fall där
  // någon glömt.
  expect(saknar, `rutter utan force-dynamic:\n${saknar.join('\n')}`).toEqual([])
})

test('force-dynamic står med värdet Next faktiskt läser', () => {
  // `dynamic = 'auto'` eller en variabel är inte samma sak som force-dynamic,
  // och skulle annars glida igenom provet ovan.
  const fel = rutter(API)
    .filter(f => {
      const kod = fs.readFileSync(f, 'utf8')
      if (!kod.includes('export const dynamic')) return false
      // Tolerant mot mellanslag: två rutter skriver `dynamic='force-dynamic'`
      // utan blanksteg. Det är formatering, inte betydelse — provet ska mäta
      // värdet Next läser, inte hur någon råkat skriva det.
      return !/export const dynamic\s*=\s*'force-dynamic'/.test(kod)
    })
    .map(rel)
  expect(fel, `rutter med annat värde än force-dynamic:\n${fel.join('\n')}`).toEqual([])
})

test('regeln står kvar i CLAUDE.md — facit och dokument pekar åt samma håll', () => {
  const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8')
  expect(claude).toContain("export const dynamic = 'force-dynamic'")
  expect(claude).toContain('getAuthenticatedBusiness')
})
