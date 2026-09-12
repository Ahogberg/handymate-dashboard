import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  DEMO_SIMULERAT_NUMMER,
  arSimuleratDemonummer,
} from '../lib/demo/simulerad-telefoni'

/**
 * Facit för "det snygga undantaget" (2026-09-10, Andreas: "Kan vi göra ett
 * snyggt undantag för demon? Vore också snyggt att kunna fejka fortnox-synk
 * i onboardingen för demot … men på låtsassiffror utan att behöva göra oAuth").
 *
 * ═══ REGELN HELA PASSET VILAR PÅ ═══
 *
 *     Demot får fejka DATAN. Demot får ALDRIG fejka STATUSEN.
 *
 * Statuslogiken (lib/agents/agent-tillstand.ts, team-activity-rutten,
 * lib/jarvis/bevakning.ts) beskriver vad RIKTIGA kunder ser. Den har kostat
 * tre rättningar den här veckan — Lisas döda agent_runs-grind, Daniels
 * nummerkrav och Hannas segmentkrav. Ett demoundantag DÄR hade varit ett
 * fjärde hål. Undantaget ligger därför i datan: ett simulerat nummer,
 * simulerade samtal, och en riktig LTV-körning över dem — och de befintliga,
 * ogrindade härledningarna får läsa dem som vad de är.
 *
 * Provet vaktar tre saker som alla kan gå sönder tyst:
 *   1. Det simulerade numret får inte kunna svälja ett riktigt nummer, och
 *      får inte kunna skrivas över ett riktigt.
 *   2. Nattsvepet måste hoppa över det — annars larmar eller NOLLSTÄLLER
 *      det numret varje dygn.
 *   3. Fortnox-simmens "bearbetade av agenterna" måste vara Karins RIKTIGA
 *      kortbyggare, inte ett demokort som bara ser ut som ett.
 *
 * Körs: npx playwright test tests/demo-undantaget.spec.ts --no-deps --project=chromium
 */

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

/** Strippar kommentarer — ett prov som spricker på ett filhuvud vaktar prosa, inte kod. */
function utanKommentarer(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const MODUL = 'lib/demo/simulerad-telefoni.ts'
const SVEPET = 'app/api/cron/phone-number-verify/route.ts'
const RESET = 'app/api/admin/demo-reset/route.ts'
const SIM = 'app/api/admin/demo-fortnox-sim/route.ts'
const SEEDARE = 'lib/demo/seed-demo-account.ts'

test.describe('det simulerade numret', () => {
  test('predikatet är EXAKT matchning — ett prefix hade kunnat svälja ett riktigt nummer', () => {
    expect(arSimuleratDemonummer(DEMO_SIMULERAT_NUMMER)).toBe(true)
    // Grannar och förlängningar får ALDRIG räknas som demonumret: gjorde de
    // det hade nattsvepet slutat kontrollera ett riktigt företags nummer.
    for (const nara of [
      DEMO_SIMULERAT_NUMMER + '1',
      DEMO_SIMULERAT_NUMMER.slice(0, -1),
      DEMO_SIMULERAT_NUMMER.replace('+46', '0'),
      '+46701740001',
      '',
    ]) {
      expect(arSimuleratDemonummer(nara), nara).toBe(false)
    }
    expect(arSimuleratDemonummer(null)).toBe(false)
    expect(arSimuleratDemonummer(undefined)).toBe(false)
  })

  test('numret definieras på ETT ställe — ingen kopierad literal någon annanstans', () => {
    // En andra kopia av strängen är hur ett undantag glider isär: svepet
    // hoppar över det ena numret medan seedningen skriver det andra.
    const literal = DEMO_SIMULERAT_NUMMER
    for (const fil of [SVEPET, RESET, SIM, SEEDARE]) {
      expect(read(fil), `${fil} har en egen kopia av numret`).not.toContain(literal)
    }
    expect(read(MODUL), 'konstanten deklareras inte i modulen').toContain(literal)
  })

  test('ett RIKTIGT nummer skrivs aldrig över', () => {
    // Skulle demokontot en dag köpa ett äkta 46elks-nummer är telefonin
    // äkta, och en simulering ovanpå hade tagit bort en fungerande telefon.
    const src = read(MODUL)
    expect(src).toMatch(/if \(befintligt && !arSimuleratDemonummer\(befintligt\)\)/)
    const grenen = src.slice(src.indexOf('if (befintligt && !arSimuleratDemonummer'), src.indexOf('if (!befintligt)'))
    expect(grenen, 'grenen skriver ändå').not.toContain('.update(')
    expect(grenen, 'grenen redovisar inte att numret behölls').toContain('riktigtNummerBehallet: true')
  })

  test('elks_number_id skrivs ALDRIG — det finns inget nummer hos 46elks att peka på', () => {
    // Ett påhittat elks_number_id hade fått nattsvepet att fråga 46elks om ett
    // id som inte finns, få 404, och NOLLSTÄLLA numret. Att lämna det NULL är
    // det som gör undantaget nedan (kan_ej_verifieras) möjligt att hoppa över.
    const src = read(MODUL)
    expect(src, 'modulen skriver elks_number_id').not.toMatch(/elks_number_id:\s*['"`]/)
  })
})

test.describe('nattsvepet hoppar över demonumret', () => {
  const src = read(SVEPET)

  test('filtret kräver BÅDA villkoren: rätt nummer OCH ett demokonto', () => {
    // Nyckeln ligger på NUMRET, inte bara på kontot: ett demokonto som köper
    // ett riktigt nummer ska verifieras som alla andra. Och kravet på
    // is_demo_tenant gör att ett riktigt företag som mot alla odds hade just
    // det numret ändå kontrolleras.
    expect(src).toContain("from '@/lib/demo/simulerad-telefoni'")
    expect(src).toMatch(
      /arSimuleratDemonummer\(rad\.assigned_phone_number\) && rad\.is_demo_tenant === true/,
    )
    // Och kolumnen måste faktiskt hämtas, annars är villkoret alltid falskt.
    expect(src).toMatch(/\.select\(['"][^'"]*is_demo_tenant[^'"]*['"]\)/)
  })

  test('nollställningen och larmen ligger EFTER filtret', () => {
    // Kommentarerna strippas: filhuvudet nämner larmen långt före koden.
    const ren = utanKommentarer(src)
    const filter = ren.indexOf('arSimuleratDemonummer(rad.assigned_phone_number)')
    expect(filter).toBeGreaterThan(-1)
    for (const senare of ['nummer_kan_ej_verifieras', 'nummer_aterkallat', 'assigned_phone_number: null']) {
      expect(ren.indexOf(senare), `${senare} ligger före filtret`).toBeGreaterThan(filter)
    }
  })
})

test.describe('ägarskapet: seedaren äger datan, resetten äger konfigen', () => {
  test('numret skrivs UTANFÖR seedaren — den rör aldrig business_config', () => {
    // tests/demo-seedning-tackning.spec.ts vaktar att seedaren bara LÄSER
    // business_config (en skrivning där kunde radera presentatörens egen
    // koppling). Simuleringen får inte smyga in en skrivning bakvägen.
    const seedare = read(SEEDARE)
    expect(seedare, 'seedaren importerar telefonisimuleringen').not.toContain('simulerad-telefoni')
    expect(seedare, 'seedaren skriver assigned_phone_number').not.toContain('assigned_phone_number:')
  })

  test('resetten kör simuleringen EFTER seedningen och fäller inte på fel', () => {
    const src = read(RESET)
    expect(src).toContain('simuleraDemotelefoni(')
    const seedPos = src.indexOf('resetDemoAccount(')
    const simPos = src.indexOf('simuleraDemotelefoni(getServerSupabase()')
    expect(seedPos).toBeGreaterThan(-1)
    expect(simPos, 'simuleringen körs före seedningen — då finns inga kunder att knyta samtalen till')
      .toBeGreaterThan(seedPos)
    // Fail-soft: en misslyckad simulering får inte fälla en lyckad reset.
    // Funktionen kastar inte (den loggar och returnerar), och rutten
    // behandlar den inte som ett fel.
    expect(read(MODUL), 'simuleringen kastar i stället för att returnera').not.toMatch(/throw new/)
    const efter = src.slice(simPos, simPos + 300)
    expect(efter, 'ett telefonifel fäller resetten').not.toMatch(/status:\s*[45]\d\d/)
  })

  test('samtalen raderas av RPC:n — annars ackumulerar demot samtal per reset', () => {
    const rpc = read('sql/v158_demo_reset_v3.sql')
    expect(rpc, 'call_recording raderas inte').toContain('DELETE FROM public.call_recording')
  })

  test('inget påhittat ljud eller påhittad transkribering', () => {
    // En recording_url som 404:ar när presentatören trycker play är sämre än
    // ingen knapp alls.
    const src = read(MODUL)
    expect(src, 'modulen hittar på en ljudfil').not.toMatch(/recording_url:\s*['"`][^'"`]/)
    expect(src).toMatch(/recording_fetched:\s*false/)
  })
})

test.describe('Fortnox-simmen: "bearbetade av agenterna" är Karins riktiga kort', () => {
  const src = read(SIM)

  test('korten byggs av delade byggaren, inte av ett demospecifikt kort', () => {
    // Ett eget demokort hade betytt att demon visar en Karin som inte finns:
    // annan text, annan nivå, annan dedup än den kunden faktiskt får.
    expect(src).toContain("from '@/lib/invoice-reminder-card'")
    for (const fn of ['loadReminderConfig(', 'composeReminderStep(', 'createInvoiceReminderCard(']) {
      expect(src, `simmen använder inte ${fn}`).toContain(fn)
    }
    // Och den skriver ALDRIG pending_approvals själv.
    expect(src, 'simmen skapar egna godkännandekort').not.toContain("from('pending_approvals')")

    // Byggaren måste vara samma som morgoncronens — annars är jämförelsen tom.
    const cron = read('app/api/cron/send-reminders/route.ts')
    expect(cron, 'cronen använder inte samma kortbyggare').toContain('createInvoiceReminderCard')
  })

  test('bara FÖRFALLNA fakturor får ett kort', () => {
    // En betald eller ännu inte förfallen faktura ska aldrig ge Karin ett kort
    // — då hade demot visat henne jaga pengar som inte är sena.
    expect(src).toMatch(/if \(mapped\.row\.status === 'overdue'\)/)
  })

  test('simmen skickar ingenting — korten väntar på ett klick', () => {
    expect(utanKommentarer(src), 'simmen skickar SMS').not.toMatch(/sendSms|46elks/i)
    expect(src, 'simmen levererar påminnelser direkt').not.toContain('invoice-reminder-send')
    // mapFortnoxInvoice sätter reminder_count 0 utan next_reminder_at, så
    // send-reminders-cronen kan inte plocka upp raderna. Den garantin ligger i
    // map-invoice och får inte kringgås här.
    // En SKRIVNING av fältet, inte omnämnandet i filhuvudet (som beskriver
    // just den garantin).
    expect(src, 'simmen sätter next_reminder_at och kan därmed trigga utskick')
      .not.toMatch(/next_reminder_at:\s*[^\s]/)
  })

  test('ett misslyckat kort fäller inte importen', () => {
    const kortPos = src.indexOf('const karinResults')
    const block = src.slice(kortPos, src.indexOf('return NextResponse.json({', kortPos))
    expect(block, 'ett kortfel returnerar felstatus i stället för att redovisas')
      .not.toMatch(/return NextResponse\.json\([^)]*status:\s*5\d\d/)
    expect(block).toContain('karinResults.errors.push')
  })
})

test.describe('en misslyckad reset går att läsa ur auditen', () => {
  test('den riktiga Postgres-orsaken sparas, inte bara en platt kod', () => {
    // 2026-09-11. demo_reset_audit hade fyra rader, alla med error_text
    // 'delete_transaction_failed'. Den strängen säger att transaktionen föll,
    // inte varför — och kostade två separata jakter på samma funktion:
    // v227 (rollgrinden jämförde uuid mot text) och v229 (sista satsen nollade
    // business_config.fortnox_token_expires_at, en kolumn som bor i
    // business_integration_credentials). Båda hade gått att läsa direkt ur
    // auditen om orsaken sparats.
    const src = read(SEEDARE)
    const block = src.slice(src.indexOf('if (resetError ||'), src.indexOf('reset_version:', src.indexOf('if (resetError ||')) + 60)
    expect(block, 'hittade inte felgrenen').toBeTruthy()
    expect(block, 'orsaken sparas inte i auditraden').toMatch(/error_text: `delete_transaction_failed: \$\{orsak\}`/)
    expect(block, 'orsaken hämtas inte ur resetError').toContain('resetError?.message')
    // Kapad, så en lång CONTEXT-stack inte sväller raden.
    expect(block, 'orsaken kapas inte').toMatch(/\.slice\(0, \d+\)/)
    // Och den platta strängen får inte stå kvar som ENDA innehåll.
    expect(block, "den platta koden står kvar utan orsak").not.toMatch(/error_text: 'delete_transaction_failed'/)
  })
})

test.describe('Hannas underlag är härlett, inte handskrivet', () => {
  const seedare = read(SEEDARE)

  test('seedaren kör den RIKTIGA LTV-motorn i stället för att skriva fälten själv', () => {
    // last_job_date, lifetime_value, job_count m.fl. är HÄRLEDDA fält. Skrivna
    // för hand hade demot glidit isär från produkten så fort beräkningen
    // ändrades — och Hannas grind läser just last_job_date.
    expect(seedare).toContain("from '@/lib/customer-ltv'")
    expect(seedare).toContain('calculateCustomerLTV(businessId)')
    expect(seedare, 'seedaren skriver last_job_date för hand').not.toContain('last_job_date:')
    expect(seedare, 'seedaren skriver lifetime_value för hand').not.toContain('lifetime_value:')
  })

  test('BRF-fakturan passerar VIP-tröskeln OCH är äldre än tystnadsgränsen', () => {
    // Två trösklar måste hållas samtidigt, annars uteblir kortet tyst:
    // lib/customer-ltv.ts kräver lifetime_value >= 50 000 kr, och
    // HANNA_OUTBOUND_QUIET_DAYS (lib/customers/quiet-customer.ts) kräver att
    // senaste jobbet är minst 180 dagar gammalt.
    const block = seedare.slice(seedare.indexOf('7a-bis'), seedare.indexOf('// 7b.'))
    expect(block, 'hittade inte BRF-fakturans block').toBeTruthy()

    const subtotal = Number(/const brfSubtotal = (\d+)/.exec(block)?.[1])
    expect(subtotal, 'hittade inte beloppet').toBeGreaterThan(0)
    const totalMedMoms = subtotal * 1.25
    const vipTroskel = Number(/lifetimeValue >= (\d+)/.exec(read('lib/customer-ltv.ts'))?.[1])
    expect(vipTroskel, 'hittade inte VIP-tröskeln i LTV-motorn').toBeGreaterThan(0)
    expect(totalMedMoms, `${totalMedMoms} kr når inte VIP-tröskeln ${vipTroskel} kr`)
      .toBeGreaterThanOrEqual(vipTroskel)

    // LTV-motorn tar last_job_date ur invoice_date (inte paid_at) — se
    // lib/customer-ltv.ts. Det är den siffran som måste vara gammal nog.
    const dagar = Number(/invoice_date: dateOnly\((-\d+)\)/.exec(block)?.[1])
    expect(dagar, 'hittade inte fakturadatumet').toBeLessThan(0)
    expect(Math.abs(dagar), `${Math.abs(dagar)} dagar räcker inte till 180`).toBeGreaterThan(180)

    // Och fakturan måste vara BETALD — LTV-motorn räknar bara betalda.
    expect(block).toMatch(/status: 'paid'/)
  })

  test('reaktiveringskortet är idempotent över upprepade resetter', () => {
    // Invarianten i tests/demo-seedning-tackning.spec.ts: allt som seedas
    // raderas av RPC:n ELLER är bevisat idempotent. v3_automation_logs står
    // inte i RPC:ns manifest, så dedupmarkören måste städas här — annars
    // skapas kortet en gång och uteblir sedan tyst i 60 dagar.
    const rpc = read('sql/v158_demo_reset_v3.sql')
    expect(rpc, 'RPC:n raderar nu v3_automation_logs — då är städningen nedan onödig')
      .not.toContain('DELETE FROM public.v3_automation_logs')

    const stad = seedare.indexOf("from('v3_automation_logs')")
    expect(stad, 'seedaren städar inte LTV-dedupen').toBeGreaterThan(-1)
    const block = seedare.slice(stad, stad + 300)
    expect(block).toContain('.delete()')
    // Avgränsad: bara demokontot, bara den regel seedningen själv skapar.
    expect(block).toContain("eq('business_id', businessId)")
    expect(block).toContain("eq('rule_name', 'customer_lifetime_reactivation')")
    // Och städningen måste ligga FÖRE motorn, annars raderar den sitt eget kort.
    expect(stad, 'städningen ligger efter LTV-körningen')
      .toBeLessThan(seedare.indexOf('calculateCustomerLTV(businessId)'))
  })
})
