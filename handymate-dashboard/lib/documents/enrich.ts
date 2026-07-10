/**
 * Dokument-hjälpare — hämtar kund/projekt-relationer SEPARAT.
 *
 * BAKGRUND (bugfix 2026-07-10): generated_document/customer_document/
 * project_document saknar FK till customer/project i prod. De embeddade
 * joinsen (customer:customer_id(...), project:project_id(...)) avvisades
 * därför av PostgREST (PGRST200) → dokumentlistan 500:ade ALLTID och
 * POST:ens insert+select rullade tillbaka → noll dokument har någonsin
 * genererats i prod. Template-embedden behålls — den FK:n finns.
 *
 * Samma mönster som pipeline-rutten ("no FK on deal table"): batch-hämta
 * relationerna och fäst dem i JS så svarsformen mot frontend är oförändrad.
 */

type ServerSupabase = ReturnType<typeof import('@/lib/supabase').getServerSupabase>

/** Select för generated_document — ENDAST embeds vars FK finns i prod. */
export const GENERATED_DOCUMENT_SELECT =
  '*, template:template_id(id, name, category_id, category:category_id(id, name, slug, icon))'

interface DocLike {
  customer_id?: string | null
  project_id?: string | null
  customer?: unknown
  project?: unknown
}

/**
 * Fäster customer ({customer_id,name,phone_number,email}) och project
 * ({project_id,name}) på varje dokument. Muterar inte input — returnerar nya
 * objekt. Saknade relationer blir null (samma som embed-formen gav).
 */
export async function attachDocumentRelations<T extends DocLike>(
  supabase: ServerSupabase,
  businessId: string,
  docs: T[]
): Promise<T[]> {
  if (docs.length === 0) return docs

  const customerIds = Array.from(new Set(docs.map(d => d.customer_id).filter((v): v is string => !!v)))
  const projectIds = Array.from(new Set(docs.map(d => d.project_id).filter((v): v is string => !!v)))

  const [customersRes, projectsRes] = await Promise.all([
    customerIds.length > 0
      ? supabase
          .from('customer')
          .select('customer_id, name, phone_number, email')
          .eq('business_id', businessId)
          .in('customer_id', customerIds)
      : Promise.resolve({ data: [] as any[] }),
    projectIds.length > 0
      ? supabase
          .from('project')
          .select('project_id, name')
          .eq('business_id', businessId)
          .in('project_id', projectIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const customerById = new Map<string, any>()
  for (const c of customersRes.data ?? []) customerById.set(c.customer_id, c)
  const projectById = new Map<string, any>()
  for (const p of projectsRes.data ?? []) projectById.set(p.project_id, p)

  return docs.map(d => ({
    ...d,
    customer: d.customer_id ? customerById.get(d.customer_id) ?? null : null,
    project: d.project_id ? projectById.get(d.project_id) ?? null : null,
  }))
}
