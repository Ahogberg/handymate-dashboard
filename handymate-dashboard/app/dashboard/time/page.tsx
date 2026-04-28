'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import TabsBar, { type TimeTab } from './components/TabsBar'
import TodayView from './components/TodayView'
import WeekView from './components/WeekView'
import BillableView from './components/BillableView'
import ApproveView from './components/ApproveView'
import PayrollView from './components/PayrollView'

const VALID_TABS: TimeTab[] = ['today', 'week', 'billable', 'approve', 'payroll']

const PERMISSION_BY_TAB: Partial<Record<TimeTab, 'approve_time' | 'create_invoices' | 'see_financials'>> = {
  billable: 'create_invoices',
  approve:  'approve_time',
  payroll:  'see_financials',
}

function TimePageInner() {
  const params = useSearchParams()
  const tabParam = params?.get('tab') as TimeTab | null
  const { can, loading } = useCurrentUser()

  // Validera tab + fall tillbaka till 'today' om användaren saknar permission
  let active: TimeTab = (tabParam && VALID_TABS.includes(tabParam)) ? tabParam : 'today'
  const required = PERMISSION_BY_TAB[active]
  if (!loading && required && !can(required)) {
    active = 'today'
  }

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      {/* Sida-rubrik */}
      <div className="mb-6">
        <h1 className="text-[18px] font-medium text-[#1E293B]">Tidrapportering</h1>
        <p className="text-[13px] text-[#94A3B8] mt-[2px]">Logga och hantera arbetstid</p>
      </div>

      {/* Tab-bar */}
      <TabsBar active={active} />

      {/* Aktiv tab */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 text-[#0F766E] animate-spin" />
        </div>
      ) : (
        <>
          {active === 'today'    && <TodayView />}
          {active === 'week'     && <WeekView />}
          {active === 'billable' && <BillableView />}
          {active === 'approve'  && <ApproveView />}
          {active === 'payroll'  && <PayrollView />}
        </>
      )}
    </div>
  )
}

/**
 * Unified tidsmodul med tab-navigation. Tabs:
 * - Idag (alla)
 * - Vecka (alla)
 * - Att fakturera (kräver create_invoices)
 * - Att attestera (kräver approve_time)
 * - Löneunderlag (kräver see_financials)
 *
 * URL-state: /dashboard/time?tab=today|week|billable|approve|payroll
 * Gamla URL:er (/time/weekly, /time/approve, /time/payroll) redirectar hit.
 */
export default function TimePage() {
  return (
    <Suspense fallback={
      <div className="p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#0F766E]" />
      </div>
    }>
      <TimePageInner />
    </Suspense>
  )
}
