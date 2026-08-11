/**
 * Attendee-email → kund (Meeting Intelligence Epic 1, 2026-08-11).
 *
 * Externa kalenderhändelser kunde aldrig kundattribueras — deltagarlistan
 * kastades vid API-gränsen och schedule_entry saknade customer_id (v118).
 * Den här hjälparen är den minsta upplösaren som gör jobbet vid synk:
 * matcha deltagar-emails mot customer.email inom tenanten.
 *
 * Medvetet enklare än lib/matte/resolver.ts (som bygger FULL kontext för
 * en identifierare) — vid synk av potentiellt hundratals event behövs bara
 * "vems möte är det här?", en batchbar fråga. Resolvern används sen när
 * briefen/analysen behöver hela bilden.
 *
 * Egna adresser (kalenderkontot, organisatören när det är hantverkaren
 * själv) filtreras bort — annars matchar hantverkarens egen adress om han
 * någonsin lagts upp som kund (testdata) och allt attribueras fel.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function resolveCustomerFromAttendees(
  supabase: SupabaseClient,
  businessId: string,
  attendees: string[],
  ownEmails: Array<string | null | undefined>,
): Promise<string | null> {
  const egna = new Set(
    ownEmails.filter((e): e is string => Boolean(e)).map(e => e.toLowerCase()),
  )
  const kandidater = Array.from(
    new Set(
      (attendees || [])
        .map(e => (e || '').toLowerCase().trim())
        .filter(e => e && !egna.has(e)),
    ),
  )
  if (kandidater.length === 0) return null

  const { data } = await supabase
    .from('customer')
    .select('customer_id, email')
    .eq('business_id', businessId)
    .in('email', kandidater)
    .limit(2)

  // Exakt en träff → attribuera. Fler än en (två kunder i samma möte) →
  // avstå hellre än gissa; hantverkaren kan koppla själv.
  if (data && data.length === 1) return data[0].customer_id
  return null
}
