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
                isCompleted ? 'bg-primary-700' : 'bg-zinc-700'
              }`} />
            )}
            <div className="flex flex-col items-center gap-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                isActive
                  ? 'bg-primary-700 hover:bg-primary-700 text-white shadow-lg shadow-primary-600/25'
                  : isCompleted
                    ? 'bg-primary-600/20 text-primary-500 border border-primary-600/30'
                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
              }`}>
                {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
              </div>
              <span className={`text-xs hidden sm:block ${
                isActive ? 'text-white font-medium' : isCompleted ? 'text-primary-500' : 'text-zinc-500'
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
