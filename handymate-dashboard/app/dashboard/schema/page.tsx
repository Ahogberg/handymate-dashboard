'use client'

import { LayoutGrid, Calendar, Clock, Users } from 'lucide-react'
import Link from 'next/link'

/**
 * Schema → Översikt — placeholder (tasks/resurs-masterplan.md, R0/R2).
 *
 * Den riktiga resurstavlan (veckotavla per person, beläggnings-%,
 * drag-drop-tilldelning) byggs i R2. Den här sidan finns bara så att
 * "Schema"-gruppens första undersida (Översikt) har något att peka på
 * redan i R0 — designsystemet är på plats, innehållet kommer i R2.
 */
export default function SchemaOverviewPage() {
  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen pt-16 sm:pt-8">
      <div className="relative z-10 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Schema</h1>
          <p className="text-gray-500 text-sm mt-1">Översikt över teamets vecka</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-12 sm:p-16 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-[#F0FDFA] flex items-center justify-center border border-[#E2E8F0]">
              <LayoutGrid className="w-10 h-10 text-primary-700" />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Resurstavlan kommer snart</h2>
          <p className="text-gray-500 mb-8 max-w-md mx-auto">
            Här kommer en veckotavla per person med beläggning, frånvaro och
            drag-drop-tilldelning av obemannade jobb — en samlad vy av hela
            teamets dag.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/dashboard/calendar"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-700 text-white font-medium hover:opacity-90 transition-opacity text-sm"
            >
              <Calendar className="w-4 h-4" />
              Gå till Kalender
            </Link>
            <Link
              href="/dashboard/time"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-[#E2E8F0] text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm"
            >
              <Clock className="w-4 h-4" />
              Gå till Tid
            </Link>
            <Link
              href="/dashboard/team"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-[#E2E8F0] text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm"
            >
              <Users className="w-4 h-4" />
              Gå till Team
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
