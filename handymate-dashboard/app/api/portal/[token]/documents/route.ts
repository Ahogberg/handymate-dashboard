import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getCustomerFromPortalToken } from '@/lib/portal-link'
import { signStorageUrl } from '@/lib/storage-signing'

export const dynamic = 'force-dynamic'

const CUSTOMER_BUCKET = 'customer-documents'
const PROJECT_BUCKET = 'project-files'

export interface PortalDocumentDto {
  id: string
  source: 'customer' | 'project' | 'generated'
  name: string
  category: string | null
  project_id: string | null
  project_name: string | null
  uploaded_at: string | null
  /** Signerad URL (1 h) — aldrig en rå storage-sökväg. */
  url: string
  mime_type: string | null
}

/**
 * GET /api/portal/[token]/documents — kundens filer i portalen.
 * Fastighetspasset steg 1, 2026-08-27.
 *
 * Dokumentfliken visade bara offerter/fakturor och bar en kommentar om att
 * "customer_documents-tabell" saknades. Tre tabeller finns: customer_document
 * (kundens filer), project_document (projektens filer) och generated_document
 * (signerade genererade dokument med PDF). Här läses alla tre, scope:ade på
 * kunden, med signerade URL:er (privata buckets sedan v151). Varje delfråga
 * kollar `error` (TD-22) — ett fel i en källa gör att just den källan
 * utelämnas och loggas, aldrig en tyst tom lista.
 */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getServerSupabase()
    const customer = await getCustomerFromPortalToken(supabase, params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })
    const businessId = customer.business_id
    const customerId = customer.customer_id

    const { data: projects, error: projErr } = await supabase
      .from('project')
      .select('project_id, name')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
    if (projErr) {
      console.error('[portal/documents] project query error:', projErr)
      return NextResponse.json({ error: 'Kunde inte hämta dokumenten just nu' }, { status: 500 })
    }
    const projectName = new Map((projects || []).map(p => [p.project_id as string, (p.name as string) || 'Projekt']))
    const projectIds = Array.from(projectName.keys())

    const [custRes, projRes, genRes] = await Promise.all([
      supabase
        .from('customer_document')
        .select('id, file_name, file_url, file_type, category, uploaded_at')
        .eq('business_id', businessId)
        .eq('customer_id', customerId)
        .order('uploaded_at', { ascending: false })
        .limit(200),
      projectIds.length > 0
        ? supabase
            .from('project_document')
            .select('id, project_id, name, file_path, mime_type, category, created_at')
            .eq('business_id', businessId)
            .in('project_id', projectIds)
            .order('created_at', { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('generated_document')
        .select('id, project_id, title, status, pdf_url, created_at')
        .eq('business_id', businessId)
        .eq('customer_id', customerId)
        .not('pdf_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    for (const [namn, res] of [['customer_document', custRes], ['project_document', projRes], ['generated_document', genRes]] as const) {
      if (res.error) console.error(`[portal/documents] ${namn} query error:`, res.error)
    }

    const documents: PortalDocumentDto[] = []
    for (const d of (custRes.data || []) as Array<Record<string, unknown>>) {
      const url = await signStorageUrl(supabase, CUSTOMER_BUCKET, d.file_url as string, 3600)
      if (!url) continue
      documents.push({
        id: `c-${d.id}`, source: 'customer', name: (d.file_name as string) || 'Dokument',
        category: (d.category as string) ?? null, project_id: null, project_name: null,
        uploaded_at: (d.uploaded_at as string) ?? null, url, mime_type: (d.file_type as string) ?? null,
      })
    }
    for (const d of (projRes.data || []) as Array<Record<string, unknown>>) {
      const url = await signStorageUrl(supabase, PROJECT_BUCKET, d.file_path as string, 3600)
      if (!url) continue
      const pid = d.project_id as string
      documents.push({
        id: `p-${d.id}`, source: 'project', name: (d.name as string) || 'Dokument',
        category: (d.category as string) ?? null, project_id: pid, project_name: projectName.get(pid) ?? null,
        uploaded_at: (d.created_at as string) ?? null, url, mime_type: (d.mime_type as string) ?? null,
      })
    }
    for (const d of (genRes.data || []) as Array<Record<string, unknown>>) {
      const pdf = d.pdf_url as string
      // pdf_url kan vara en publik URL eller en storage-sökväg — signera om
      // det går, annars används den som den är.
      const url = (await signStorageUrl(supabase, PROJECT_BUCKET, pdf, 3600)) || pdf
      const pid = (d.project_id as string | null) ?? null
      documents.push({
        id: `g-${d.id}`, source: 'generated', name: (d.title as string) || 'Dokument',
        category: (d.status as string) ?? null, project_id: pid, project_name: pid ? projectName.get(pid) ?? null : null,
        uploaded_at: (d.created_at as string) ?? null, url, mime_type: 'application/pdf',
      })
    }
    documents.sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || ''))
    return NextResponse.json({ documents })
  } catch (error) {
    console.error('[portal/documents] oväntat fel:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
