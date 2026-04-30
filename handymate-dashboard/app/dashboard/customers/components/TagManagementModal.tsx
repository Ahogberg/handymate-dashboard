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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900">Hantera taggar</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <input
            type="color"
            value={newTagColor}
            onChange={e => setNewTagColor(e.target.value)}
            className="w-10 h-10 rounded-lg border border-[#E2E8F0] cursor-pointer"
          />
          <input
            type="text"
            placeholder="Ny tagg..."
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onCreate()}
            className="flex-1 px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:border-[#0F766E]"
          />
          <button
            onClick={onCreate}
            disabled={!newTagName.trim() || actionLoading}
            className="px-4 py-2.5 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            Skapa
          </button>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {tags.length === 0 ? (
            <p className="text-center text-gray-400 py-4">Inga taggar skapade ännu</p>
          ) : (
            tags.map(tag => (
              <div key={tag.tag_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span className="text-sm font-medium text-gray-900">{tag.name}</span>
                  <span className="text-xs text-gray-400">({tag.customer_count} kunder)</span>
                </div>
                <button
                  onClick={() => onDelete(tag.tag_id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
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
