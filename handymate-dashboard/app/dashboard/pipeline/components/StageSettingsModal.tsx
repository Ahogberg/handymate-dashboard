'use client'

import { GripVertical, Loader2, Lock, MoveDown, MoveUp, Plus, Save, Trash2, X } from 'lucide-react'
import { usePipelineContext } from '../context'

/**
 * "Hantera pipeline-steg"-modalen. Triggas idag inte från någon knapp i UI:t
 * (stegen är låsta enligt ARCHITECTURE.md), men koden bevaras för framtida bruk.
 */
export function StageSettingsModal() {
  const {
    stages,
    showStageSettings,
    setShowStageSettings,
    stageEdits,
    setStageEdits,
    newStageName,
    setNewStageName,
    stageSaving,
    saveStageEdits,
    addNewStage,
    deleteStage,
    moveStageOrder,
  } = usePipelineContext()

  if (!showStageSettings) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-t-2xl sm:rounded-xl p-6 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Hantera pipeline-steg</h3>
          <button onClick={() => setShowStageSettings(false)} className="text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2 mb-6">
          {stages
            .filter(s => !s.is_won && !s.is_lost)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((stage, idx, arr) => (
            <div key={stage.id} className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
              <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />

              {/* Color picker */}
              <input
                type="color"
                value={stageEdits[stage.id]?.color || stage.color}
                onChange={(e) => setStageEdits(prev => ({ ...prev, [stage.id]: { ...prev[stage.id], color: e.target.value } }))}
                className="w-6 h-6 rounded-md border border-[#E2E8F0] cursor-pointer flex-shrink-0"
                style={{ padding: 0 }}
              />

              {/* Name input */}
              {stage.is_system ? (
                <span className="flex-1 flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500">
                  <Lock className="w-3 h-3" />
                  {stage.name}
                </span>
              ) : (
                <input
                  type="text"
                  value={stageEdits[stage.id]?.name || stage.name}
                  onChange={(e) => setStageEdits(prev => ({ ...prev, [stage.id]: { ...prev[stage.id], name: e.target.value } }))}
                  className="flex-1 px-3 py-1.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 focus:outline-none focus:border-[#0F766E]"
                />
              )}

              {/* Reorder */}
              <button onClick={() => moveStageOrder(stage.id, 'up')} disabled={idx === 0}
                className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded-lg hover:bg-gray-100 transition-all">
                <MoveUp className="w-4 h-4" />
              </button>
              <button onClick={() => moveStageOrder(stage.id, 'down')} disabled={idx === arr.length - 1}
                className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded-lg hover:bg-gray-100 transition-all">
                <MoveDown className="w-4 h-4" />
              </button>

              {/* Delete — only for custom stages */}
              {!stage.is_system ? (
                <button onClick={() => deleteStage(stage.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                  title="Ta bort steg">
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : (
                <span className="w-7" />
              )}
            </div>
          ))}

          {/* System stages (non-editable name) */}
          {stages.filter(s => s.is_won || s.is_lost).sort((a, b) => a.sort_order - b.sort_order).map(stage => (
            <div key={stage.id} className="flex items-center gap-2 p-3 bg-gray-50/50 rounded-xl opacity-70">
              <div className="w-4" />
              <span className="w-6 h-6 rounded-md flex-shrink-0" style={{ backgroundColor: stage.color }} />
              <span className="flex-1 text-sm text-gray-500 px-3 py-1.5">{stage.name}</span>
              <span className="text-xs text-gray-400 px-2">Systemsteg</span>
            </div>
          ))}
        </div>

        {/* Add new stage */}
        <div className="flex items-center gap-2 mb-6">
          <input
            type="text"
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            placeholder="Nytt steg, t.ex. 'Platsbedömning'"
            className="flex-1 px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E] min-h-[44px]"
            onKeyDown={(e) => e.key === 'Enter' && addNewStage()}
          />
          <button
            onClick={addNewStage}
            disabled={stageSaving || !newStageName.trim()}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-700 rounded-xl text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            Lägg till
          </button>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={() => setShowStageSettings(false)} className="px-4 py-2.5 text-gray-500 hover:text-gray-900 min-h-[44px]">
            Avbryt
          </button>
          <button
            onClick={saveStageEdits}
            disabled={stageSaving}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-700 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 min-h-[44px]"
          >
            {stageSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Spara ändringar
          </button>
        </div>
      </div>
    </div>
  )
}
