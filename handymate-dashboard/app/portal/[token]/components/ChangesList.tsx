'use client'

import { CheckCircle, ChevronRight } from 'lucide-react'
import type { Project } from '../types'

interface ChangesListProps {
  projects: Project[]
  onOpenAta: (projectId: string) => void
}

/**
 * ÄTA-aggregator (rendered när activeTab === 'changes').
 * Visar alla pending ÄTA över alla projekt, klick → öppna projektdetalj.
 * Extraherat från page.tsx vid komponent-splitten — INGEN visuell ändring.
 */
export default function ChangesList({ projects, onOpenAta }: ChangesListProps) {
  const pendingAtas = projects.flatMap(p =>
    (p.atas || [])
      .filter(a => a.status !== 'signed' && a.sign_token)
      .map(a => ({ ata: a, project: p })),
  )

  if (pendingAtas.length === 0) {
    return (
      <div className="space-y-3">
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
          <h3 className="font-semibold text-gray-900">Inget att signera</h3>
          <p className="text-sm text-gray-500 mt-1">Du har inga öppna ÄTA just nu.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {pendingAtas.map(({ ata, project }) => (
        <button
          key={ata.change_id}
          onClick={() => onOpenAta(project.project_id)}
          className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-primary-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-xs text-gray-500">{project.name}</p>
              <h3 className="font-semibold text-gray-900">ÄTA-{ata.ata_number}</h3>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
              Att signera
            </span>
          </div>
          {ata.description && (
            <p className="text-sm text-gray-600 line-clamp-2 mb-2">{ata.description}</p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{ata.total?.toLocaleString('sv-SE')} kr</span>
            <span className="text-sm text-sky-700 flex items-center gap-1">
              Signera <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}
