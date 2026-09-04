/**
 * Facit: Pass A — push når fram (2026-09-04).
 *
 * Bakgrund: docs/audits/AUTOPILOT_REVISION_2026-09-04.md, avsnitt
 * "1. Ingen får veta" — 0 prenumerationer, 0 skickade pushar, någonsin.
 * Tre buggar i components/PWAInstallBanner.tsx plus att de flesta cronar
 * aldrig pushade. Låser fixarna, browserlöst (källskanning, ingen `page`).
 *
 * Körs: npx playwright test tests/autopilot-push.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

const banner = read('components/PWAInstallBanner.tsx')
const klient = read('lib/push/prenumerera-klient.ts')
const settings = read('app/dashboard/settings/page.tsx')
const skapaKort = read('lib/approvals/skapa-kort.ts')

test.describe('PWAInstallBanner + prenumerera-klient', () => {
  test('PUSH_SUBSCRIBED_KEY är v2 (låsta piloter frigörs)', () => {
    const m = klient.match(/PUSH_SUBSCRIBED_KEY\s*=\s*'([^']+)'/)
    expect(m, 'PUSH_SUBSCRIBED_KEY-definitionen hittades inte').not.toBeNull()
    expect(m![1]).toContain('_v2')
    // Bannern importerar konstanten, definierar den inte längre själv.
    expect(banner).not.toMatch(/PUSH_SUBSCRIBED_KEY\s*=\s*'handymate_push_subscribed'(?!_v2)/)
    expect(banner).toContain("from '@/lib/push/prenumerera-klient'")
  })

  test('kvittot sätts BARA efter ett ok-svar från servern, aldrig innan', () => {
    // Nätanropet ligger i prenumereraPaPush (lib/push/prenumerera-klient.ts)
    // sedan utbrytningen till delad klientkod — det är där den ursprungliga
    // buggen (kvitto utan att läsa svaret) satt och är fixad.
    const fetchIdx = klient.indexOf("await fetch('/api/push/subscribe'")
    expect(fetchIdx, 'fetch-anropet till /api/push/subscribe hittades inte').toBeGreaterThan(-1)
    const efterFetch = klient.slice(fetchIdx)

    const okIdx = efterFetch.indexOf('res.ok')
    const setItemIdx = efterFetch.indexOf('setItem(PUSH_SUBSCRIBED_KEY')
    expect(okIdx, 'res.ok kontrolleras inte efter fetch-anropet').toBeGreaterThan(-1)
    expect(setItemIdx, 'localStorage.setItem(PUSH_SUBSCRIBED_KEY saknas efter fetch-anropet').toBeGreaterThan(-1)
    expect(okIdx, 'res.ok måste kollas FÖRE flaggan sätts, inte efter').toBeLessThan(setItemIdx)
  })

  test('flaggan sätts på EXAKT ett ställe i prenumereraPaPush — och det är efter res.ok', () => {
    // Det första facit tittade bara EFTER fetch-anropet. Den första
    // implementationen satte flaggan även i "existing"-grenen FÖRE fetch —
    // webbläsaren hade en native prenumeration, alltså "sant". Men servern
    // är sanningen, inte webbläsaren: varje pilot som försökte före v198 har
    // just det läget (prenumeration i webbläsaren, ingen rad på servern) och
    // hade låsts om igen med v2-nyckeln. Därför: exakt en setItem, och den
    // ska ligga efter res.ok.
    const fnStart = klient.indexOf('export async function prenumereraPaPush')
    const fn = klient.slice(fnStart)
    const traffar = fn.split('setItem(PUSH_SUBSCRIBED_KEY').length - 1
    expect(traffar, 'PUSH_SUBSCRIBED_KEY får sättas på exakt ett ställe').toBe(1)
    expect(fn.indexOf('res.ok')).toBeLessThan(fn.indexOf('setItem(PUSH_SUBSCRIBED_KEY'))
    // En befintlig prenumeration ska ändå skickas till servern.
    expect(fn).toContain('let subscription = existing')

    // Felvägen (else-grenen, strax efter setItem-grenen i koden) ska logga
    // och LÅTA BLI att sätta flaggan.
    const setItemIdxIFn = fn.indexOf('setItem(PUSH_SUBSCRIBED_KEY')
    const felgren = fn.slice(setItemIdxIFn, setItemIdxIFn + 400)
    expect(felgren, `felväg saknar console.warn, hittade:\n${felgren}`).toMatch(/console\.warn/)
  })

  test('iOS-detektion finns och !isStandalone är inte längre ett ensamt returvillkor', () => {
    const kombinerat = banner + '\n' + klient
    expect(kombinerat).toMatch(/iPad\|iPhone\|iPod/)

    // Den gamla buggen: `if (!isStandalone || !PUBLIC_VAPID_KEY) return`.
    expect(kombinerat).not.toMatch(/if\s*\(\s*!isStandalone\s*\|\|[^)]*\)\s*return/)
    // Och inget ensamt `if (!isStandalone) return` utan någon annan operand.
    expect(kombinerat).not.toMatch(/if\s*\(\s*!isStandalone\s*\)\s*return/)
    // isStandalone ska nu samverka med iOS-kollen (Android/desktop i flik
    // ska också tillfrågas).
    expect(banner).toMatch(/!isStandalone\s*&&\s*arIOS\(\)/)
  })

  test('prenumerera-klient.ts exporterar prenumereraPaPush; bannern och inställningarna delar den', () => {
    expect(klient).toMatch(/export\s+async\s+function\s+prenumereraPaPush/)
    expect(banner).toMatch(/import\s*\{[^}]*prenumereraPaPush[^}]*\}\s*from\s*'@\/lib\/push\/prenumerera-klient'/)
    expect(settings).toMatch(/from\s*'@\/lib\/push\/prenumerera-klient'/)

    // Ingen dubblerad pushManager.subscribe — bara EN plats i klientkoden
    // ska faktiskt anropa .subscribe({...}).
    const alla = [banner, settings]
    const antalSubscribeAnrop = alla.reduce(
      (n, src) => n + (src.match(/pushManager\.subscribe\(/g) || []).length,
      0,
    )
    expect(antalSubscribeAnrop).toBe(0)
    expect(klient.match(/pushManager\.subscribe\(/g)?.length).toBe(1)
  })
})

test.describe('Inställningar — "Aktivera notiser"', () => {
  test('kortet finns med aktiverings- och testknapp', () => {
    expect(settings).toContain('Aktivera notiser')
    expect(settings).toContain('Skicka testnotis')
    expect(settings).toMatch(/\/api\/push\/test-approval/)
  })

  test('visar iOS-instruktionen i stället för knappen på iOS utan standalone', () => {
    // Samma vaktflagga (arIOS() && !standalone) som gate:ar knappen bort.
    expect(settings).toMatch(/pushArIOSUtanStandalone/)
    expect(settings).toMatch(/hemskärmen/)
  })
})

test.describe('lib/approvals/skapa-kort.ts', () => {
  test('importerar sendApprovalPush och matchar ApprovalLike', () => {
    expect(skapaKort).toMatch(/import\s*\{\s*sendApprovalPush\s*\}\s*from\s*'@\/lib\/notifications\/approval-push'/)
  })

  test('insert kommer FÖRE push', () => {
    const insertIdx = skapaKort.indexOf(".from('pending_approvals')\n    .insert(")
    const pushIdx = skapaKort.indexOf('sendApprovalPush(')
    expect(insertIdx, 'insert(...) i pending_approvals hittades inte').toBeGreaterThan(-1)
    expect(pushIdx, 'anrop till sendApprovalPush hittades inte').toBeGreaterThan(-1)
    expect(insertIdx).toBeLessThan(pushIdx)
  })

  test('catch runt pushen returnerar kortet ändå (fail-soft)', () => {
    const pushIdx = skapaKort.indexOf('sendApprovalPush(')
    const catchIdx = skapaKort.indexOf('} catch (err) {', pushIdx)
    const returnIdx = skapaKort.indexOf('return { id }')
    expect(catchIdx, 'catch runt sendApprovalPush hittades inte').toBeGreaterThan(pushIdx)
    expect(returnIdx, 'return { id } efter push-blocket hittades inte').toBeGreaterThan(catchIdx)
  })

  test('insertfel returnerar null och loggar, kastar aldrig', () => {
    expect(skapaKort).toMatch(/console\.warn\([^)]*insert misslyckades/)
    expect(skapaKort).toMatch(/return null/)
    // Inget `throw` i hela filen — fail-soft, aldrig kasta.
    expect(skapaKort).not.toMatch(/\bthrow\b/)
  })
})

test.describe('Del 4 — inkopplade call-sites', () => {
  const filer = [
    'app/api/cron/karin-deadlines/route.ts',
    'app/api/cron/missed-revenue/route.ts',
    'lib/egenkontroll/suggest-time-entry.ts',
  ]

  for (const rel of filer) {
    test(`${rel} använder skapaKort, inte längre rå insert mot pending_approvals`, () => {
      const src = read(rel)
      expect(src, `${rel} importerar inte skapaKort`).toMatch(/import\s*\{\s*skapaKort\s*\}\s*from\s*'@\/lib\/approvals\/skapa-kort'/)
      expect(src, `${rel} anropar inte skapaKort(`).toContain('skapaKort(')
      expect(src, `${rel} har fortfarande en rå .from('pending_approvals').insert(`).not.toMatch(
        /\.from\('pending_approvals'\)\s*\.insert\(/,
      )
    })
  }
})
