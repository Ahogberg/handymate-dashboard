import { Calendar, Plus, Filter } from 'lucide-react'

const bookings = [
  { id: 1, customer: 'Anna Svensson', phone: '+46701234567', service: 'Elinstallation', date: '2026-01-30', time: '09:00', address: 'Storgatan 1, Stockholm', status: 'confirmed', priority: 'normal' },
  { id: 2, customer: 'Erik Johansson', phone: '+46702345678', service: 'Felsökning - Strömavbrott', date: '2026-01-30', time: '11:00', address: 'Kungsgatan 45, Stockholm', status: 'pending', priority: 'urgent' },
  { id: 3, customer: 'Maria Lindberg', phone: '+46703456789', service: 'Säkringsbyte', date: '2026-01-30', time: '14:00', address: 'Drottninggatan 12, Stockholm', status: 'confirmed', priority: 'normal' },
  { id: 4, customer: 'Johan Andersson', phone: '+46704567890', service: 'Elbilsladdare installation', date: '2026-01-30', time: '16:00', address: 'Sveavägen 89, Stockholm', status: 'confirmed', priority: 'normal' },
  { id: 5, customer: 'Lisa Karlsson', phone: '+46705678901', service: 'Elcentral uppgradering', date: '2026-01-31', time: '09:00', address: 'Birger Jarlsgatan 22, Stockholm', status: 'pending', priority: 'normal' },
]

export default function BookingsPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bokningar</h1>
          <p className="text-gray-600">Hantera alla bokningar</p>
        </div>
        <div className="flex space-x-4">
          <button className="flex items-center px-4 py-2 text-gray-700 bg-white border rounded-lg hover:bg-gray-50">
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </button>
          <button className="flex items-center px-4 py-2 text-white bg-primary-600 rounded-lg hover:bg-primary-700">
            <Plus className="w-4 h-4 mr-2" />
            Ny bokning
          </button>
        </div>
      </div>

      {/* Bookings table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kund</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tjänst</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Datum & Tid</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adress</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Åtgärd</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {bookings.map((booking) => (
              <tr key={booking.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="font-medium text-gray-900">{booking.customer}</div>
                    <div className="text-sm text-gray-500">{booking.phone}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    {booking.priority === 'urgent' && (
                      <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                    )}
                    <span className="text-gray-900">{booking.service}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-gray-900">{booking.date}</div>
                  <div className="text-sm text-gray-500">{booking.time}</div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-gray-600 text-sm">{booking.address}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                    booking.status === 'confirmed' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {booking.status === 'confirmed' ? 'Bekräftad' : 'Väntar'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button className="text-primary-600 hover:text-primary-900 mr-4">Visa</button>
                  <button className="text-gray-600 hover:text-gray-900">Redigera</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
