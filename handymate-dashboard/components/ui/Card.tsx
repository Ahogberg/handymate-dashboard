'use client'

import { type HTMLAttributes, type ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
}

export default function Card({
  children,
  hover = false,
  padding = 'md',
  className = '',
  ...props
}: CardProps) {
  return (
    <div
      className={`
        bg-white rounded-xl border border-gray-200 shadow-sm
        ${hover ? 'hover:shadow-md hover:border-gray-300 transition-all cursor-pointer' : ''}
        ${paddingStyles[padding]}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}

export function CardHeader({ title, description, action, icon }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="p-2 rounded-lg bg-primary-50 text-primary-700">
            {icon}
          </div>
        )}
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}
