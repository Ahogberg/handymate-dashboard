'use client'

import { ChevronRight, FileText as FileSignature } from 'lucide-react'
import type { FieldReport } from '../types'

interface FieldReportsListProps {
  reports: FieldReport[]
}

/**
 * Fältrapport-lista (rendered när activeTab === 'reports').
 * Extraherat från page.tsx vid komponent-splitten — INGEN visuell ändring.
 *
 * Notering: rapport-signering sker via extern länk
 * (`/sign/report/[token]`), inte inline i portalen. Därför ingen
 * ReportSigningModal aktivt använd här — se separat fil-kommentar.
 */
export default function FieldReportsList({ reports }: FieldReportsListProps) {
  if (reports.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <FileSignature className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <h3 className="font-semibold text-gray-900">Inga fältrapporter</h3>
        <p className="text-sm text-gray-500 mt-1">Det finns inga rapporter att visa.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {reports.map(r => (
        <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500">{r.report_number || 'Rapport'}</p>
              <h3 className="font-semibold text-gray-900">{r.title}</h3>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${
              r.status === 'signed' ? 'bg-emerald-100 text-emerald-700' :
              r.status === 'rejected' ? 'bg-red-100 text-red-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {r.status === 'signed' ? 'Signerad' :
               r.status === 'rejected' ? 'Invändning' :
               r.status === 'sent' ? 'Att signera' : 'Utkast'}
            </span>
          </div>
          {r.work_performed && (
            <p className="text-sm text-gray-600 line-clamp-2 mb-3">{r.work_performed}</p>
          )}
          {r.status === 'sent' && r.signature_token && (
            <a
              href={`/sign/report/${r.signature_token}`}
              className="inline-flex items-center gap-1.5 text-sm text-sky-700 hover:underline"
            >
              Öppna och signera <ChevronRight className="w-4 h-4" />
            </a>
          )}
          {r.status === 'signed' && r.signed_by && (
            <p className="text-xs text-gray-400">Signerad av {r.signed_by}</p>
          )}
        </div>
      ))}
    </div>
  )
}
