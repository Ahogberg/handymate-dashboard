/** @jsxImportSource react */
// Ingen egen 'use client' — komponenten används uteslutande som barn av
// redan klient-gränsade filer (AgentMessage.tsx, Jobbkompisen.tsx), och
// pragmat ovan behövs för att tests/mission-plan-card.spec.ts ska kunna
// renderToStaticMarkup:a kortet i Node (samma fix som components/quotes/
// document/QuoteDocument.tsx redan bär, av samma anledning).

import { groupStepsByClass } from '@/lib/mission/plan-contract-view'
import type { MissionPlanPresentation } from '@/lib/mission/mission-presentation'
import type { TruthClass } from '@/lib/mission/opportunity-portfolio'

/**
 * MissionPlanCard — uppdragsplanens kort i Matte-chatten (Goal-to-Plan V1,
 * Etapp C, tasks/jaunty-pondering-hummingbird.md). Renderas av
 * AgentMessage.tsx när presentationen har kind 'mission_plan', bredvid
 * BusinessScenarioCard-grenen.
 *
 * ═══ EN KANTAD SEKTION PER SANNINGSKLASS ═══
 *
 * Varje klass som förekommer i planen (lib/mission/plan-contract-view.ts
 * groupStepsByClass) får sin egen sektion med SIN EGEN badge och SINA EGNA
 * stegs mått. Ingen knapp eller rad lägger ihop klassernas belopp till en
 * gemensam siffra — se tests/mission-plan-card.spec.ts för facit som dödar
 * en sådan hopläggning.
 */

const CLASS_LABEL: Record<TruthClass, string> = {
  indrivningsbart: 'Indrivningsbart',
  faktureringsklart: 'Faktureringsklart',
  pipeline: 'Pipeline (ej säkrat)',
  ateraktivering: 'Återaktivering',
  marginalskydd: 'Marginalskydd',
}

const CLASS_BADGE: Record<TruthClass, { text: string; className: string }> = {
  indrivningsbart: { text: 'KÄNT', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  faktureringsklart: { text: 'KÄNT', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pipeline: { text: 'PIPELINE', className: 'bg-slate-50 text-slate-600 border-slate-200' },
  ateraktivering: { text: 'ANTAL', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  marginalskydd: { text: 'SKYDD', className: 'bg-amber-50 text-amber-700 border-amber-200' },
}

function formatMeasure(measure: MissionPlanPresentation['steps'][number]['measure']): string {
  return measure.kind === 'kr'
    ? `${measure.amountKr.toLocaleString('sv-SE')} kr`
    : `${measure.count} st`
}

export function MissionPlanCard({
  presentation,
  onSendChat,
  onPrefill,
  onOpenPanel,
}: {
  presentation: MissionPlanPresentation
  /** Skickar chattmeddelandet "Starta uppdraget som föreslaget." */
  onSendChat?: (text: string) => void
  /** Förifyller chattinputen, skickar inget. */
  onPrefill?: (text: string) => void
  /** Etapp X (Mission Mandates V1): öppnar uppdragspanelen (components/mission/
      MissionPanel.tsx), där mandatdialogen faktiskt bor. Kortet SKAPAR aldrig
      ett mandat självt — Matte/chatten är inte en mandatskapande yta, se
      lib/mandates/mission-mandate.ts:s filhuvud. */
  onOpenPanel?: () => void
}) {
  const sections = groupStepsByClass(presentation.steps)

  return (
    <div className="mt-2 bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div>
        <p className="m-0 text-sm font-semibold text-slate-900">{presentation.headline}</p>
        <p className="m-0 mt-0.5 text-xs text-slate-500">Deadline {presentation.deadline}</p>
      </div>

      {sections.map(section => {
        const badge = CLASS_BADGE[section.truth_class]
        return (
          <div key={section.truth_class} className="border border-slate-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-slate-700">{CLASS_LABEL[section.truth_class]}</span>
              <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${badge.className}`}>
                {badge.text}
              </span>
            </div>
            <ul className="m-0 p-0 list-none space-y-1.5">
              {section.steps.map(step => (
                <li key={step.item_id} className="text-sm text-slate-800">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>{step.title}</span>
                    <span className="tabular-nums font-medium whitespace-nowrap">{formatMeasure(step.measure)}</span>
                  </div>
                  {step.motivation && (
                    <p className="m-0 mt-0.5 text-xs text-slate-500">{step.motivation}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      {presentation.degraded_sources.length > 0 && (
        <p className="m-0 text-[11px] text-slate-400">
          Källor som inte kunde läsas: {presentation.degraded_sources.join(', ')}
        </p>
      )}

      {presentation.state === 'proposal' ? (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onSendChat?.('Starta uppdraget som föreslaget.')}
            className="flex-1 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800 transition-colors"
          >
            Starta uppdraget
          </button>
          <button
            type="button"
            onClick={() => onPrefill?.('Justera planen: ')}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Justera
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
            ✓ Uppdraget startat — jag säger till när något behöver dig.
          </span>
          {onOpenPanel && (
            <button
              type="button"
              onClick={onOpenPanel}
              className="block text-xs text-primary-700 hover:text-primary-800 font-medium underline underline-offset-2"
            >
              Vill du låta teamet genomföra inom gränser? Öppna uppdragspanelen.
            </button>
          )}
        </div>
      )}
    </div>
  )
}
