'use client'

import { Lightbulb } from 'lucide-react'

/**
 * ProjectCustomerFactsCard — "Att tänka på" (Customer Facts V1,
 * injektionspunkt 2 av 2, 2026-08-12).
 *
 * Visar projektkundens bekräftade kundfakta (customer_fact, v122) i
 * Översikt-tabben — samma data och läs-API (/api/customers/[id]/facts) som
 * kundkortets "Det här vet Handymate", bara begränsad till 6 rader här.
 *
 * Renderas INTE alls när listan är tom — ett kort som bara säger "vi vet
 * inget" är brus, inte hjälp.
 */

interface ProjectCustomerFact {
  id: string
  fact_type: 'preference' | 'constraint' | 'commitment' | 'contact'
  content: string
}

const FACT_TYPE_BADGE: Record<ProjectCustomerFact['fact_type'], { label: string; className: string }> = {
  preference: { label: 'Preferens', className: 'bg-teal-50 text-teal-700' },
  constraint: { label: 'Förutsättning', className: 'bg-amber-50 text-amber-700' },
  commitment: { label: 'Löfte', className: 'bg-primary-50 text-primary-700' },
  contact: { label: 'Kontakt', className: 'bg-gray-100 text-gray-700' },
}

interface ProjectCustomerFactsCardProps {
  facts: ProjectCustomerFact[]
}

export function ProjectCustomerFactsCard({ facts }: ProjectCustomerFactsCardProps) {
  if (facts.length === 0) return null

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-4 h-4 text-primary-700" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-primary-700">
          Att tänka på
        </span>
      </div>
      <div className="space-y-3">
        {facts.slice(0, 6).map(fact => {
          const badge = FACT_TYPE_BADGE[fact.fact_type] || FACT_TYPE_BADGE.preference
          return (
            <div key={fact.id} className="p-3 bg-slate-50 rounded-xl">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mb-1.5 ${badge.className}`}>
                {badge.label}
              </span>
              <p className="text-sm text-slate-900">{fact.content}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
