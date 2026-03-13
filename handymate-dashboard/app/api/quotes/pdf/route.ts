import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { calculateSubtotal } from '@/lib/quote-calculations'
import {
  escapeHtml,
  formatCurrency,
  formatDateLong,
  buildContactLine,
  renderDocumentHeader,
  renderTealLine,
  renderFooterGrid,
  wrapInPage,
} from '@/lib/document-html'

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { quoteId } = await request.json()

    const { data: quote } = await supabase
      .from('quotes')
      .select('*')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .single()

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const { data: quoteItems } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('sort_order', { ascending: true })
    quote.quote_items = quoteItems || []

    if (quote.customer_id) {
      const { data: customer } = await supabase
        .from('customer')
        .select('*')
        .eq('customer_id', quote.customer_id)
        .single()
      quote.customer = customer
    }

    const { data: config } = await supabase
      .from('business_config')
      .select('accent_color, logo_url, bankgiro, plusgiro, default_quote_terms, swish_number, org_number, f_skatt_registered, contact_email, phone_number, address, service_area, contact_name, website')
      .eq('business_id', business.business_id)
      .single()

    const html = generateQuoteHTML(quote, business, config)

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="Offert-${quote.quote_number || quoteId}.html"`,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('PDF generation error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const quoteId = request.nextUrl.searchParams.get('id')

    if (!quoteId) {
      return NextResponse.json({ error: 'Missing quote ID' }, { status: 400 })
    }

    const { data: quote } = await supabase
      .from('quotes')
      .select('*')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .single()

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const { data: quoteItems } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('sort_order', { ascending: true })
    quote.quote_items = quoteItems || []

    if (quote.customer_id) {
      const { data: customer } = await supabase
        .from('customer')
        .select('*')
        .eq('customer_id', quote.customer_id)
        .single()
      quote.customer = customer
    }

    const { data: config } = await supabase
      .from('business_config')
      .select('accent_color, logo_url, bankgiro, plusgiro, default_quote_terms, swish_number, org_number, f_skatt_registered, contact_email, phone_number, address, service_area, contact_name, website')
      .eq('business_id', business.business_id)
      .single()

    const html = generateQuoteHTML(quote, business, config)

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── Helpers ────────────────────────────────────────────────────

function getUnitLabel(unit: string): string {
  switch (unit) {
    case 'hour': case 'h': case 'tim': return 'tim'
    case 'piece': case 'st': return 'st'
    case 'm2': return 'm²'
    case 'm': return 'm'
    case 'lm': return 'lm'
    case 'pauschal': return 'pauschal'
    case 'kg': return 'kg'
    case 'l': return 'l'
    default: return unit || 'st'
  }
}

// ── HTML generation ────────────────────────────────────────────

function generateQuoteHTML(quote: any, business: any, config: any): string {
  const quoteNumber = quote.quote_number || quote.quote_id?.substring(0, 8).toUpperCase()
  const structuredItems: any[] = quote.quote_items || []
  const hasStructuredItems = structuredItems.length > 0
  const detailLevel = quote.detail_level || 'detailed'
  const showUnitPrices = quote.show_unit_prices !== false
  const showQuantities = quote.show_quantities !== false

  // Legacy items
  const items = quote.items || []
  const laborItems = items.filter((i: any) => i.type === 'labor')
  const materialItems = items.filter((i: any) => i.type === 'material')
  const serviceItems = items.filter((i: any) => i.type === 'service')

  const terms = quote.terms || {}
  const images: string[] = quote.images || []
  const paymentPlan: any[] = quote.payment_plan || []

  // Business contact info
  const contactLine = buildContactLine(
    config?.contact_name || business?.contact_name,
    config?.phone_number || business?.phone_number,
    config?.contact_email || business?.contact_email,
    config?.website,
  )

  // ── Header ──
  const header = renderDocumentHeader(
    business?.business_name || 'Företag',
    contactLine,
    'Offert',
    quoteNumber,
  )

  // ── Meta row ──
  const customerAddress = [
    quote.customer?.name || 'Kund',
    quote.customer?.address_line || '',
  ].filter(Boolean).join('<br>')

  const projectDesc = [
    quote.title || quote.description?.substring(0, 60) || '',
    quote.project_address || '',
  ].filter(Boolean).map(s => escapeHtml(s)).join('<br>')

  const metaRow = `
  <div class="meta-row meta-row-3">
    <div class="meta-block">
      <div class="label">Kund</div>
      <div class="value">${customerAddress}</div>
    </div>
    <div class="meta-block">
      <div class="label">Offertdatum</div>
      <div class="value">${formatDateLong(quote.created_at)}</div>
      <div class="label" style="margin-top:12px">Giltig till</div>
      <div class="value highlight">${formatDateLong(quote.valid_until)}</div>
    </div>
    <div class="meta-block">
      <div class="label">Avser</div>
      <div class="value">${projectDesc || 'Arbete enligt nedan'}</div>
    </div>
  </div>`

  // ── References ──
  let referencesHtml = ''
  if (quote.reference_person || quote.customer_reference || quote.project_address) {
    const refs: string[] = []
    if (quote.reference_person) refs.push(`<div class="ref-item"><span>Vår referens:</span> <strong>${escapeHtml(quote.reference_person)}</strong></div>`)
    if (quote.customer_reference) refs.push(`<div class="ref-item"><span>Er referens:</span> <strong>${escapeHtml(quote.customer_reference)}</strong></div>`)
    if (quote.project_address) refs.push(`<div class="ref-item"><span>Projektadress:</span> <strong>${escapeHtml(quote.project_address)}</strong></div>`)
    referencesHtml = `<div class="references">${refs.join('')}</div>`
  }

  // ── Images ──
  const imagesHtml = images.length > 0
    ? `<div class="images">${images.slice(0, 3).map((img: string) => `<img src="${escapeHtml(img)}" alt="Projektbild" />`).join('')}</div>`
    : ''

  // ── Introduction text ──
  const introHtml = quote.introduction_text
    ? `<div class="intro-text">${escapeHtml(quote.introduction_text)}</div>`
    : ''

  // ── Items table ──
  let itemsTableHtml = ''
  if (detailLevel !== 'total_only') {
    itemsTableHtml = hasStructuredItems
      ? renderStructuredItems(structuredItems, detailLevel, showQuantities, showUnitPrices)
      : renderLegacyItems(laborItems, materialItems, serviceItems)
  }

  // ── Not included ──
  const notIncludedHtml = quote.not_included
    ? `<div class="not-included"><div class="ni-title">Ej inkluderat i offerten</div><p>${escapeHtml(quote.not_included)}</p></div>`
    : ''

  // ── ATA terms ──
  const ataHtml = quote.ata_terms
    ? `<div class="ata-terms"><div class="ata-title">ÄTA-villkor</div><p>${escapeHtml(quote.ata_terms)}</p></div>`
    : ''

  // ── Totals ──
  const subtotal = quote.subtotal || (quote.total / 1.25)
  const vatRate = quote.vat_rate || 25
  const vatAmount = quote.vat_amount || (quote.total * 0.2)
  const hasRot = quote.rot_work_cost > 0 || (quote.rot_rut_type === 'rot')
  const hasRut = quote.rut_work_cost > 0 || (quote.rot_rut_type === 'rut')
  const rotDeduction = quote.rot_deduction || quote.rot_rut_deduction || 0
  const rutDeduction = quote.rut_deduction || 0
  const totalDeduction = rotDeduction + rutDeduction
  const customerPays = quote.rot_customer_pays || quote.rut_customer_pays || quote.customer_pays || quote.total

  let totalsRows = ''
  totalsRows += `<div class="t-row"><span>Netto exkl. moms</span><span>${formatCurrency(subtotal)}</span></div>`
  if (quote.discount_amount > 0) {
    totalsRows += `<div class="t-row"><span>Rabatt</span><span>-${formatCurrency(quote.discount_amount)}</span></div>`
  }
  totalsRows += `<div class="t-row"><span>Moms ${vatRate}%</span><span>${formatCurrency(vatAmount)}</span></div>`
  if (hasRot) {
    totalsRows += `<div class="t-row rot"><span>ROT-avdrag 30%</span><span>-${formatCurrency(rotDeduction)}</span></div>`
  }
  if (hasRut) {
    totalsRows += `<div class="t-row rot"><span>RUT-avdrag 50%</span><span>-${formatCurrency(rutDeduction)}</span></div>`
  }
  if (totalDeduction > 0) {
    totalsRows += `<div class="t-row final"><span>Att betala</span><span>${formatCurrency(customerPays)}</span></div>`
  } else {
    totalsRows += `<div class="t-row final"><span>Totalt inkl. moms</span><span>${formatCurrency(quote.total || 0)}</span></div>`
  }

  const totalsHtml = `
  <div class="totals">
    <div class="totals-block">
      ${totalsRows}
    </div>
  </div>`

  // ── Payment plan ──
  let paymentPlanHtml = ''
  if (paymentPlan.length > 0) {
    const ppRows = paymentPlan.map((entry: any, idx: number) => {
      const amount = entry.amount || Math.round((quote.total || 0) * (entry.percent || 0) / 100)
      return `<tr>
        <td><div class="item-name">${escapeHtml(entry.label || `Delfaktura ${idx + 1}`)}</div></td>
        <td class="r">${entry.percent || 0}%</td>
        <td class="amt">${formatCurrency(amount)}</td>
        <td class="r">${escapeHtml(entry.due_description || '')}</td>
      </tr>`
    }).join('')

    paymentPlanHtml = `
    <div class="payment-plan">
      <div class="pp-title">Betalningsplan</div>
      <table class="items">
        <thead><tr>
          <th style="width:40%">Delfaktura</th>
          <th class="r" style="width:15%">Andel</th>
          <th class="r" style="width:25%">Belopp</th>
          <th class="r" style="width:20%">Förfaller</th>
        </tr></thead>
        <tbody>${ppRows}</tbody>
      </table>
    </div>`
  }

  // ── Conclusion text ──
  const conclusionHtml = quote.conclusion_text
    ? `<div class="conclusion-text">${escapeHtml(quote.conclusion_text)}</div>`
    : ''

  // ── Sign box ──
  const isSigned = !!quote.signature_data || quote.status === 'signed'
  const signBoxHtml = `
  <div class="sign-box">
    <div>
      <div class="sign-label">${isSigned ? 'Offerten godkänd med digital signatur' : 'Godkänn offerten med digital signatur'}</div>
      <div class="sign-link">handymate.se/sign/${escapeHtml(quoteNumber)}</div>
    </div>
    <div class="sign-badge${isSigned ? ' signed' : ''}">${isSigned
      ? `E-signerad ${quote.signed_by_name ? escapeHtml(quote.signed_by_name) : ''} ${quote.signed_at ? formatDateLong(quote.signed_at) : ''}`
      : 'Inväntar signatur'
    }</div>
  </div>`

  // ── Footer ──
  const orgNumber = config?.org_number || business?.org_number || ''
  const fSkatt = config?.f_skatt_registered ?? business?.f_skatt_registered
  const bankgiro = config?.bankgiro || ''

  const footerHtml = renderFooterGrid([
    {
      label: 'Betalningsvillkor',
      value: escapeHtml(`${terms.payment_terms || 30} dagar netto`),
    },
    {
      label: 'Org.nr / F-skatt',
      value: [
        escapeHtml(orgNumber),
        fSkatt ? 'Godkänd för F-skatt' : '',
      ].filter(Boolean).join('<br>'),
    },
    {
      label: 'Bankgiro',
      value: escapeHtml(bankgiro) || '—',
    },
  ])

  // ── Assemble ──
  const bodyHtml = [
    header,
    renderTealLine(),
    metaRow,
    referencesHtml,
    imagesHtml,
    introHtml,
    itemsTableHtml ? `<div class="section-title">Arbeten och material</div>` + itemsTableHtml : '',
    notIncludedHtml,
    ataHtml,
    totalsHtml,
    paymentPlanHtml,
    conclusionHtml,
    signBoxHtml,
    footerHtml,
  ].filter(Boolean).join('\n')

  return wrapInPage(
    `Offert ${escapeHtml(quoteNumber)} — ${escapeHtml(business?.business_name || '')}`,
    '',
    bodyHtml,
  )
}

// ── Structured items table ─────────────────────────────────────

function renderStructuredItems(
  items: any[],
  detailLevel: string,
  showQuantities: boolean,
  showUnitPrices: boolean,
): string {
  // Column config
  const headerCols: string[] = ['<th style="width:44%">Beskrivning</th>']
  if (showQuantities) {
    headerCols.push('<th class="r" style="width:10%">Antal</th>')
    headerCols.push('<th class="r" style="width:10%">Enhet</th>')
  }
  if (showUnitPrices) {
    headerCols.push('<th class="r" style="width:18%">Pris/enhet</th>')
  }
  headerCols.push('<th class="r" style="width:18%">Summa</th>')

  const colCount = headerCols.length
  const rows: string[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    if (item.item_type === 'heading') {
      rows.push(`<tr class="heading-row"><td colspan="${colCount}">${escapeHtml(item.description || item.group_name || '')}</td></tr>`)
      continue
    }

    if (item.item_type === 'text') {
      if (detailLevel === 'subtotals_only') continue
      rows.push(`<tr class="text-row"><td colspan="${colCount}">${escapeHtml(item.description || '')}</td></tr>`)
      continue
    }

    if (item.item_type === 'item') {
      if (detailLevel === 'subtotals_only') continue
      const lineTotal = item.quantity * item.unit_price
      const rotBadge = item.is_rot_eligible ? ' <span class="rot-badge">ROT</span>' : ''
      const rutBadge = item.is_rut_eligible ? ' <span class="rut-badge">RUT</span>' : ''
      const descHtml = `<div class="item-name">${escapeHtml(item.description || '')}${rotBadge}${rutBadge}</div>${item.article_number ? `<div class="item-desc">Art.nr: ${escapeHtml(item.article_number)}</div>` : ''}`

      const cols: string[] = [`<td>${descHtml}</td>`]
      if (showQuantities) {
        cols.push(`<td class="r">${item.quantity}</td>`)
        cols.push(`<td class="r">${getUnitLabel(item.unit)}</td>`)
      }
      if (showUnitPrices) {
        cols.push(`<td class="r">${formatCurrency(item.unit_price)}</td>`)
      }
      cols.push(`<td class="amt">${formatCurrency(lineTotal)}</td>`)
      rows.push(`<tr>${cols.join('')}</tr>`)
      continue
    }

    if (item.item_type === 'subtotal') {
      const subtotalValue = calculateSubtotal(items, i)
      const spanCount = colCount - 1
      rows.push(`<tr class="subtotal-row"><td colspan="${spanCount}" style="text-align:right">${escapeHtml(item.description || 'Delsumma')}</td><td class="amt">${formatCurrency(subtotalValue)}</td></tr>`)
      continue
    }

    if (item.item_type === 'discount') {
      const discountAmount = item.total || -(Math.abs(item.quantity) * Math.abs(item.unit_price))
      const spanCount = colCount - 1
      rows.push(`<tr class="discount-row"><td colspan="${spanCount}">${escapeHtml(item.description || 'Rabatt')}</td><td class="amt">${formatCurrency(discountAmount)}</td></tr>`)
      continue
    }
  }

  return `
  <table class="items">
    <thead><tr>${headerCols.join('')}</tr></thead>
    <tbody>${rows.join('\n')}</tbody>
  </table>`
}

// ── Legacy items table ─────────────────────────────────────────

function renderLegacyItems(
  laborItems: any[],
  materialItems: any[],
  serviceItems: any[],
): string {
  const allItems = [
    ...laborItems.map((i: any) => ({ ...i, _section: 'Arbete' })),
    ...materialItems.map((i: any) => ({ ...i, _section: 'Material' })),
    ...serviceItems.map((i: any) => ({ ...i, _section: 'Tjänster' })),
  ]

  if (allItems.length === 0) return ''

  const rows: string[] = []
  let currentSection = ''

  for (const item of allItems) {
    if (item._section !== currentSection) {
      currentSection = item._section
      rows.push(`<tr class="heading-row"><td colspan="5">${escapeHtml(currentSection)}</td></tr>`)
    }
    rows.push(`<tr>
      <td><div class="item-name">${escapeHtml(item.name || '')}</div>${item.description ? `<div class="item-desc">${escapeHtml(item.description)}</div>` : ''}</td>
      <td class="r">${item.quantity}</td>
      <td class="r">${getUnitLabel(item.unit)}</td>
      <td class="r">${formatCurrency(item.unit_price)}</td>
      <td class="amt">${formatCurrency(item.total)}</td>
    </tr>`)
  }

  return `
  <table class="items">
    <thead><tr>
      <th style="width:44%">Beskrivning</th>
      <th class="r" style="width:10%">Antal</th>
      <th class="r" style="width:10%">Enhet</th>
      <th class="r" style="width:18%">Pris/enhet</th>
      <th class="r" style="width:18%">Summa</th>
    </tr></thead>
    <tbody>${rows.join('\n')}</tbody>
  </table>`
}
