'use client'

import React from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

// ─── Component ───────────────────────────────────────────────────────────────

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log to console for now — replace with Sentry later
    console.error('[ErrorBoundary] Ett oväntat fel uppstod:', error)
    console.error('[ErrorBoundary] Komponentstack:', errorInfo.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoBack = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
            {/* Icon */}
            <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-red-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            {/* Heading */}
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Något gick fel
            </h2>

            {/* Description */}
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              Ett oväntat fel uppstod. Försök att ladda om sidan. Om problemet
              kvarstår, kontakta supporten.
            </p>

            {/* Error detail (collapsed by default in production) */}
            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 transition-colors">
                  Visa teknisk information
                </summary>
                <pre className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 overflow-auto max-h-40 whitespace-pre-wrap break-words">
                  {this.state.error.message}
                </pre>
              </details>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
              >
                Ladda om sidan
              </button>
              <button
                onClick={this.handleGoBack}
                className="px-6 py-2.5 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors border border-gray-300"
              >
                Försök igen
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
