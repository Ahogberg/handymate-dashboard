'use client'

import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { ProductCategory } from '../types'

/** 'all' = alla produkter, 'none' = utan kategori, annars kategori-id */
export type CategoryFilter = 'all' | 'none' | string

interface CategoryTreeProps {
  categories: ProductCategory[]
  selected: CategoryFilter
  onSelect: (filter: CategoryFilter) => void
  onCreate: (name: string, parentId: string | null) => Promise<void> | void
  onRename: (id: string, name: string) => Promise<void> | void
  onDelete: (category: ProductCategory) => void
}

const FILTER_CLS = (active: boolean) =>
  `w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
    active ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
  }`

const ICON_BTN_CLS = 'p-1.5 text-gray-400 hover:text-primary-700 transition-colors rounded'

/**
 * Kategoriträd med exakt 2 nivåer (huvudrubrik → underrubrik).
 * Skapa/byt namn/ta bort sker inline; nivå 3 kan inte skapas härifrån —
 * "Ny underrubrik" finns bara på huvudrubriker.
 */
export function CategoryTree({
  categories,
  selected,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: CategoryTreeProps) {
  // 'root' = ny huvudrubrik, annars id på huvudrubriken som får en underrubrik
  const [creatingParent, setCreatingParent] = useState<'root' | string | null>(null)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  async function submitCreate() {
    const name = newName.trim()
    if (!name) return
    await onCreate(name, creatingParent === 'root' ? null : creatingParent)
    setNewName('')
    setCreatingParent(null)
  }

  async function submitRename() {
    const name = editName.trim()
    if (!editingId || !name) return
    await onRename(editingId, name)
    setEditingId(null)
    setEditName('')
  }

  function renderNameInput(
    value: string,
    setValue: (v: string) => void,
    onSubmit: () => void,
    onCancel: () => void,
    placeholder: string
  ) {
    return (
      <div className="flex items-center gap-1 px-2 py-1">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSubmit()
            if (e.key === 'Escape') onCancel()
          }}
          placeholder={placeholder}
          autoFocus
          className="flex-1 min-w-0 px-2 py-1.5 text-sm bg-white border border-primary-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-500"
        />
        <button onClick={onSubmit} aria-label="Spara" className="p-1.5 text-primary-700 hover:bg-primary-50 rounded">
          <Check className="w-4 h-4" />
        </button>
        <button onClick={onCancel} aria-label="Avbryt" className="p-1.5 text-gray-400 hover:bg-gray-100 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  function renderCategoryRow(cat: ProductCategory, isMain: boolean) {
    if (editingId === cat.id) {
      return renderNameInput(
        editName,
        setEditName,
        submitRename,
        () => { setEditingId(null); setEditName('') },
        'Namn på kategorin'
      )
    }
    const active = selected === cat.id
    return (
      <div
        className={`group flex items-center rounded-lg ${
          active ? 'bg-primary-50' : 'hover:bg-gray-50'
        }`}
      >
        <button
          onClick={() => onSelect(cat.id)}
          className={`flex-1 min-w-0 text-left px-3 py-2 text-sm truncate ${
            active ? 'text-primary-700 font-medium' : 'text-gray-700'
          }`}
        >
          {cat.name}
        </button>
        <div className="flex items-center shrink-0 pr-1">
          {isMain && (
            <button
              onClick={() => { setCreatingParent(cat.id); setNewName('') }}
              aria-label={`Ny underrubrik till ${cat.name}`}
              title="Ny underrubrik"
              className={ICON_BTN_CLS}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => { setEditingId(cat.id); setEditName(cat.name) }}
            aria-label={`Byt namn på ${cat.name}`}
            title="Byt namn"
            className={ICON_BTN_CLS}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(cat)}
            aria-label={`Ta bort ${cat.name}`}
            title="Ta bort"
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      <button onClick={() => onSelect('all')} className={FILTER_CLS(selected === 'all')}>
        Alla produkter
      </button>
      <button onClick={() => onSelect('none')} className={FILTER_CLS(selected === 'none')}>
        Utan kategori
      </button>

      {categories.length > 0 && <div className="h-px bg-gray-100 my-2" />}

      {categories.map(main => (
        <div key={main.id}>
          {renderCategoryRow(main, true)}
          <div className="ml-4 border-l border-gray-100 pl-1 space-y-0.5">
            {main.children.map(child => (
              <div key={child.id}>{renderCategoryRow(child, false)}</div>
            ))}
            {creatingParent === main.id &&
              renderNameInput(
                newName,
                setNewName,
                submitCreate,
                () => { setCreatingParent(null); setNewName('') },
                'Ny underrubrik'
              )}
          </div>
        </div>
      ))}

      {creatingParent === 'root' ? (
        renderNameInput(
          newName,
          setNewName,
          submitCreate,
          () => { setCreatingParent(null); setNewName('') },
          'Ny huvudrubrik'
        )
      ) : (
        <button
          onClick={() => { setCreatingParent('root'); setNewName('') }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary-700 hover:bg-primary-50 rounded-lg transition-colors font-medium"
        >
          <Plus className="w-4 h-4" /> Ny huvudrubrik
        </button>
      )}
    </div>
  )
}
