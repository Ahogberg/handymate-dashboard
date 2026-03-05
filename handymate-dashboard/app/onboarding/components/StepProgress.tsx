'use client'

import { Check } from 'lucide-react'
import { STEPS } from '../constants'

interface StepProgressProps {
  currentStep: number
}

export default function StepProgress({ currentStep }: StepProgressProps) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8">
      {STEPS.map((step, i) => {
        const Icon = step.icon
        const isActive = step.id === currentStep
        const isCompleted = step.id < currentStep

        return (
          <div key={step.id} className="flex items-center">
            {i > 0 && (
              <div className={`w-6 sm:w-10 h-0.5 mx-1 transition-colors ${
                isCompleted ? 'bg-teal-600' : 'bg-zinc-700'
              }`} />
            )}
            <div className="flex flex-col items-center gap-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                isActive
                  ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-500/25'
                  : isCompleted
                    ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
              }`}>
                {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
              </div>
              <span className={`text-xs hidden sm:block ${
                isActive ? 'text-white font-medium' : isCompleted ? 'text-teal-400' : 'text-zinc-500'
              }`}>
                {step.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
