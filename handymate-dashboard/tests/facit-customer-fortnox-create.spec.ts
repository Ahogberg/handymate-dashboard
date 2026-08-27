/**
 * Facit: Fortnox-kundnummer vid SKAPANDET (2026-08-26).
 *
 * Bakgrund: synken var lat (bara vid första faktura/offert) → Fortnox
 * löpnummer i faktureringsordning, inte skapandeordning. Dessutom hittades
 * en P0-bugg: fortnox_sync_error saknades i prod, UPDATE:en efter Fortnox-
 * skapandet avvisades i sin helhet och funktionen returnerade success:true
 * ändå → nästa faktura skapade kunden på nytt i Fortnox (dubblettkunder).
 *
 *   npx playwright test tests/facit-customer-fortnox-create.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test.describe('P0 — syncCustomerToFortnox påstår aldrig success utan persisterat nummer', () => {
  const s = read('lib/fortnox.ts')
  const fn = s.slice(s.indexOf('export async function syncCustomerToFortnox'))
  const body = fn.slice(0, fn.indexOf('\n}\n') + 3)

  test('UPDATE:en efter Fortnox-skapandet läser error och returnerar success:false vid fel', () => {
    const upd = body.indexOf('fortnox_customer_number: fortnoxCustomer.CustomerNumber')
    expect(upd, 'UPDATE:en hittades inte').toBeGreaterThan(-1)
    const efter = body.slice(upd)
    expect(efter).toContain('if (updateError)')
    const felgren = efter.slice(efter.indexOf('if (updateError)'), efter.indexOf('return { success: true'))
    expect(felgren, 'felgrenen ska returnera success:false').toContain('success: false')
    expect(felgren, 'felgrenen ska eskalera till driftlarmet').toContain('rapporteraTystFel')
    expect(felgren).toContain("'fortnox:customer-number-not-persisted'")
  })

  test('båda UPDATE:arna är tenant-scopade på business_id', () => {
    const updates = body.split(".from('customer')").slice(1).filter(b => b.trimStart().startsWith('.update('))
    expect(updates.length).toBeGreaterThanOrEqual(2)
    for (const u of updates) {
      expect(u.slice(0, 400), 'UPDATE utan business_id-scope').toContain(".eq('business_id', businessId)")
    }
  })

  test('sql/v169 lägger till kolumnen som saknades', () => {
    const sql = read('sql/v169_customer_fortnox_sync_error.sql')
    expect(sql).toMatch(/ALTER TABLE customer ADD COLUMN IF NOT EXISTS fortnox_sync_error TEXT/)
  })
})

test.describe('syncNewCustomerToFortnox — hooken', () => {
  const s = read('lib/fortnox/sync.ts')
  const fn = s.slice(s.indexOf('export async function syncNewCustomerToFortnox'))

  test('finns, kortsluter på fortnox_connected och går via syncCustomerWithTracking', () => {
    expect(fn.length).toBeGreaterThan(0)
    const kortslut = fn.indexOf("select('fortnox_connected')")
    const synk = fn.indexOf('syncCustomerWithTracking(businessId, customerId)')
    expect(kortslut).toBeGreaterThan(-1)
    expect(synk).toBeGreaterThan(kortslut)
  })

  test('äkta fel (inte skipped) eskaleras till driftlarmet', () => {
    expect(fn).toContain("'customer-create:fortnox-sync'")
    expect(fn).toContain('rapporteraTystFel')
  })

  test('kastar aldrig — hela kroppen är i try/catch', () => {
    const kropp = fn.slice(0, fn.indexOf('\n}\n'))
    expect(kropp).toMatch(/^\s*try \{/m)
    expect(kropp).toContain('catch (err: unknown)')
  })
})

test.describe('de fem skapandevägarna anropar hooken EFTER sin insert-felkoll', () => {
  const vagar: Array<{ fil: string; insertMarkor: string; felkoll: string }> = [
    { fil: 'app/api/actions/route.ts', insertMarkor: "case 'create_customer'", felkoll: 'throw error' },
    { fil: 'app/api/customers/route.ts', insertMarkor: 'export async function POST', felkoll: 'if (error) throw error' },
    { fil: 'app/api/agent/trigger/tool-router.ts', insertMarkor: 'async function createCustomer(', felkoll: 'if (error) return { success: false, error: error.message }' },
    { fil: 'lib/leads/golden-path.ts', insertMarkor: "const newId = 'cust_'", felkoll: 'customerId = newCustomer?.customer_id || newId' },
    { fil: 'lib/approve-actions.ts', insertMarkor: 'async function createCustomer(supabase: SupabaseClient, suggestion', felkoll: 'if (error) throw error' },
  ]

  for (const v of vagar) {
    test(`${v.fil} synkar den nya kunden till Fortnox`, () => {
      const s = read(v.fil)
      const start = s.indexOf(v.insertMarkor)
      expect(start, `${v.insertMarkor} hittades inte`).toBeGreaterThan(-1)
      // 6000 (2026-08-27): create_customer fick ett 409-block for telefonmatch
      // fore hooken — 4000 tecken racker inte langre for den vagen.
      const block = s.slice(start, start + 6000)
      const felkoll = block.indexOf(v.felkoll)
      const hook = block.indexOf('syncNewCustomerToFortnox(')
      expect(felkoll, 'insert-felkollen hittades inte').toBeGreaterThan(-1)
      expect(hook, 'hooken saknas').toBeGreaterThan(felkoll)
      // Non-blocking: hooken ligger i ett try/catch.
      const fore = block.slice(felkoll, hook)
      expect(fore).toContain('try {')
    })
  }
})

test.describe('skyddsnätet — batchSync + cronen', () => {
  test('batchSync sveper kunder i skapandeordning och läser error', () => {
    const s = read('lib/fortnox/sync.ts')
    const fn = s.slice(s.indexOf('export async function batchSync'))
    const kund = fn.slice(fn.indexOf("if (!entityType || entityType === 'customer')"), fn.indexOf("if (!entityType || entityType === 'invoice')"))
    expect(kund).toContain(".order('created_at', { ascending: true })")
    expect(kund).toContain('customersError')
  })

  test('2h-cronen kör kundsvepet per kopplat företag', () => {
    const s = read('app/api/cron/fortnox-sync/route.ts')
    expect(s).toContain("batchSync(biz.business_id, 'customer')")
    expect(s).toContain('total_customers_synced')
  })

  test('serverimporterna sveper efter loopen, inte per rad', () => {
    for (const fil of ['app/api/customers/import/route.ts', 'app/api/customers/bulk/route.ts']) {
      const s = read(fil)
      expect(s, `${fil} anropar inte batchSync`).toMatch(/batchSync\([\w.]+, 'customer'\)/)
      expect(s, `${fil} ska inte anropa hooken per rad`).not.toContain('syncNewCustomerToFortnox(')
    }
  })
})

test.describe('en väg in — manuella push-rutten går genom samma synk', () => {
  test('sync/customers anropar syncCustomerWithTracking, inte createFortnoxCustomer direkt', () => {
    const s = read('app/api/integrations/fortnox/sync/customers/route.ts')
    expect(s).toContain('syncCustomerWithTracking(businessId, customer.customer_id)')
    expect(s).not.toContain('createFortnoxCustomer(')
    expect(s, 'ingen egen adressparsning kvar').not.toContain('zipCode')
    expect(s).toContain(".order('created_at', { ascending: true })")
  })
})
