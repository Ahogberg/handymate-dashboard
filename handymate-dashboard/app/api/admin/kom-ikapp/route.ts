import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { getServerSupabase } from '@/lib/supabase'
import { normalizeTemplateBranch } from '@/lib/quote-template-defaults'
import { seedQuoteTemplates } from '@/lib/seed-defaults'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/kom-ikapp
 *
 * Kör seedningen igen för BEFINTLIGA företag, så att de får det som lagts
 * till i seedaren efter att de onboardade.
 *
 * ═══ VARFÖR DEN HÄR VÄGEN BEHÖVS ═══
 *
 * Mätt 2026-09-18, efter Andreas klickprov: 26 av 29 företag saknade helt
 * jobbtyper, och 17 av 34 jobbtyper hos riktiga kunder hade inget upplägg —
 * ett tryck på dem ledde ingenstans.
 *
 * Ingen av de sakerna berodde på en tabbe. Mekanismerna FANNS:
 *   · ensureOnboardingJobTypes skapar jobbtyperna
 *   · JOBBTYP_FOR_MALL kopplar seedad mall → jobbtyp (2026-09-17)
 *   · jobTypeStarters ger varje jobbtyp utan upplägg branschens
 *     generella rader (2026-09-17)
 *
 * De bor bara alla inuti seedQuoteTemplates, och seedQuoteTemplates körs
 * BARA vid onboardingens finalize. Ett företag som onboardade i juli fick
 * därför aldrig något som skrevs i september. Varje förbättring i seedningen
 * nådde bara framtida kunder, och de befintliga halkade tyst efter — en
 * mekanism i taget.
 *
 * Det är den bristen den här rutten stänger: en väg som tar ett BEFINTLIGT
 * företag till dagens läge. Nästa gång seedaren blir bättre räcker det att
 * köra den här i stället för att någon ska minnas en engångsmigrering.
 *
 * ═══ VARFÖR INTE SQL ═══
 *
 * Samma skäl som admin/backfill-products skriver i sin header: mallarna,
 * namnmappningen och startraderna ägs av lib/quote-template-defaults.ts och
 * lib/onboarding/template-articles.ts. En SQL-kopia hade blivit en andra
 * implementation som driftar isär från den första. Rutten anropar den
 * RIKTIGA seedaren — samma kod som onboardingen kör.
 *
 * ═══ SÄKERHET OCH FÖRSIKTIGHET ═══
 *
 *   · Kräver admin (isAdmin — @handymate.se eller ADMIN_EMAILS).
 *   · seedQuoteTemplates är idempotent: en mall vars namn redan finns hoppas
 *     över, ett satt job_type_slug skrivs aldrig över, ingen jobbtyp döps om
 *     eller avarkiveras.
 *   · `dryRun` (default true) skriver ingenting.
 *
 * Body: { dryRun?: boolean, businessId?: string }
 *   businessId → kör bara det kontot. Utelämnat → alla konton.
 *
 * OM TORRKÖRNINGEN: den visar LÄGET NU — företag utan jobbtyper, och
 * jobbtyper utan upplägg. Den simulerar inte seedaren rad för rad, för det
 * hade varit precis den andra implementationen som stycket ovan avråder
 * från. Den svarar på "vem ligger efter", inte "exakt vilka rader skrivs".
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await isAdmin(request)
    if (!admin.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun !== false
    const onlyBusinessId: string | undefined = body.businessId

    const supabase = getServerSupabase()

    let bizQuery = supabase.from('business_config').select('business_id, business_name, branch, industry')
    if (onlyBusinessId) bizQuery = bizQuery.eq('business_id', onlyBusinessId)
    const { data: businesses, error: bizErr } = await bizQuery
    if (bizErr) throw bizErr

    const resultat: Array<{
      business_id: string
      business_name: string
      branch: string
      jobbtyper: number
      jobbtyper_utan_upplagg: string[]
      nya_upplagg?: number
      omkopplade?: number
      hoppade_over?: string
    }> = []

    for (const biz of businesses || []) {
      const branch = normalizeTemplateBranch(biz.branch || biz.industry)

      // Läget före: vilka jobbtyper leder ingenstans i dag? Det är precis de
      // jobTypeStarters fyller, så listan är både rapport och förklaring.
      const [{ data: jobbtyper, error: jobbFel }, { data: upplagg, error: uppFel }] = await Promise.all([
        supabase.from('job_types').select('slug, name').eq('business_id', biz.business_id).eq('is_active', true),
        supabase.from('quote_templates').select('job_type_slug').eq('business_id', biz.business_id),
      ])
      if (jobbFel || uppFel) {
        resultat.push({
          business_id: biz.business_id, business_name: biz.business_name, branch,
          jobbtyper: 0, jobbtyper_utan_upplagg: [],
          hoppade_over: `uppslag misslyckades: ${(jobbFel || uppFel)!.message}`,
        })
        continue
      }
      const medUpplagg = new Set((upplagg || []).map(r => r.job_type_slug).filter(Boolean))
      const tomma = (jobbtyper || []).filter(j => !medUpplagg.has(j.slug)).map(j => j.name)

      const rad = {
        business_id: biz.business_id,
        business_name: biz.business_name,
        branch,
        jobbtyper: (jobbtyper || []).length,
        jobbtyper_utan_upplagg: tomma,
      }

      if (dryRun) { resultat.push({ ...rad, hoppade_over: 'torrkörning' }); continue }

      try {
        const { inserted, relinked } = await seedQuoteTemplates(supabase, biz.business_id, branch)
        resultat.push({ ...rad, nya_upplagg: inserted.length, omkopplade: relinked })
      } catch (error) {
        // Ett konto som faller får aldrig stoppa resten — men det ska synas
        // i svaret, inte bara i en logg ingen läser.
        const text = error instanceof Error ? error.message : String(error)
        resultat.push({ ...rad, hoppade_over: `seedning misslyckades: ${text.slice(0, 200)}` })
      }
    }

    return NextResponse.json({
      success: true,
      dry_run: dryRun,
      foretag_kontrollerade: resultat.length,
      foretag_utan_jobbtyper: resultat.filter(r => r.jobbtyper === 0).length,
      jobbtyper_utan_upplagg: resultat.reduce((n, r) => n + r.jobbtyper_utan_upplagg.length, 0),
      nya_upplagg: resultat.reduce((n, r) => n + (r.nya_upplagg || 0), 0),
      omkopplade: resultat.reduce((n, r) => n + (r.omkopplade || 0), 0),
      misslyckade: resultat.filter(r => r.hoppade_over?.startsWith('seedning misslyckades')).length,
      resultat,
    })
  } catch (error: unknown) {
    const text = error instanceof Error ? error.message : 'Kom-ikapp misslyckades'
    console.error('[kom-ikapp] Error:', error)
    return NextResponse.json({ error: text }, { status: 500 })
  }
}
