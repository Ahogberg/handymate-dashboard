/**
 * Projektfakturans underlag — EN komposition, två konsumenter.
 *
 * ═══ VARFÖR FILEN FINNS (Tur 4 etapp 2, 2026-08-10) ═══
 *
 * Kompositionen (offertrader ur quote_items → ÄTA-rader → totaler → ROT via
 * calculateCappedDeduction → kunden betalar) låg inbäddad i
 * lib/projects/auto-invoice-on-complete.ts steg 3–6. När missad-intäkt-svepet
 * nu ska bära ett FÄRDIGT fakturautkast på kortet (fakturera_projekt) behöver
 * samma komposition köras därifrån — och vid godkännandet EN gång till som
 * drift-vakt. Tre anropare, en sanning. En kopia hade varit tre ROT-beräkningar
 * som driftar isär (samma felklass som momsbasen 2026-07-30: duplicerad
 * pengalogik överlever granskning för att alla kopior är sinsemellan
 * konsistenta).
 *
 * FAIL-CLOSED: saknas kund, finns redan en faktura, eller blir det noll rader
 * — då är svaret ok:false med orsak. Ett kort som säger "fakturan är ifylld
 * och redo" får aldrig skapas på ett underlag som inte håller.
 *
 * Ingen faktura skapas här. Filen läser och räknar; skrivandet äger
 * anroparen (autoInvoiceOnComplete resp. godkännande-exekveraren).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateCappedDeduction } from '@/lib/rot-rut-limits'
import { mapQuoteItemsToInvoiceItems, rotRutLaborBasis } from '@/lib/invoices/quote-to-invoice-items'

export interface ProjektFakturaUnderlag {
  ok: true
  project: {
    project_id: string
    name: string | null
    customer_id: string
    quote_id: string | null
  }
  /** Fakturaraderna — samma form som invoice.items (offert + ÄTA). */
  items: any[]
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  rotRutType: 'rot' | 'rut' | null
  rotRutDeduction: number
  /** Det kunden faktiskt betalar (total − avdrag). Alltid ett tal. */
  customerPays: number
  personnummer: string | null
  fastighetsbeteckning: string | null
  /** ÄTA-id:n som ska källmarkeras när fakturan väl skapas. */
  ataChangeIds: string[]
  hasAta: boolean
}

export interface ProjektFakturaStopp {
  ok: false
  reason: 'projekt_saknas' | 'kund_saknas' | 'faktura_finns' | 'inga_rader'
  error: string
  existingInvoiceId?: string
}

export type ProjektFakturaResultat = ProjektFakturaUnderlag | ProjektFakturaStopp

export async function byggProjektFakturaUnderlag(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
): Promise<ProjektFakturaResultat> {
  // 1. Projektet med offert-referens
  const { data: project, error: projErr } = await supabase
    .from('project')
    .select('project_id, name, customer_id, quote_id')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .single()

  if (projErr || !project) {
    return { ok: false, reason: 'projekt_saknas', error: 'Projekt hittades inte' }
  }

  if (!project.customer_id) {
    return { ok: false, reason: 'kund_saknas', error: 'Projektet saknar kund' }
  }

  // 2. Finns redan en faktura är underlaget inaktuellt per definition.
  const { data: existingInvoice } = await supabase
    .from('invoice')
    .select('invoice_id')
    .eq('business_id', businessId)
    .eq('project_id', projectId)
    .limit(1)
    .maybeSingle()

  if (existingInvoice) {
    return {
      ok: false,
      reason: 'faktura_finns',
      error: 'Faktura finns redan för projektet',
      existingInvoiceId: existingInvoice.invoice_id,
    }
  }

  // 3. Offertens rader — quote_items är sanningen, JSONB:n bara legacy-fallback
  // (projektauditen P1-3, se historiken i auto-invoice-on-complete.ts).
  let quoteItems: any[] = []
  let rotRutType: string | null = null
  let rotRutDeduction = 0
  let customerPays: number | null = null
  let personnummer: string | null = null
  let fastighetsbeteckning: string | null = null
  let vatRate = 25

  if (project.quote_id) {
    const { data: quote } = await supabase
      .from('quotes')
      .select('items, rot_rut_type, rot_rut_deduction, customer_pays, personnummer, fastighetsbeteckning, vat_rate')
      .eq('quote_id', project.quote_id)
      .single()

    // A1: labor_amount/is_rut_eligible/cost_price/article_number/
    // linked_product_id/group_name följde tidigare INTE med här — RUT-rader
    // tappade sitt berättigande helt och ROT-basen föll tillbaka på radtotal.
    const { data: strukturerade } = await supabase
      .from('quote_items')
      .select('item_type, description, quantity, unit, unit_price, total, is_rot_eligible, is_rut_eligible, sort_order, is_hidden, option_selected, group_name, cost_price, article_number, labor_amount, linked_product_id')
      .eq('quote_id', project.quote_id)
      .eq('business_id', businessId)
      .order('sort_order')

    if (strukturerade && strukturerade.length > 0) {
      // Delade mapparen (lib/invoices/quote-to-invoice-items.ts): tillvals-
      // filtret, ??-kopierad labor_amount och bevarad produktkoppling.
      quoteItems = mapQuoteItemsToInvoiceItems(strukturerade, { idPrefix: 'ii_q_' })
    } else if (quote?.items && Array.isArray(quote.items)) {
      // Legacy-offert: JSONB:n är den enda källan som finns.
      quoteItems = mapQuoteItemsToInvoiceItems(quote.items, { idPrefix: 'ii_q_' })
    }

    if (quote && quoteItems.length > 0) {
      rotRutType = quote.rot_rut_type || null
      rotRutDeduction = quote.rot_rut_deduction || 0
      customerPays = quote.customer_pays || null
      personnummer = quote.personnummer || null
      fastighetsbeteckning = quote.fastighetsbeteckning || null
      vatRate = quote.vat_rate || 25
    }
  }

  // 4. Godkända ÄTA
  const { data: atas } = await supabase
    .from('project_change')
    .select('change_id, description, items, total, change_type')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .in('status', ['approved', 'signed'])

  const ataItems: any[] = []
  if (atas && atas.length > 0) {
    ataItems.push({
      id: 'ii_ata_header',
      item_type: 'heading',
      description: 'Tilläggsarbeten (ÄTA)',
      quantity: 0,
      unit: '',
      unit_price: 0,
      total: 0,
    })

    for (const ata of atas) {
      if (ata.items && Array.isArray(ata.items)) {
        for (const item of ata.items) {
          const sign = ata.change_type === 'removal' ? -1 : 1
          ataItems.push({
            id: 'ii_ata_' + Math.random().toString(36).substr(2, 8),
            item_type: ata.change_type === 'removal' ? 'discount' : 'item',
            description: item.description || item.name || ata.description || 'ÄTA',
            quantity: item.quantity || 1,
            unit: item.unit || 'st',
            unit_price: Math.abs(item.unit_price || 0),
            total: sign * Math.abs((item.quantity || 1) * (item.unit_price || 0)),
            type: item.type || 'labor',
            // A6 (stänger TD-26): ÄTA-radens EGEN flagga respekteras när den
            // finns (sätts i ÄTA-editorn); rot_rut_type-fältet på äldre
            // AtaItem-rader hedras också. Saknas båda → false som förut.
            is_rot_eligible: !!(item.is_rot_eligible ?? (item.rot_rut_type === 'rot')),
            is_rut_eligible: !!(item.is_rut_eligible ?? (item.rot_rut_type === 'rut')),
            sort_order: 900 + ataItems.length,
          })
        }
      } else if (ata.total) {
        const sign = ata.change_type === 'removal' ? -1 : 1
        ataItems.push({
          id: 'ii_ata_' + Math.random().toString(36).substr(2, 8),
          item_type: ata.change_type === 'removal' ? 'discount' : 'item',
          description: ata.description || 'Tilläggsarbete',
          quantity: 1,
          unit: 'st',
          unit_price: Math.abs(ata.total),
          total: sign * Math.abs(ata.total),
          type: 'labor',
          is_rot_eligible: false,
          sort_order: 900 + ataItems.length,
        })
      }
    }
  }

  // 5. Alla rader
  const allItems = [...quoteItems, ...ataItems]

  if (allItems.length === 0) {
    return { ok: false, reason: 'inga_rader', error: 'Inga fakturarader — varken offert eller ÄTA hittades' }
  }

  // 6. Totaler + ROT/RUT med årstaksvalidering (kapad mot kundens utrymme)
  const regularItems = allItems.filter(i => i.item_type === 'item' || !i.item_type)
  const discountItems = allItems.filter(i => i.item_type === 'discount')
  const subtotal = regularItems.reduce((sum, i) => sum + (i.total || 0), 0)
    - discountItems.reduce((sum, i) => sum + Math.abs(i.total || 0), 0)
  const vatAmount = Math.round(subtotal * (vatRate / 100))
  const total = subtotal + vatAmount

  if (rotRutType) {
    const rate = rotRutType === 'rut' ? 0.5 : 0.3
    // A1: basen från raderna — labor_amount ?? radtotal per berättigad rad
    // (delade rotRutLaborBasis; tidigare räknades HELA radtotalen även när
    // arbetsandelen var känd → för högt avdrag som Skatteverket nekar).
    // Legacy-rader utan flaggor: härled ur offertens kopierade avdrag.
    const radBas = rotRutLaborBasis(allItems, rotRutType as 'rot' | 'rut')
    const eligibleLabor = radBas > 0 ? radBas : (rotRutDeduction ? rotRutDeduction / rate : 0)
    if (eligibleLabor > 0) {
      const capped = await calculateCappedDeduction(
        project.customer_id,
        businessId,
        rotRutType as 'rot' | 'rut',
        eligibleLabor,
        { vatRate },
      )
      rotRutDeduction = capped.deduction
    }
    customerPays = total - rotRutDeduction
  }

  return {
    ok: true,
    project: {
      project_id: project.project_id,
      name: project.name ?? null,
      customer_id: project.customer_id,
      quote_id: project.quote_id ?? null,
    },
    items: allItems,
    subtotal,
    vatRate,
    vatAmount,
    total,
    rotRutType: (rotRutType as 'rot' | 'rut' | null) || null,
    rotRutDeduction,
    customerPays: customerPays ?? total,
    personnummer,
    fastighetsbeteckning,
    ataChangeIds: (atas || []).map(a => a.change_id),
    hasAta: ataItems.length > 0,
  }
}
