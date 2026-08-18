import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { calculateQuoteTotals } from '@/lib/quote-calculations'
import { applyAnnualCap } from '@/lib/quotes/apply-annual-cap'
import { resolveReferencePerson } from '@/lib/quotes/resolve-reference-person'
import { lockedChanges, lockedChangeMessage } from '@/lib/quotes/lifecycle'
import { createQuote, resolveItemSplit } from '@/lib/quotes/create-quote'
import { signAttachmentList } from '@/lib/storage-signing'
import type { QuoteItem } from '@/lib/types/quote'

const ATTACHMENTS_BUCKET = 'customer-documents'

/**
 * Produktbank (v67): invariant-backstopp för arbete/material-spliten.
 * labor_amount + material_amount MÅSTE vara radens total (öres-invariant,
 * se lib/products/build-item-snapshot.ts). Vid drift: härled material_amount
 * = total − labor_amount, logga varning, blockera aldrig sparandet.
 * `??` genomgående — labor_amount 0 är GILTIGT (ren material), inte falsy.
 */
// Split-invarianten bor numera i den kanoniska byggaren — en kopia här hade
// varit två sanningar om samma regel.

/**
 * GET - Lista offerter för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const status = request.nextUrl.searchParams.get('status')
    const customerId = request.nextUrl.searchParams.get('customerId')
    const search = request.nextUrl.searchParams.get('search')
    const quoteId = request.nextUrl.searchParams.get('quoteId')

    // Single quote fetch
    if (quoteId) {
      const { data: quote, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('quote_id', quoteId)
        .eq('business_id', businessId)
        .single()

      if (error || !quote) {
        return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
      }

      // Fetch structured items from quote_items table
      const { data: quoteItems } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quoteId)
        .order('sort_order', { ascending: true })

      // Fetch customer separately
      let customer = null
      if (quote.customer_id) {
        const { data } = await supabase
          .from('customer')
          .select('customer_id, name, phone_number, email, address_line, personal_number, property_designation')
          .eq('customer_id', quote.customer_id)
          .single()
        customer = data
      }

      // Fetch sibling versions if this quote is part of a version family
      let versions: any[] = []
      const parentId = quote.parent_quote_id || quote.quote_id
      const { data: versionData } = await supabase
        .from('quotes')
        .select('quote_id, version_number, version_label, status, total, created_at')
        .or(`quote_id.eq.${parentId},parent_quote_id.eq.${parentId}`)
        .eq('business_id', businessId)
        .order('version_number', { ascending: true })
      versions = versionData || []

      // ETAPP 4 (offert-masterplan.md), punkt 5: "vad ändrades"-raden i
      // versionsväljaren jämför radantal mellan versioner — item_count per
      // sibling-version hämtas här (en extra fråga, bara när det faktiskt
      // finns fler versioner) så klienten kan diffa utan N separata anrop.
      if (versions.length > 1) {
        const versionIds = versions.map((v: any) => v.quote_id)
        const { data: itemRows } = await supabase
          .from('quote_items')
          .select('quote_id')
          .in('quote_id', versionIds)
        const counts: Record<string, number> = {}
        for (const row of itemRows || []) {
          counts[row.quote_id] = (counts[row.quote_id] || 0) + 1
        }
        versions = versions.map((v: any) => ({ ...v, item_count: counts[v.quote_id] || 0 }))
      }

      // ETAPP 4, punkt 3: verklig händelselogg (inte en hårdkodad 5-stegs-
      // timeline) — de faktiska tracking-events /api/quotes/track redan
      // loggar (öppningar/stängningar från kundens signeringssida).
      const { data: trackingEvents } = await supabase
        .from('quote_tracking_events')
        .select('event_type, session_id, duration_seconds, created_at')
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: true })
        .limit(50)

      // v151: quote.attachments[].url lagrar en storage-path (bucketen är
      // privat) — signera vid läsning, aldrig persistera den signerade
      // länken. `path` följer med så klienten kan spara path oförändrat.
      const signedAttachments = await signAttachmentList(
        supabase,
        ATTACHMENTS_BUCKET,
        Array.isArray(quote.attachments) ? quote.attachments : [],
        3600,
      )

      return NextResponse.json({
        quote: {
          ...quote,
          attachments: signedAttachments,
          quote_items: quoteItems || [],
          customer,
        },
        versions: versions.length > 1 ? versions : [],
        trackingEvents: trackingEvents || [],
      })
    }

    // List quotes
    let query = supabase
      .from('quotes')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    if (customerId) {
      query = query.eq('customer_id', customerId)
    }
    if (search) {
      query = query.ilike('title', `%${search}%`)
    }

    const { data: quotes, error } = await query
    if (error) throw error

    // Fetch customer data separately (no FK)
    const customerIds = Array.from(new Set((quotes || []).map((q: any) => q.customer_id).filter(Boolean)))
    const customerMap: Record<string, any> = {}
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customer')
        .select('customer_id, name, phone_number, email, address_line')
        .in('customer_id', customerIds)
      for (const c of (customers || [])) {
        customerMap[c.customer_id] = c
      }
    }

    const enrichedQuotes = (quotes || []).map((q: any) => ({
      ...q,
      customer: q.customer_id ? customerMap[q.customer_id] || null : null,
    }))

    return NextResponse.json({ quotes: enrichedQuotes })
  } catch (error: any) {
    console.error('Get quotes error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny offert
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver create_invoices (offerter leder till fakturor)
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const businessId = business.business_id

    // Duplicate from existing quote
    if (body.duplicate_from) {
      const { data: source, error: srcErr } = await supabase
        .from('quotes')
        .select('*')
        .eq('quote_id', body.duplicate_from)
        .eq('business_id', businessId)
        .single()

      if (srcErr || !source) {
        return NextResponse.json({ error: 'Source quote not found' }, { status: 404 })
      }

      // Version support: if create_version is true, link to parent and increment version
      const isVersion = body.create_version === true
      const parentQuoteId = isVersion ? (source.parent_quote_id || source.quote_id) : null
      let versionNumber = 1
      let versionLabel = body.version_label || null

      if (isVersion && parentQuoteId) {
        // Find highest version number in this family
        const { data: siblings } = await supabase
          .from('quotes')
          .select('version_number')
          .or(`quote_id.eq.${parentQuoteId},parent_quote_id.eq.${parentQuoteId}`)
          .eq('business_id', businessId)
          .order('version_number', { ascending: false })
          .limit(1)
        versionNumber = (siblings?.[0]?.version_number || 1) + 1
        if (!versionLabel) versionLabel = `Version ${versionNumber}`
      }

      // De källkopierade fälten. Invarianterna (id, NYTT nummer, NY sign_token,
      // datum) sätts av byggaren — kopian ärvde tidigare ingen token alls och
      // gick därför inte att dela förrän den skickades.
      const dupData: Record<string, any> = {
        // Version fields
        parent_quote_id: parentQuoteId,
        version_number: isVersion ? versionNumber : 1,
        version_label: isVersion ? versionLabel : null,
        items: source.items,
        labor_total: source.labor_total,
        material_total: source.material_total,
        subtotal: source.subtotal,
        discount_percent: source.discount_percent,
        discount_amount: source.discount_amount,
        vat_rate: source.vat_rate,
        vat_amount: source.vat_amount,
        total: source.total,
        rot_rut_type: source.rot_rut_type,
        rot_rut_eligible: source.rot_rut_eligible,
        rot_rut_deduction: source.rot_rut_deduction,
        customer_pays: source.customer_pays,
        terms: source.terms,
        images: source.images,
        duplicated_from: body.duplicate_from,
        ai_generated: source.ai_generated,
        // New fields
        introduction_text: source.introduction_text,
        conclusion_text: source.conclusion_text,
        not_included: source.not_included,
        ata_terms: source.ata_terms,
        payment_terms_text: source.payment_terms_text,
        terms_text: source.terms_text,
        reservations_snapshot: source.reservations_snapshot,
        payment_plan: source.payment_plan,
        reference_person: source.reference_person,
        customer_reference: source.customer_reference,
        project_address: source.project_address,
        detail_level: source.detail_level,
        show_unit_prices: source.show_unit_prices,
        show_quantities: source.show_quantities,
        // Samma offertfamilj ska behålla samma explicita jämförelsenyckel;
        // annars tappar en ny version sitt historiska Reality Check-underlag.
        template_id: source.template_id,
        job_type: source.job_type,
        template_style: source.template_style,
        attachments: source.attachments,
        deal_id: source.deal_id,
        lead_id: source.lead_id,
        rot_work_cost: source.rot_work_cost,
        rot_deduction: source.rot_deduction,
        rot_customer_pays: source.rot_customer_pays,
        rut_work_cost: source.rut_work_cost,
        rut_deduction: source.rut_deduction,
        rut_customer_pays: source.rut_customer_pays,
      }

      if (source.personnummer) dupData.personnummer = source.personnummer
      if (source.fastighetsbeteckning) dupData.fastighetsbeteckning = source.fastighetsbeteckning

      // Raderna läses FÖRE skapandet — byggaren skriver huvud och rader ihop
      // och rullar tillbaka huvudet om raderna inte går att spara.
      const { data: sourceItems, error: sourceItemsErr } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', body.duplicate_from)
        .order('sort_order')

      if (sourceItemsErr) {
        console.error('Read source quote_items error:', sourceItemsErr)
        return NextResponse.json(
          { error: 'Kunde inte läsa originaloffertens rader — försök igen' },
          { status: 500 }
        )
      }

      const skapadKopia = await createQuote(supabase, businessId, {
        customerId: source.customer_id,
        title: isVersion ? (source.title || 'Offert') : (source.title ? source.title + ' (kopia)' : 'Kopia'),
        description: source.description,
        vatRate: source.vat_rate ?? 25,
        rotRutType: source.rot_rut_type,
        rotRutDeduction: source.rot_rut_deduction ?? 0,
        // Kopian/versionen tillhör den som skapar den (v68-identitet), inte
        // originalets skapare — annars visar avsändarblocket fel person.
        createdBy: currentUser?.id ?? null,
        source: 'duplicate',
        items: (sourceItems || []).map(({ id: _id, quote_id: _q, business_id: _b, sort_order: _s, created_at: _c, ...rad }: any) => rad),
        extra: dupData,
      })

      if (!skapadKopia.success || !skapadKopia.quote) {
        console.error('Duplicate quote error:', skapadKopia.error)
        return NextResponse.json(
          { error: skapadKopia.error || 'Kunde inte kopiera offerten — försök igen' },
          { status: 500 }
        )
      }

      return NextResponse.json({ quote: skapadKopia.quote })
    }

    // New quote creation - support both legacy items and structured quote_items.
    // Id, nummer, sign_token, valid_until och radskrivningen ägs numera av den
    // kanoniska byggaren (lib/quotes/create-quote.ts) — samma golv som agenten,
    // Matte och rösten går genom. Den här vägen behåller sin rikedom via extra.
    const validDays = body.valid_days ?? 30

    const structuredItems: QuoteItem[] = body.quote_items || []
    const legacyItems = body.items || []
    const vatRate = body.vat_rate ?? 25
    const discountPercent = body.discount_percent ?? 0

    let laborTotal = 0, materialTotal = 0, subtotal = 0, discountAmount = 0
    let vatAmount = 0, total = 0
    let rotWorkCost = 0, rotDeduction = 0, rotCustomerPays = 0
    let rutWorkCost = 0, rutDeduction = 0, rutCustomerPays = 0
    let rotRutEligible = 0, rotRutDeduction = 0, customerPays = 0
    let rotRutCapped = false
    let rotRutCapWarning: string | undefined

    if (structuredItems.length > 0) {
      // Use new calculation engine
      const totals = calculateQuoteTotals(structuredItems, discountPercent, vatRate)
      laborTotal = totals.laborTotal
      materialTotal = totals.materialTotal
      subtotal = totals.subtotal
      discountAmount = totals.discountAmount
      vatAmount = totals.vat
      total = totals.total
      rotWorkCost = totals.rotWorkCost
      rotDeduction = totals.rotDeduction
      rotCustomerPays = totals.rotCustomerPays
      rutWorkCost = totals.rutWorkCost
      rutDeduction = totals.rutDeduction
      rutCustomerPays = totals.rutCustomerPays

      // Fix 3: kapa mot kundens redan förbrukade ROT/RUT-utrymme i år.
      const capResult = await applyAnnualCap(
        businessId,
        body.customer_id,
        vatRate,
        totals,
        { rotDeduction, rotCustomerPays, rutDeduction, rutCustomerPays },
      )
      rotDeduction = capResult.rotDeduction
      rotCustomerPays = capResult.rotCustomerPays
      rutDeduction = capResult.rutDeduction
      rutCustomerPays = capResult.rutCustomerPays
      rotRutCapped = capResult.capped
      rotRutCapWarning = capResult.warning

      // Legacy compat
      rotRutEligible = rotWorkCost + rutWorkCost
      rotRutDeduction = rotDeduction + rutDeduction
      customerPays = (rotDeduction > 0 || rutDeduction > 0) ? total - rotRutDeduction : total
    } else if (legacyItems.length > 0) {
      // Legacy calculation
      laborTotal = legacyItems.filter((i: any) => i.type === 'labor').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      materialTotal = legacyItems.filter((i: any) => i.type === 'material').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      const serviceTotal = legacyItems.filter((i: any) => i.type === 'service').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      subtotal = laborTotal + materialTotal + serviceTotal
      discountAmount = subtotal * (discountPercent / 100)
      const afterDiscount = subtotal - discountAmount
      vatAmount = afterDiscount * (vatRate / 100)
      total = afterDiscount + vatAmount

      if (body.rot_rut_type) {
        rotRutEligible = laborTotal
        const rate = body.rot_rut_type === 'rot' ? 0.30 : 0.50
        const maxDed = body.rot_rut_type === 'rot' ? 50000 : 75000
        rotRutDeduction = Math.min(rotRutEligible * rate, maxDed)
        customerPays = total - rotRutDeduction
      } else {
        customerPays = total
      }
    }

    const processedLegacyItems = legacyItems.map((i: any) => ({
      ...i,
      total: (i.quantity || 0) * (i.unit_price || 0)
    }))

    // De rika fälten. Invarianterna (id, nummer, token, datum) sätts av
    // byggaren; det här är allt den INTE behöver förstå.
    const insertData: Record<string, any> = {
      items: structuredItems.length > 0 ? [] : processedLegacyItems,
      labor_total: laborTotal,
      material_total: materialTotal,
      subtotal,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total,
      rot_rut_type: body.rot_rut_type || null,
      rot_rut_eligible: rotRutEligible,
      rot_rut_deduction: rotRutDeduction,
      customer_pays: customerPays,
      terms: body.terms || {},
      images: body.images || [],
      // B6 (kodrevision 2026-08-03): body.attachments skickades redan från
      // quotes/new/page.tsx (bifogade dokument + nu även analyserade AI-
      // foton) men saknades helt i insertData — kolumnen (quotes.attachments,
      // sql/quote_overhaul.sql) fanns, men POST skrev aldrig till den, så
      // ALLA bilagor tappades tyst redan vid skapande, oavsett foto-fixen.
      attachments: body.attachments || [],
      sent_at: body.status === 'sent' ? new Date().toISOString() : null,
      ai_generated: body.ai_generated || false,
      ai_confidence: body.ai_confidence || null,
      source_transcript: body.source_transcript || null,
      template_id: body.template_id || null,
      // Business Twin Reality Check: bevara en explicit källklassificering
      // från deal/offertflödet. Ingen fritextinferens görs här.
      job_type: typeof body.job_type === 'string'
        ? body.job_type.trim().slice(0, 120) || null
        : null,
      template_style: ['modern', 'premium', 'friendly'].includes(body.template_style)
        ? body.template_style
        : null,
      // New fields
      introduction_text: body.introduction_text || null,
      conclusion_text: body.conclusion_text || null,
      not_included: body.not_included || null,
      ata_terms: body.ata_terms || null,
      payment_terms_text: body.payment_terms_text || null,
      terms_text: body.terms_text || null,
      // Reservationer (v91): frysta förbehåll. Sparas som de såg ut när de
      // lades till — biblioteksändringar rör aldrig en skapad offert.
      reservations_snapshot: Array.isArray(body.reservations_snapshot) ? body.reservations_snapshot : null,
      payment_plan: body.payment_plan || [],
      // Offert-identitet (v68): spåra vem som SKAPADE offerten så kunddokumentet
      // kan visa skaparens namn/tel/mail (fallback till ägaren när null).
      created_by: currentUser?.id ?? null,
      // "Vår referens" förifylls med skaparens namn om fältet lämnats tomt;
      // hantverkarens egen ifyllnad vinner (se resolve-reference-person.ts).
      reference_person: resolveReferencePerson(body.reference_person, currentUser?.name),
      customer_reference: body.customer_reference || null,
      project_address: body.project_address || null,
      detail_level: body.detail_level || 'detailed',
      show_unit_prices: body.show_unit_prices ?? true,
      show_quantities: body.show_quantities ?? true,
      rot_work_cost: rotWorkCost || null,
      rot_deduction: rotDeduction || null,
      rot_customer_pays: rotCustomerPays || null,
      rut_work_cost: rutWorkCost || null,
      rut_deduction: rutDeduction || null,
      rut_customer_pays: rutCustomerPays || null,
    }

    if (body.personnummer) insertData.personnummer = body.personnummer
    if (body.fastighetsbeteckning) insertData.fastighetsbeteckning = body.fastighetsbeteckning
    if (body.lead_id) insertData.lead_id = body.lead_id
    if (body.deal_id) insertData.deal_id = body.deal_id

    const skapad = await createQuote(supabase, businessId, {
      customerId: body.customer_id || null,
      title: body.title || '',
      description: body.description || null,
      status: body.status === 'sent' ? 'sent' : 'draft',
      vatRate,
      rotRutType: body.rot_rut_type || null,
      rotRutDeduction,
      validDays,
      createdBy: currentUser?.id ?? null,
      source: 'ui',
      items: structuredItems,
      extra: insertData,
    })

    if (!skapad.success || !skapad.quote) {
      console.error('Quote insert error:', skapad.error)
      return NextResponse.json({ error: skapad.error || 'Offerten kunde inte skapas' }, { status: 500 })
    }
    const quote = skapad.quote as Record<string, any>
    const quoteId = skapad.quoteId!

    // Raderna (quote_items) skrevs av byggaren, med samma rollback-regel som
    // förut: en offert utan sina rader är korrupt och huvudet tas bort.

    // Sync deal value + quote_id if deal_id provided
    if (body.deal_id && quote.quote_id) {
      try {
        // Hämta deal för att kopiera lead_id till offerten
        const { data: dealData } = await supabase
          .from('deal')
          .select('lead_id')
          .eq('id', body.deal_id)
          .eq('business_id', business.business_id)
          .single()

        if (dealData?.lead_id && !quote.lead_id) {
          await supabase
            .from('quotes')
            .update({ lead_id: dealData.lead_id })
            .eq('quote_id', quote.quote_id)
        }

        const dealUpdate: Record<string, unknown> = { quote_id: quote.quote_id }
        if (quote.total) dealUpdate.value = quote.total
        await supabase
          .from('deal')
          .update(dealUpdate)
          .eq('id', body.deal_id)
          .eq('business_id', business.business_id)
      } catch (dealErr) {
        console.error('Deal sync error (non-blocking):', dealErr)
      }
    } else if (quote.quote_id && quote.customer_id) {
      // Fristående offert (skapad utanför en deal-länk, t.ex. från Offert-sidan
      // eller kundkortet): koppla till kundens öppna deal som ännu saknar offert.
      // Annars hittade pipeline-övergångarna (skickad/öppnad/vunnen) ingen deal
      // via quote_id och dealen fastnade tyst i första steget.
      try {
        const { data: openDeal } = await supabase
          .from('deal')
          .select('id, lead_id')
          .eq('business_id', business.business_id)
          .eq('customer_id', quote.customer_id)
          .is('quote_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (openDeal) {
          const dealUpdate: Record<string, unknown> = { quote_id: quote.quote_id }
          if (quote.total) dealUpdate.value = quote.total
          await supabase
            .from('deal')
            .update(dealUpdate)
            .eq('id', openDeal.id)
            .eq('business_id', business.business_id)

          // Spegla lead_id till offerten om den saknar det (paritet med deal_id-vägen)
          if (openDeal.lead_id && !quote.lead_id) {
            await supabase
              .from('quotes')
              .update({ lead_id: openDeal.lead_id })
              .eq('quote_id', quote.quote_id)
          }
        }
      } catch (linkErr) {
        console.error('Standalone quote→deal link error (non-blocking):', linkErr)
      }
    }

    return NextResponse.json({
      quote,
      ...(rotRutCapped ? { rot_rut_capped: true, rot_rut_warning: rotRutCapWarning } : {}),
    })
  } catch (error: any) {
    console.error('Create quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera offert
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver create_invoices
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { quote_id } = body

    if (!quote_id) {
      return NextResponse.json({ error: 'Missing quote_id' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('quotes')
      .select('quote_id, business_id, status, customer_id')
      .eq('quote_id', quote_id)
      .eq('business_id', business.business_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // ═══ LIVSCYKELSPÄRR (2026-08-07) ═══
    //
    // Statusen hämtades förut bara för att sätta `sent_at`. Ingen gren avvisade
    // `accepted` eller `signed`, så en offert kunden sagt ja till kunde skrivas
    // om i efterhand — priser, rader, villkor — medan `signature_data` och
    // `signed_at` stod kvar orörda. Kundens signeringslänk läser den muterbara
    // raden, så signaturen pekade på ett annat innehåll än det som signerades.
    //
    // Endast det KOMMERSIELLA innehållet låses. Status, projekt- och
    // affärskoppling får ändras vidare — annars går arbetsflödet efter accept
    // sönder och folk kringgår spärren i stället för att versionera.
    const lasta = lockedChanges(existing.status, Object.keys(body))
    if (lasta.length > 0) {
      return NextResponse.json(
        {
          error: lockedChangeMessage(existing.status),
          locked_fields: lasta,
          quote_status: existing.status,
        },
        { status: 409 },
      )
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    // Update simple fields
    if (body.customer_id !== undefined) updates.customer_id = body.customer_id
    if (body.title !== undefined) updates.title = body.title
    if (body.description !== undefined) updates.description = body.description
    if (body.personnummer !== undefined && body.personnummer !== null) updates.personnummer = body.personnummer
    if (body.fastighetsbeteckning !== undefined && body.fastighetsbeteckning !== null) updates.fastighetsbeteckning = body.fastighetsbeteckning
    if (body.terms !== undefined) updates.terms = body.terms
    if (body.images !== undefined) updates.images = body.images
    // Parity med POST (B6, kodrevision 2026-08-03) — samma bugg fanns här:
    // attachments skrevs aldrig vid uppdatering.
    if (body.attachments !== undefined) updates.attachments = body.attachments

    // New text fields
    if (body.introduction_text !== undefined) updates.introduction_text = body.introduction_text
    if (body.conclusion_text !== undefined) updates.conclusion_text = body.conclusion_text
    if (body.not_included !== undefined) updates.not_included = body.not_included
    if (body.terms_text !== undefined) updates.terms_text = body.terms_text
    // Reservationer (v91) — frysta förbehåll, se POST-grenen.
    if (body.reservations_snapshot !== undefined) updates.reservations_snapshot = body.reservations_snapshot
    if (body.ata_terms !== undefined) updates.ata_terms = body.ata_terms
    if (body.payment_terms_text !== undefined) updates.payment_terms_text = body.payment_terms_text
    if (body.payment_plan !== undefined) updates.payment_plan = body.payment_plan
    if (body.reference_person !== undefined) updates.reference_person = body.reference_person
    if (body.customer_reference !== undefined) updates.customer_reference = body.customer_reference
    if (body.project_address !== undefined) updates.project_address = body.project_address
    if (body.detail_level !== undefined) updates.detail_level = body.detail_level
    if (body.show_unit_prices !== undefined) updates.show_unit_prices = body.show_unit_prices
    if (body.show_quantities !== undefined) updates.show_quantities = body.show_quantities
    if (body.template_style !== undefined) {
      updates.template_style = ['modern', 'premium', 'friendly'].includes(body.template_style)
        ? body.template_style
        : null
    }
    if (body.deal_id !== undefined) updates.deal_id = body.deal_id || null

    if (body.status !== undefined) {
      updates.status = body.status
      if (body.status === 'sent' && !existing.status?.includes('sent')) {
        updates.sent_at = new Date().toISOString()
      }
    }

    const structuredItems: QuoteItem[] = body.quote_items || []
    const vatRate = body.vat_rate ?? 25
    const discountPercent = body.discount_percent ?? 0
    let rotRutCapped = false
    let rotRutCapWarning: string | undefined

    // Recalculate from structured items
    if (structuredItems.length > 0) {
      const totals = calculateQuoteTotals(structuredItems, discountPercent, vatRate)

      // Fix 3: kapa mot kundens redan förbrukade ROT/RUT-utrymme i år —
      // customer_id kan komma från body (om den ändras i samma anrop) eller
      // annars den redan sparade kunden på offerten.
      const effectiveCustomerId = body.customer_id !== undefined ? body.customer_id : existing.customer_id
      const capResult = await applyAnnualCap(
        business.business_id,
        effectiveCustomerId,
        vatRate,
        totals,
        {
          rotDeduction: totals.rotDeduction,
          rotCustomerPays: totals.rotCustomerPays,
          rutDeduction: totals.rutDeduction,
          rutCustomerPays: totals.rutCustomerPays,
        },
      )
      rotRutCapped = capResult.capped
      rotRutCapWarning = capResult.warning
      const rotDeduction = capResult.rotDeduction
      const rotCustomerPays = capResult.rotCustomerPays
      const rutDeduction = capResult.rutDeduction
      const rutCustomerPays = capResult.rutCustomerPays

      updates.labor_total = totals.laborTotal
      updates.material_total = totals.materialTotal
      updates.subtotal = totals.subtotal
      updates.discount_percent = discountPercent
      updates.discount_amount = totals.discountAmount
      updates.vat_rate = vatRate
      updates.vat_amount = totals.vat
      updates.total = totals.total
      updates.items = [] // Clear legacy JSONB

      // ROT/RUT new split
      updates.rot_work_cost = totals.rotWorkCost
      updates.rot_deduction = rotDeduction
      updates.rot_customer_pays = rotCustomerPays
      updates.rut_work_cost = totals.rutWorkCost
      updates.rut_deduction = rutDeduction
      updates.rut_customer_pays = rutCustomerPays

      // Legacy compat
      const totalDeduction = rotDeduction + rutDeduction
      if (totals.rotWorkCost > 0 && totals.rutWorkCost > 0) {
        updates.rot_rut_type = 'rot' // both active, prefer rot
      } else if (totals.rotWorkCost > 0) {
        updates.rot_rut_type = 'rot'
      } else if (totals.rutWorkCost > 0) {
        updates.rot_rut_type = 'rut'
      } else if (body.rot_rut_type !== undefined) {
        updates.rot_rut_type = body.rot_rut_type || null
      }
      updates.rot_rut_eligible = totals.rotWorkCost + totals.rutWorkCost
      updates.rot_rut_deduction = totalDeduction
      updates.customer_pays = totalDeduction > 0 ? totals.total - totalDeduction : totals.total

      // Byt ut quote_items-raderna utan att någonsin tappa data:
      // (1) hämta gamla radernas id, (2) infoga de NYA raderna först,
      // (3) radera de gamla raderna först NÄR insert lyckats. Tabellen har
      // bara `id` som PK och ingen unik constraint på (quote_id, sort_order)
      // (sql/quote_overhaul.sql), så gamla + nya rader kan samexistera
      // kortvarigt. Tidigare raderades allt först — ett misslyckat insert
      // (t.ex. item_type utanför CHECK-constrainten) raderade då samtliga
      // rader permanent medan offerthuvudet sparades "framgångsrikt".
      const { data: oldRows } = await supabase
        .from('quote_items')
        .select('id')
        .eq('quote_id', quote_id)
      const oldIds = (oldRows || []).map((r) => r.id)

      const itemInserts = structuredItems.map((item, idx) => {
        const rowTotal = item.item_type === 'item' ? (item.quantity || 0) * (item.unit_price || 0) : (item.total || 0)
        const split = resolveItemSplit(item, rowTotal)
        return {
          // Alltid färskt id: inkommande item.id är ofta ett befintligt rad-id
          // och skulle kollidera med gamla radens PK medan båda uppsättningarna
          // samexisterar. Inget (FK eller kod) refererar quote_items.id.
          id: 'qi_' + Math.random().toString(36).substr(2, 12),
          quote_id: quote_id,
          business_id: business.business_id,
          item_type: item.item_type,
          group_name: item.group_name || null,
          description: item.description || '',
          quantity: item.quantity || 0,
          unit: item.unit || 'st',
          unit_price: item.unit_price || 0,
          total: rowTotal,
          cost_price: item.cost_price || null,
          article_number: item.article_number || null,
          category_slug: item.category_slug || null,
          is_rot_eligible: item.is_rot_eligible || false,
          is_rut_eligible: item.is_rut_eligible || false,
          rot_rut_type: item.rot_rut_type || null,
          option_selected: item.option_selected ?? false,
          option_default: item.option_default ?? false,
          linked_product_id: item.linked_product_id || null,
          // Produktbank (v67): snapshot-fälten — ?? så att 0 bevaras
          labor_amount: split.labor_amount,
          material_amount: split.material_amount,
          estimated_hours: item.estimated_hours ?? null,
          component_snapshot: item.component_snapshot ?? null,
          show_components_to_customer: item.show_components_to_customer ?? false,
          // Dold för kunden — priset ingår ändå i summan (v90).
          is_hidden: item.is_hidden ?? false,
          sort_order: idx,
        }
      })
      const { error: itemsErr } = await supabase.from('quote_items').insert(itemInserts)
      if (itemsErr) {
        console.error('Update quote_items error:', itemsErr)
        // Gamla raderna är orörda och offerthuvudet ännu inte uppdaterat —
        // offerten är kvar i sitt tidigare, konsistenta skick.
        return NextResponse.json(
          { error: 'Kunde inte spara offertens rader — försök igen' },
          { status: 500 }
        )
      }

      if (oldIds.length > 0) {
        const { error: delErr } = await supabase
          .from('quote_items')
          .delete()
          .in('id', oldIds)
        if (delErr) {
          console.error('Delete old quote_items error:', delErr)
          // Rulla tillbaka de nyinfogade raderna så offerten inte får
          // dubbla rader, och lämna det gamla skicket intakt.
          await supabase
            .from('quote_items')
            .delete()
            .in('id', itemInserts.map((i) => i.id))
          return NextResponse.json(
            { error: 'Kunde inte spara offertens rader — försök igen' },
            { status: 500 }
          )
        }
      }
    } else if (body.items !== undefined) {
      // Legacy JSONB items recalculation
      const items = body.items || []
      const laborTotal = items.filter((i: any) => i.type === 'labor').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      const materialTotal = items.filter((i: any) => i.type === 'material').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      const serviceTotal = items.filter((i: any) => i.type === 'service').reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0)
      const subtotal = laborTotal + materialTotal + serviceTotal
      const discountAmt = subtotal * (discountPercent / 100)
      const afterDiscount = subtotal - discountAmt
      const vatAmount = afterDiscount * (vatRate / 100)
      const total = afterDiscount + vatAmount

      const processedItems = items.map((i: any) => ({ ...i, total: (i.quantity || 0) * (i.unit_price || 0) }))

      updates.items = processedItems
      updates.labor_total = laborTotal
      updates.material_total = materialTotal
      updates.subtotal = subtotal
      updates.discount_percent = discountPercent
      updates.discount_amount = discountAmt
      updates.vat_rate = vatRate
      updates.vat_amount = vatAmount
      updates.total = total

      if (body.rot_rut_type !== undefined) updates.rot_rut_type = body.rot_rut_type
      if (body.rot_rut_type) {
        const rotRutEligible = laborTotal
        const rate = body.rot_rut_type === 'rot' ? 0.30 : 0.50
        const maxDed = body.rot_rut_type === 'rot' ? 50000 : 75000
        const rotRutDeduction = Math.min(rotRutEligible * rate, maxDed)
        updates.rot_rut_eligible = rotRutEligible
        updates.rot_rut_deduction = rotRutDeduction
        updates.customer_pays = total - rotRutDeduction
      } else if (body.rot_rut_type === '' || body.rot_rut_type === null) {
        updates.rot_rut_type = null
        updates.rot_rut_eligible = 0
        updates.rot_rut_deduction = 0
        updates.customer_pays = total
      }
    } else {
      if (body.discount_percent !== undefined) updates.discount_percent = body.discount_percent
      if (body.vat_rate !== undefined) updates.vat_rate = body.vat_rate
      if (body.rot_rut_type !== undefined) updates.rot_rut_type = body.rot_rut_type || null
    }

    if (body.valid_days !== undefined) {
      const validUntil = new Date()
      validUntil.setDate(validUntil.getDate() + body.valid_days)
      updates.valid_until = validUntil.toISOString().split('T')[0]
    }

    const { data: quote, error } = await supabase
      .from('quotes')
      .update(updates)
      .eq('quote_id', quote_id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({
      quote,
      ...(rotRutCapped ? { rot_rut_capped: true, rot_rut_warning: rotRutCapWarning } : {}),
    })
  } catch (error: any) {
    console.error('Update quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort offert
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver create_invoices
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const quoteId = request.nextUrl.searchParams.get('quoteId')

    if (!quoteId) {
      return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 })
    }

    const { data: quote } = await supabase
      .from('quotes')
      .select('status')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .single()

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // quote_items are CASCADE deleted via FK
    const { error } = await supabase
      .from('quotes')
      .delete()
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Nummergivningen bor i den kanoniska byggaren (lib/quotes/create-quote.ts),
// inklusive omtag vid v98-kollision. En lokal kopia utan omtaget vore sämre.
