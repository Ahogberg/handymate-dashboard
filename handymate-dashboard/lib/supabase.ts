import { createClient } from '@supabase/supabase-js'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/**
 * Webbläsarens Supabase-klient.
 *
 * ═══ VARFÖR createClientComponentClient OCH INTE createClient ═══
 *
 * Inloggningen sker helt på servern: /dashboard-sidorna postar till
 * /api/auth, som kör signInWithPassword på en createRouteHandlerClient.
 * Sessionen hamnar därmed i cookies — inte i webbläsarens localStorage.
 *
 * Den här filen byggde tidigare klienten med rå createClient från
 * supabase-js. Den lagrar sessionen i localStorage, som aldrig fylldes.
 * Följden: varje läsning som en React-komponent gjorde gick som rollen
 * `anon`, aldrig som den inloggade användaren. Det märktes inte så länge
 * tabellerna hade en villkorslöst öppen policy.
 *
 * v96 stängde den dörren — `REVOKE ALL ... FROM anon` på business_config,
 * project, project_change, project_material, time_entry och
 * supplier_invoices, med policyer bara för `authenticated` och
 * `service_role`. Från den stunden svarade alla klientläsningar av de sex
 * tabellerna med nekad behörighet. Inställningssidan visade "Kunde inte
 * ladda inställningar"; 27 andra ytor läste tyst tomt.
 *
 * createClientComponentClient läser samma cookie som routehanteraren
 * skriver. Klienten blir alltså den faktiskt inloggade användaren, RLS
 * bedömer honom som medlem i sitt eget företag, och läsningarna går
 * igenom — som sig själv, inte som anon.
 *
 * Under SSR av klientkomponenter finns ingen cookie att läsa i den här
 * modulen. Där byggs en sessionslös klient; komponenterna läser ändå i
 * useEffect, alltså i webbläsaren.
 */
export const supabase = !supabaseUrl || !supabaseAnonKey
  ? (null as any)
  : typeof window === 'undefined'
    ? createClient(supabaseUrl, supabaseAnonKey)
    : createClientComponentClient()

// Server-side Supabase client with service role (for use in API routes)
export function getServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Types för vår databas
export interface Customer {
  id: string
  phone: string
  name: string | null
  email: string | null
  address: string | null
  created_at: string
  business_id: string
}

export interface Booking {
  id: string
  customer_id: string
  business_id: string
  service_type: string
  scheduled_time: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  notes: string | null
  created_at: string
  customer?: Customer
}

export interface Case {
  id: string
  customer_id: string
  business_id: string
  call_id: string | null
  summary: string | null
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  created_at: string
  customer?: Customer
  booking?: Booking
}

export interface Event {
  id: string
  business_id: string
  event_type: string
  entity_type: string
  entity_id: string
  data: Record<string, any>
  created_at: string
}
