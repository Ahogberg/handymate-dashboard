import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  bedomMottagarlage,
  utanMottagare,
  type PushSandSvar,
} from '../lib/notifications/push-utan-mottagare'
import { PUSH_MISSLYCKANDE_TEXT, type PushMisslyckande } from '../lib/push/prenumerera-klient'

// Facit för "pushen nådde ingen, och ingen fick veta" (2026-09-10).
//
// Provsamtalen den morgonen fångades, svar-SMS gick ut, in-app-notisen skrevs
// — och ingen push kom fram. Mot produktionsdatabasen samma dag:
//
//   push_subscriptions   0 rader. Inte något konto, inte någon gång.
//   push_tokens          1 rad, för ett rollprovskonto.
//   push_held            två missade samtal från 2026-09-09, båda släppta
//                        05:10 med release_outcome = 'ingen_mottagare'.
//
// Produkten hade alltså skrivit ner, två gånger, att den saknade mottagare —
// och ingenting larmade. Utanför tyst tid fanns inte ens det spåret.
//
// Två fel, samma klass som allt annat vi rensat den här veckan:
//   1. Tystnad. En push som inte nådde någon lämnade inget spår och inget larm.
//   2. Sammanblandning. "VAPID saknas hos oss" och "kunden har ingen enhet
//      registrerad" är olika saker, och ytan sa "försök igen" för båda.

const ROT = join(__dirname, '..')

// ── 1. Bedömningen ─────────────────────────────────────────────────────

const LEVERERAT: PushSandSvar = {
  delivered: true,
  channels: { expo: { attempted: 1 }, web: { attempted: 0, reason: 'no_subscriptions' } },
}

test('en levererad push är inte utan mottagare', () => {
  expect(bedomMottagarlage(LEVERERAT)).toBe('har_mottagare')
  expect(utanMottagare(bedomMottagarlage(LEVERERAT))).toBe(false)
})

test('vår saknade konfiguration skiljs från kundens saknade enhet', () => {
  // Exakt de två svaren /api/push/send faktiskt producerar. Den skillnaden
  // fanns redan i svaret (channels.web.reason) och lästes av ingen.
  const vapidSaknas: PushSandSvar = {
    delivered: false,
    reason: 'no_recipients',
    channels: { expo: { attempted: 0 }, web: { attempted: 0, reason: 'vapid_not_configured' } },
  }
  expect(bedomMottagarlage(vapidSaknas)).toBe('webbpush_ej_konfigurerad')

  const ingenEnhet: PushSandSvar = {
    delivered: false,
    reason: 'no_recipients',
    channels: { expo: { attempted: 0 }, web: { attempted: 0, reason: 'no_subscriptions' } },
  }
  expect(bedomMottagarlage(ingenEnhet)).toBe('ingen_registrerad_enhet')
})

test('ett försök som NÅDDE en mottagare men avvisades är inte "ingen mottagare"', () => {
  // Skillnaden avgör om dedupenyckeln får brännas. Ett avvisat försök ska inte
  // upprepas varje minut; ett försök utan mottagare ska kunna nå fram så snart
  // någon registrerar en telefon.
  const avvisat: PushSandSvar = {
    delivered: false,
    reason: 'provider_rejected',
    channels: { expo: { attempted: 0 }, web: { attempted: 2, reason: 'provider_error' } },
  }
  expect(bedomMottagarlage(avvisat)).toBe('har_mottagare')
})

test('ett tomt eller trasigt svar tolkas som ingen mottagare, aldrig som levererat', () => {
  // Fail-safe: vet vi inte, ska vi larma — inte tiga. Ett antaget "levererat"
  // är precis den sortens gissning som gjorde att elva dagars tystnad gick
  // obemärkt.
  for (const svar of [{}, { delivered: false }, { channels: {} }] as PushSandSvar[]) {
    expect(bedomMottagarlage(svar)).toBe('ingen_registrerad_enhet')
  }
})

// ── 2. Att larmet faktiskt sitter i sändningsvägen ─────────────────────

test('sendApprovalPush larmar när pushen inte nådde någon — och returnerar ändå', () => {
  const src = readFileSync(join(ROT, 'lib/notifications/approval-push.ts'), 'utf8')
  const gren = src.slice(src.indexOf('if (utanMottagare('), src.indexOf('await bokforPush('))
  expect(gren, 'grenen för "ingen mottagare" finns inte längre').toBeTruthy()
  expect(gren, 'ingen larmar — tystnaden var hela felet').toContain('larmaPushUtanMottagare')
  expect(gren, 'grenen returnerar inte, så dedupenyckeln bränns på ett försök som aldrig kunde nå fram')
    .toContain('return')
})

test('ett försök utan mottagare bokförs fortfarande INTE i dedupeloggen', () => {
  // Medvetet, och lätt att råka rätta bort: registrerar hantverkaren sin
  // telefon senare samma dag ska nästa signal kunna nå fram. Larmet ersätter
  // tystnaden, inte beslutet.
  const src = readFileSync(join(ROT, 'lib/notifications/approval-push.ts'), 'utf8')
  const larmStart = src.indexOf('if (utanMottagare(')
  const bokforStart = src.indexOf('await bokforPush(')
  expect(larmStart, 'larmgrenen saknas').toBeGreaterThan(-1)
  expect(bokforStart, 'bokföringen saknas').toBeGreaterThan(-1)
  expect(bokforStart, 'bokföringen ligger före larmgrenen — då bokförs även försök utan mottagare')
    .toBeGreaterThan(larmStart)
})

test('larmet går via driftlarmet, inte bara till konsolen', () => {
  const src = readFileSync(join(ROT, 'lib/notifications/push-utan-mottagare.ts'), 'utf8')
  expect(src, 'ett console.error är inte ett larm — det var exakt vad som gjorde elva dagar tysta')
    .toContain('rapporteraTystFel')
  // Båda skälen ska ha en egen larmkälla, annars går de inte att skilja i
  // digest-mejlet heller.
  expect(src).toContain('push_ej_konfigurerad')
  expect(src).toContain('push_ingen_registrerad_enhet')
})

// ── 3. Ytan får inte ge ett falskt råd ─────────────────────────────────

test('varje misslyckande har en egen text — inget naket "försök igen"', () => {
  const skal: PushMisslyckande[] = ['stods_ej', 'ej_konfigurerad', 'nekad', 'servern_nekade', 'ovantat_fel']
  const texter = skal.map(s => PUSH_MISSLYCKANDE_TEXT[s])
  texter.forEach((text, i) => {
    expect(text, `${skal[i]} saknar text`).toBeTruthy()
  })
  expect(new Set(texter).size, 'två skäl delar text — då är skillnaden meningslös').toBe(skal.length)
})

test('är felet vårt får texten inte be kunden försöka igen', () => {
  // Knappen kan aldrig lyckas när VAPID-nyckeln saknas i bygget. "Försök igen"
  // är då inte bara värdelöst, det lägger skulden på kunden.
  const text = PUSH_MISSLYCKANDE_TEXT.ej_konfigurerad.toLowerCase()
  expect(text, 'texten ber kunden försöka igen fast ett nytt försök är omöjligt').not.toContain('försök igen')
  expect(text, 'texten säger inte att det är vårt att åtgärda').toMatch(/hos oss|vi har|inget du/)
})

test('prenumerationen returnerar ett skäl, inte ett naket false', () => {
  const src = readFileSync(join(ROT, 'lib/push/prenumerera-klient.ts'), 'utf8')
  const fn = src.slice(src.indexOf('export async function prenumereraPaPush'))
  const nakna = fn.split('\n').filter(r => /^\s*(return false|return true)\s*$/.test(r))
  expect(nakna.join('\n'), 'ett naket true/false gör skälet osynligt för ytan').toEqual('')
  expect(fn).toContain("skal: 'ej_konfigurerad'")
})

test('båda ytorna läser utfallet — ett objekt är alltid sant, så !ok tystar allt', () => {
  // Den farligaste varianten av den här ändringen: byta returtyp till ett
  // objekt och lämna `if (!ok)` kvar. Det kompilerar, och alla fel försvinner.
  for (const fil of ['app/dashboard/settings/page.tsx', 'components/PWAInstallBanner.tsx']) {
    const src = readFileSync(join(ROT, fil), 'utf8')
    const anrop = src.indexOf('await prenumereraPaPush()')
    expect(anrop, `${fil} anropar inte prenumereraPaPush`).toBeGreaterThan(-1)
    const efter = src.slice(anrop, anrop + 700)
    expect(efter, `${fil} läser inte .ok — ett objekt är alltid sant`).toMatch(/utfall\.ok|\.ok\b/)
    expect(efter, `${fil} har kvar ett !ok på ett objekt`).not.toMatch(/if \(!ok\)/)
  }
})
