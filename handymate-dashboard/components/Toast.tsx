'use client'

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration: number
}

interface ToastContextValue {
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>')
  }
  return ctx
}

// ─── Style helpers ───────────────────────────────────────────────────────────

const ICON_MAP: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'i',
  warning: '!',
}

function borderColor(type: ToastType): string {
  switch (type) {
    case 'success':
      return 'border-l-emerald-500'
    case 'error':
      return 'border-l-red-500'
    case 'info':
      return 'border-l-blue-500'
    case 'warning':
      return 'border-l-amber-500'
  }
}

function iconBg(type: ToastType): string {
  switch (type) {
    case 'success':
      return 'bg-emerald-100 text-emerald-600'
    case 'error':
      return 'bg-red-100 text-red-600'
    case 'info':
      return 'bg-blue-100 text-blue-600'
    case 'warning':
      return 'bg-amber-100 text-amber-600'
  }
}

// ─── Individual Toast ────────────────────────────────────────────────────────

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: (id: string) => void
}) {
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setExiting(true)
    }, toast.duration)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [toast.duration])

  // After the exit animation completes, remove the toast
  useEffect(() => {
    if (!exiting) return
    const t = setTimeout(() => onDismiss(toast.id), 300)
    return () => clearTimeout(t)
  }, [exiting, toast.id, onDismiss])

  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setExiting(true)
  }

  return (
    <div
      role="alert"
      className={`
        w-full sm:w-96 bg-white border border-gray-200 border-l-4 ${borderColor(toast.type)}
        rounded-lg shadow-lg pointer-events-auto
        flex items-start gap-3 p-4
        transition-all duration-300 ease-in-out
        ${exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
      `}
    >
      {/* Icon */}
      <span
        className={`
          flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
          text-xs font-bold ${iconBg(toast.type)}
        `}
      >
        {ICON_MAP[toast.type]}
      </span>

      {/* Message */}
      <p className="flex-1 text-sm text-gray-700 leading-snug pt-0.5">
        {toast.message}
      </p>

      {/* Close button */}
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Stäng"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

// ─── Provider ────────────────────────────────────────────────────────────────

let idCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback(
    (type: ToastType, message: string, duration: number = 4000) => {
      const id = `toast-${++idCounter}-${Date.now()}`
      setToasts((prev) => [...prev, { id, type, message, duration }])
    },
    []
  )

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const contextValue = React.useMemo<ToastContextValue>(
    () => ({
      success: (msg, dur) => addToast('success', msg, dur),
      error: (msg, dur) => addToast('error', msg, dur),
      info: (msg, dur) => addToast('info', msg, dur),
      warning: (msg, dur) => addToast('warning', msg, dur),
    }),
    [addToast]
  )

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {/* Toast container — bottom-right, full-width on mobile */}
      <div
        aria-live="polite"
        className="fixed bottom-0 right-0 z-[9999] p-4 sm:p-6 flex flex-col-reverse gap-3 items-end pointer-events-none w-full sm:w-auto"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
