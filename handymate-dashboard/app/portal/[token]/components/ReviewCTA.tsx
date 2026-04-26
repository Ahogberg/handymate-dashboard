'use client'

import { ExternalLink, Star } from 'lucide-react'

interface ReviewCTAProps {
  customerFirstName: string
  businessName: string
  googleReviewUrl: string | null | undefined
  onGoToPortal: () => void
}

/**
 * Google-recensions-CTA (landing från review-SMS efter completed projekt).
 * Extraherat från page.tsx vid komponent-splitten — INGEN visuell ändring.
 */
export default function ReviewCTA({
  customerFirstName,
  businessName,
  googleReviewUrl,
  onGoToPortal,
}: ReviewCTAProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
        <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Star className="w-7 h-7 text-amber-500 fill-amber-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Tack {customerFirstName}!
        </h2>
        <p className="text-gray-600 mb-2">
          Vi hoppas du är nöjd med jobbet från {businessName}.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Om du har en stund — en recension betyder enormt mycket för oss.
        </p>

        {googleReviewUrl ? (
          <a
            href={googleReviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-700 text-white rounded-xl font-medium hover:bg-primary-800 transition-colors"
          >
            <Star className="w-5 h-5" />
            Lämna en Google-recension
            <ExternalLink className="w-4 h-4" />
          </a>
        ) : (
          <p className="text-sm text-gray-400">
            Recensionslänk inte tillgänglig — kontakta {businessName} direkt.
          </p>
        )}
      </div>

      <button
        onClick={onGoToPortal}
        className="w-full text-center text-sm text-sky-700 hover:underline py-2"
      >
        Gå till portalen →
      </button>
    </div>
  )
}
