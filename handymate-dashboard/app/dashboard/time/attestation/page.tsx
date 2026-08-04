import { redirect } from 'next/navigation'

/**
 * Incheckningskonsolidering (tasks/resurs-masterplan.md, R1-E).
 *
 * Denna sida var ORPHANAD — ingen nav-länk pekade hit (verifierat mot
 * components/Sidebar.tsx), bara nåbar via direktlänk/bokmärke. Den visade
 * time_checkins-rader och lät en admin attestera dem via
 * POST /api/checkin/approve, som skapar en time_entry direkt.
 *
 * Samma flöde täcks redan av Godkännanden-inkorgen: varje utcheckning
 * (app/api/checkin/checkout/route.ts) skapar ett pending_approvals-kort
 * med approval_type: 'time_attestation', som Godkännanden-sidan redan
 * renderar specialanpassat (app/dashboard/approvals/page.tsx, raden
 * `approval.approval_type === 'time_attestation'`) och vars godkännande
 * (app/api/approvals/[id]/route.ts, case 'time_attestation') gör EXAKT
 * samma sak — skapar time_entry med approval_status 'approved' direkt.
 * Ingen unik funktion kvar att bevara här.
 *
 * ApproveView (/dashboard/time?tab=approve) är ett ANNAT flöde — den
 * godkänner redan skapade time_entry-rader (manuellt loggad tid) i
 * veckobatchar, inte time_checkins. De två är inte samma data, men
 * "attestering av tid" som begrepp hör hemma i Tid-modulen, så gamla
 * länkar hit landar där istället för att 404:a.
 *
 * RÖR EJ payroll-exporten: app/api/time-reports/payroll-export/route.ts
 * läser bara time_entry (+ travel_entry/allowance_reports), aldrig
 * time_checkins direkt — den tabellen och båda godkänna-vägarna in i
 * time_entry (denna sidas gamla /api/checkin/approve OCH Godkännanden-
 * kortets 'time_attestation'-case) är oförändrade av denna redirect.
 */
export default function AttestationRedirect() {
  redirect('/dashboard/time?tab=approve')
}
