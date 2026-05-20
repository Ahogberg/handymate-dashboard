import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Client-side Supabase client (for use in React components)
//
// Explicit auth-config för att garantera att JWT-tokens auto-refreshas i
// bakgrunden. Default är true i v2 men explicit konfig förebygger framtida
// regressioner + dokumenterar avsikten. Cookies persistas så server-side
// getAuthenticatedBusiness ser uppdaterade tokens. detectSessionInUrl
// hanterar magic-link/OAuth-callbacks som kommer tillbaka med ?code=...
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null as any

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
