import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { harledIntervall } from '@/lib/billing/write-billing-update'
import { getCancellationFacts, getPlanCommercialFacts, type PlanType } from '@/lib/feature-gates'
import { arTestNamn } from '@/lib/testdata'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Påminnelse före årsförnyelse (beslut Andreas 2026-09-18).
 *
 * ═══ VARFÖR ═══
 *
 * Ingenting i koden sätter `cancel_at_period_end`, så ett årsabonnemang
 * förnyas automatiskt för 59 950 kr. Det är avtalsenligt — villkorens §9
 * säger det rakt ut — men en tyst dragning av det beloppet upplevs som ett
 * övertramp ändå. Det som gör skillnaden är inte att förnyelsen sker, utan
 * att kunden visste om den i tid för att hinna välja.
 *
 * Bara ÅRSPLANER. En månadsförnyelse på 5 995 kr är den rytm kunden köpt.
 *
 * ═══ 30 DAGAR, EN GÅNG ═══
 *
 * Fönstret är dagen då `billing_period_end` ligger 30 dygn bort. Cronen går
 * en gång per dygn, så varje konto passerar fönstret exakt en dag. Utskicket
 * loggas ändå mot `billing_event` med en deterministisk `stripe_event_id`,
 * så en extra körning eller ett återförsök aldrig kan skicka två gånger:
 * kvittot är nyckeln, inte tajmingen.
 *
 * ═══ INTERVALLET HÄRLEDS ═══
 *
 * Faktureringsintervallet lagras inte på kontot; det finns bara i
 * checkout-sessionens metadata. `harledIntervall` läser periodens längd i
 * stället — entydigt för de två plantyper som finns.
 *
 * FÖRUTSÄTTNING: `billing_period_end` måste vara ifylld. Den var null för
 * alla konton fram till 2026-09-18 (se `laesAbonnemangsperiod`). Konton som
 * aldrig fått en webhook efter rättningen behöver
 * `POST /api/admin/billing-resync` först — utan datum kan cronen inte veta
 * när något förnyas, och hoppar över kontot i stället för att gissa.
 */

const PAMINNELSE_DYGN = 30

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const nu = new Date()
  // Fönstret är ett helt dygn: [30 dygn bort, 31 dygn bort). Cronen går en
  // gång per dygn, så varje konto hamnar i det exakt en gång.
  const från = new Date(nu.getTime() + PAMINNELSE_DYGN * 86_400_000)
  const till = new Date(nu.getTime() + (PAMINNELSE_DYGN + 1) * 86_400_000)

  const { data: konton, error } = await supabase
    .from('business_config')
    .select('business_id, business_name, contact_email, subscription_plan, subscription_status, billing_period_start, billing_period_end, is_demo_tenant')
    .eq('subscription_status', 'active')
    .not('billing_period_end', 'is', null)
    .gte('billing_period_end', från.toISOString())
    .lt('billing_period_end', till.toISOString())

  if (error) {
    console.error('[arsforyelse] kunde inte läsa konton:', error.message)
    return NextResponse.json({ error: 'Kunde inte läsa kontona' }, { status: 500 })
  }

  const utskick: Array<Record<string, unknown>> = []

  for (const konto of konton || []) {
    const period = { start: konto.billing_period_start, end: konto.billing_period_end }
    const intervall = harledIntervall(period)
    // Bara årsplaner, och bara riktiga konton.
    if (intervall !== 'yearly') continue
    if (konto.is_demo_tenant === true) continue
    if (arTestNamn(konto.business_name || '')) continue
    if (!konto.contact_email) {
      console.warn('[arsforyelse] saknar e-post, hoppar över:', konto.business_id)
      continue
    }

    const plan = (konto.subscription_plan || 'professional') as PlanType
    const fakta = getPlanCommercialFacts(plan)
    const belopp = fakta.yearlyPriceSek
    const datum = new Date(konto.billing_period_end as string)
    const datumText = datum.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })

    // Deterministisk nyckel → samma konto + samma förnyelsedatum kan bara
    // kvitteras en gång, oavsett hur många gånger cronen råkar gå.
    const kvittoNyckel = `arsforyelse_${konto.business_id}_${(konto.billing_period_end as string).slice(0, 10)}`

    const { data: redanSkickat } = await supabase
      .from('billing_event')
      .select('id')
      .eq('stripe_event_id', kvittoNyckel)
      .maybeSingle()
    if (redanSkickat) continue

    const uppsagning = getCancellationFacts('yearly')
    const html = `
      <p>Hej!</p>
      <p>Din årsplan <strong>${fakta.label}</strong> i Handymate förnyas den <strong>${datumText}</strong>.
      Då drar vi ${belopp ? belopp.toLocaleString('sv-SE') : ''} kr exkl. moms för nästa tolv månader,
      på samma kort som tidigare.</p>
      <p>Vill du fortsätta behöver du inte göra någonting.</p>
      <p>Vill du inte det säger du upp under <strong>${uppsagning.where}</strong> före den ${datumText}.
      Du har kvar tillgången till tjänsten hela den period du redan betalat.</p>
      <p>Har du frågor är det bara att svara på det här mejlet.</p>
      <p>— Handymate</p>
    `

    const resultat = await sendEmail({
      to: konto.contact_email as string,
      subject: `Din årsplan förnyas den ${datumText}`,
      html,
      businessId: konto.business_id as string,
      replyTo: 'hej@handymate.se',
      idempotencyKey: kvittoNyckel,
    })

    // Kvittot skrivs BARA när utskicket faktiskt accepterades. Skrivs det
    // ändå blir en misslyckad påminnelse permanent osänd.
    if (resultat.success) {
      await supabase.from('billing_event').insert({
        business_id: konto.business_id,
        event_type: 'yearly_renewal_reminder_sent',
        stripe_event_id: kvittoNyckel,
        data: { renewal_at: konto.billing_period_end, plan, amount_sek: belopp },
      })
    } else {
      console.error('[arsforyelse] utskick misslyckades:', konto.business_id, resultat.error)
    }

    utskick.push({ business_id: konto.business_id, skickat: resultat.success, fornyas: konto.billing_period_end })
  }

  return NextResponse.json({ ok: true, kontrollerade: (konton || []).length, utskick })
}
