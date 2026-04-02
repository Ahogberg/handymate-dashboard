'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  children: ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-700 text-white hover:bg-primary-800 focus:ring-primary-500/30 shadow-sm',
  secondary:
    'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus:ring-gray-300/30 shadow-sm',
  ghost:
    'text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-300/30',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500/30 shadow-sm',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, children, className = '', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          inline-flex items-center justify-center font-medium rounded-lg
          transition-colors focus:outline-none focus:ring-2
          disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
