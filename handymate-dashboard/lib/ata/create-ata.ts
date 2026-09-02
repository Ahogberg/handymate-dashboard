/**
 * skapaAta — EN väg att skapa en ÄTA, delad av `POST /api/ata` och
 * `POST /api/projects/[id]/changes`.
 *
 * ═══ VARFÖR ═══
 *
 * De två skapande-rutterna drev isär: `/api/ata` satte sign_token, rader,
 * total och status 'draft' — `/changes` satte inget av det (status 'pending',
 * bara `amount`), så en ÄTA skapad den vägen kunde aldrig skickas till kund
 * (send-routen kräver sign_token). Nu bor insert-logiken här.
 *
 * ═══ INVARIANTER ═══
 *
 * - `ata_number` sätts INTE här — DB-triggern `set_ata_number()` räknar
 *   MAX+1 per PROJEKT (sql/v10_ata.sql). Att sätta den från koden skulle
 *   tävla med triggern och ge dubbletter under samtidiga anrop.
 * - `vat_rate` fryses vid skapande från `business_config.default_vat_rate`
 *   (sql/vat_rate.sql) så att en senare ändring av företagets momssats inte
 *   skriver om en redan skickad ÄTA:s summor.
 * - Rader normaliseras (`normaliseraAtaRader`) så att `total` alltid speglar
 *   det kunden får se — inte ett råbody-objekt med okända nycklar.
 */

import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normaliseraAtaRader } from './items'
import { beraknaAtaSummor } from './totals'

export interface SkapaAtaInput {
  projectId: string
  changeType: string
  description: string
  items?: unknown
  hours?: number | null
  notes?: string | null
  customerId?: string | null
  /** Legacy-fält från /changes-rutten: belopp exkl. moms när rader saknas. */
  amount?: number | null
}

export type SkapaAtaResultat =
  | { ok: true; ata: Record<string, any> }
  | { ok: false; error: string; status: number }

/**
 * Skapa en ÄTA i status 'draft'. Anroparen ansvarar för auth och för att
 * projekt/kund verifierats mot företaget (verifyOwnership) FÖRE anropet —
 * service role kringgår RLS.
 */
export async function skapaAta(
  supabase: SupabaseClient,
  business: { business_id: string; default_vat_rate?: number | null },
  input: SkapaAtaInput,
): Promise<SkapaAtaResultat> {
  const description = (input.description || '').trim()
  if (!input.projectId || !description || !input.changeType) {
    return { ok: false, error: 'Projekt, beskrivning och typ av ändring krävs', status: 400 }
  }

  const items = normaliseraAtaRader(input.items)

  // Momssatsen: business-objektet från getAuthenticatedBusiness bär oftast
  // default_vat_rate; saknas den slås den upp så att frysningen blir rätt.
  let vatRate = Number(business.default_vat_rate)
  if (!Number.isFinite(vatRate)) {
    const { data: cfg } = await supabase
      .from('business_config')
      .select('default_vat_rate')
      .eq('business_id', business.business_id)
      .maybeSingle()
    vatRate = Number(cfg?.default_vat_rate)
    if (!Number.isFinite(vatRate)) vatRate = 25
  }

  // total = delsumma exkl. moms, ALLTID positiv — konsumenterna (invoice-
  // preview, project-invoice-draft, create-final-invoice, projekt-GET)
  // lägger själva på tecknet ur change_type === 'removal'. Ett negativt
  // lagrat total skulle dubbelnegeras där. Utan rader faller vi tillbaka
  // på legacy-`amount` så /changes-anropare inte får 0.
  const summor = beraknaAtaSummor(items, vatRate, input.changeType)
  const total = items.length > 0
    ? Math.abs(summor.delsumma)
    : Math.abs(Number(input.amount) || 0)

  const { data, error } = await supabase
    .from('project_change')
    .insert({
      business_id: business.business_id,
      project_id: input.projectId,
      change_type: input.changeType,
      description,
      items,
      total,
      amount: total,
      hours: Number(input.hours) || 0,
      vat_rate: vatRate,
      status: 'draft',
      sign_token: randomUUID(),
      notes: input.notes || null,
      customer_id: input.customerId || null,
    })
    .select()
    .single()

  if (error) {
    console.error('[skapaAta] insert error:', error)
    return { ok: false, error: 'Kunde inte skapa ÄTA:n', status: 500 }
  }

  return { ok: true, ata: data }
}
