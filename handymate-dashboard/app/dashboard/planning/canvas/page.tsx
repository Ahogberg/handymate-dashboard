'use client'

import dynamic from 'next/dynamic'
import { useBusiness } from '@/lib/BusinessContext'
import { Loader2, Pencil } from 'lucide-react'

const ProjectCanvas = dynamic(() => import('@/components/project/ProjectCanvas'), {
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
    </div>
  ),
  ssr: false,
})

export default function SkissblockPage() {
  const business = useBusiness()

  if (!business?.business_id) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center">
            <Pencil className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Skissblock</h1>
            <p className="text-sm text-gray-500">Snabbskissa idéer — koppla till projekt eller lead senare</p>
          </div>
        </div>

        <ProjectCanvas
          entityType="standalone"
          entityId={business.business_id}
        />
      </div>
    </div>
  )
}
