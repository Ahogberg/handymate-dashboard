'use client'

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900
              placeholder:text-gray-400
              focus:outline-none focus:ring-2 focus:border-primary-500
              transition-colors
              ${icon ? 'pl-10' : ''}
              ${error
                ? 'border-red-300 focus:ring-red-500/30'
                : 'border-gray-200 focus:ring-primary-500/30'
              }
              ${className}
            `}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
export default Input
