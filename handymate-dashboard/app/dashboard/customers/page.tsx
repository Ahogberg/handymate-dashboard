import { Users, Plus, Search } from 'lucide-react'

const customers = [
  { id: 1, name: 'Anna Svensson', phone: '+46701234567', email: 'anna@example.com', address: 'Storgatan 1, Stockholm', bookings: 3, lastContact: '2026-01-29' },
  { id: 2, name: 'Erik Johansson', phone: '+46702345678', email: 'erik@example.com', address: 'Kungsgatan 45, Stockholm', bookings: 1, lastContact: '2026-01-29' },
  { id: 3, name: 'Maria Lindberg', phone: '+46703456789', email: 'maria@example.com', address: 'Drottninggatan 12, Stockholm', bookings: 5, lastContact: '2026-01-28' },
  { id: 4, name: 'Johan Andersson', phone: '+46704567890', email: 'johan@example.com', address: 'Sveavägen 89, Stockholm', bookings: 2, lastContact: '2026-01-27' },
  { id: 5, name: 'Lisa Karlsson', phone: '+46705678901', email: 'lisa@example.com', address: 'Birger Jarlsgatan 22, Stockholm', bookings: 1, lastContact: '2026-01-29' },
]

export default function CustomersPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kunder</h1>
          <p className="text-gray-600">Hantera kundregister</p>
        </div>
        <div className="flex space-x-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Sök kund..."
              className="pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button className="flex items-center px-4 py-2 text-white bg-primary-600 rounded-lg hover:bg-primary-700">
            <Plus className="w-4 h-4 mr-2" />
            Ny kund
          </button>
        </div>
      </div>

      {/* Customers grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {customers.map((customer) => (
          <div key={customer.id} className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-primary-600 font-medium text-lg">
                    {customer.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <div className="ml-4">
                  <h3 className="font-medium text-gray-900">{customer.name}</h3>
                  <p className="text-sm text-gray-500">{customer.phone}</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-2 text-sm">
              <p className="text-gray-600">
                <span className="text-gray-400">Email:</span> {customer.email}
              </p>
              <p className="text-gray-600">
                <span className="text-gray-400">Adress:</span> {customer.address}
              </p>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm">
                <span className="text-gray-500">{customer.bookings} bokningar</span>
              </div>
              <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                Visa detaljer →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
