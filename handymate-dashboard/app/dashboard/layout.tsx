'use client'

import Sidebar from '@/components/Sidebar'
import AICopilot from '@/components/AICopilot'
import { useAuth } from '@/lib/useAuth'
import { BusinessContext } from '@/lib/BusinessContext'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { business, loading, logout } = useAuth(true)

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-zinc-400">Laddar...</div>
      </div>
    )
  }

  if (!business) {
    return null
  }

  return (
    <BusinessContext.Provider value={business}>
      <div className="flex min-h-screen bg-[#09090b]">
        <Sidebar businessName={business.business_name} businessId={business.business_id} onLogout={logout} />
        <main className="flex-1 md:ml-64">
          {children}
        </main>
        <AICopilot />
      </div>
    </BusinessContext.Provider>
  )
}
