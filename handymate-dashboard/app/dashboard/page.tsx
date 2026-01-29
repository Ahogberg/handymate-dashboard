import { 
  Calendar, 
  Users, 
  Phone, 
  AlertTriangle,
  TrendingUp,
  Clock
} from 'lucide-react'

// Demo-data
const stats = [
  { name: 'Bokningar idag', value: '8', icon: Calendar, color: 'bg-blue-500' },
  { name: 'Aktiva kunder', value: '124', icon: Users, color: 'bg-green-500' },
  { name: 'Samtal idag', value: '12', icon: Phone, color: 'bg-purple-500' },
  { name: 'Akuta ärenden', value: '2', icon: AlertTriangle, color: 'bg-red-500' },
]

const recentBookings = [
  { id: 1, customer: 'Anna Svensson', service: 'Elinstallation', time: '09:00', status: 'confirmed' },
  { id: 2, customer: 'Erik Johansson', service: 'Felsökning', time: '11:00', status: 'pending' },
  { id: 3, customer: 'Maria Lindberg', service: 'Säkringsbyte', time: '14:00', status: 'confirmed' },
  { id: 4, customer: 'Johan Andersson', service: 'Elbilsladdare', time: '16:00', status: 'confirmed' },
]

const aiInsights = [
  { 
    type: 'warning', 
    title: 'Akut ärende väntar', 
    description: 'Kund med strömavbrott har väntat 2 timmar på återkoppling.' 
  },
  { 
    type: 'suggestion', 
    title: 'Optimera rutten', 
    description: 'Byt ordning på bokning 2 och 3 för att spara 30 min restid.' 
  },
  { 
    type: 'info', 
    title: 'Veckosammanfattning', 
    description: '23% fler bokningar än förra veckan. Bra jobbat!' 
  },
]

export default function DashboardPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">God morgon! 👋</h1>
        <p className="text-gray-600">Här är en översikt av dagen.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white rounded-xl shadow-sm p-6 border">
            <div className="flex items-center">
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Bookings */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Dagens bokningar</h2>
          </div>
          <div className="divide-y">
            {recentBookings.map((booking) => (
              <div key={booking.id} className="p-4 hover:bg-gray-50 transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                      <Clock className="w-5 h-5 text-primary-600" />
                    </div>
                    <div className="ml-4">
                      <p className="font-medium text-gray-900">{booking.customer}</p>
                      <p className="text-sm text-gray-500">{booking.service}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">{booking.time}</p>
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                      booking.status === 'confirmed' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {booking.status === 'confirmed' ? 'Bekräftad' : 'Väntar'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Insights */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-6 border-b">
            <div className="flex items-center">
              <TrendingUp className="w-5 h-5 text-primary-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">AI Insikter</h2>
            </div>
          </div>
          <div className="p-4 space-y-4">
            {aiInsights.map((insight, i) => (
              <div 
                key={i} 
                className={`p-4 rounded-lg ${
                  insight.type === 'warning' ? 'bg-red-50 border-l-4 border-red-500' :
                  insight.type === 'suggestion' ? 'bg-blue-50 border-l-4 border-blue-500' :
                  'bg-gray-50 border-l-4 border-gray-300'
                }`}
              >
                <p className="font-medium text-gray-900">{insight.title}</p>
                <p className="text-sm text-gray-600 mt-1">{insight.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
