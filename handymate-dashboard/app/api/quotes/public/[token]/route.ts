import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { sendApprovalPush } from '@/lib/notifications/approval-push'
import { calculateQuoteTotals } from '@/lib/quote-calculations'
import { resolveDisplayLevel, groupItemsForSummary } from '@/lib/quotes/display-level'
import { buildQuoteTemplateData, selectTemplate } from '@/lib/quote-templates'
import { fetchQuoteCreator } from '@/lib/quotes/fetch-quote-creator'
import { sanitizeTemplateDataForPublic } from '@/lib/quotes/public-document'
import { buildPublicQuoteDto } from '@/lib/quotes/public-dto'
import { stripPrintBar } from '@/lib/document-html'
import { QUOTE_SURFACE_BUSINESS_SELECT, logBusinessConfigError } from '@/lib/business/quote-surface-select'

// ETAPP 5 (offert-masterplan.md): dokument-HTML-rendering (Premium/Friendly)
// kräver Node-runtime (react-dom/server via lib/quote-templates, samma som
// PDF-routen) — Edge-runtimet saknar det.
export const runtime = 'nodejs'

/**
 * GET /api/quotes/public/[token] - Hämta offert via publik signeringslänk
 * Ingen auth krävs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = getServerSupabase()
    const token = params.token

    if (!token) {
      return NextResponse.json({ error: 'Token saknas' }, { status: 400 })
    }

    // Fetch quote by sign_token
    const { data: quote, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('sign_token', token)
      .single()

    if (error || !quote) {
      console.error('[quote/public] Fetch error:', error?.message, 'token:', token)
      return NextResponse.json({ error: 'Offert hittades inte eller länken är ogiltig' }, { status: 404 })
    }

    // Riktiga offertrader ligger i quote_items-tabellen — moderna offerter har
    // JSONB-fältet quotes.items medvetet tomt. Utan detta renderar publika
    // sidan noll rader. Exponeras som structured_items vid sidan av legacy items.
    const { data: structuredItems } = await supabase
      .from('quote_items')
      // is_hidden MÅSTE med i select:en — annars kan varken filtreringen nedan
      // eller data-buildern veta att raden är dold, och den skulle skickas ut
      // till kunden i klartext trots att hantverkaren dolt den.
      .select('id, item_type, group_name, description, quantity, unit, unit_price, total, sort_order, is_rot_eligible, is_rut_eligible, rot_rut_type, option_selected, option_default, labor_amount, material_amount, estimated_hours, component_snapshot, show_components_to_customer, is_hidden')
      .eq('quote_id', quote.quote_id)
      .order('sort_order', { ascending: true })

    // Hämta kund separat (FK-relation kan saknas)
    let customer: any = null
    if (quote.customer_id) {
      const { data: c } = await supabase
        .from('customer')
        .select('name, phone_number, email, address_line, portal_token')
        .eq('customer_id', quote.customer_id)
        .single()
      customer = c
    }
    ;(quote as any).customer = customer

    // Resolva deal-nummer om offerten är kopplad till ett ärende — samma
    // uppslag som /api/quotes/pdf redan gör för ?token=-vägen, så
    // dokumentets "Ärende #X"-rad matchar mellan PDF och kundvyn.
    if (quote.deal_id) {
      const { data: deal } = await supabase
        .from('deal')
        .select('deal_number')
        .eq('id', quote.deal_id)
        .maybeSingle()
      if (deal?.deal_number != null) (quote as any).deal_number = deal.deal_number
    }

    // Fetch business info — ETAPP 5 (offert-masterplan.md): utökat med samma
    // fält som /api/quotes/pdf hämtar (adress/bankgiro/plusgiro/swish/
    // webbplats/mallval) — behövs av buildQuoteTemplateData för att bygga
    // samma dokument som PDF:en/"Visa offert".
    // Kolumnlistan är borttagen (2026-08-06, samma rotorsak som logotypsbuggen
    // — se lib/business/quote-surface-select.ts). Den här listan 400:ade aldrig,
    // men den utelämnade `vat_number` och `tagline`, som buildQuoteTemplateData
    // läser. Följden var att KUNDENS offert saknade momsregistreringsnummer och
    // företagets tagline medan hantverkarens live-canvas (som läser '*') visade
    // dem — en tyst divergens mellan det man ser och det man skickar.
    const { data: business, error: businessError } = await supabase
      .from('business_config')
      .select(QUOTE_SURFACE_BUSINESS_SELECT)
      .eq('business_id', quote.business_id)
      .single()
    logBusinessConfigError('quotes/public/[token]', businessError)

    // Check if already signed
    const alreadySigned = quote.status === 'accepted' && quote.signed_at

    // Referensfoton — fail-soft, en bonus som aldrig får fälla offertvyn.
    const { getReferencePhotos } = await import('@/lib/quotes/reference-photos')
    const referencePhotos = await getReferencePhotos(supabase, quote.business_id, (quote as any).title)

    // ── Visningsnivå (Del C) — filtrera SERVER-SIDE innan svaret ──────────────
    // Kunden får ALDRIG à-priser den inte ska se ur nätverkssvaret.
    // 'summary' → gruppsummor (display_groups) + endast tillval i structured_items
    //             (tillval behåller fulla fält så live-totalen kan räkna deltan).
    // 'rows'    → structured_items utan unit_price/quantity (radtotal kvar).
    // 'full'    → oförändrat.
    const displayLevel = resolveDisplayLevel({
      detail_level: quote.detail_level,
      show_unit_prices: quote.show_unit_prices,
    })

    const rawItems = structuredItems && structuredItems.length > 0 ? structuredItems : []
    let responseItems: any[] | undefined = rawItems.length > 0 ? rawItems : undefined
    let displayGroups: { heading: string; total: number }[] | undefined
    // Bas-totaler (icke-tillvalsrader) — behövs för live-totalen i summary/rows
    // där à-priserna strippats: klienten kan inte längre summera basen själv.
    // Endast siffror, aldrig à-priser. Tillvalsdeltan läggs på i klienten.
    let baseTotals: ReturnType<typeof calculateQuoteTotals> | undefined

    if (rawItems.length > 0) {
      const hasOptions = rawItems.some(it => it.item_type === 'option')
      if (displayLevel === 'summary') {
        const { groups, options } = groupItemsForSummary(rawItems)
        displayGroups = groups
        // Endast tillval kvar bland raderna — med fulla belopp (kundens val).
        responseItems = options.length > 0 ? options : undefined
      } else if (displayLevel === 'rows') {
        // Strippa à-pris + antal ur varje icke-tillvalsrad. Tillval behåller
        // sina belopp (live-totalen behöver dem). Radtotal (total) står kvar.
        responseItems = rawItems.map(it =>
          it.item_type === 'option'
            ? it
            : { ...it, unit_price: null, quantity: null },
        )
      }
      // Bas = alla icke-tillvalsrader (fulla värden server-side). Bara relevant
      // när det finns tillval OCH à-priser strippats ur svaret.
      if (hasOptions && displayLevel !== 'full') {
        const nonOptionRows = rawItems.filter(it => it.item_type !== 'option')
        baseTotals = calculateQuoteTotals(nonOptionRows as any, quote.discount_percent ?? 0, quote.vat_rate ?? 25)
      }
    }

    // Sanera bort INTERNA kalkylfält ur svaret: material-split, timmar och den
    // fulla component_snapshot (som bär unit_cost). Kunden får bara en trimmad
    // komponentspec (description/quantity_per_unit/unit) när hantverkaren aktivt
    // slagit på show_components_to_customer — ALDRIG interna kostnader.
    // labor_amount BEHÅLLS (ROT-arbetsbasen, inte en dold à-pris) — klientens
    // live-total i 'full' + tillvalsdeltan i summary/rows behöver den.
    // Dolda rader (v90) bort ur svaret. Görs EFTER baseTotals/displayGroups
    // ovan, som medvetet räknas på den ofiltrerade listan — priset ingår i
    // summan, det är bara raden som inte ska synas. Utan detta låg
    // beskrivning och belopp öppet i JSON-svaret för den som tittar i
    // devtools, och "dold för kund" hade bara varit sant mot ögat.
    if (responseItems) {
      responseItems = responseItems.filter((it: any) => it?.is_hidden !== true)
      if (responseItems.length === 0) responseItems = undefined
    }

    if (responseItems) {
      responseItems = responseItems.map((it: any) => {
        const { material_amount, estimated_hours, component_snapshot, ...safe } = it
        if (it.show_components_to_customer === true && Array.isArray(component_snapshot?.components)) {
          safe.component_snapshot = {
            components: component_snapshot.components.map((c: any) => ({
              description: c?.description ?? '',
              quantity_per_unit: c?.quantity_per_unit ?? null,
              unit: c?.unit ?? '',
            })),
          }
        }
        return safe
      })
    }

    // ── ETAPP 5 (offert-masterplan.md): dokumentet ÄR gränssnittet ────────────
    // Bygg SAMMA templateData som PDF:en/"Visa offert" redan använder
    // (buildQuoteTemplateData — kundvänd sedan tidigare, se lib/quote-
    // templates/data-builder.ts) så kundens signeringssida kan rendera
    // hantverkarens FAKTISKA mallval istället för en fjärde egen tolkning.
    // quote.quote_items sätts till de RÅA (osanerade) structuredItems —
    // buildQuoteTemplateData tillämpar sin egen displayLevel-logik internt
    // (samma resolveDisplayLevel-källa som ovan); JSON-svaret saneras separat
    // nedan (sanitizeTemplateDataForPublic) eftersom 'rows'-nivån bara döljer
    // kolumner VISUELLT i mallen — de råa värdena får inte läcka i nätverks-
    // svaret som denna funktion serialiserar till klienten.
    ;(quote as any).quote_items = rawItems
    const creator = await fetchQuoteCreator(supabase, quote.created_by)
    const templateStyle = (quote.template_style || business?.quote_template_style || 'modern') as
      | 'modern' | 'premium' | 'friendly'
    let publicTemplateData: ReturnType<typeof buildQuoteTemplateData> | null = null
    let documentHtml: string | null = null
    try {
      const templateData = buildQuoteTemplateData(quote, business, business, creator)
      // Signatur-CTA: data-builder sätter alltid 'hidden' (PDF/förhands-
      // granskning ska förbli oförändrade) — den publika kundvyn är den ENDA
      // ytan som ska visa den, som 'active' (ej signerad) eller 'signed'.
      templateData.signatureCta = alreadySigned ? 'signed' : 'active'
      publicTemplateData = sanitizeTemplateDataForPublic(templateData)
      // Premium/Friendly saknar (ännu) en React-motor (ETAPP 2a tog bara
      // Modern, se offert-masterplan.md) — rendera samma statiska HTML-sträng
      // som PDF:en/"Visa offert" använder. .print-bar strippas (samma regel
      // som preview-html-routen) — sidan har egna PDF-/signeringsknappar.
      if (templateStyle !== 'modern') {
        const renderFn = selectTemplate(templateStyle)
        documentHtml = stripPrintBar(renderFn(publicTemplateData))
      }
    } catch (docErr) {
      // Dokumentbygget får ALDRIG blockera hela svaret — utan templateData
      // faller sidan tillbaka på ett tomt dokument (hellre en trasig yta än
      // en 500:a som stoppar kunden från att signera).
      console.error('[quote/public] Kunde inte bygga dokumentmotor-data:', docErr)
    }

    return NextResponse.json({
      quote: buildPublicQuoteDto({
        quote,
        customer,
        structuredItems: responseItems,
        displayLevel,
        displayGroups,
        baseTotals,
        templateData: publicTemplateData,
        templateStyle,
        documentHtml,
      }),
      business: {
        name: business?.business_name || '',
        contact_name: business?.contact_name || '',
        email: business?.contact_email || '',
        phone: business?.phone_number || '',
        org_number: business?.org_number || '',
        f_skatt: business?.f_skatt_registered || false,
        logo_url: business?.logo_url || null,
        accent_color: business?.accent_color || null,
      },
      alreadySigned,
      // Referensfoton från hantverkarens egna avslutade jobb. Kunden jämför
      // två-tre offerter — vår ska vara den enda som visar hur det blev.
      // null när det inte finns något att visa; aldrig ett tomt block.
      reference_photos: referencePhotos,
    })

  } catch (error: any) {
    console.error('Get public quote error:', error)
    return NextResponse.json({ error: 'Kunde inte läsa offerten' }, { status: 500 })
  }
}

/**
 * POST /api/quotes/public/[token] - Signera eller avböj offert
 * action: 'sign' (default) | 'decline'
 * Ingen auth krävs
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = getServerSupabase()
    const token = params.token
    const body = await request.json()
    const { action = 'sign', name, signature_data, reason } = body

    // Fetch quote by sign_token
    const { data: quote, error: fetchError } = await supabase
      .from('quotes')
      .select('*')
      .eq('sign_token', token)
      .single()

    if (fetchError || !quote) {
      return NextResponse.json(
        { error: 'Offert hittades inte eller länken är ogiltig' },
        { status: 404 }
      )
    }

    // ── Kunden måste hämtas även här (2026-08-07) ─────────────────────────
    //
    // GET-grenen hämtar kunden separat och hänger på den som `quote.customer`
    // (rad 56-66) eftersom FK-relationen kan saknas. POST-grenen gjorde bara
    // `select('*')` — som inte innehåller någon kund — men läser ändå
    // `quote.customer?.name` och `quote.customer?.phone_number` på fyra
    // ställen nedan.
    //
    // Följden syntes hos piloten som tre olika fel med samma orsak:
    //   1. korten sa "Hej Kunden!" i stället för kundens namn,
    //   2. `customer_phone` blev null, så aviseringen hoppades över,
    //   3. och eftersom kön tolkade uteblivet SMS som misslyckande fick
    //      hantverkaren "Handling misslyckades" trots att svaret sparats.
    let customerRow: any = null
    if (quote.customer_id) {
      const { data: c } = await supabase
        .from('customer')
        .select('name, phone_number, email')
        .eq('customer_id', quote.customer_id)
        .maybeSingle()
      customerRow = c
    }
    ;(quote as any).customer = customerRow

    // ── Kunden väljer en föreslagen tid (idé 4) ───────────────────────────────
    // Skapar INTE en bokning rakt in i kalendern — det vore att låta en kund
    // skriva i hantverkarens schema. I stället ett önskemål i godkännande-kön
    // som hantverkaren bekräftar. Kunden får besked om att det är preliminärt.
    if (action === 'request_booking') {
      const requestedDate = typeof body.date === 'string' ? body.date.trim() : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
        return NextResponse.json({ error: 'Ogiltigt datum' }, { status: 400 })
      }

      const customerName = (quote.customer as any)?.name || 'Kunden'
      const { error: bookingApprovalErr } = await supabase.from('pending_approvals').insert({
        id: `appr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        business_id: quote.business_id,
        approval_type: 'new_booking_request',
        title: `${customerName} vill boka ${requestedDate}`,
        description: `Kunden signerade offerten och önskar start ${requestedDate}. Bekräfta så läggs den i kalendern.`,
        payload: {
          agent: 'lars',
          quote_id: quote.quote_id,
          quote_title: (quote as any).title || null,
          customer_id: quote.customer_id,
          customer_name: customerName,
          customer_phone: (quote.customer as any)?.phone_number || null,
          requested_date: requestedDate,
          source: 'quote_signing',
        },
        status: 'pending',
        risk_level: 'low',
      })

      if (bookingApprovalErr) {
        console.error('[quote/public] bokningsönskemål kunde inte sparas:', bookingApprovalErr.message)
        return NextResponse.json({ error: 'Kunde inte skicka önskemålet — hör av dig till oss i stället' }, { status: 500 })
      }

      try {
        const { sendApprovalPush } = await import('@/lib/notifications/approval-push')
        void sendApprovalPush({
          business_id: quote.business_id,
          approval_type: 'new_booking_request',
          payload: { customer_name: customerName, requested_date: requestedDate },
        })
      } catch { /* non-blocking */ }

      return NextResponse.json({ success: true })
    }

    // ── Kundens fråga ─────────────────────────────────────────────────────────
    // Offerten slutar vara ett dokument och blir en kanal. En kund som undrar
    // vad en rad innebär hör oftast inte av sig alls — hen tackar nej i
    // tysthet. Frågan landar som ett kort i godkännande-kön, med raden som
    // kontext, så hantverkaren kan svara på det som faktiskt oroar.
    //
    // Ligger FÖRE status-guarderna nedan: en fråga är aldrig skadlig, och de
    // guarderna finns för att skydda mot dubbla BESLUT — inte mot samtal.
    if (action === 'question') {
      const questionText = typeof body.question === 'string' ? body.question.trim() : ''
      if (!questionText) {
        return NextResponse.json({ error: 'Skriv din fråga först' }, { status: 400 })
      }
      if (questionText.length > 1000) {
        return NextResponse.json({ error: 'Frågan är för lång — korta ner den lite.' }, { status: 400 })
      }

      const aboutItemId = typeof body.item_id === 'string' ? body.item_id : null
      let aboutRow: string | null = null
      if (aboutItemId) {
        const { data: item } = await supabase
          .from('quote_items')
          .select('description')
          .eq('id', aboutItemId)
          .eq('quote_id', quote.quote_id)
          .maybeSingle()
        aboutRow = item?.description || null
      }

      // Går genom den delade vägen (lib/portal/customer-thread.ts) så frågan
      // hamnar i kundens portaltråd OCH som kort hos hantverkaren. Kunden ska
      // kunna se vad hen frågat, och svaret kommer tillbaka i samma tråd —
      // ett samtal, inte två system.
      if (!quote.customer_id) {
        return NextResponse.json({ error: 'Offerten saknar kundkoppling' }, { status: 400 })
      }

      const { receiveCustomerMessage } = await import('@/lib/portal/customer-thread')
      const result = await receiveCustomerMessage(supabase, {
        businessId: quote.business_id,
        customerId: quote.customer_id,
        customerName: (quote.customer as any)?.name || null,
        customerPhone: (quote.customer as any)?.phone_number || null,
        message: questionText,
        quote: {
          quoteId: quote.quote_id,
          quoteNumber: (quote as any).quote_number || null,
          quoteTitle: (quote as any).title || null,
          itemId: aboutItemId,
          itemDescription: aboutRow,
        },
      })

      if (!result.threadWritten && !result.approvalCreated) {
        return NextResponse.json({ error: 'Kunde inte skicka frågan — försök igen' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }


    if (quote.status === 'accepted' && quote.signed_at) {
      return NextResponse.json({ error: 'Offerten är redan signerad' }, { status: 400 })
    }

    if (quote.status === 'declined') {
      return NextResponse.json({ error: 'Offerten är redan avböjd' }, { status: 400 })
    }

    // ── Decline ───────────────────────────────────────────────────────────────
    if (action === 'decline') {
      // Strukturerat skäl (reason_code) + valfri fritext. Koden är det som gör
      // förlusten räknebar — fritext ensam går inte att gruppera på, och de
      // flesta kunder orkar inte skriva något alls.
      const { parseDeclineReasonCode, buildLostReason } = await import('@/lib/quotes/decline-reasons')
      const reasonCode = parseDeclineReasonCode((body as any).reason_code)

      if (!reasonCode && !reason) {
        return NextResponse.json({ error: 'Ange ett skäl för avböjandet' }, { status: 400 })
      }

      const lostReason = buildLostReason(reasonCode, reason)

      // Skriv garanterat giltiga kolumner först (status + declined_at). Tidigare
      // skrevs lost_reason i samma update — den kolumnen saknas i schemat → hela
      // avböjningen kastade och kunden fick ett generiskt 500.
      const { error: updateError } = await supabase
        .from('quotes')
        .update({
          status: 'declined',
          declined_at: new Date().toISOString(),
        })
        .eq('sign_token', token)

      if (updateError) throw updateError

      // lost_reason är en valfri kolumn (sql/add_quote_lost_reason.sql) — best
      // effort, blockera aldrig avböjningen om kolumnen inte finns.
      if (lostReason) {
        const { error: reasonErr } = await supabase
          .from('quotes')
          .update({ lost_reason: lostReason })
          .eq('sign_token', token)
        if (reasonErr) console.warn('[quote decline] lost_reason ej sparat (kör add_quote_lost_reason.sql):', reasonErr.message)
      }

      // Trigger agent automation for declined quote (non-blocking)
      try {
        const { triggerEventCommunication } = await import('@/lib/smart-communication')
        await triggerEventCommunication({
          businessId: quote.business_id,
          event: 'quote_declined',
          customerId: quote.customer_id,
          context: { quoteId: quote.quote_id, extraVariables: { reason } },
        })
      } catch { /* non-blocking */ }

      console.log(`[quote/public] Declined: ${quote.quote_id}, reason: ${reason}`)
      return NextResponse.json({ success: true })
    }

    // ── Sign ──────────────────────────────────────────────────────────────────
    // Spärra signering av utgången offert — annars kunde kunden binda
    // hantverkaren till ett pris som löpt ut. (Statusguarderna ovan täckte bara
    // accepted/declined, inte expired/passerat valid_until.)
    if (quote.status === 'expired' || (quote.valid_until && new Date(quote.valid_until) < new Date())) {
      return NextResponse.json({ error: 'Offerten har gått ut. Kontakta oss för en uppdaterad offert.' }, { status: 400 })
    }

    if (!name || !signature_data) {
      return NextResponse.json({ error: 'Namn och signatur krävs' }, { status: 400 })
    }

    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown'

    // ── Tillval: kundens val skrivs + servern räknar om totalen SJÄLV ──
    // (litar aldrig på klientens summa). selected_option_ids valideras mot
    // offertens egna option-rader — okända id:n → 400.
    const selectedOptionIds: string[] = Array.isArray(body.selected_option_ids)
      ? body.selected_option_ids.map(String) : []
    const { data: allRows } = await supabase
      .from('quote_items')
      .select('id, item_type, description, quantity, unit, unit_price, total, is_rot_eligible, is_rut_eligible, rot_rut_type, sort_order, option_selected, option_default, labor_amount, material_amount')
      .eq('quote_id', quote.quote_id)
      .order('sort_order', { ascending: true })
    const optionRows = (allRows || []).filter(r => r.item_type === 'option')
    const validIds = new Set(optionRows.map(r => r.id))
    if (selectedOptionIds.some(id => !validIds.has(id))) {
      return NextResponse.json({ error: 'Ogiltiga tillval' }, { status: 400 })
    }
    let signedOptions: any[] | null = null
    let recomputed: ReturnType<typeof calculateQuoteTotals> | null = null
    if (optionRows.length > 0) {
      const chosen = new Set(selectedOptionIds)
      // Skriv kundens val per option-rad
      for (const r of optionRows) {
        await supabase.from('quote_items')
          .update({ option_selected: chosen.has(r.id) })
          .eq('id', r.id).eq('quote_id', quote.quote_id)
      }
      // Räkna om med EN summa-sanning
      const effectiveItems = (allRows || []).map(r => ({
        ...r,
        option_selected: r.item_type === 'option' ? chosen.has(r.id) : r.option_selected,
      }))
      recomputed = calculateQuoteTotals(effectiveItems as any, quote.discount_percent ?? 0, quote.vat_rate ?? 25)
      // Juridiskt spår: valda/bortvalda tillval med belopp vid signeringsögonblicket
      signedOptions = optionRows.map(r => ({
        id: r.id, name: r.description, total: r.total, selected: chosen.has(r.id),
      }))
    }

    const updateFields: Record<string, any> = {
      status: 'accepted',
      signed_at: new Date().toISOString(),
      signed_by_name: name,
      signed_by_ip: ip,
      signature_data,
      accepted_at: new Date().toISOString(),
    }
    if (recomputed) {
      // Samma kolumnmappning som quotes-POST:ens insertData
      // (app/api/quotes/route.ts) — inkl. legacy-kompat-fälten.
      const rotRutDeduction = recomputed.rotDeduction + recomputed.rutDeduction
      updateFields.labor_total = recomputed.laborTotal
      updateFields.material_total = recomputed.materialTotal
      updateFields.subtotal = recomputed.subtotal
      updateFields.discount_amount = recomputed.discountAmount
      updateFields.vat_amount = recomputed.vat
      updateFields.total = recomputed.total
      updateFields.rot_work_cost = recomputed.rotWorkCost || null
      updateFields.rot_deduction = recomputed.rotDeduction || null
      updateFields.rot_customer_pays = recomputed.rotCustomerPays || null
      updateFields.rut_work_cost = recomputed.rutWorkCost || null
      updateFields.rut_deduction = recomputed.rutDeduction || null
      updateFields.rut_customer_pays = recomputed.rutCustomerPays || null
      updateFields.rot_rut_eligible = recomputed.rotWorkCost + recomputed.rutWorkCost
      updateFields.rot_rut_deduction = rotRutDeduction
      updateFields.customer_pays = rotRutDeduction > 0 ? recomputed.total - rotRutDeduction : recomputed.total
      updateFields.signed_options = signedOptions
    }

    const { error: updateError } = await supabase
      .from('quotes')
      .update(updateFields)
      .eq('sign_token', token)

    if (updateError) throw updateError

    // Notiser/events nedan skall visa det signerade beloppet — inte det
    // gamla quote.total från före tillvalsomräkningen.
    const finalTotal = recomputed ? recomputed.total : (quote.total || 0)

    // V80: den gamla "flytta till accepted"-flytten här togs bort — den var
    // vestigial (flyttade dealen till det numera borttagna 'quote_accepted'-
    // steget, för att sedan alltid bli omedelbart överkörd av "Golden Path:
    // flytta deal till Vunnen" längre ned i samma handler). Den blocket
    // längre ned är nu den enda sanningen för denna signeringsväg.

    // Smart communication + notifications (non-blocking)
    try {
      const { triggerEventCommunication } = await import('@/lib/smart-communication')
      await triggerEventCommunication({
        businessId: quote.business_id,
        event: 'quote_signed',
        customerId: quote.customer_id,
        context: { quoteId: quote.quote_id },
      })

      try {
        const { notifyQuoteSigned } = await import('@/lib/notifications')
        await notifyQuoteSigned({
          businessId: quote.business_id,
          customerName: (quote.customer as any)?.name || 'Kund',
          quoteId: quote.quote_id,
          total: finalTotal,
        })
      } catch { /* non-blocking */ }

      // Push-notis till Christoffer — quote_signed har INGEN pending_approval-rad
      // (info, inte action — kunden behöver veta att offerten signerats, inte agera).
      // Anropas med "syntetiskt" approval-objekt så helpern kan återanvända
      // template-logiken. Fire-and-forget, helpern loggar fel internt.
      void sendApprovalPush({
        business_id: quote.business_id,
        approval_type: 'quote_signed',
        payload: {
          customer_name: (quote.customer as any)?.name || 'Kund',
          quote_id: quote.quote_id,
          project_id: (quote as any).project_id || null,
          total: finalTotal,
        },
      })

      try {
        const { handleProjectEvent } = await import('@/lib/project-ai-engine')
        await handleProjectEvent({
          type: 'quote_accepted',
          businessId: quote.business_id,
          quoteId: quote.quote_id,
        })
      } catch { /* non-blocking */ }
    } catch (commErr) {
      console.error('Communication trigger error (non-blocking):', commErr)
    }

    // V3 Automation Engine: fire quote_signed event för pipeline-regler
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'quote_signed', quote.business_id, {
        quote_id: quote.quote_id,
        customer_id: quote.customer_id,
        quote_title: quote.title,
        total: finalTotal,
      })
    } catch { /* non-blocking */ }

    // Autopilot: förbered deal-to-delivery-paket
    try {
      const { triggerAutopilot } = await import('@/lib/autopilot/trigger')
      await triggerAutopilot(quote.business_id, quote.quote_id)
    } catch { /* non-blocking */ }

    // Bekräftelse, projekt och deal→vunnen ligger i lib/quotes/finalize-accepted.ts
    // så att portalens "Acceptera"-knapp gör EXAKT samma sak. Tidigare låg
    // kedjan bara här, och portalvägen gav en vunnen offert utan projekt.
    // Allt är non-blocking — kunden har redan signerat.
    const { finalizeAcceptedQuote } = await import('@/lib/quotes/finalize-accepted')
    await finalizeAcceptedQuote(supabase, {
      businessId: quote.business_id,
      quoteId: quote.quote_id,
      quoteNumber: (quote as any).quote_number || null,
      quoteTitle: (quote as any).title || null,
      customerId: quote.customer_id,
      customerName: (quote.customer as any)?.name || null,
      customerPhone: (quote.customer as any)?.phone_number || null,
      total: finalTotal ?? null,
      source: 'signering',
    })

    // Signeringen är det enda ögonblick då kunden är maximalt engagerad. Går
    // hen därifrån utan datum blir bokningen ett telefonsamtal som ska jagas.
    // Föreslår BARA dagar med verklig ledig kapacitet — ett förslag som inte
    // håller är ett löfte hantverkaren måste ta tillbaka.
    const { getBookingSuggestionsForBusiness } = await import('@/lib/quotes/booking-suggestions')
    const bookingSuggestions = await getBookingSuggestionsForBusiness(
      supabase,
      quote.business_id,
      new Date().toISOString().slice(0, 10),
    )

    return NextResponse.json({ success: true, booking_suggestions: bookingSuggestions })

  } catch (error: any) {
    console.error('Quote public POST error:', error)
    return NextResponse.json({ error: 'Kunde inte behandla din begäran' }, { status: 500 })
  }
}
