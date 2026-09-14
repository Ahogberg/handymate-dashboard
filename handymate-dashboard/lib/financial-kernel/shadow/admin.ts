import { NextResponse } from 'next/server'
import { adminFailure, requiredText } from '../admin'
export function shadowReason(value: unknown): string {
  const reason = requiredText(value, 'skäl', 500)
  if (reason.length < 3) throw new TypeError('Skälet måste innehålla minst tre tecken')
  return reason
}
export function shadowAdminFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/financial_kernel_phase_(reserved|invalid|reason_required)|financial_shadow_(phase_off|reason_required|resolution_invalid)/.test(message))
    return NextResponse.json({ error: 'Kontrollera fas och skäl. Fas S2 är inte tillgänglig.' }, { status: 400 })
  if (/financial_shadow_(divergence_not_open|run_not_running|run_already_running)/.test(message))
    return NextResponse.json({ error: 'Tillståndet har ändrats. Uppdatera vyn.' }, { status: 409 })
  return adminFailure(error)
}
