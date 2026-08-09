import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { createInvoice } from '@/lib/invoices/create-invoice'
import { markInvoiceSources } from '@/lib/invoices/mark-sources'

/**
 * Revenue Review V1 — granskningen av ett intäktsfynd (X1b, 2026-08-09).
 *
 * ═══ KONTRAKTET ═══
 *
 * missad_intakt är REVIEW_REQUIRED i ACTION_CONTRACT: ett klick i
 * godkännandekön får ALDRIG skapa en faktura. Den här rutten är den
 * avsiktliga vägen — hantverkaren har sett fyndet, granskat raderna och
 * valt. Två handlingar:
 *
 *   skapa_utkast  EXAKT EN källspecifik väg (roadmapens X1b-scope):
 *                 ÄTA-fyndet (kind=ata_ej_fakturerad, action=
 *                 DRAFT_AFTER_REVIEW) → fakturaUTKAST via den befintliga
 *                 byggaren + atomisk källmarkering (v104). Aldrig sändning.
 *                 Material- och projektfynd förblir granskningssignaler —
 *                 en universell byggare är precis det X1 varnar för.
 *
 *   avfarda       kräver ANGIVEN ORSAK — avfärdanden utan skäl går inte
 *                 att lära sig något av, och falsklarm ska mätas.
 *
 * ═══ SANNINGSREGLERNA ═══
 *
 *   - Beloppet tas ur KÄLLRADERNA vid granskningstillfället, inte ur
 *     kortets preview — kortet kan vara dagar gammalt.
 *   - Källfärskhet före allt: är ÄTA:n redan fakturerad när hantverkaren
 *     klickar är kortet inaktuellt och stängs som sådant. Omkörning skapar
 *     ALDRIG en andra faktura (idempotensregeln ur roadmapen).
 *   - Utfallet stämplas på kortet: identifierad → utkast/avfärdad(orsak)
 *     är SEPARATA tal, läsbara ur payloaden.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const body = await request.json().catch(() => ({}))
    const action = body?.action as 'skapa_utkast' | 'avfarda' | undefined

    if (action !== 'skapa_utkast' && action !== 'avfarda') {
      return NextResponse.json({ error: "action måste vara 'skapa_utkast' eller 'avfarda'" }, { status: 400 })
    }

    // ── Kortet ──
    const { data: kort } = await supabase
      .from('pending_approvals')
      .select('id, status, payload, title')
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .eq('approval_type', 'missad_intakt')
      .maybeSingle()

    if (!kort) {
      return NextResponse.json({ error: 'Fyndet hittades inte' }, { status: 404 })
    }

    const payload = (kort.payload || {}) as Record<string, any>

    // Idempotens: redan hanterat kort svarar med sitt utfall — aldrig en
    // andra faktura, aldrig ett andra avfärdande.
    if (kort.status !== 'pending') {
      return NextResponse.json({
        already_resolved: true,
        status: kort.status,
        ...(payload.draft_invoice_id
          ? { invoice_id: payload.draft_invoice_id, invoice_number: payload.draft_invoice_number || null }
          : {}),
        ...(payload.dismissal_reason ? { dismissal_reason: payload.dismissal_reason } : {}),
      })
    }

    // ── AVFÄRDA — kräver orsak ──
    if (action === 'avfarda') {
      const reason = String(body?.reason || '').trim()
      if (!reason) {
        return NextResponse.json(
          { error: 'Ange varför fyndet avfärdas — falsklarm ska gå att lära sig av.' },
          { status: 400 }
        )
      }

      const { error: updErr } = await supabase
        .from('pending_approvals')
        .update({
          status: 'rejected',
          resolved_at: new Date().toISOString(),
          payload: { ...payload, dismissal_reason: reason, dismissed_by: currentUser.id },
        })
        .eq('id', kort.id)
        .eq('business_id', business.business_id)
        .eq('status', 'pending')

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 })
      }
      return NextResponse.json({ dismissed: true, reason })
    }

    // ── SKAPA UTKAST — den enda källspecifika vägen ──
    if (payload.kind !== 'ata_ej_fakturerad' || payload.recommended_action !== 'DRAFT_AFTER_REVIEW') {
      return NextResponse.json(
        {
          error:
            'Det här fyndet är en granskningssignal utan fakturaväg. Kontrollera källorna och fakturera från projektet om det stämmer.',
        },
        { status: 400 }
      )
    }

    const sourceIds: string[] = Array.isArray(payload.source_ids) ? payload.source_ids : []
    if (sourceIds.length === 0) {
      return NextResponse.json({ error: 'Fyndet saknar källrader' }, { status: 400 })
    }

    // Källfärskhet: beloppen läses ur ÄTA-raderna NU, och en rad som redan
    // fått en faktura sedan kortet skapades gör kortet inaktuellt.
    const { data: ataRader } = await supabase
      .from('project_change')
      .select('change_id, description, amount, status, invoice_id, invoiced_at')
      .eq('business_id', business.business_id)
      .in('change_id', sourceIds)

    const farska = (ataRader || []).filter(a => !a.invoice_id && !a.invoiced_at)
    if (farska.length === 0) {
      // Allt är redan fakturerat på annan väg — stäng kortet som inaktuellt.
      await supabase
        .from('pending_approvals')
        .update({
          status: 'rejected',
          resolved_at: new Date().toISOString(),
          payload: { ...payload, dismissal_reason: 'Inaktuellt — källan fakturerades på annan väg', auto_stale: true },
        })
        .eq('id', kort.id)
        .eq('business_id', business.business_id)
        .eq('status', 'pending')
      return NextResponse.json(
        { stale: true, message: 'Tillägget är redan fakturerat — fyndet har stängts.' },
        { status: 409 }
      )
    }

    // Kunden via projektet — fyndet är projektbundet.
    const { data: projekt } = await supabase
      .from('project')
      .select('project_id, customer_id, name')
      .eq('project_id', payload.project_id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (!projekt?.customer_id) {
      return NextResponse.json(
        { error: 'Projektet saknar kund — koppla kund innan fakturautkastet kan skapas.' },
        { status: 400 }
      )
    }

    // Raderna ur källan. ÄTA-belopp är exklusive moms — samma hållning som
    // autoInvoiceOnComplete.
    const items = farska.map((a, idx) => ({
      id: 'ii_rr_' + Math.random().toString(36).substring(2, 10),
      item_type: 'item',
      description: a.description?.trim() || 'Tilläggsarbete enligt signerad ÄTA',
      quantity: 1,
      unit: 'st',
      unit_price: Math.round(Number(a.amount) || 0),
      total: Math.round(Number(a.amount) || 0),
      type: 'labor',
      sort_order: idx,
    }))
    const subtotal = items.reduce((s, i) => s + i.total, 0)
    if (subtotal <= 0) {
      return NextResponse.json({ error: 'Källraderna saknar belopp' }, { status: 400 })
    }
    const vatRate = 25
    const vatAmount = Math.round(subtotal * (vatRate / 100))
    const total = subtotal + vatAmount

    // UTKAST — aldrig sändning. Sändningen är hantverkarens eget steg,
    // och det är sändrutten som sätter den statusen (N3).
    const { invoice, invoiceNumber } = await createInvoice(supabase, {
      businessId: business.business_id,
      customerId: projekt.customer_id,
      items,
      subtotal,
      vatRate,
      vatAmount,
      total,
      projectId: projekt.project_id,
      invoiceType: 'standard',
      status: 'draft',
      selectClause: 'invoice_id, invoice_number, total, status',
    })

    // Atomisk källmarkering (v104) — ÄTA:n går till invoiced och kan aldrig
    // plockas upp av svepet eller en annan faktura igen.
    const markering = await markInvoiceSources(supabase, {
      businessId: business.business_id,
      invoiceId: invoice.invoice_id,
      changeIds: farska.map(a => a.change_id),
    })
    if (!markering.ok) {
      console.error('[revenue-review] källmarkeringen misslyckades:', markering.errors, {
        invoice_id: invoice.invoice_id,
      })
    }

    // Utfallet stämplas på kortet — granskad → utkast, spårbart.
    await supabase
      .from('pending_approvals')
      .update({
        status: 'approved',
        resolved_at: new Date().toISOString(),
        payload: {
          ...payload,
          draft_invoice_id: invoice.invoice_id,
          draft_invoice_number: invoiceNumber,
          drafted_by: currentUser.id,
          drafted_amount_kr: subtotal,
          sources_marked: markering.ok,
        },
      })
      .eq('id', kort.id)
      .eq('business_id', business.business_id)
      .eq('status', 'pending')

    return NextResponse.json({
      invoice_id: invoice.invoice_id,
      invoice_number: invoiceNumber,
      status: 'draft',
      total,
      subtotal,
      sources_marked: markering.ok,
      ...(farska.length < sourceIds.length
        ? { note: `${sourceIds.length - farska.length} av källraderna var redan fakturerade och togs inte med.` }
        : {}),
    })
  } catch (error: any) {
    console.error('[revenue-review] error:', error)
    return NextResponse.json({ error: error?.message || 'Något gick fel' }, { status: 500 })
  }
}
