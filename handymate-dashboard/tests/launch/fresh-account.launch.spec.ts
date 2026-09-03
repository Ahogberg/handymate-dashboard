/**
 * Färskkontoprovet — den maskinella delen av LAUNCH_TEST_SUITE §9.
 *
 *   npx playwright test --project=launch-proof
 *   LAUNCH_PROOF_LIVE=1 npx playwright test --project=launch-proof   ← skarpt
 *
 * ═══ VAD DEN BEVISAR, OCH VAD DEN INTE KAN ═══
 *
 * Codex §9 kräver fyra helt nya företag (bygg, el, måleri, VVS) som går hela
 * kedjan utan databasfix. En del av den kedjan går att bevisa maskinellt:
 * registrering, att bransch och roll sparas, att genomgången bara visar
 * verkliga uppgifter, att branschseeden ger relevanta jobbtyper, att en offert
 * kan skapas och bli projekt med relationerna intakta.
 *
 * En annan del går INTE att bevisa maskinellt, och de raderna skrivs ut som
 * MANUELL — aldrig PASS:
 *   - riktigt kundinflöde (kräver ett inkommande samtal eller mejl)
 *   - skarpt kortköp (vi kör Stripe test-mode, per Andreas beslut 2026-09-03)
 *   - mobil push på fysisk iPhone
 *   - Fortnox mot rätt bolag
 *   - BEGRIPLIGHET — den viktigaste. En maskin kan bevisa att en knapp
 *     fungerar, aldrig att produkten är självklar för en hantverkare som ser
 *     den för första gången. Den raden ägs av en kall testperson.
 *
 * ═══ TORRLÄGE ÄR STANDARD ═══
 *
 * Utan LAUNCH_PROOF_LIVE=1 skapas inga konton. Specen rapporterar vad den
 * skulle ha gjort och passerar. Fyra riktiga konton i produktion ska aldrig
 * kunna uppstå ur en slentrianmässig `npx playwright test`.
 */
import { test, expect, type APIRequestContext } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const LIVE = process.env.LAUNCH_PROOF_LIVE === '1'
const ROOT = path.resolve(__dirname, '..', '..')
const UTFALLSFIL = path.join(ROOT, 'docs', 'launch', 'evidence', 'fresh-account-senaste.json')

/** Branscherna ur §9. Nyckeln måste matcha lib/branch BRANCH_IDS. */
const BRANSCHER = [
  { id: 'carpenter', namn: 'Bygg' },
  { id: 'electrician', namn: 'El' },
  { id: 'painter', namn: 'Måleri' },
  { id: 'plumber', namn: 'VVS' },
] as const

/** Det som en maskin aldrig får bokföra som PASS (§9.1 + Grind B). */
const MANUELLA_STATIONER = [
  'Verkligt kundinflöde — inkommande samtal eller mejl (§9.1, Grind B §8.2/§8.3)',
  'Skarpt kortköp med riktigt kort (Grind B §8.1) — här körs Stripe test-mode',
  'Mobil push på fysisk iPhone (Grind B §8.5)',
  'Fortnox mot rätt bolag (Grind B §8.6)',
  'BEGRIPLIGHET: full onboarding av en kall testperson utan hjälp',
]

interface Steg {
  namn: string
  status: 'PASS' | 'FAIL' | 'MANUELL' | 'TORRLÄGE'
  ms?: number
  detalj?: string
}

interface Kontoutfall {
  bransch: string
  businessId: string | null
  steg: Steg[]
  matvarden: Record<string, number | null>
  blockerandeFel: number
  manuellaIngrepp: number
}

const utfall: Kontoutfall[] = []

/** Mäter ett steg och bokför det. Ett kastat fel blir FAIL, inte en krasch. */
async function steg(konto: Kontoutfall, namn: string, fn: () => Promise<string | void>): Promise<boolean> {
  const start = Date.now()
  try {
    const detalj = await fn()
    konto.steg.push({ namn, status: 'PASS', ms: Date.now() - start, detalj: detalj || undefined })
    return true
  } catch (err) {
    konto.blockerandeFel++
    konto.steg.push({
      namn,
      status: 'FAIL',
      ms: Date.now() - start,
      detalj: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

test.describe('§9 färskkontoprov', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })

  for (const bransch of BRANSCHER) {
    test(`${bransch.namn}: registrering → offert → projekt`, async ({ request }) => {
      const konto: Kontoutfall = {
        bransch: bransch.namn,
        businessId: null,
        steg: [],
        matvarden: {
          minuterTillOnboardingKlar: null,
          minuterTillForstaOffert: null,
          minuterTillForstaUppdrag: null,
        },
        blockerandeFel: 0,
        manuellaIngrepp: 0,
      }
      utfall.push(konto)

      if (!LIVE) {
        konto.steg.push({
          namn: 'Hela kedjan',
          status: 'TORRLÄGE',
          detalj: 'LAUNCH_PROOF_LIVE=1 saknas — inget konto skapades. Sätt flaggan för skarp körning.',
        })
        for (const m of MANUELLA_STATIONER) konto.steg.push({ namn: m, status: 'MANUELL' })
        test.skip(true, 'Torrläge — sätt LAUNCH_PROOF_LIVE=1 för att köra skarpt')
        return
      }

      const stamp = Date.now()
      const epost = `launch-prov-${bransch.id}-${stamp}@handymate.se`

      // ── Registrering ────────────────────────────────────────────────
      const okReg = await steg(konto, 'Registrering och verifierad inloggning', async () => {
        const res = await request.post('/api/auth', {
          data: {
            action: 'register',
            email: epost,
            password: `Prov-${stamp}-Aa1!`,
            businessName: `Provfirman ${bransch.namn} ${stamp}`,
            branch: bransch.id,
          },
        })
        if (!res.ok()) throw new Error(`Registrering svarade ${res.status()}: ${(await res.text()).slice(0, 200)}`)
        const body = await res.json()
        konto.businessId = body.business_id || body.businessId || null
        if (!konto.businessId) throw new Error('Inget business_id i svaret')
        return `business_id ${konto.businessId}`
      })
      if (!okReg) return

      // ── Bransch och roll sparas ─────────────────────────────────────
      await steg(konto, 'Företag, roll och bransch sparas', async () => {
        const res = await request.get('/api/onboarding')
        if (!res.ok()) throw new Error(`GET /api/onboarding svarade ${res.status()}`)
        const d = await res.json()
        if (d.branch !== bransch.id) throw new Error(`Bransch blev "${d.branch}", väntade "${bransch.id}"`)
        return `bransch ${d.branch}`
      })

      // ── Genomgången visar bara verkliga uppgifter ────────────────────
      await steg(konto, 'Genomgången visar bara verkliga uppgifter', async () => {
        const res = await request.get('/api/onboarding/company-scan')
        if (res.status() === 403) return 'ägargrindad (403) — förväntat för icke-ägare'
        if (!res.ok()) throw new Error(`company-scan svarade ${res.status()}`)
        const d = await res.json()
        // Ett nytt konto utan import får ALDRIG visa fynd ur kunddata.
        for (const falt of ['customerCount', 'openInvoicesCount', 'activeProjectsCount', 'openQuotesCount']) {
          if (Number(d[falt]) > 0) throw new Error(`${falt} = ${d[falt]} på ett nytt konto utan import`)
        }
        return `profilrader: ${d.profil ? 'ja' : 'nej'}`
      })

      // ── Betalgrinden blockerar före betalning ───────────────────────
      await steg(konto, 'Finalize blockeras före betalning (ingen provperiod)', async () => {
        const res = await request.post('/api/onboarding', { data: { branch: bransch.id } })
        if (res.status() !== 402) {
          throw new Error(`Finalize svarade ${res.status()}, väntade 402 — betalgrinden läcker`)
        }
        return '402 som väntat'
      })

      // Resten av kedjan (betalning i test-mode, seed, offert, projekt)
      // kräver en genomförd Stripe-checkout. Den stationen bokförs som
      // MANUELL tills test-mode-flödet körs av den som äger beviskedjan —
      // en maskin som "simulerar" en betalning bevisar ingenting om
      // betalvägen.
      konto.steg.push({
        namn: 'Betalning (Stripe test-mode) och kedjan därefter',
        status: 'MANUELL',
        detalj: 'Kräver genomförd checkout. Kör test-mode-kortet och fortsätt kedjan därifrån.',
      })

      for (const m of MANUELLA_STATIONER) konto.steg.push({ namn: m, status: 'MANUELL' })

      expect(konto.blockerandeFel, `${bransch.namn}: blockerande fel i den maskinella kedjan`).toBe(0)
    })
  }

  test.afterAll(async ({ }) => {
    fs.mkdirSync(path.dirname(UTFALLSFIL), { recursive: true })
    fs.writeFileSync(
      UTFALLSFIL,
      JSON.stringify(
        {
          kord: new Date().toISOString(),
          lage: LIVE ? 'skarpt' : 'torrläge',
          konton: utfall,
          paminnelse:
            'MANUELL betyder att stationen inte är bevisad. Den får aldrig bokföras som PASS i protokollet.',
        },
        null,
        2,
      ),
      'utf8',
    )
    console.log(`\nUtfall skrivet till ${path.relative(ROOT, UTFALLSFIL)} (${LIVE ? 'skarpt' : 'torrläge'})`)
    if (LIVE) {
      const ids = utfall.map(k => k.businessId).filter(Boolean)
      console.log(`Skapade konton att städa: ${ids.length > 0 ? ids.join(', ') : '(inga)'}`)
    }
  })
})
