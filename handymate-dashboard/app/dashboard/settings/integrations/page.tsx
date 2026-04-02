'use client'

import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import { ArrowLeft, Globe, Calendar, Mail, Code, ChevronRight, Copy, Check, Loader2 } from 'lucide-react'
import { useState } from 'react'

export default function IntegrationsPage() {
  const business = useBusiness()
  const [copied, setCopied] = useState(false)

  const embedCode = `<script src="https://app.handymate.se/embed.js" data-key="HM-${business.business_id?.slice(0, 8) || 'abc123'}"></script>`

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!business.business_id) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  const integrations = [
    {
      icon: Globe,
      title: 'Hemsida-widget',
      description: 'Lägg till en chattwidget på din hemsida så kunder kan kontakta dig direkt',
      href: '/dashboard/settings/website-widget',
      connected: false,
      color: 'text-primary-700 bg-primary-50',
    },
    {
      icon: Calendar,
      title: 'Google Calendar',
      description: 'Synka bokningar med din kalender automatiskt',
      href: '/dashboard/settings',
      connected: false,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      icon: Mail,
      title: 'Gmail',
      description: 'Importera leads automatiskt från din inkorg',
      href: '/dashboard/settings',
      connected: false,
      color: 'text-red-500 bg-red-50',
    },
  ]

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/settings" className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Integrationer</h1>
            <p className="text-sm text-gray-500">Koppla ihop Handymate med dina andra verktyg</p>
          </div>
        </div>

        {/* Integration cards */}
        <div className="space-y-3 mb-8">
          {integrations.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.color}`}>
                <item.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{item.title}</span>
                  {item.connected && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Kopplad</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 truncate">{item.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </Link>
          ))}
        </div>

        {/* Embed code section */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-1">
            <Code className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">Snabbinstallation</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Klistra in denna kod på din hemsida för att aktivera Handymate-widgeten
          </p>

          <div className="relative">
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto font-mono">
              {embedCode}
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              title="Kopiera"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          {copied && (
            <p className="text-xs text-emerald-600 mt-2">Kopierat till urklipp!</p>
          )}
        </div>
      </div>
    </div>
  )
}
