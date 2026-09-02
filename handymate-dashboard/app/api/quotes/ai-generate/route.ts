import { checkFuelGate } from '@/lib/costs/fuel'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkAiApiRateLimit } from '@/lib/auth'
import { generateQuoteFromInput, getAveragePrice, analyzeJobImage } from '@/lib/ai-quote-generator'
import { buildQuoteGenerationContext } from '@/lib/quotes/quote-generation-context'
import { QuoteContextError } from '@/lib/quotes/job-type-generation'
import { getServerSupabase } from '@/lib/supabase'
import { describeBranches, resolveBusinessBranch } from '@/lib/branch'

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = checkAiApiRateLimit(business.business_id)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    const fuel = await checkFuelGate(getServerSupabase(), business.business_id)
    if (!fuel.allowed) {
      return NextResponse.json({ error: 'Bränslet är slut eller kunde inte verifieras', code: fuel.reason }, { status: 402 })
    }

    // jobType/job_type: valfritt fält. Sedan Fas 1.6 (offert-omtaget,
    // 2026-08-31) skickar QuoteBuilder.tsx `jobType` från den kopplade
    // dealens job_type på alla tre AI-generate-anropen (foto/text/
    // snabbutkast) — tas ändå emot i båda stavningarna, dels för bakåt-
    // kompatibilitet, dels för framtida anropare. Vid kallstart (ingen
    // deal) skickas fältet inte alls.
    // Utan det hämtas inga project_lesson-lärdomar (sanningsprincipen,
    // lib/ai-quote-generator.ts) — hellre inga lärdomar än fel jobbtyps lärdomar.
    const { imageBase64, images, voiceTranscript, textDescription, customerId, jobType, job_type, templateId, template_id } = await request.json()

    // Stöd både images[] (nytt) och imageBase64 (bakåtkompatibilitet)
    const allImages: string[] = images?.length ? images : imageBase64 ? [imageBase64] : []
    const primaryImage = allImages[0] || undefined

    if (!primaryImage && !voiceTranscript && !textDescription) {
      return NextResponse.json({ error: 'Ange bild, röst eller text' }, { status: 400 })
    }

    // Get business pricing, price list and templates in parallel
    const supabase = getServerSupabase()
    // Branschförståelse steg 1: svensk branschtext ur `branch` via lib/branch
    // (tidigare en gissad Bygg-fallback ur den föråldrade industry-kolumnen).
    const branch = describeBranches(resolveBusinessBranch(business))

    // Fas 3 (offert-omtaget, 2026-08-31): prislista + mallar + kundprislista
    // hämtas nu via EN delad helper (lib/quotes/quote-generation-context.ts)
    // — samma urval som Matte-chattens create_quote_draft-verktyg och
    // bakgrundsförslaget (lib/quotes/suggest-quote-draft.ts) använder, så de
    // tre vägarna in i generateQuoteFromInput aldrig kan glida isär om vilka
    // artiklar/mallar/kundpriser som "finns".
    const { priceList: priceListData, templates: templatesData, customerPriceList, jobTypeContext } =
      await buildQuoteGenerationContext(supabase, business.business_id, customerId, {
        jobType: jobType ?? job_type, templateId: templateId ?? template_id,
      })

    const configuredHourlyRate = Number(business.pricing_settings?.hourly_rate || business.default_hourly_rate)
    const hourlyRate = Number.isFinite(configuredHourlyRate) && configuredHourlyRate > 0
      ? configuredHourlyRate
      : null

    // Om flera bilder: analysera extra bilder och kombinera med textDescription
    let combinedText = textDescription || ''
    if (allImages.length > 1) {
      try {
        const extraAnalyses = await Promise.all(
          allImages.slice(1, 5).map(img => analyzeJobImage(img, branch, business.business_id))
        )
        const extraDesc = extraAnalyses
          .map((a, i) => `Foto ${i + 2}: ${a.description}`)
          .join('\n')
        combinedText = [textDescription, extraDesc].filter(Boolean).join('\n\n')
      } catch (err: any) {
        console.error('[ai-generate] Extra image analysis failed:', err.message)
      }
    }

    const quote = await generateQuoteFromInput({
      businessId: business.business_id,
      branch,
      hourlyRate,
      imageBase64: primaryImage,
      voiceTranscript,
      textDescription: combinedText || undefined,
      customerId,
      priceList: priceListData,
      templates: templatesData,
      customerPriceList,
      jobTypeContext,
      jobType: jobType || job_type || undefined,
    })

    // Get price comparison
    const description = [textDescription, voiceTranscript].filter(Boolean).join(' ')
    const priceComparison = description
      ? await getAveragePrice(business.business_id, description)
      : { average: 0, min: 0, max: 0, count: 0 }

    // Build price warning if applicable
    const priceWarning = quote.priceListEmpty
      ? {
          warning: true,
          message: 'Din produktbank är tom. Lägg till dina priser under Inställningar → Produkter för att få konsekventa AI-offerter.',
          link: '/dashboard/settings/products',
        }
      : quote.missingPriceCount > 0
        ? {
            warning: true,
            message: `${quote.missingPriceCount} rad${quote.missingPriceCount > 1 ? 'er' : ''} saknar pris från din produktbank. Fyll i priserna manuellt eller lägg till dem under Inställningar → Produkter.`,
            link: '/dashboard/settings/products',
          }
        : null

    return NextResponse.json({
      success: true,
      quote,
      priceComparison,
      priceWarning,
      photoCount: allImages.length,
    })
  } catch (error: any) {
    console.error('AI quote generation error:', error)
    if (error instanceof QuoteContextError) return NextResponse.json({ error: error.message, templateChoices: error.choices }, { status: error.status })
    return NextResponse.json({ error: error.message || 'Generering misslyckades' }, { status: 500 })
  }
}
