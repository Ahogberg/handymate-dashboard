import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getVardekvitto } from '@/lib/value/vardekvitto'
import { getWeeklyValue } from '@/lib/weekly-value'
import { byggAgarrapport, type AgarrapportKostnad } from '@/lib/value/agarrapport'

export const dynamic = 'force-dynamic'

/**
 * GET /api/value/agarrapport — månadens värde i tre sanningsnivåer (A1).
 *
 * BARA LÄSNING och bara INNEVARANDE månad (natt 1): det uppskattade
 * blocket räknas ur ett rullande fönster bakåt från nu, och det fönstret
 * kan bara approximera den månad vi står i. Historiska månader får vänta
 * på lagrade poster (natt 2).
 *
 * Vilande (pengar på bordet) läses INTE här — ytan bär redan den datan
 * ur /api/dashboard/pengar; att läsa om åtta källor vore en andra sanning.
 *
 * Rollgrind som observations/pengar/kvitto: ägare/admin
 * (tests/permission-contract.spec.ts).
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const nu = new Date()
    const period = `${nu.getUTCFullYear()}-${String(nu.getUTCMonth() + 1).padStart(2, '0')}`

    const kvitto = await getVardekvitto(supabase, business.business_id, period)
    if (!kvitto) {
      return NextResponse.json({ error: 'Kunde inte räkna fram kvittot' }, { status: 500 })
    }

    // Uppskattat: rullande fönster = dagar in i månaden (approximerar
    // kalendermånaden; dag 1 ger minst en dags fönster).
    const dagarInIManaden = Math.max(1, nu.getUTCDate())
    let uppskattat = null
    try {
      const veckovarde = await getWeeklyValue(supabase, business.business_id, dagarInIManaden)
      uppskattat = {
        adminTimmar: veckovarde.time_hours,
        samtalFangade: veckovarde.calls_captured,
        automatiskaAtgarder: veckovarde.autonomous_count,
      }
    } catch (err) {
      // null = datat saknas — blocket utelämnas hellre än visar mätta nollor.
      console.error('[agarrapport] uppskattat-blocket kunde inte räknas (utelämnas):', err)
    }

    // Kostnaden — BARA vid säker källa: aktiv prenumeration med
    // Stripe-koppling (B7-bevisade fält) + pris ur billing_plan.
    // Allt annat (testkonton, co-founder-comp, driftade cachefält) ger
    // null och därmed ingen rad (lärdomen 2026-05-30).
    let kostnad: AgarrapportKostnad | null = null
    try {
      const { data: cfg } = await supabase
        .from('business_config')
        .select('subscription_plan, subscription_status, stripe_subscription_id')
        .eq('business_id', business.business_id)
        .maybeSingle()
      if (cfg?.subscription_status === 'active' && cfg.stripe_subscription_id && cfg.subscription_plan) {
        const { data: plan } = await supabase
          .from('billing_plan')
          .select('name, price_sek')
          .eq('plan_id', cfg.subscription_plan)
          .maybeSingle()
        if (plan && Number(plan.price_sek) > 0) {
          kostnad = { kr: Number(plan.price_sek), planNamn: plan.name || null }
        }
      }
    } catch (err) {
      console.error('[agarrapport] kostnadskällan kunde inte läsas (raden utelämnas):', err)
    }

    return NextResponse.json({
      rapport: byggAgarrapport({ kvitto, uppskattat, vilandeKr: null, kostnad }),
    })
  } catch (err: any) {
    console.error('[value/agarrapport] oväntat fel:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
