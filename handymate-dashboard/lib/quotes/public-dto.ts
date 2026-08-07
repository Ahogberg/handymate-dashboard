/**
 * Den publika offert-DTO:n är en allowlist. Databasraden hämtas med service
 * role och kan få nya interna kolumner utan att de automatiskt hamnar i ett
 * anonymt nätverkssvar.
 */
export function buildPublicQuoteDto({
  quote,
  customer,
  structuredItems,
  displayLevel,
  displayGroups,
  baseTotals,
  templateData,
  templateStyle,
  documentHtml,
}: {
  quote: Record<string, any>
  customer: Record<string, any> | null
  structuredItems: any[] | undefined
  displayLevel: string
  displayGroups: { heading: string; total: number }[] | undefined
  baseTotals: unknown
  templateData: unknown
  templateStyle: 'modern' | 'premium' | 'friendly'
  documentHtml: string | null
}) {
  return {
    quote_id: quote.quote_id,
    quote_number: quote.quote_number ?? null,
    title: quote.title ?? null,
    description: quote.description ?? null,
    status: quote.status,
    created_at: quote.created_at ?? null,
    valid_until: quote.valid_until ?? null,
    signed_at: quote.signed_at ?? null,
    signed_by_name: quote.signed_by_name ?? null,
    labor_total: quote.labor_total ?? 0,
    material_total: quote.material_total ?? 0,
    subtotal: quote.subtotal ?? 0,
    discount_amount: quote.discount_amount ?? 0,
    discount_percent: quote.discount_percent ?? 0,
    vat_amount: quote.vat_amount ?? 0,
    vat_rate: quote.vat_rate ?? 25,
    total: quote.total ?? 0,
    rot_rut_type: quote.rot_rut_type ?? null,
    rot_rut_deduction: quote.rot_rut_deduction ?? 0,
    customer_pays: quote.customer_pays ?? quote.total ?? 0,
    attachments: Array.isArray(quote.attachments) ? quote.attachments : [],
    customer: customer
      ? {
          name: customer.name ?? '',
          phone_number: customer.phone_number ?? null,
          email: customer.email ?? null,
          address_line: customer.address_line ?? null,
          // Behövs endast för legacy-sidans redirect till samma kunds portal.
          portal_token: customer.portal_token ?? null,
        }
      : null,
    structured_items: structuredItems,
    display_level: displayLevel,
    display_groups: displayGroups,
    base_totals: baseTotals,
    template_data: templateData,
    template_style: templateStyle,
    document_html: documentHtml,
  }
}
