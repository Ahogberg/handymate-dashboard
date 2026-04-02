'use client'

import { type ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-12 text-center">
      <div className="text-gray-300 mx-auto mb-3 flex justify-center">
        {icon}
      </div>
      <p className="text-gray-500 font-medium">{title}</p>
      {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
