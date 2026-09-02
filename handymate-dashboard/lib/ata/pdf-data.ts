/**
 * Uppslag av allt ÄTA-PDF:en behöver, givet en redan hämtad (och
 * behörighetsprövad) ÄTA-rad. Delas av den inloggade och den publika
 * PDF-rutten så att dokumentet blir identiskt oavsett vem som öppnar det.
 *
 * Projekt saknar FK till customer i prod (PGRST200 vid embeddad join),
 * därför tre separata uppslag.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { signStorageUrl } from '@/lib/storage-signing'
import type { AtaPdfBilaga, AtaPdfBusiness, AtaPdfCustomer, AtaPdfProject } from './pdf'

/** Bucketen ÄTA-bilagor ligger i (privat, se sql/v151_private_buckets.sql). */
export const ATA_BILAGE_BUCKET = 'project-files'

export interface AtaPdfKontext {
  business: AtaPdfBusiness | null
  customer: AtaPdfCustomer | null
  project: AtaPdfProject | null
  attachments: AtaPdfBilaga[]
}

export async function laddaAtaPdfKontext(
  supabase: SupabaseClient,
  ata: { change_id: string; business_id: string; project_id: string | null; customer_id?: string | null },
): Promise<AtaPdfKontext> {
  const [{ data: business }, { data: project }, { data: bilagor }] = await Promise.all([
    supabase
      .from('business_config')
      .select('business_name, org_number, address, phone_number, contact_email, logo_url')
      .eq('business_id', ata.business_id)
      .maybeSingle(),
    ata.project_id
      ? supabase
          .from('project')
          .select('name, project_number, customer_id')
          .eq('project_id', ata.project_id)
          .eq('business_id', ata.business_id)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
    supabase
      .from('project_document')
      .select('id, name, file_path, mime_type, created_at')
      .eq('change_id', ata.change_id)
      .eq('business_id', ata.business_id)
      .order('created_at', { ascending: true }),
  ])

  const customerId = ata.customer_id || project?.customer_id || null
  let customer: AtaPdfCustomer | null = null
  if (customerId) {
    const { data } = await supabase
      .from('customer')
      .select('name, address_line, visit_address, phone_number, email')
      .eq('customer_id', customerId)
      .eq('business_id', ata.business_id)
      .maybeSingle()
    customer = data ?? null
  }

  const attachments: AtaPdfBilaga[] = []
  for (const d of bilagor || []) {
    if (!d.file_path) continue
    const url = await signStorageUrl(supabase, ATA_BILAGE_BUCKET, d.file_path, 600)
    if (url) attachments.push({ name: d.name, mime_type: d.mime_type, url })
  }

  return {
    business: business ?? null,
    customer,
    project: project ? { name: project.name, project_number: project.project_number } : null,
    attachments,
  }
}

export function pdfSvar(buffer: Buffer, ataNumber: number | null | undefined): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ATA-${ataNumber ?? 'x'}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
