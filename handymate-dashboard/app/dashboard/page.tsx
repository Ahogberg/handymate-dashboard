import { 
  Calendar, 
  Users, 
  Phone, 
  AlertTriangle,
  TrendingUp,
  Clock,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'

// Demo-data
const stats = [
  { name: 'Bokningar idag', value: '8', change: '+12%', trend: 'up', icon: Calendar, color: 'from-violet-500 to-fuchsia-500' },
  { name: 'Aktiva kunder', value: '124', change: '+5%', trend: 'up', icon: Users, color: 'from-cyan-500 to-blue-500' },
  { name: 'Samtal idag', value: '12', change: '+18%', trend: 'up', icon: Phone, color: 'from-emerald-500 to-green-500' },
  { name: 'Akuta ärenden', value: '2', change: '-1', trend: 'down', icon: AlertTriangle, color: 'from-orange-500 to-red-500' },
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
    <div className="p-8 bg-[#09090b] min-h-screen">
      {/* Background gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">God morgon! 👋</h1>
          <p className="text-zinc-400">Här är en översikt av dagen.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => (
            <div key={stat.name} className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl p-6 border border-zinc-800 hover:border-zinc-700 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.color}`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
                <div className={`flex items-center text-sm ${stat.trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stat.trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {stat.change}
                </div>
              </div>
              <p className="text-3xl font-bold text-white mb-1">{stat.value}</p>
              <p className="text-sm text-zinc-500">{stat.name}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Bookings */}
          <div className="lg:col-span-2 bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white">Dagens bokningar</h2>
            </div>
            <div className="divide-y divide-zinc-800">
              {recentBookings.map((booking) => (
                <div key={booking.id} className="p-4 hover:bg-zinc-800/30 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-xl flex items-center justify-center border border-violet-500/30">
                        <Clock className="w-5 h-5 text-violet-400" />
                      </div>
                      <div className="ml-4">
                        <p className="font-medium text-white">{booking.customer}</p>
                        <p className="text-sm text-zinc-500">{booking.service}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-white">{booking.time}</p>
                      <span className={`inline-flex px-2.5 py-1 text-xs rounded-full ${
                        booking.status === 'confirmed' 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
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
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800">
            <div className="p-6 border-b border-zinc-800">
              <div className="flex items-center">
                <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 mr-3">
                  <TrendingUp className="w-4 h-4 text-violet-400" />
                </div>
                <h2 className="text-lg font-semibold text-white">AI Insikter</h2>
              </div>
            </div>
            <div className="p-4 space-y-4">
              {aiInsights.map((insight, i) => (
                <div 
                  key={i} 
                  className={`p-4 rounded-xl border ${
                    insight.type === 'warning' ? 'bg-red-500/10 border-red-500/30' :
                    insight.type === 'suggestion' ? 'bg-violet-500/10 border-violet-500/30' :
                    'bg-zinc-800/50 border-zinc-700'
                  }`}
                >
                  <p className="font-medium text-white text-sm">{insight.title}</p>
                  <p className="text-xs text-zinc-400 mt-1">{insight.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
