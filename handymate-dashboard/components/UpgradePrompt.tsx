'use client'

import Link from 'next/link'
import { Lock, Sparkles, Check, ArrowRight } from 'lucide-react'
import { useBusinessPlan } from '@/lib/useBusinessPlan'
import {
  FEATURE_GATES,
  getNextPlan,
  getPlanPrice,
  getPlanLabel,
  PlanType,
} from '@/lib/feature-gates'

interface UpgradePromptProps {
  featureKey: string
  inline?: boolean
}

export default function UpgradePrompt({ featureKey, inline = false }: UpgradePromptProps) {
  const { plan } = useBusinessPlan()
  const gate = FEATURE_GATES[featureKey]
  const nextPlan = getNextPlan(plan)

  if (!gate || !nextPlan) return null

  const targetPlan = gate.plans[0] as PlanType
  const targetLabel = getPlanLabel(targetPlan)
  const targetPrice = getPlanPrice(targetPlan)

  // Get a few highlight features the user would gain
  const upgradeHighlights = Object.values(FEATURE_GATES)
    .filter(g => g.plans.includes(targetPlan) && !g.plans.includes(plan) && g.key !== featureKey)
    .slice(0, 5)

  if (inline) {
    return (
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-primary-50 to-primary-50 border border-primary-200 rounded-xl">
        <Lock className="w-5 h-5 text-primary-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{gate.name} ingår i {targetLabel}</p>
          <p className="text-xs text-gray-500 mt-0.5">Uppgradera för att låsa upp denna funktion</p>
        </div>
        <Link
          href="/dashboard/settings/billing"
          className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-primary-600 to-primary-600 text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          Uppgradera
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto mt-12 p-8">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-600 px-6 py-5">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-white" />
            <h2 className="text-lg font-semibold text-white">Uppgradera till {targetLabel}</h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <p className="text-sm text-gray-600">
            <strong className="text-gray-900">{gate.name}</strong> ingår i {targetLabel}-planen.
          </p>

          {upgradeHighlights.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-900 mb-3">Du får även:</p>
              <ul className="space-y-2">
                {upgradeHighlights.map(h => (
                  <li key={h.key} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />
                    {h.name}
                  </li>
                ))}
                {Object.values(FEATURE_GATES).filter(g => g.plans.includes(targetPlan) && !g.plans.includes(plan)).length > 5 && (
                  <li className="text-sm text-gray-400 ml-6">
                    ...och mycket mer
                  </li>
                )}
              </ul>
            </div>
          )}

          <Link
            href="/dashboard/settings/billing"
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-600 text-white font-medium rounded-xl hover:opacity-90 transition-opacity"
          >
            Uppgradera nu – {targetPrice.toLocaleString('sv-SE')} kr/mån
            <ArrowRight className="w-4 h-4" />
          </Link>

          <p className="text-xs text-gray-400 text-center">
            Du kan närsomhelst byta plan eller avsluta i inställningarna
          </p>
        </div>
      </div>
    </div>
  )
}
