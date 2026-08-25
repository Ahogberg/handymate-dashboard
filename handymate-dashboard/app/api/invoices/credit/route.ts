import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { generateOCR } from '@/lib/ocr'
import { createInvoice } from '@/lib/invoices/create-invoice'

/**
 * POST - Skapa kreditfaktura (hel eller delkredit)
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver create_invoices
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const {
      original_invoice_id,
      credit_type = 'full', // 'full' | 'partial'
      items: partialItems,
      credit_reason,
    } = body
    const business_id = business.business_id

    if (!original_invoice_id) {
      return NextResponse.json({ error: 'Missing original_invoice_id' }, { status: 400 })
    }

    // Hämta originalfaktura
    const { data: original, error: origError } = await supabase
      .from('invoice')
      .select('*')
      .eq('invoice_id', original_invoice_id)
      .eq('business_id', business_id)
      .single()

    if (origError || !original) {
      return NextResponse.json({ error: 'Originalfaktura hittades inte' }, { status: 404 })
    }

    if (original.status === 'credited' || original.status === 'draft' || original.status === 'cancelled') {
      return NextResponse.json({ error: 'Denna faktura kan inte krediteras' }, { status: 400 })
    }

    let creditItems: any[]

    if (credit_type === 'full') {
      // Full kreditering: kopiera alla items, negera belopp
      creditItems = (original.items || []).map((item: any) => ({
        ...item,
        id: 'ii_' + Math.random().toString(36).substr(2, 12),
        total: -Math.abs(item.total || 0),
        unit_price: -Math.abs(item.unit_price || 0),
      }))
    } else {
      // Delkreditering: använd angivna items
      if (!partialItems || partialItems.length === 0) {
        return NextResponse.json({ error: 'Inga rader angivna för delkredit' }, { status: 400 })
      }
      creditItems = partialItems.map((item: any) => ({
        ...item,
        id: item.id || 'ii_' + Math.random().toString(36).substr(2, 12),
        total: -Math.abs(item.total || (item.quantity * item.unit_price) || 0),
        unit_price: -Math.abs(item.unit_price || 0),
      }))
    }

    // Beräkna krediterade totaler
    const subtotal = creditItems.reduce((sum: number, item: any) => sum + item.total, 0)
    const vatRate = original.vat_rate || 25
    const vatAmount = subtotal * (vatRate / 100)
    const total = subtotal + vatAmount

    // Generera kreditfakturanummer.
    // BUGFIX (2026-08-25): räknade tidigare COUNT(*)+1 — exakt samma
    // felklass som offertserien (lib/quotes/create-quote.ts, fixad samma
    // dag, verkligt prod-repro där): en raderad kreditfaktura får count att
    // permanent glida isär från högsta utfärdade numret → antingen
    // dubblettnummer i bokföringen eller evig kollision. Facit: högsta
    // FAKTISKA numret + 1.
    const year = new Date().getFullYear()
    const { data: existingCredits } = await supabase
      .from('invoice')
      .select('invoice_number')
      .eq('business_id', business_id)
      .eq('invoice_type', 'credit')
      .gte('created_at', `${year}-01-01`)
      .not('invoice_number', 'is', null)
    const hogstaKf = (existingCredits || []).reduce((max, row) => {
      const m = String(row.invoice_number).match(/(\d+)\s*$/)
      const n = m ? parseInt(m[1], 10) : NaN
      return Number.isFinite(n) && n > max ? n : max
    }, 0)
    const nextKfNum = hogstaKf + 1

    const creditNumber = `KF-${year}-${String(nextKfNum).padStart(3, '0')}`
    // OCR-underlaget är oförändrat från innan: alla siffror ur numret
    // ("KF-2026-004" → "2026004") — bara räkningen av löpnumret är fixad.
    const ocrNumber = generateOCR(creditNumber.replace(/\D/g, '') || String(nextKfNum))
    const invoiceDate = new Date()

    // ROT/RUT: negera avdrag proportionellt
    let rotRutDeduction = 0
    let customerPays = total
    if (original.rot_rut_deduction && original.total) {
      if (credit_type === 'full') {
        rotRutDeduction = -Math.abs(original.rot_rut_deduction)
      } else {
        // Proportionell negering
        const proportion = Math.abs(total) / Math.abs(original.total)
        rotRutDeduction = -Math.abs(Math.round(original.rot_rut_deduction * proportion))
      }
      customerPays = total - rotRutDeduction
    }

    // ETAPP 6a (offert-masterplan.md): kreditfakturan har en EGEN nummerserie
    // (KF-YYYY-NNN, räknad på COUNT(*) ovan) — INTE business_config.
    // next_invoice_number-serien som RPC:n (sql/v81) atomiserar. numberOverride
    // kringgår därför RPC:n medvetet (se create-invoice.ts-kommentaren) —
    // resten av sexstegskedjan (datum/insert) delas ändå med de andra sju
    // vägarna. dueDays=0 speglar oförändrat beteende (due_date = invoiceDate).
    const { invoice: creditNote } = await createInvoice(supabase, {
      businessId: business_id,
      customerId: original.customer_id,
      items: creditItems,
      subtotal,
      vatRate,
      vatAmount,
      total,
      rotRutType: original.rot_rut_type,
      rotRutDeduction,
      customerPays,
      invoiceType: 'credit',
      // BUGFIX (2026-08-25, Codex-granskningens fynd 2, källverifierat):
      // skapades tidigare direkt med status 'sent' — men den här rutten
      // levererar INGENTING (inget mejl, inget SMS, ingen e-faktura).
      // Kreditfakturan bokfördes alltså som skickad utan att kunden
      // någonsin fått den — brott mot sanningsprincipen (samma klass som
      // auto-send-fyndet i PROJECT_SYSTEM_AUDIT §16). 'draft' är det
      // sanna tillståndet; UI:t navigerar redan till kreditfakturans
      // detaljsida efter skapandet, där den vanliga Skicka-vägen
      // (sendInvoice-kärnan) levererar på riktigt och sätter 'sent' först
      // efter faktisk leverans.
      status: 'draft',
      dueDays: 0,
      invoiceDate,
      personnummer: original.personnummer,
      fastighetsbeteckning: original.fastighetsbeteckning,
      numberOverride: { invoiceNumber: creditNumber, ocrNumber },
      selectClause: `*, customer:customer_id ( customer_id, name, phone_number, email, address_line )`,
      extraFields: {
        is_credit_note: true,
        original_invoice_id,
        credit_for_invoice_id: original_invoice_id,
        credit_reason: credit_reason || null,
      },
    })

    // Markera originalfaktura som krediterad (only if full credit)
    if (credit_type === 'full') {
      await supabase
        .from('invoice')
        .update({ status: 'credited' })
        .eq('invoice_id', original_invoice_id)
        .eq('business_id', business_id)
    }

    return NextResponse.json({ invoice: creditNote })

  } catch (error: any) {
    console.error('Create credit note error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
