'use client'

import Sidebar from '@/components/Sidebar'
import AICopilot from '@/components/AICopilot'
import { useAuth } from '@/lib/useAuth'

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
    return null // Redirectas till login av useAuth
  }

  return (
    <div className="flex min-h-screen bg-[#09090b]">
      <Sidebar businessName={business.business_name} onLogout={logout} />
      <main className="flex-1 ml-64">
        {children}
      </main>
      <AICopilot />
    </div>
  )
}
