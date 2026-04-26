'use client'

import { ArrowLeft } from 'lucide-react'

interface PortalHeaderProps {
  businessName: string
  customerName: string
  selectedProjectId: string | null
  selectedProjectName?: string
  onBackToProjects: () => void
}

/**
 * Sticky portal-header (företagsnamn + välkomst eller bakåt-knapp till projekt).
 * Extraherat från page.tsx vid komponent-splitten — INGEN visuell ändring.
 */
export default function PortalHeader({
  businessName,
  customerName,
  selectedProjectId,
  selectedProjectName,
  onBackToProjects,
}: PortalHeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 py-4">
        <p className="text-sm text-primary-700 font-medium">{businessName}</p>
        <h1 className="text-lg font-semibold text-gray-900">
          {selectedProjectId ? (
            <button onClick={onBackToProjects} className="flex items-center gap-2 hover:text-primary-700">
              <ArrowLeft className="w-4 h-4" />
              {selectedProjectName}
            </button>
          ) : (
            `Valkommen, ${customerName}`
          )}
        </h1>
      </div>
    </header>
  )
}
