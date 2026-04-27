'use client'

import { ChevronRight, Lock } from 'lucide-react'
import { usePipelineContext } from '../context'
import { formatColumnValue } from '../helpers'
import { DealCard } from './DealCard'

/**
 * Kanban-vyn — desktop visar alla aktiva stages som kolumner + lost-kolumn
 * (kollapsbar). Mobil visar en stage i taget (växlas via PipelineHeaderns
 * mobile tabs som styr context.mobileStageIndex).
 *
 * Drag-and-drop går via context.handleDragOver/Leave/Drop.
 * activeStages-listan filtreras lokalt baserat på hideEmpty-flaggan.
 */
export function KanbanView() {
  const {
    stages,
    dealsForStage,
    stageValue,
    draggingDealId,
    dragOverStageId,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    hideEmpty,
    scrollContainerRef,
    mobileStageIndex,
    lostExpanded,
    setLostExpanded,
  } = usePipelineContext()

  const allActiveStages = stages.filter(s => !s.is_lost)
  const lostStage = stages.find(s => s.is_lost)
  const activeStages = hideEmpty
    ? allActiveStages.filter(s => dealsForStage(s.id).length > 0 || s.sort_order === 1)
    : allActiveStages

  return (
    <>
      {/* Desktop */}
      <div ref={scrollContainerRef} className="hidden lg:flex h-full overflow-x-auto px-4 py-4 gap-2 scroll-smooth">
        {activeStages.map(stage => {
          const stageDeals = dealsForStage(stage.id)
          const total = stageValue(stage.id)
          const isDropTarget = dragOverStageId === stage.id
          return (
            <div key={stage.id} id={`stage-${stage.id}`}
              className={`flex-1 min-w-[160px] flex flex-col rounded-xl border transition-all duration-200 ${isDropTarget ? 'border-dashed border-primary-400 bg-primary-50/50 shadow-inner' : 'border-gray-200 bg-white/50'}`}
              onDragOver={e => handleDragOver(e, stage.id)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, stage)}>
              <div className="flex-shrink-0 px-3 py-2.5 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                    <h3 className="text-sm font-semibold text-gray-900">{stage.name}</h3>
                    {stage.is_system && <span title="Systemsteg — används av automationer"><Lock className="w-3 h-3 text-gray-300" /></span>}
                    <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">{stageDeals.length}</span>
                  </div>
                  <span className="text-xs text-gray-400 font-medium">{formatColumnValue(total)}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {stageDeals.length === 0 && <div className="flex items-center justify-center py-8 text-gray-300 text-xs">{isDropTarget ? 'Släpp här' : 'Inga deals'}</div>}
                {stageDeals.map(deal => (
                  <DealCard key={deal.id} deal={deal} isDragging={draggingDealId === deal.id} />
                ))}
                {stage.id === 'won' && (
                  <a href="/dashboard/projects" className="flex items-center justify-center gap-1.5 py-3 mt-1 text-xs text-primary-700 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors">
                    <span>🚀</span>
                    <span>Vunna deals blir projekt →</span>
                  </a>
                )}
              </div>
            </div>
          )
        })}

        {/* Lost column - collapsed by default */}
        {lostStage && (
          <div id={`stage-${lostStage.id}`}
            className={`flex-shrink-0 flex flex-col rounded-xl border transition-all duration-200 ${lostExpanded ? 'w-[200px]' : 'w-[52px]'} ${dragOverStageId === lostStage?.id ? 'border-dashed border-red-400 bg-red-50/50' : 'border-gray-200 bg-gray-50/50'}`}
            onDragOver={e => handleDragOver(e, lostStage.id)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, lostStage)}>
            {lostExpanded ? (
              <>
                <div className="flex-shrink-0 px-3 py-2.5 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <h3 className="text-sm font-semibold text-gray-900">{lostStage.name}</h3>
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">{dealsForStage(lostStage.id).length}</span>
                    </div>
                    <button onClick={() => setLostExpanded(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {dealsForStage(lostStage.id).map(deal => (
                    <DealCard key={deal.id} deal={deal} isDragging={draggingDealId === deal.id} />
                  ))}
                </div>
              </>
            ) : (
              <button onClick={() => setLostExpanded(true)}
                className="flex flex-col items-center justify-center h-full py-4 gap-2 text-gray-400 hover:text-gray-600 transition-colors">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-xs font-medium [writing-mode:vertical-lr] rotate-180">{lostStage.name} ({dealsForStage(lostStage.id).length})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mobile */}
      <div className="lg:hidden h-full flex flex-col">
        {stages[mobileStageIndex] && (
          <div className="flex-1 overflow-y-auto p-4 space-y-2"
            onDragOver={e => handleDragOver(e, stages[mobileStageIndex].id)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, stages[mobileStageIndex])}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: stages[mobileStageIndex].color }} />
                <h3 className="text-sm font-semibold text-gray-900">{stages[mobileStageIndex].name}</h3>
                <span className="text-xs text-gray-400">{dealsForStage(stages[mobileStageIndex].id).length} deals</span>
              </div>
              <span className="text-xs text-gray-400">{formatColumnValue(stageValue(stages[mobileStageIndex].id))}</span>
            </div>
            {dealsForStage(stages[mobileStageIndex].id).length === 0 && <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Inga deals i detta steg</div>}
            {dealsForStage(stages[mobileStageIndex].id).map(deal => (
              <DealCard key={deal.id} deal={deal} isDragging={draggingDealId === deal.id} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
