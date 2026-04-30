'use client'

export function CustomersHeader() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Kunder</h1>
        <p className="text-sm sm:text-base text-gray-500">CRM och kundkommunikation</p>
      </div>
    </div>
  )
}
