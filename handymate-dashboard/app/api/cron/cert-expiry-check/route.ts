import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { svDateStr } from '@/lib/dates'
import { selectCertsNeedingReminder } from '@/lib/certifikat/status'

export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/cert-expiry-check
 *
 * Daglig agentpåminnelse för certifikat som går ut (R3, tasks/
 * resurs-masterplan.md — "differentieraren, Easoft har noll"). Hittar
 * employee_certificate-rader vars valid_until är "inom 30 dagar" enligt
 * lib/certifikat/status.ts selectCertsNeedingReminder (MEDVETET inklusive
 * redan utgångna certifikat — se den filens kommentar) och som saknar en
 * redan öppen pending_approval för samma cert_id → skapar en ny
 * pending_approval av typ cert_expiry_reminder, routing owner_admin
 * (lib/approvals/routing.ts).
 *
 * NY DEDIKERAD ROUTE (inte påhängd på en befintlig daglig cron) — beslut
 * efter genomläsning av vercel.json + app/api/cron/*: repot har redan 30+
 * routes, konsekvent en per fristående koncern (avtal-forslag,
 * hemsida-forslag, tidrapport-forslag, m.fl. — alla samma mönster: egen
 * fil, egen cron-rad, egen dedupe). Ingen befintlig daglig route äger
 * "certifikat" semantiskt: driftlarm är en intern felsvep-digest till
 * Andreas (inte en kund-approval-skapare), send-reminders är hårt
 * fakturaspecifik (delad state/typer som inte passar cert-domänen). Att
 * hänga på endera hade blandat ihop två orelaterade koncept i en route för
 * att spara en vercel.json-rad — fel avvägning givet hur resten av repot
 * redan är strukturerat. Schemat "35 6 * * *" (en gång per dag, Hobby-
 * plan-säkert) ligger i en lucka mellan agent-observations/lars (10 6) och
 * agent-observations/lisa (0 7).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runCertExpiryCheck()
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runCertExpiryCheck()
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation .* does not exist/i.test(error.message || '')
  )
}

function formatSvDate(dateStr: string): string {
  try {
    return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
  } catch {
    return dateStr
  }
}

async function runCertExpiryCheck() {
  const supabase = getServerSupabase()
  const todayStr = svDateStr()

  // Hämtar alla certifikat med satt valid_until, tvärs alla businesses —
  // tabellen är liten (en handfull certifikat per anställd) så en full
  // scan här är enklare och tryggare än att duplicera fönsterlogiken i en
  // SQL .lte()-filtrering (single source of truth = selectCertsNeedingReminder).
  const { data: certs, error } = await supabase
    .from('employee_certificate')
    .select('id, business_id, business_user_id, cert_type, cert_number, valid_until, business_user:business_user_id (name)')
    .not('valid_until', 'is', null)

  if (error) {
    if (isMissingTableError(error)) {
      console.warn('[cert-expiry-check] employee_certificate saknas ännu (kör sql/v84_certifikat.sql) — hoppar över körningen.')
      return NextResponse.json({ success: true, skipped: 'table_missing' })
    }
    console.error('[cert-expiry-check] kunde inte hämta certifikat:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const allRows = (certs || []) as any[]
  const candidateIds = new Set(
    selectCertsNeedingReminder(
      allRows.map((c) => ({ id: c.id, valid_until: c.valid_until })),
      todayStr,
    ).map((c) => c.id),
  )
  const rows = allRows.filter((c) => candidateIds.has(c.id))

  let created = 0
  let skippedExisting = 0
  const results: Array<{ cert_id: string; created: boolean }> = []

  for (const cert of rows) {
    // Dedupe — samma mönster som app/api/cron/send-reminders (.contains på payload).
    const { count: existing, error: dedupeError } = await supabase
      .from('pending_approvals')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', cert.business_id)
      .eq('approval_type', 'cert_expiry_reminder')
      .eq('status', 'pending')
      .contains('payload', { cert_id: cert.id })

    if (dedupeError) {
      console.error('[cert-expiry-check] dedupe-koll misslyckades, hoppar över för säkerhets skull:', cert.id, dedupeError)
      results.push({ cert_id: cert.id, created: false })
      continue
    }
    if ((existing ?? 0) > 0) {
      skippedExisting++
      results.push({ cert_id: cert.id, created: false })
      continue
    }

    const memberName = cert.business_user?.name || 'Okänd medlem'
    const dateLabel = formatSvDate(cert.valid_until)
    const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const { error: insertError } = await supabase.from('pending_approvals').insert({
      id: approvalId,
      business_id: cert.business_id,
      approval_type: 'cert_expiry_reminder',
      routing_role: 'owner_admin',
      title: `Certifikat går ut: ${memberName} — ${cert.cert_type} (${dateLabel})`,
      description: `${cert.cert_type}${cert.cert_number ? ` (${cert.cert_number})` : ''} för ${memberName} går ut ${dateLabel}. Boka förnyelse i tid.`,
      risk_level: 'low',
      status: 'pending',
      payload: {
        cert_id: cert.id,
        business_user_id: cert.business_user_id,
        member_name: memberName,
        cert_type: cert.cert_type,
        cert_number: cert.cert_number,
        valid_until: cert.valid_until,
      },
      // Löper ut 14 dagar EFTER certets eget utgångsdatum — ger owner/admin
      // gott om tid att agera även efter faktisk utgång, men förhindrar att
      // kortet ligger kvar "pending" för alltid om det aldrig hanteras.
      expires_at: new Date(new Date(`${cert.valid_until}T12:00:00Z`).getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    })

    if (insertError) {
      console.error('[cert-expiry-check] approval insert failed:', cert.id, insertError)
      results.push({ cert_id: cert.id, created: false })
      continue
    }

    created++
    results.push({ cert_id: cert.id, created: true })
  }

  return NextResponse.json({
    success: true,
    checked: rows.length,
    created,
    skipped_existing: skippedExisting,
    results,
  })
}
