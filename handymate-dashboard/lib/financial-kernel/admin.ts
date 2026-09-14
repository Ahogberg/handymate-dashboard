import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { getServerSupabase } from '@/lib/supabase'
import { isSuperAdmin } from '@/lib/auth/superadmin'
import type { KernelDb } from './events/publish'
import { AUTOMATION_BRIDGE_CONSUMER } from './events/bridge-automation'

/** Verify the actor with Auth, never with request body or an impersonated business. */
export async function financialKernelAdmin(request: NextRequest): Promise<string | null> {
  try {
    const bearer = request.headers.get('authorization')
    const cookieStore = cookies()
    const client = bearer?.startsWith('Bearer ') ? getServerSupabase()
      : createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user }, error } = await client.auth.getUser(bearer?.startsWith('Bearer ') ? bearer.slice(7) : undefined)
    return !error && isSuperAdmin(user) && user ? user.id : null
  } catch { return null }
}
export function requiredText(value: unknown, name: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new TypeError(`Ogiltigt ${name}`)
  return value.trim()
}
export function adminFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof TypeError) return NextResponse.json({ error: message }, { status: 400 })
  if (message.includes('not_found')) return NextResponse.json({ error: 'Posten hittades inte' }, { status: 404 })
  if (message.includes('not_resolvable')) return NextResponse.json({ error: 'Posten har ändrats. Uppdatera listan.' }, { status: 409 })
  return NextResponse.json({ error: 'Åtgärden kunde inte bekräftas. Uppdatera listan innan du försöker igen.' }, { status: 500 })
}
export interface ConsumerStatus { last_seq: string; backlog: string; lease_active: boolean; halted_at: string | null }
export async function consumerStatus(db: KernelDb, businessId: string): Promise<ConsumerStatus[]> {
  const { data, error } = await db.rpc('get_financial_consumer_status', { p_business_id: businessId, p_consumer: AUTOMATION_BRIDGE_CONSUMER })
  if (error) throw new Error(error.message)
  if (!Array.isArray(data)) throw new TypeError('Invalid consumer status')
  return data as ConsumerStatus[]
}
