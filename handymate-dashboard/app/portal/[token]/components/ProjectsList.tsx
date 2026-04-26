'use client'

import { Calendar, ChevronRight, FolderKanban } from 'lucide-react'
import { formatDateTime, getProjectStatusText } from '../helpers'
import type { Project } from '../types'

interface ProjectsListProps {
  projects: Project[]
  onSelectProject: (id: string) => void
}

/**
 * Projektlista (rendered när activeTab === 'projects' && !selectedProject).
 * Extraherat från page.tsx vid komponent-splitten — INGEN visuell ändring.
 */
export default function ProjectsList({ projects, onSelectProject }: ProjectsListProps) {
  if (projects.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <FolderKanban className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p>Inga projekt just nu.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {projects.map(p => (
        <button
          key={p.project_id}
          onClick={() => onSelectProject(p.project_id)}
          className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-primary-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-gray-900">{p.name}</h3>
            <span className={`text-xs px-2 py-1 rounded-full ${
              p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
              p.status === 'active' || p.status === 'in_progress' ? 'bg-primary-100 text-primary-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {getProjectStatusText(p.status)}
            </span>
          </div>

          {typeof p.progress === 'number' && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Framsteg</span>
                <span>{p.progress}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary-700 rounded-full transition-all" style={{ width: `${p.progress}%` }} />
              </div>
            </div>
          )}

          {p.nextVisit && (
            <div className="flex items-center gap-2 text-sm text-primary-700 mb-2">
              <Calendar className="w-4 h-4" />
              Nasta besok: {formatDateTime(p.nextVisit.start_time)}
            </div>
          )}

          {p.latestLog && (
            <p className="text-sm text-gray-500 line-clamp-2">
              {p.latestLog.description}
            </p>
          )}

          <div className="flex items-center justify-end mt-2 text-sm text-sky-700">
            Se detaljer <ChevronRight className="w-4 h-4" />
          </div>
        </button>
      ))}
    </div>
  )
}
