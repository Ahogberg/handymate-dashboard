/**
 * Referral-belöningen: en månad gratis som Stripe-kundsaldo.
 *
 *   npx playwright test tests/referral-reward.spec.ts --project=chromium --no-deps
 *
 * Bakgrund (2026-09-02): den gamla "50 % på nästa faktura" skrevs bara som
 * JSON i v3_automation_settings.referral_discount_pending och lästes aldrig
 * vid fakturering — SMS:et lovade en rabatt som aldrig drogs. Nu krediteras
 * referrerns månadspris (PLAN_PRICES_SEK) som negativt kundsaldo i Stripe,
 * och referral-raden sätts till 'rewarded' BARA när krediten ligger i Stripe.
 *
 * Källskanning — ingen webbläsare, ingen databas, ingen Stripe.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const DISCOUNTS = 'lib/referral/discounts.ts'
const REFERRAL_PAGE = 'app/dashboard/referral/page.tsx'

/** GSM-7-basalfabetet (inkl. svenska å ä ö) — allt annat tvingar UCS-2 och
 *  sänker taket till 70 tecken per del. */
const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'

function gå(dir: string, besök: (rel: string) => void) {
  let poster: fs.Dirent[]
  try { poster = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }) } catch { return }
  for (const f of poster) {
    const rel = `${dir}/${f.name}`
    if (f.isDirectory()) {
      if (f.name === 'node_modules' || f.name === '.next') continue
      gå(rel, besök)
    } else if (/\.tsx?$/.test(f.name)) {
      besök(rel)
    }
  }
}

test.describe('lib/referral/discounts.ts — Stripe-kredit', () => {
  const src = kod(DISCOUNTS)

  test('krediten skrivs som negativt kundsaldo i SEK från PLAN_PRICES_SEK', () => {
    expect(src).toContain('export async function grantReferralMonthCredit(')
    expect(src).toContain('createBalanceTransaction')
    expect(src).toContain("currency: 'sek'")
    expect(src).toContain('PLAN_PRICES_SEK')
    // Öre, negativt = tillgodo
    expect(src).toMatch(/amount:\s*-\(amountSek \* 100\)/)
  })

  test('den döda 50 %-rabatten är borta', () => {
    expect(src).not.toContain('applyNextInvoiceDiscount')
    expect(src).not.toContain('getPendingDiscount')
    expect(src).not.toContain('clearPendingDiscount')
    expect(src).not.toContain('referral_discount_pending')
    expect(src).not.toMatch(/50\s?%\s+rabatt/)
  })

  test('ingen Stripe-kund / okänd plan → ingen kredit, inget gissat belopp', () => {
    expect(src).toContain("error: 'no_stripe_customer'")
    expect(src).toContain("error: 'unknown_plan'")
    // Priset slås upp på planen — aldrig ett hårdkodat fallback-pris
    expect(src).toMatch(/PLAN_PRICES_SEK\[referrer\.subscription_plan\]/)
    expect(src).not.toMatch(/PLAN_PRICES_SEK\.professional/)
  })

  test('ordning: kredit FÖRE rewarded, och granted:false returnerar innan rewarded', () => {
    const start = src.indexOf('export async function handleFirstPaymentReferral(')
    expect(start).toBeGreaterThan(-1)
    const fn = src.slice(start)

    const iGrant = fn.indexOf('grantReferralMonthCredit(')
    const iGranted = fn.indexOf('if (!credit.granted)')
    const iRewardedAt = fn.indexOf('rewarded_at')
    expect(iGrant).toBeGreaterThan(-1)
    expect(iGranted).toBeGreaterThan(iGrant)
    expect(iRewardedAt).toBeGreaterThan(iGranted)

    // Grenen som saknar kredit returnerar utan att nå rewarded-uppdateringen
    const granted = fn.slice(iGranted, iRewardedAt)
    expect(granted).toMatch(/return \{ rewarded: false, referrerBusinessId, error: credit\.error \}/)

    // rewarded skrivs DIREKT efter krediten — före SMS:et — och felkontrolleras
    const iSms = fn.indexOf('sendSmsViaElks')
    expect(iSms).toBeGreaterThan(iRewardedAt)
    expect(fn).toContain('const { error: rewardedError } = await supabase')
    expect(fn).toContain("rapporteraTystFel(supabase, referrerBusinessId, 'referral_rewarded_status'")
  })

  test('utebliven kredit larmar — ingen adminyta listar kund-referrals', () => {
    expect(src).toContain("rapporteraTystFel(supabase, referrerBusinessId, 'referral_kredit'")
  })

  test('idempotens: rewarded-raden avvisas, Stripe-nyckel per referral, och permanent skydd via metadata.referral_id', () => {
    expect(src).toContain("if (existingReferral.status === 'rewarded')")
    expect(src).toMatch(/idempotencyKey: `referral-month-\$\{opts\.referralId\}`/)
    // Lager 2: transaktionen märks med referral_id och historiken kontrolleras före skrivning
    expect(src).toMatch(/metadata: \{[^}]*referral_id: opts\.referralId/)
    expect(src).toContain('listBalanceTransactions')
    expect(src).toMatch(/t\.metadata\?\.referral_id === opts\.referralId/)
    const iList = src.indexOf('listBalanceTransactions')
    const iCreate = src.indexOf('createBalanceTransaction(')
    expect(iList).toBeGreaterThan(-1)
    expect(iList).toBeLessThan(iCreate)
    // Redan krediterad → inget nytt SMS
    expect(src).toContain('if (!credit.alreadyCredited) try {')
  })

  test('SMS:et går genom strypunkten och ryms i EN SMS-del', () => {
    expect(src).toContain('sendSmsViaElks')
    expect(src).toContain("messageType: 'referral_reward'")

    const m = src.match(/export const REFERRAL_REWARD_SMS =\s*\n?\s*'([^']+)'/)
    expect(m, 'REFERRAL_REWARD_SMS hittades inte').toBeTruthy()
    const sms = m![1]
    expect(sms).toContain('en månad gratis')
    expect(sms).not.toMatch(/50\s?%/)
    expect(sms.length).toBeLessThanOrEqual(160)
    const utanförGsm7 = Array.from(sms).filter(c => !GSM7.includes(c))
    expect(utanförGsm7, `tecken utanför GSM-7 (tvingar 70-teckensdelar): ${utanförGsm7.join(' ')}`).toEqual([])
  })
})

test.describe('referral_discount_pending läses ingenstans', () => {
  test('ingen fil i app/, lib/, components/ nämner kolumnen', () => {
    const träffar: string[] = []
    for (const rot of ['app', 'lib', 'components']) {
      gå(rot, rel => { if (kod(rel).includes('referral_discount_pending')) träffar.push(rel) })
    }
    expect(träffar).toEqual([])
  })
})

test.describe('app/dashboard/referral/page.tsx — löftet stämmer med belöningen', () => {
  const src = kod(REFERRAL_PAGE)

  test('lovar en månad gratis — inte 50 % och ingen provperiod', () => {
    expect(src).toContain('en månad gratis')
    expect(src).not.toContain('50%')
    expect(src).not.toContain('50 %')
    expect(src).not.toMatch(/[Pp]rova gratis/)
    expect(src).not.toContain('provperiod')
  })

  test('pekar på stämpel-toggeln i Inställningar', () => {
    expect(src).toContain('Din länk finns redan i botten på varje offert, faktura och kundmejl du skickar')
    expect(src).toContain('/dashboard/settings?tab=integrations')
  })
})

test.describe('övriga ytor som nämner belöningen', () => {
  test('morgonrapportens referral-tips lovar inte 50 %', () => {
    const src = kod('lib/agent/morning-report.ts')
    expect(src).not.toMatch(/50\s?%\s+rabatt/)
    expect(src).toContain('en månad gratis')
  })
})
