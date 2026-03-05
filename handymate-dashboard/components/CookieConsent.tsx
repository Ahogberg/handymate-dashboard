'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Cookie, X } from 'lucide-react'

export default function CookieConsent() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('handymate_cookie_consent')
    if (!consent) {
      const timer = setTimeout(() => setShow(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [])

  if (!show) return null

  const accept = (level: 'all' | 'necessary') => {
    localStorage.setItem('handymate_cookie_consent', level)
    setShow(false)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl shadow-lg p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Cookie className="w-6 h-6 text-amber-500 flex-shrink-0 hidden sm:block" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-700">
            Vi använder cookies för att förbättra din upplevelse.{' '}
            <Link href="/privacy" className="text-sky-700 hover:underline">
              Läs vår integritetspolicy
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
          <button
            onClick={() => accept('necessary')}
            className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Bara nödvändiga
          </button>
          <button
            onClick={() => accept('all')}
            className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:opacity-90 transition-opacity"
          >
            Godkänn alla
          </button>
        </div>
      </div>
    </div>
  )
}
