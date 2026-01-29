import { 
  Sparkles, 
  AlertTriangle, 
  Lightbulb, 
  Info, 
  CheckCircle,
  Clock,
  ArrowRight
} from 'lucide-react'

const aiItems = [
  { 
    id: 1,
    type: 'urgent',
    title: 'Akut: Kund väntar på återkoppling',
    description: 'Erik Johansson ringde för 2 timmar sedan angående strömavbrott. Ärendet är markerat som akut men ingen har återkopplat.',
    suggestion: 'Ring kunden nu eller tilldela ärendet till en tillgänglig tekniker.',
    time: '2 timmar sedan',
    actions: ['Ring kund', 'Tilldela tekniker']
  },
  { 
    id: 2,
    type: 'optimization',
    title: 'Ruttoptimering möjlig',
    description: 'Bokningarna kl 11:00 och 14:00 idag kan byta plats för att spara 30 minuters restid.',
    suggestion: 'Vill du att jag byter ordning på bokningarna?',
    time: '30 min sedan',
    actions: ['Byt ordning', 'Ignorera']
  },
  { 
    id: 3,
    type: 'followup',
    title: 'Uppföljning: Offert utan svar',
    description: 'Maria Lindberg fick en offert för elcentral-uppgradering för 5 dagar sedan men har inte svarat.',
    suggestion: 'Skicka en påminnelse via SMS eller ring för att följa upp.',
    time: '1 timme sedan',
    actions: ['Skicka SMS', 'Ring kund']
  },
  { 
    id: 4,
    type: 'insight',
    title: 'Veckoanalys: Fler akuta ärenden',
    description: '40% fler akuta ärenden denna vecka jämfört med förra. De flesta gäller strömavbrott i Södermalm.',
    suggestion: 'Överväg att ha en tekniker standby för akuta ärenden i området.',
    time: '3 timmar sedan',
    actions: ['Visa detaljer']
  },
  { 
    id: 5,
    type: 'completed',
    title: 'Automatisk bekräftelse skickad',
    description: 'SMS-bekräftelse skickades automatiskt till Johan Andersson för morgondagens bokning kl 16:00.',
    suggestion: null,
    time: '4 timmar sedan',
    actions: []
  },
]

const typeConfig = {
  urgent: { icon: AlertTriangle, color: 'bg-red-100 text-red-600 border-red-200', badge: 'bg-red-500' },
  optimization: { icon: Lightbulb, color: 'bg-blue-100 text-blue-600 border-blue-200', badge: 'bg-blue-500' },
  followup: { icon: Clock, color: 'bg-yellow-100 text-yellow-600 border-yellow-200', badge: 'bg-yellow-500' },
  insight: { icon: Info, color: 'bg-purple-100 text-purple-600 border-purple-200', badge: 'bg-purple-500' },
  completed: { icon: CheckCircle, color: 'bg-green-100 text-green-600 border-green-200', badge: 'bg-green-500' },
}

export default function AIInboxPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <Sparkles className="w-8 h-8 text-primary-600 mr-3" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Inbox</h1>
            <p className="text-gray-600">Intelligenta förslag och varningar</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">5 nya idag</span>
          <button className="px-4 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg">
            Markera alla som lästa
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex space-x-2 mb-6">
        {['Alla', 'Akuta', 'Förslag', 'Uppföljning', 'Insikter'].map((tab, i) => (
          <button 
            key={tab}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              i === 0 ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* AI Items */}
      <div className="space-y-4">
        {aiItems.map((item) => {
          const config = typeConfig[item.type as keyof typeof typeConfig]
          const Icon = config.icon
          
          return (
            <div key={item.id} className={`bg-white rounded-xl border p-6 hover:shadow-md transition ${item.type === 'urgent' ? 'border-l-4 border-l-red-500' : ''}`}>
              <div className="flex items-start">
                <div className={`p-3 rounded-lg ${config.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                
                <div className="ml-4 flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">{item.title}</h3>
                    <span className="text-sm text-gray-400">{item.time}</span>
                  </div>
                  
                  <p className="text-gray-600 mt-1">{item.description}</p>
                  
                  {item.suggestion && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">AI föreslår:</span> {item.suggestion}
                      </p>
                    </div>
                  )}
                  
                  {item.actions.length > 0 && (
                    <div className="flex items-center space-x-3 mt-4">
                      {item.actions.map((action, i) => (
                        <button
                          key={action}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                            i === 0 
                              ? 'bg-primary-600 text-white hover:bg-primary-700' 
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
