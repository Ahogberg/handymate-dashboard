'use client'

import { useCurrentUser } from '@/lib/CurrentUserContext'
import { ReactNode } from 'react'

type Permission =
  | 'see_all_projects'
  | 'see_financials'
  | 'manage_users'
  | 'approve_time'
  | 'create_invoices'
  | 'manage_settings'

interface PermissionGateProps {
  permission: Permission
  children: ReactNode
  fallback?: ReactNode
}

/**
 * PermissionGate - Döljer eller blockerar innehåll baserat på användarens behörigheter.
 * Visar fallback (standard: "Åtkomst nekad"-meddelande) om användaren saknar behörighet.
 */
export function PermissionGate({ permission, children, fallback }: PermissionGateProps) {
  const { can, loading, user } = useCurrentUser()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin h-8 w-8 border-4 border-teal-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!user || !can(permission)) {
    if (fallback) return <>{fallback}</>

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Åtkomst nekad
        </h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-md">
          Du har inte behörighet att se den här sidan.
          Kontakta din administratör om du behöver åtkomst.
        </p>
      </div>
    )
  }

  return <>{children}</>
}

/**
 * RequireRole - Döljer innehåll om användaren inte har rätt roll.
 */
export function RequireRole({ roles, children, fallback }: {
  roles: ('owner' | 'admin' | 'project_manager' | 'employee')[]
  children: ReactNode
  fallback?: ReactNode
}) {
  const { user, loading } = useCurrentUser()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin h-8 w-8 border-4 border-teal-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!user || !roles.includes(user.role)) {
    if (fallback) return <>{fallback}</>

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Åtkomst nekad
        </h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-md">
          Du har inte behörighet att se den här sidan.
          Kontakta din administratör om du behöver åtkomst.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
