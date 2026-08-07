import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { sendApprovalPush } from '@/lib/notifications/approval-push'
import { checkCostGuards } from '@/lib/agents/shared/cost-guard'
import { generateStorefrontContent } from '@/lib/storefront/generate-content'
import { getAppBaseUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

// Tak per körning — förhindrar en LLM-storm om många businesses kvalificerar
// samma dag (t.ex. efter en onboarding-våg). Resterande tas nästa dygn.
const MAX_CARDS_PER_RUN = 10

/**
 * GET /api/cron/hemsida-forslag
 *
 * Körs dagligen. Se tasks/hemsida-forgrening-spec.md (förgreningen) för
 * bakgrund — denna cron är "EJ i denna insats"-punkten som blev nästa
 * insats: nudge-kortet som frågar hantverkaren om hen vill publicera
 * microsajten (utan att de behöver leta upp /dashboard/website själva).
 *
 * Urval (business_config):
 * - website_url IS NULL (egen sajt → widget-vägen, ALDRIG detta kort)
 * - onboarding_completed_at satt (klar med onboardingen)
 * - is_active (skippar döda/testkonton)
 *
 * Per business, i tur och ordning:
 * 1. Kill-switch + dygns-cost-cap via checkCostGuards (delad helper,
 *    samma som agent-observations-cronarna) — vi kan behöva anropa
 *    Claude för att generera innehåll, så guarden gäller alltid.
 * 2. Dedup: finns redan en pending_approvals-rad av typen
 *    'publish_microsite' för businessen (OAVSETT status — pending,
 *    godkänd, avvisad eller utgången)? Då frågar vi ALDRIG igen.
 * 3. Redan publicerad storefront? Skippa (inget att föreslå).
 * 4. Finns redan ett OGENERERAT-KLART utkast (hero_headline +
 *    hero_description satta, t.ex. från en tidigare körning där
 *    kort-inserten failade, eller manuellt påbörjat via
 *    /dashboard/website utan publicering)? Återanvänd det INNAN vi
 *    kör en ny (kostsam) generering — annars skulle vi kunna skriva
 *    över hantverkarens egna redigeringar.
 * 5. Annars: generera via delad kärna (lib/storefront/generate-content.ts),
 *    is_published:false. Misslyckas genereringen → inget kort, logga,
 *    fortsätt till nästa business.
 * 6. Skapa 'publish_microsite'-kortet med en förhandsvisning
 *    (rubrik + kort beskrivning) så hantverkaren godkänner något hen
 *    faktiskt sett — inte en svart låda.
 *
 * Exekvering vid godkännande: 'publish_microsite'-caset i
 * app/api/approvals/[id]/route.ts sätter is_published=true,
 * business-scopat. Vid avvisning: inget händer, utkastet ligger kvar.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const appUrl = getAppBaseUrl()

  const { data: businesses, error: bizError } = await supabase
    .from('business_config')
    .select('business_id, business_name, agents_globally_paused, agent_cost_cap_usd_daily')
    .eq('is_active', true)
    .is('website_url', null)
    .not('onboarding_completed_at', 'is', null)

  if (bizError) {
    console.error('[cron/hemsida-forslag] business_config error:', bizError)
    return NextResponse.json(
      { error: bizError.message, code: bizError.code, stage: 'business_config' },
      { status: 500 },
    )
  }

  let approvalsCreated = 0
  const skipped = {
    cost_guard: 0,
    already_asked: 0,
    already_published: 0,
    generation_failed: 0,
    cap_reached: 0,
  }
  const errors: { business_id: string; message: string }[] = []

  for (const biz of businesses || []) {
    if (approvalsCreated >= MAX_CARDS_PER_RUN) {
      skipped.cap_reached++
      continue
    }

    try {
      // ── 1. Kill-switch + cost-cap ────────────────────────────────
      const guardSkip = await checkCostGuards(supabase, biz, 'hanna')
      if (guardSkip) {
        skipped.cost_guard++
        continue
      }

      // ── 2. Dedup — frågat en gång, oavsett utfall ────────────────
      const { data: existingCard } = await supabase
        .from('pending_approvals')
        .select('id')
        .eq('business_id', biz.business_id)
        .eq('approval_type', 'publish_microsite')
        .limit(1)

      if ((existingCard || []).length > 0) {
        skipped.already_asked++
        continue
      }

      // ── 3. Redan publicerad? ──────────────────────────────────────
      const { data: storefront } = await supabase
        .from('storefront')
        .select('id, slug, is_published, hero_headline, hero_description')
        .eq('business_id', biz.business_id)
        .maybeSingle()

      if (storefront?.is_published) {
        skipped.already_published++
        continue
      }

      // ── 4/5. Återanvänd befintligt utkast eller generera nytt ────
      let storefrontId: string
      let slug: string
      let headline: string
      let description: string

      if (storefront?.hero_headline && storefront?.hero_description && storefront.slug) {
        storefrontId = storefront.id
        slug = storefront.slug
        headline = storefront.hero_headline
        description = storefront.hero_description
      } else {
        const result = await generateStorefrontContent(supabase, biz.business_id, { isPublished: false })
        if (!result.ok) {
          console.warn('[cron/hemsida-forslag] generation failed:', {
            business_id: biz.business_id, error: result.error,
          })
          skipped.generation_failed++
          continue
        }
        storefrontId = result.id
        slug = result.slug
        headline = result.headline
        description = result.description
      }

      // ── 6. Bygg + skapa kortet ────────────────────────────────────
      const publicUrl = `${appUrl}/site/${slug}`
      const businessName = (biz.business_name || '').trim()
      const title = businessName ? `🌐 Förslag på hemsida — ${businessName}` : '🌐 Förslag på hemsida'
      const description_ = 'Hanna har byggt ett förslag på hemsida utifrån din företagsprofil. '
        + 'Godkänn för att publicera den — sidan blir då synlig för alla på internet.'

      const payload = {
        routed_agent: 'hanna',
        storefront_id: storefrontId,
        slug,
        preview: { headline, description },
        public_url: publicUrl,
      }

      const expiresAt = new Date(Date.now() + 14 * 86400000)

      const { error: insertError } = await supabase
        .from('pending_approvals')
        .insert({
          business_id: biz.business_id,
          approval_type: 'publish_microsite',
          title,
          description: description_,
          payload,
          status: 'pending',
          risk_level: 'medium',
          expires_at: expiresAt.toISOString(),
        })

      if (insertError) {
        errors.push({ business_id: biz.business_id, message: insertError.message })
        continue
      }

      approvalsCreated++

      void sendApprovalPush({
        business_id: biz.business_id,
        approval_type: 'publish_microsite',
        payload,
      })
    } catch (err) {
      console.error('[cron/hemsida-forslag] business error:', {
        business_id: biz.business_id,
        error: err instanceof Error ? err.message : String(err),
      })
      errors.push({
        business_id: biz.business_id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({
    ok: true,
    businesses_scanned: businesses?.length || 0,
    approvals_created: approvalsCreated,
    skipped,
    errors: errors.slice(0, 20),
    total_errors: errors.length,
  })
}
