'use client'

// Root-nivåns felgräns (App Router). Fångar renderfel i root-layouten som
// components/ErrorBoundary.tsx aldrig ser, rapporterar till Sentry (no-op
// utan DSN) och visar en ärlig svensk sida i stället för Next:s tomma vita.
// Måste rendera egen <html>/<body> — root-layouten är ur spel när den körs.

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    try {
      Sentry.captureException(error)
    } catch {
      // Felspårningen får aldrig fälla felsidan.
    }
  }, [error])

  return (
    <html lang="sv">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#F8FAFC', margin: 0 }}>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: '100%',
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 16,
              padding: 32,
              textAlign: 'center',
            }}
          >
            <h1 style={{ fontSize: 20, margin: '0 0 8px', color: '#111827' }}>Något gick fel</h1>
            <p style={{ color: '#6B7280', fontSize: 14, margin: '0 0 20px' }}>
              Sidan kunde inte visas. Felet är rapporterat till Handymate.
              {error.digest ? ` Referens: ${error.digest}.` : ''}
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                background: '#0F766E',
                color: '#fff',
                border: 0,
                borderRadius: 10,
                padding: '10px 20px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Försök igen
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
