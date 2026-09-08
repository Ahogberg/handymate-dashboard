/**
 * Offert-identitet (v68): hämta den SKAPANDE användarens kontaktuppgifter
 * (name/phone/email) via quotes.created_by → business_users.id.
 *
 * Returnerar null när created_by saknas (gamla offerter) eller posten inte
 * hittas → buildQuoteTemplateData faller då tillbaka på ägarens
 * business_config exakt som förr. Best effort: en misslyckad query blockerar
 * aldrig renderingen, den ger bara fallback-vägen.
 */
export async function fetchQuoteCreator(
  supabase: any,
  createdBy: string | null | undefined,
  businessId?: string,
): Promise<{ name: string | null; phone: string | null; email: string | null } | null> {
  if (!createdBy) return null
  let query = supabase
    .from('business_users')
    .select('name, phone, email')
    .eq('id', createdBy)
  if (businessId) query = query.eq('business_id', businessId)
  const { data } = await query.maybeSingle()
  if (!data) return null
  return {
    name: data.name ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
  }
}
