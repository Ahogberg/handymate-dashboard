'use client'

import { type ReactNode } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
  dot?: boolean
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-600 border-gray-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-secondary-50 text-secondary-700 border-secondary-200',
  primary: 'bg-primary-50 text-primary-700 border-primary-200',
}

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-gray-400',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-secondary-500',
  primary: 'bg-primary-600',
}

export default function Badge({ variant = 'default', children, className = '', dot = false }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2 py-0.5
        text-xs font-medium rounded-full border
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  )
}
