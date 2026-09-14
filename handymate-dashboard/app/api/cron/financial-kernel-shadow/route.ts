import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { kernelDb } from '@/lib/financial-kernel/kernel-db'
import { listFinancialKernelWork } from '@/lib/financial-kernel/shadow/service'
import { runShadowForBusiness } from '@/lib/financial-kernel/shadow/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const deadline = Date.now() + 240_000, db = kernelDb(), sb = getServerSupabase()
  try {
    const work = (await listFinancialKernelWork(db)).filter(b => b.phase !== 'off')
    const { data, error } = await sb.from('business_config').select('business_id').eq('fortnox_connected', true)
    if (error) throw new Error(error.message)
    const connected = new Set((data ?? []).map(b => b.business_id))
    const all = work.filter(b => connected.has(b.business_id))
    const offset = all.length ? Math.floor(Date.now() / 86_400_000) % all.length : 0
    const businesses = [...all.slice(offset), ...all.slice(0, offset)]
    const results = [], errors: { businessId: string; message: string }[] = []
    let visited = 0
    for (const business of businesses) {
      if (Date.now() + 25_000 >= deadline) break
      visited++
      try { results.push({ businessId: business.business_id, ...await runShadowForBusiness(business.business_id, { trigger: 'cron', db, sb, deadline }) }) }
      catch (error) { errors.push({ businessId: business.business_id, message: error instanceof Error ? error.message : String(error) }) }
    }
    return NextResponse.json({ ok: errors.length === 0, results, errors, skipped: businesses.length - visited,
      budgetExhausted: Date.now() + 25_000 >= deadline })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }) }
}
