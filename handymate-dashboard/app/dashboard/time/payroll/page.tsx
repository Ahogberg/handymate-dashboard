import { redirect } from 'next/navigation'

/**
 * Permanent redirect till tab-routern. Gamla länkar fortsätter fungera.
 */
export default function PayrollRedirect() {
  redirect('/dashboard/time?tab=payroll')
}
