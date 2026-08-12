import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { svDateStr } from '@/lib/dates'
import { currentWeekMonday } from '@/lib/capacity/week-capacity'
import { genereraMandagskort, insertMandagskort } from '@/lib/jarvis/monday-brief'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/morning-brief
 * Genererar morning brief för alla aktiva businesses.
 * Körs kl 06:00 UTC (08:00 svensk tid) via vercel.json cron.
 *
 * Bär även Måndagskortet (Måndagsmötet etapp 1, 2026-08-13) — ingen egen
 * vercel.json-rad (Hobby-planens gräns för antal/frekvens crons, se
 * CLAUDE.md), utan ett extra, isolerat steg på DEN HÄR redan dagliga cronen.
 * `runMondayBrief` no-opar alla dagar utom måndag och kan ALDRIG fälla
 * morgonbriefen ovan — hela blocket + varje företag har sin egen try/catch,
 * exakt som per-företags-loopen i app/api/cron/monthly-review/route.ts.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

  const res = await fetch(`${appUrl}/api/morning-brief`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
  })

  const result = await res.json()
  const mondayBrief = await runMondayBrief()

  return NextResponse.json({ ...result, monday_brief: mondayBrief })
}

interface MondayBriefRunResult {
  ran: boolean
  processed?: number
  created?: number
  duplicates?: number
  errors?: number
}

/**
 * Måndagskortet — genereras bara på måndagar (svensk lokaltid). Fail-safe:
 * ett fel var som helst i det här blocket loggas och sväljs, morgonbriefens
 * eget svar ovan är redan klart och opåverkat.
 */
async function runMondayBrief(): Promise<MondayBriefRunResult> {
  try {
    // "Är det måndag idag?" — återanvänder currentWeekMonday() (lib/capacity/
    // week-capacity.ts) i stället för en egen veckodags-uträkning: idag ÄR
    // måndag exakt när idag = veckans egen måndag.
    if (svDateStr() !== currentWeekMonday()) return { ran: false }

    const supabase = getServerSupabase()
    const { data: businesses, error } = await supabase
      .from('business_config')
      .select('business_id')
      .eq('subscription_status', 'active')
    if (error) throw new Error(error.message)

    let created = 0
    let duplicates = 0
    let errors = 0
    for (const biz of businesses || []) {
      try {
        const kort = await genereraMandagskort(supabase, biz.business_id)
        if (!kort) continue
        const status = await insertMandagskort(supabase, kort)
        if (status === 'inserted') created++
        else duplicates++
      } catch (err) {
        errors++
        console.error('[cron/morning-brief] Måndagskortet misslyckades för', biz.business_id, err)
      }
    }
    return { ran: true, processed: (businesses || []).length, created, duplicates, errors }
  } catch (err) {
    console.error('[cron/morning-brief] Måndagskortet-blocket misslyckades helt (fail-safe, morgonbriefen opåverkad):', err)
    return { ran: false }
  }
}
