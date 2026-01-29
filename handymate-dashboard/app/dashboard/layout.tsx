import Sidebar from '@/components/Sidebar'
import AICopilot from '@/components/AICopilot'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <AICopilot />
    </div>
  )
}
