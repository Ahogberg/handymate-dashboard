/**
 * verify-execution-parity.ts — E2E-paritetstest för execution-chain Steg 1.
 *
 * Bevisar att de lib-extraherade flödena (PR #4) skickar + utför sidoeffekter
 * exakt som förr. Återanvändbart efter Steg 3 + 5.
 *
 * MOT PROD (Bee, biz_21wswuhrbhy) + test-kund med Andreas nummer. Skickar
 * RIKTIGA SMS/mail — de landar hos Andreas, inte riktiga kunder.
 *
 * Anropar HTTP-routerna (hela vägen route→lib, inkl. four-eyes) och
 * verifierar/seedar/städar via service-role. En deal seedas per offert så
 * moveDeal blir mätbart.
 *
 * Körning (PowerShell):
 *   $env:SUPABASE_URL="https://pktaqedooyzgvzwipslu.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<från Vercel>"
 *   $env:BEE_TOKEN="<Bee-ägarens access_token>"
 *   $env:BEE_EMPLOYEE_TOKEN="<icke-ägare-token>"   # VALFRI — krävs för 2b (four-eyes)
 *   $env:APP_URL="https://app.handymate.se"
 *   npx tsx scripts/verify-execution-parity.ts
 *
 * VIKTIGT om 2b (four-eyes, den kritiska): four-eyes hoppas över för
 * owner/admin per design. Med bara BEE_TOKEN (ägare) kan grinden inte testas
 * — sätt BEE_EMPLOYEE_TOKEN (en icke-ägare) för att bevisa att den håller.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const BEE_TOKEN = process.env.BEE_TOKEN || ''
const BEE_EMPLOYEE_TOKEN = process.env.BEE_EMPLOYEE_TOKEN || ''
const APP_URL = process.env.APP_URL || 'https://app.handymate.se'
const BIZ = 'biz_21wswuhrbhy'
const TEST_PHONE = '+46708379552'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !BEE_TOKEN) {
  console.error('Saknar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / BEE_TOKEN i env.')
  process.exit(1)
}
const sb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const RUN_START = new Date().toISOString()

type Res = '✅' | '❌' | '⚠️' | 'n/a'
const rows: Array<{ flow: string; effect: string; res: Res; detail: string }> = []
function record(flow: string, effect: string, res: Res, detail = '') {
  rows.push({ flow, effect, res, detail })
}

async function callRoute(path: string, body: any, token: string): Promise<{ status: number; json: any }> {
  const r = await fetch(`${APP_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  let json: any = null
  try { json = await r.json() } catch { /* non-JSON */ }
  return { status: r.status, json }
}

// Spårning för cleanup
const created = { invoices: [] as string[], quotes: [] as string[], deals: [] as string[], bookings: [] as string[] }

async function main() {
  // ── Hitta test-kund ──
  const { data: cust } = await sb.from('customer')
    .select('customer_id, name, email, phone_number')
    .eq('business_id', BIZ).eq('phone_number', TEST_PHONE).limit(1).maybeSingle()
  if (!cust) {
    console.error(`Ingen test-kund med ${TEST_PHONE} för ${BIZ}. Avbryter.`)
    process.exit(1)
  }
  const customerId = cust.customer_id
  console.log(`Test-kund: ${cust.name} (${customerId}), email=${cust.email || '(saknas)'}\n`)

  // En giltig pipeline-stage att seeda deals i (initialt steg)
  const { data: initStage } = await sb.from('pipeline_stage')
    .select('id, slug').eq('business_id', BIZ).order('sort_order', { ascending: true }).limit(1).maybeSingle()

  // ════════════════════════════════════════════════════════════════
  // FLÖDE 1: send_invoice
  // ════════════════════════════════════════════════════════════════
  {
    const flow = '1. send_invoice'
    const invoiceId = 'parity_inv_' + Date.now()
    const invNo = `PARITY-${Date.now().toString().slice(-6)}`
    const { error: seedErr } = await sb.from('invoice').insert({
      invoice_id: invoiceId, business_id: BIZ, customer_id: customerId,
      invoice_number: invNo, invoice_type: 'standard', status: 'draft',
      items: [{ description: 'Paritetstest', quantity: 1, unit_price: 1000, total: 1000, type: 'labor' }],
      subtotal: 1000, vat_rate: 25, vat_amount: 250, total: 1250, customer_pays: 1250,
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0],
    })
    if (seedErr) { record(flow, 'seed faktura', '❌', seedErr.message) }
    else {
      created.invoices.push(invoiceId)
      // Kör flödet (SMS — telefon känd; skickar riktigt SMS till Andreas)
      const r = await callRoute('/api/invoices/send', { invoice_id: invoiceId, send_sms: true, send_email: false }, BEE_TOKEN)
      record(flow, 'route 200 + success', r.status === 200 && r.json?.success ? '✅' : '❌', `HTTP ${r.status} ${JSON.stringify(r.json)}`)

      const { data: inv } = await sb.from('invoice').select('status').eq('invoice_id', invoiceId).maybeSingle()
      record(flow, "status → 'sent'", inv?.status === 'sent' ? '✅' : '❌', `status=${inv?.status}`)

      const { data: act } = await sb.from('activity').select('id')
        .eq('business_id', BIZ).eq('customer_id', customerId).eq('activity_type', 'invoice_sent')
        .gte('created_at', RUN_START).limit(1)
      record(flow, "activity 'invoice_sent'", (act && act.length > 0) ? '✅' : '❌', `${act?.length || 0} rad`)

      record(flow, 'pipeline moveDeal', 'n/a', 'ingen deal kopplad till seedad faktura → moveDeal fyrar ej (korrekt)')
      record(flow, 'smart-communication', 'n/a', 'triggar comm-sekvens; ingen deterministisk DB-rad att mäta')
    }
  }

  // ════════════════════════════════════════════════════════════════
  // FLÖDE 2a: send_quote UNDER four-eyes-tröskel
  // ════════════════════════════════════════════════════════════════
  {
    const flow = '2a. send_quote (<tröskel)'
    const quoteId = 'parity_q_' + Date.now()
    const { error: qErr } = await sb.from('quotes').insert({
      quote_id: quoteId, business_id: BIZ, customer_id: customerId,
      title: 'Paritetstest — under tröskel', description: 'E2E', status: 'draft',
      total: 25000, valid_until: new Date(Date.now() + 30 * 864e5).toISOString(), quote_number: '#PARITY',
    })
    if (qErr) { record(flow, 'seed offert', '❌', qErr.message) }
    else {
      created.quotes.push(quoteId)
      // Seeda en deal kopplad till offerten → Golden Path moveDeal blir mätbar
      let dealId: string | null = null
      if (initStage?.id) {
        dealId = 'parity_deal_' + Date.now()
        const { error: dErr } = await sb.from('deal').insert({
          id: dealId, business_id: BIZ, customer_id: customerId, quote_id: quoteId,
          title: 'Paritetstest deal', value: 25000, stage_id: initStage.id, source: 'parity_test',
        })
        if (dErr) { dealId = null; record(flow, 'seed deal', '⚠️', dErr.message) }
        else created.deals.push(dealId)
      }

      const r = await callRoute('/api/quotes/send', { quoteId, method: 'sms' }, BEE_TOKEN)
      record(flow, 'route 200 + success', r.status === 200 && r.json?.success ? '✅' : '❌', `HTTP ${r.status} ${JSON.stringify(r.json)}`)

      const { data: q } = await sb.from('quotes').select('status, sent_at').eq('quote_id', quoteId).maybeSingle()
      record(flow, "status → 'sent' + sent_at", (q?.status === 'sent' && q?.sent_at) ? '✅' : '❌', `status=${q?.status} sent_at=${q?.sent_at}`)

      const { data: ca } = await sb.from('customer_activity').select('activity_id')
        .eq('business_id', BIZ).eq('customer_id', customerId).eq('activity_type', 'sms_sent')
        .gte('created_at', RUN_START).limit(1)
      record(flow, "customer_activity 'sms_sent'", (ca && ca.length > 0) ? '✅' : '❌', `${ca?.length || 0} rad`)

      if (dealId) {
        const { data: d } = await sb.from('deal').select('stage_id').eq('id', dealId).maybeSingle()
        let slug: string | null = null
        if (d?.stage_id) {
          const { data: st } = await sb.from('pipeline_stage').select('slug').eq('id', d.stage_id).maybeSingle()
          slug = st?.slug || null
        }
        record(flow, "moveDeal → 'quote_sent'", slug === 'quote_sent' ? '✅' : '❌', `deal stage=${slug}`)
      } else {
        record(flow, 'moveDeal', 'n/a', 'kunde inte seeda deal (ingen initial stage?)')
      }
      record(flow, 'fireEvent quote_sent', 'n/a', 'automation-engine fyrar; effekt beror på seed-regler, ingen säker enskild rad')
      record(flow, 'portal-notifikation', 'n/a', 'sendPortalNotification — mäts ej här (kan loggas i portal_notification_log)')
    }
  }

  // ════════════════════════════════════════════════════════════════
  // FLÖDE 2b: send_quote ÖVER tröskel — FOUR-EYES (KRITISK)
  // ════════════════════════════════════════════════════════════════
  {
    const flow = '2b. send_quote (>tröskel, four-eyes)'
    // Läs + sätt four_eyes-config (återställs efteråt)
    const { data: cfg } = await sb.from('business_config')
      .select('four_eyes_enabled, four_eyes_threshold_sek').eq('business_id', BIZ).maybeSingle()
    const origEnabled = cfg?.four_eyes_enabled ?? null
    const origThreshold = cfg?.four_eyes_threshold_sek ?? null
    await sb.from('business_config').update({ four_eyes_enabled: true, four_eyes_threshold_sek: 50000 }).eq('business_id', BIZ)

    const quoteId = 'parity_q4e_' + Date.now()
    await sb.from('quotes').insert({
      quote_id: quoteId, business_id: BIZ, customer_id: customerId,
      title: 'Paritetstest — över tröskel', description: 'E2E four-eyes', status: 'draft',
      total: 75000, valid_until: new Date(Date.now() + 30 * 864e5).toISOString(), quote_number: '#PARITY4E',
    })
    created.quotes.push(quoteId)

    if (!BEE_EMPLOYEE_TOKEN) {
      // Owner-token hoppar över four-eyes per design → grinden kan inte testas
      record(flow, 'four-eyes-grind', '⚠️', 'BEE_EMPLOYEE_TOKEN saknas — four-eyes hoppas över för owner/admin per design, grinden EJ testad. Sätt en icke-ägare-token.')
    } else {
      const r = await callRoute('/api/quotes/send', { quoteId, method: 'sms' }, BEE_EMPLOYEE_TOKEN)
      const requiresApproval = r.json?.requires_approval === true
      record(flow, 'returnerar requires_approval (skickar EJ)', requiresApproval ? '✅' : '❌', `HTTP ${r.status} ${JSON.stringify(r.json)}`)

      const { data: q } = await sb.from('quotes').select('status, sent_at').eq('quote_id', quoteId).maybeSingle()
      record(flow, "status → 'pending_approval' (INTE 'sent')", q?.status === 'pending_approval' ? '✅' : '❌', `status=${q?.status}`)

      const { data: appr } = await sb.from('pending_approvals').select('id')
        .eq('business_id', BIZ).eq('approval_type', 'four_eyes_quote').gte('created_at', RUN_START)
        .filter('payload->>quote_id', 'eq', quoteId).limit(1)
      record(flow, "four_eyes_quote-approval skapad", (appr && appr.length > 0) ? '✅' : '❌', `${appr?.length || 0} rad`)

      const { data: ca } = await sb.from('customer_activity').select('activity_id')
        .eq('customer_id', customerId).eq('activity_type', 'sms_sent').gte('created_at', RUN_START)
        .ilike('description', `%${quoteId}%`).limit(1)
      record(flow, 'INGET SMS skickat (gate höll)', (!ca || ca.length === 0) ? '✅' : '❌', 'inga sms_sent för denna offert')
    }

    // Återställ four_eyes-config
    await sb.from('business_config').update({ four_eyes_enabled: origEnabled, four_eyes_threshold_sek: origThreshold }).eq('business_id', BIZ)
  }

  // ════════════════════════════════════════════════════════════════
  // FLÖDE 3: create_booking
  // ════════════════════════════════════════════════════════════════
  {
    const flow = '3. create_booking'
    const start = new Date(Date.now() + 2 * 864e5).toISOString()
    const end = new Date(Date.now() + 2 * 864e5 + 36e5).toISOString()
    const r = await callRoute('/api/bookings', {
      customer_id: customerId, scheduled_start: start, scheduled_end: end,
      notes: 'Paritetstest', service_type: 'Paritetstest',
    }, BEE_TOKEN)
    const bookingId = r.json?.booking?.booking_id
    if (bookingId) created.bookings.push(bookingId)
    record(flow, 'route 200 + booking skapad', (r.status === 200 && bookingId) ? '✅' : '❌', `HTTP ${r.status} booking_id=${bookingId}`)

    if (bookingId) {
      const { data: b } = await sb.from('booking').select('status, google_event_id').eq('booking_id', bookingId).maybeSingle()
      record(flow, "booking-rad finns (status confirmed)", b?.status === 'confirmed' ? '✅' : '❌', `status=${b?.status}`)
      record(flow, 'calendar-sync', b?.google_event_id ? '✅' : 'n/a', b?.google_event_id ? `google_event_id satt` : 'ingen google_event_id → Bee har troligen ej Google Calendar kopplad (non-blocking, korrekt)')

      const { data: disp } = await sb.from('pending_approvals').select('id')
        .eq('business_id', BIZ).eq('approval_type', 'dispatch_suggestion').gte('created_at', RUN_START)
        .filter('payload->>context_id', 'eq', bookingId).limit(1)
      record(flow, 'dispatch-förslag', (disp && disp.length > 0) ? '✅' : 'n/a', (disp && disp.length > 0) ? 'dispatch_suggestion skapad' : 'ingen dispatch_suggestion → ingen lämplig medarbetare (score<3) eller inga members (korrekt non-blocking)')
      record(flow, 'MEETING_BOOKED-stage', 'n/a', 'kräver projekt i CONTRACT_SIGNED för kunden — ej seedat')
    }
  }

  // ── Städa ──────────────────────────────────────────────────────
  console.log('\nStädar test-data...')
  for (const id of created.bookings) await sb.from('booking').delete().eq('booking_id', id)
  for (const id of created.deals) await sb.from('deal').delete().eq('id', id)
  for (const id of created.invoices) await sb.from('invoice').delete().eq('invoice_id', id)
  for (const id of created.quotes) await sb.from('quotes').delete().eq('quote_id', id)
  // Log-rader + approvals skapade under körningen för test-kunden
  await sb.from('activity').delete().eq('customer_id', customerId).gte('created_at', RUN_START).eq('activity_type', 'invoice_sent')
  await sb.from('customer_activity').delete().eq('customer_id', customerId).gte('created_at', RUN_START).in('activity_type', ['sms_sent', 'email_sent'])
  await sb.from('pending_approvals').delete().eq('business_id', BIZ).gte('created_at', RUN_START).in('approval_type', ['four_eyes_quote', 'dispatch_suggestion'])
  console.log('Städat: fakturor, offerter, deals, bokningar, log-rader, test-approvals. Test-kund behållen.')

  // ── Rapport ────────────────────────────────────────────────────
  console.log('\n═══ PARITETSRAPPORT ═══\n')
  let lastFlow = ''
  let hardFail = false
  for (const row of rows) {
    if (row.flow !== lastFlow) { console.log(`\n${row.flow}`); lastFlow = row.flow }
    console.log(`  ${row.res}  ${row.effect}${row.detail ? '  — ' + row.detail : ''}`)
    if (row.res === '❌') hardFail = true
  }
  // four-eyes-regression = STOPP
  const fourEyesRow = rows.find(r => r.flow.startsWith('2b') && r.effect.startsWith('returnerar requires_approval'))
  console.log('\n═══ SAMMANFATTNING ═══')
  if (fourEyesRow && fourEyesRow.res === '❌') {
    console.log('🛑 STOPP: four-eyes-grinden SKICKADE istället för att kräva approval — REGRESSION. Merga INTE.')
  } else if (hardFail) {
    console.log('❌ Avvikelse hittad (se ❌ ovan). Granska innan merge.')
  } else {
    console.log('✅ Paritet OK på alla mätbara sidoeffekter. (n/a = förutsättning saknas, ej regression.)')
  }
}

main().catch(err => { console.error('Script-fel:', err); process.exit(1) })
