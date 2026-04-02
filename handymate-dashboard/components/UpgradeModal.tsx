'use client'

import { X } from 'lucide-react'
import Link from 'next/link'

interface UpgradeModalProps {
  feature: string
  onClose: () => void
}

export function UpgradeModal({ feature, onClose }: UpgradeModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-6 text-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-4xl mb-4">⚡</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Uppgradera till Professional
          </h2>
          <p className="text-gray-500 mb-6">
            {feature} ingår obegränsat i Professional-planen.
          </p>

          <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
            <div className="font-semibold text-gray-900">Professional — 5 995 kr/mån</div>
            <ul className="text-sm text-gray-500 mt-3 space-y-1.5">
              <li>✓ Obegränsade offertmallar</li>
              <li>✓ Obegränsade lead-källor</li>
              <li>✓ Upp till 5 teammedlemmar</li>
              <li>✓ Alla AI-automationer</li>
              <li>✓ Fortnox-integration</li>
            </ul>
          </div>

          <Link
            href="/dashboard/settings/billing"
            className="block w-full bg-primary-800 text-white py-3 rounded-xl font-medium hover:bg-primary-800 transition-colors"
            onClick={onClose}
          >
            Uppgradera nu →
          </Link>
          <button
            onClick={onClose}
            className="mt-3 text-sm text-gray-400 hover:text-gray-600"
          >
            Inte nu
          </button>
        </div>
      </div>
    </div>
  )
}
