import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { arUtgangen, prefillFranCase, type SalesCasePayload } from '@/lib/sales/sales-case'

// force-dynamic: svaret beror på vilken token som frågas och på om raden
// gått ut. En statisk cache här hade kunnat servera ETT företags genomgång
// till nästa besökare (CLAUDE.md, svepet 2026-08-22) — det värsta utfallet
// den här tabellen kan ge.
export const dynamic = 'force-dynamic'

/**
 * GET /api/sales-case/[token]
 *
 * Läser en säljgenomgång. PUBLIK — token är legitimationen, precis som i
 * kundportalen (lib/portal-link.ts). Token är en uuid (122 bitar entropi),
 * aldrig ett löpnummer, och raden går ut efter 90 dagar.
 *
 * Två konsumenter:
 *   1. Den personliga case-sidan kunden fick länken till.
 *   2. Onboardingen, via ?case=<token> — den läser `prefill` och fyller i
 *      de fält kunden annars hade skrivit igen.
 *
 * SVARET LÄCKER ALDRIG SÄLJSIDAN: created_by_business_id,
 * created_by_user_id och id stannar på servern. En publik token ska inte
 * kunna berätta vem hos oss som byggde caset eller vilka andra rader som
 * finns.
 *
 * En utgången eller okänd token ger 404 — samma svar för båda, så en
 * gissande anropare inte kan skilja "fanns men gick ut" från "fanns
 * aldrig".
 */
export async function GET(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  try {
    const token = (params?.token || '').trim()
    if (!token) return NextResponse.json({ error: 'Genomgången finns inte.' }, { status: 404 })

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('sales_case')
      .select('token, business_name, org_number, prospect_name, prospect_email, payload, expires_at, opened_at, consumed_at')
      .eq('token', token)
      .maybeSingle()

    if (error) {
      // Ett genuint DB-fel loggas men svarar 404 utåt — samma hållning som
      // getCustomerFromPortalToken: token-URL:er är publika, och en 500
      // skulle inte skvallra mer än en 404, men felet ska synas i loggen
      // i stället för att tyst ge en tom sida.
      console.error('[sales-case] uppslag misslyckades:', error.message)
      return NextResponse.json({ error: 'Genomgången finns inte.' }, { status: 404 })
    }
    if (!data) return NextResponse.json({ error: 'Genomgången finns inte.' }, { status: 404 })

    if (arUtgangen(data.expires_at as string | null, Date.now())) {
      return NextResponse.json({ error: 'Genomgången finns inte.' }, { status: 404 })
    }

    // Första öppningen stämplas — en säljsignal, inte ett villkor. Ett
    // misslyckat stämplande får aldrig hindra kunden från att se sin
    // genomgång, så det är best-effort och väntas inte in med hårdhet.
    if (!data.opened_at) {
      const { error: stampErr } = await supabase
        .from('sales_case')
        .update({ opened_at: new Date().toISOString() })
        .eq('token', token)
        .is('opened_at', null)
      if (stampErr) console.error('[sales-case] kunde inte stämpla opened_at:', stampErr.message)
    }

    const payload = (data.payload ?? {}) as SalesCasePayload
    const { form, extras } = prefillFranCase(token, payload)

    return NextResponse.json({
      ok: true,
      token,
      companyName: data.business_name,
      orgNumber: data.org_number,
      prospect: { name: data.prospect_name, email: data.prospect_email },
      payload,
      // Färdigmappat för onboardingen, så klienten aldrig behöver känna
      // säljsidans payload-form. Se lib/sales/sales-case.ts.
      prefill: form,
      extras,
      redanAnvand: Boolean(data.consumed_at),
    })
  } catch (err: any) {
    console.error('[sales-case] oväntat fel:', err?.message || err)
    return NextResponse.json({ error: 'Genomgången finns inte.' }, { status: 404 })
  }
}
