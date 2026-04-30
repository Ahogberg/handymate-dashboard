'use client'

import { Trash2, X } from 'lucide-react'
import type { CustomerTag } from './types'

interface TagManagementModalProps {
  open: boolean
  tags: CustomerTag[]
  newTagName: string
  setNewTagName: (s: string) => void
  newTagColor: string
  setNewTagColor: (s: string) => void
  actionLoading: boolean
  onClose: () => void
  onCreate: () => void
  onDelete: (tagId: string) => void
}

export function TagManagementModal({
  open,
  tags,
  newTagName,
  setNewTagName,
  newTagColor,
  setNewTagColor,
  actionLoading,
  onClose,
  onCreate,
  onDelete,
}: TagManagementModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading text-lg font-bold text-slate-900 tracking-tight">Hantera taggar</h3>
          <button
            onClick={onClose}
            aria-label="Stäng"
            className="p-1.5 -m-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <input
            type="color"
            value={newTagColor}
            onChange={e => setNewTagColor(e.target.value)}
            className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer"
          />
          <input
            type="text"
            placeholder="Ny tagg…"
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onCreate()}
            className="flex-1 px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
          />
          <button
            onClick={onCreate}
            disabled={!newTagName.trim() || actionLoading}
            className="px-4 py-2.5 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            Skapa
          </button>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {tags.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-4">Inga taggar skapade ännu</p>
          ) : (
            tags.map(tag => (
              <div
                key={tag.tag_id}
                className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="text-sm font-medium text-slate-900 truncate">{tag.name}</span>
                  <span className="text-[11px] text-slate-400">({tag.customer_count} kunder)</span>
                </div>
                <button
                  onClick={() => onDelete(tag.tag_id)}
                  aria-label="Ta bort"
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
