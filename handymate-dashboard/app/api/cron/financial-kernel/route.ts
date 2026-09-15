import {
  valueLedgerConsumer,
  kernelValueEnabled,
} from '@/lib/value/events/kernel-consumer'
import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'
import { kernelDb } from '@/lib/financial-kernel/kernel-db'
import { consumeOnce } from '@/lib/financial-kernel/events/consume'
import { automationBridge } from '@/lib/financial-kernel/events/bridge-automation'
import { listOwedEffectIntents } from '@/lib/financial-kernel/commands/service'
import { listFinancialKernelWork } from '@/lib/financial-kernel/shadow/service'
import { sweepInvoiceIntents } from '@/lib/financial-kernel/effects/sweep'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  if (!verifyCronSecret(request))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const deadline = Date.now() + 240_000
  const shouldStop = () => Date.now() >= deadline
  const sb = getServerSupabase(),
    db = kernelDb()
  let all
  try {
    all = await listFinancialKernelWork(db)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
  // Rotate the first business between scheduled runs so a busy tenant cannot starve the tail.
  const offset = all.length ? Math.floor(Date.now() / 600_000) % all.length : 0
  const businesses = [...all.slice(offset), ...all.slice(0, offset)]
  const summary = {
    businesses: 0,
    consumed: 0,
    swept: 0,
    halted: 0,
    unknown: 0,
    skipped: 0,
    budgetExhausted: false,
    errors: [] as { businessId: string; message: string }[],
  }
  for (const business of businesses) {
    if (shouldStop()) break
    const businessId = business.business_id
    summary.businesses++
    try {
      if (business.consume) {
        if (shouldStop()) break
        const result = await consumeOnce(db, businessId, automationBridge, {
          limit: 100,
          shouldStop,
        })
        summary.consumed += result.delivered
        if (result.halted) {
          summary.halted++
          await rapporteraTystFel(
            sb,
            businessId,
            'financial-kernel:consumer-halted',
            'Betalningsuppföljningen är pausad och behöver granskas av en administratör',
            { consumer: automationBridge.consumer },
          )
        }
      }
      if (shouldStop()) break
      if (business.sweep) {
        const owed = await listOwedEffectIntents(db, businessId)
        for (const row of owed) {
          if (shouldStop()) break
          const sweep = await sweepInvoiceIntents(businessId, row.invoice_id, {
            db,
            sb,
          })
          summary.swept += sweep.effects.length
          summary.unknown += sweep.markedUnknown
        }
      }
      if (shouldStop()) break
      if (business.consume && kernelValueEnabled()) {
        try {
          const valueResult = await consumeOnce(
            db,
            businessId,
            valueLedgerConsumer,
            { limit: 100, shouldStop },
          )
          if (valueResult.halted) {
            summary.halted++
            await rapporteraTystFel(
              sb,
              businessId,
              'financial-kernel:value-consumer-halted',
              'Värdeunderlaget är pausat och behöver granskas av en administratör',
              { consumer: valueLedgerConsumer.consumer },
            )
          }
        } catch (error) {
          summary.errors.push({
            businessId,
            message: `value-ledger: ${error instanceof Error ? error.message : String(error)}`,
          })
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      summary.errors.push({ businessId, message })
      await rapporteraTystFel(
        sb,
        businessId,
        'financial-kernel:runner-failed',
        message,
        { cron: 'financial-kernel' },
      )
    }
  }
  summary.skipped = businesses.length - summary.businesses
  summary.budgetExhausted = shouldStop()
  return NextResponse.json({ ok: summary.errors.length === 0, ...summary })
}
