import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { isAdmin, getAdminSupabase } from '@/lib/admin-auth'
import {
  writeBillingUpdate,
  laesAbonnemangsperiod,
  STRIPE_STATUS_MAP,
} from '@/lib/billing/write-billing-update'

// force-dynamic: isAdmin läser sessionen via cookies() — utan den kan svaret
// cachas statiskt och serveras till fel anropare (CLAUDE.md, kända fallgropar).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/billing-resync — läs om prenumerationsstatus från Stripe.
 *
 * ═══ VARFÖR DEN FINNS ═══
 *
 * Kontots faktureringsfält skrivs bara av webhookar. Missas en webhook —
 * nedtid, en signatur som inte gick igenom, ett fel i en gren — driver
 * databasen isär från Stripe, och ingenting upptäcker det. Rutten är vägen
 * tillbaka: Stripe är sanningen, den här läser om och skriver via exakt
 * samma väg som webhooken (writeBillingUpdate), aldrig en egen variant.
 *
 * Den skrevs för backfyllnaden efter periodbuggen (se laesAbonnemangsperiod:
 * current_period_* lästes från prenumerationsroten, där de inte finns i
 * stripe v20, så billing_period_start/end var null för alla konton). Men den
 * är inte en engångsrutt — driften behöver den.
 *
 * ═══ GRÄNSER ═══
 *
 * Adminbehörighet krävs. Utan `business_id` sveps alla konton med en
 * stripe_subscription_id. Grundarstämpeln rörs ALDRIG härifrån: den sätts
 * vid köptillfället och får inte kunna återuppstå vid en omläsning.
 */
export async function POST(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) {
    return NextResponse.json({ error: 'Endast administratör' }, { status: 403 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Betalsystemet är inte konfigurerat' }, { status: 500 })
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-01-28.clover' as any,
  })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const enbartFöretag = typeof body?.business_id === 'string' ? body.business_id : null

  const supabase = getAdminSupabase()
  let fråga = supabase
    .from('business_config')
    .select('business_id, business_name, stripe_subscription_id, billing_period_end')
    .not('stripe_subscription_id', 'is', null)
  if (enbartFöretag) fråga = fråga.eq('business_id', enbartFöretag)

  const { data: konton, error } = await fråga
  if (error) {
    console.error('[billing-resync] kunde inte läsa konton:', error.message)
    return NextResponse.json({ error: 'Kunde inte läsa kontona' }, { status: 500 })
  }

  const resultat: Array<Record<string, unknown>> = []

  for (const konto of konton || []) {
    const rad: Record<string, unknown> = {
      business_id: konto.business_id,
      business_name: konto.business_name,
      period_end_innan: konto.billing_period_end ?? null,
    }
    try {
      const subscription = await stripe.subscriptions.retrieve(konto.stripe_subscription_id as string)
      const period = laesAbonnemangsperiod(subscription)
      const critical: Record<string, any> = {
        subscription_status: STRIPE_STATUS_MAP[subscription.status] || subscription.status,
        stripe_subscription_id: subscription.id,
      }
      // Grundarstämpeln skickas medvetet INTE med — se filhuvudet.
      await writeBillingUpdate(supabase, konto.business_id as string, critical, period)
      rad.status = critical.subscription_status
      rad.period_end_efter = period?.end ?? null
      rad.ok = true
    } catch (err: any) {
      // En trasig prenumeration får inte stoppa svepet över de övriga.
      console.error('[billing-resync] misslyckades för', konto.business_id, err?.message || err)
      rad.ok = false
      rad.fel = err?.code === 'resource_missing'
        ? 'Prenumerationen finns inte i Stripe'
        : (err?.message || 'okänt fel')
    }
    resultat.push(rad)
  }

  return NextResponse.json({
    ok: true,
    antal: resultat.length,
    lyckades: resultat.filter(r => r.ok).length,
    konton: resultat,
  })
}
