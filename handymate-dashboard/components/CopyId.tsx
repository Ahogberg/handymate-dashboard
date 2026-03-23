'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface CopyIdProps {
  value: string
  label?: string
  className?: string
}

export function CopyId({ value, label, className = '' }: CopyIdProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = value
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 text-gray-400 hover:text-teal-600 transition-colors ${className}`}
      title={`Kopiera ${label || value}`}
    >
      <span className="font-mono text-xs">{label || value}</span>
      {copied ? (
        <Check className="w-3 h-3 text-teal-600" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
      {copied && (
        <span className="text-[10px] text-teal-600 font-medium">Kopierat!</span>
      )}
    </button>
  )
}
