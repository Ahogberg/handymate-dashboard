'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  HelpCircle,
  Search,
  ChevronDown,
  Mail,
  Clock,
  FileText,
  Phone,
  Users,
  CreditCard,
  Download,
  Calendar,
  Zap,
  ArrowRight,
  MessageSquare
} from 'lucide-react'

interface FAQItem {
  question: string
  answer: string
  icon: React.ReactNode
}

const faqItems: FAQItem[] = [
  {
    question: 'Hur skapar jag en offert?',
    answer:
      'Gå till Jobb > Offerter och klicka på "Ny offert". Du kan välja en befintlig kund eller skapa en ny. Lägg till arbetsrader och material, ange ROT/RUT om det gäller, och klicka "Skapa offert". Du kan också låta AI-assistenten generera en offert automatiskt baserat på ett samtal eller en beskrivning av jobbet.',
    icon: <FileText className="w-5 h-5" />,
  },
  {
    question: 'Hur kopplar jag mitt telefonnummer?',
    answer:
      'Under Inställningar > Telefon kan du koppla ditt företagsnummer. Handymate tilldelar dig ett dedikerat nummer via 46elks. Inkommande samtal vidarekopplas till ditt mobilnummer, och samtalen spelas in (med kundens samtycke) för AI-analys. Du kan även ställa in öppettider och hälsningsmeddelanden.',
    icon: <Phone className="w-5 h-5" />,
  },
  {
    question: 'Vad är ROT/RUT-avdrag?',
    answer:
      'ROT-avdrag gäller reparation, ombyggnad och tillbyggnad av bostäder. RUT-avdrag gäller hushållsnära tjänster som städning och trädgårdsarbete. Avdraget är 30% för ROT och 50% för RUT (max 75 000 kr per person och år). Handymate beräknar automatiskt avdraget på offerter och fakturor, så kunden ser sitt pris efter avdrag.',
    icon: <CreditCard className="w-5 h-5" />,
  },
  {
    question: 'Hur skickar jag en faktura?',
    answer:
      'Gå till Jobb > Fakturor och klicka "Ny faktura", eller konvertera en godkänd offert till faktura direkt. Fyll i raderna, ange förfallodatum och klicka "Skicka". Fakturan skickas som PDF via e-post och/eller SMS till kunden. Du kan följa betalningsstatus och skicka påminnelser automatiskt.',
    icon: <FileText className="w-5 h-5" />,
  },
  {
    question: 'Hur fungerar AI-assistenten?',
    answer:
      'AI-assistenten analyserar dina inspelade samtal och skapar automatiska förslag: boka jobb, skicka offert, följa upp kund, med mera. Du hittar förslagen i Samtal-fliken. Godkänn eller avvisa med ett klick. Du kan även använda röstkommando under Samtal för att ge instruktioner direkt till AI:n.',
    icon: <Zap className="w-5 h-5" />,
  },
  {
    question: 'Hur importerar jag kunder?',
    answer:
      'Gå till Kunder och klicka på importknappen. Du kan ladda upp en CSV-fil med kolumnerna namn, telefon, e-post och adress. Systemet matchar automatiskt kolumner och visar en förhandsgranskning innan import. Du kan även lägga till kunder manuellt en i taget.',
    icon: <Users className="w-5 h-5" />,
  },
  {
    question: 'Hur byter jag plan?',
    answer:
      'Gå till Inställningar > Prenumeration. Där ser du din nuvarande plan och kan uppgradera eller nedgradera. Ändringen träder i kraft vid nästa faktureringsperiod. Vid uppgradering får du tillgång till fler samtal, SMS och funktioner direkt.',
    icon: <CreditCard className="w-5 h-5" />,
  },
  {
    question: 'Hur exporterar jag min data?',
    answer:
      'Under Inställningar > Data kan du exportera kunder, bokningar, offerter och fakturor som CSV-filer. Du äger alltid din data och kan ladda ner allt när som helst. Exporter inkluderar all historik och kan användas för bokföring eller övergång till annat system.',
    icon: <Download className="w-5 h-5" />,
  },
]

const quickLinks = [
  {
    title: 'Skapa offert',
    description: 'Generera en ny offert med AI-hjälp',
    href: '/dashboard/quotes/new',
    icon: <FileText className="w-6 h-6" />,
    color: 'from-teal-600 to-teal-500',
  },
  {
    title: 'Kunder',
    description: 'Hantera din kunddatabas',
    href: '/dashboard/customers',
    icon: <Users className="w-6 h-6" />,
    color: 'from-emerald-500 to-teal-500',
  },
  {
    title: 'Schema',
    description: 'Se och hantera dina bokningar',
    href: '/dashboard/schedule',
    icon: <Calendar className="w-6 h-6" />,
    color: 'from-teal-500 to-teal-600',
  },
  {
    title: 'Samtal',
    description: 'AI-inbox och samtalshistorik',
    href: '/dashboard/calls',
    icon: <Phone className="w-6 h-6" />,
    color: 'from-amber-500 to-orange-500',
  },
  {
    title: 'Fakturor',
    description: 'Skapa och skicka fakturor',
    href: '/dashboard/invoices',
    icon: <CreditCard className="w-6 h-6" />,
    color: 'from-rose-500 to-pink-500',
  },
  {
    title: 'Inställningar',
    description: 'Konfigurera ditt konto',
    href: '/dashboard/settings',
    icon: <Zap className="w-6 h-6" />,
    color: 'from-slate-500 to-gray-500',
  },
]

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const filteredFAQ = faqItems.filter(
    (item) =>
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  )

  function toggleFAQ(index: number) {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-600 shadow-lg shadow-teal-500/25 mb-4">
            <HelpCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">
            Hjälpcenter
          </h1>
          <p className="text-slate-500 text-lg">
            Hitta svar på vanliga frågor eller kontakta oss
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-10">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Sök bland vanliga frågor..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setOpenIndex(null)
            }}
            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 shadow-sm transition-all text-base"
          />
        </div>

        {/* FAQ Accordion */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-teal-600" />
            Vanliga frågor
          </h2>
          <div className="space-y-3">
            {filteredFAQ.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
                <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">
                  Inga frågor matchade din sökning.
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-3 text-teal-600 hover:text-sky-700 text-sm font-medium transition-colors"
                >
                  Rensa sökning
                </button>
              </div>
            ) : (
              filteredFAQ.map((item, index) => {
                const isOpen = openIndex === index
                return (
                  <div
                    key={index}
                    className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all"
                  >
                    <button
                      onClick={() => toggleFAQ(index)}
                      className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-teal-50 to-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
                        {item.icon}
                      </div>
                      <span className="flex-1 text-sm sm:text-base font-medium text-slate-900">
                        {item.question}
                      </span>
                      <ChevronDown
                        className={`w-5 h-5 text-slate-400 transition-transform duration-200 flex-shrink-0 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    <div
                      className={`transition-all duration-200 ease-in-out overflow-hidden ${
                        isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <div className="px-5 pb-5 pl-[4.5rem]">
                        <p className="text-slate-600 text-sm leading-relaxed">
                          {item.answer}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {/* Quick Links */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-teal-600" />
            Snabblänkar
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-teal-200 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${link.color} flex items-center justify-center text-white shadow-lg shadow-slate-200`}
                  >
                    {link.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 text-sm mb-0.5 flex items-center gap-1">
                      {link.title}
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </h3>
                    <p className="text-slate-500 text-xs">{link.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Contact Support */}
        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5 text-teal-600" />
            Kontakta support
          </h2>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-teal-600 flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
                <Mail className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  Behöver du mer hjälp?
                </h3>
                <p className="text-slate-500 text-sm mb-4">
                  Vårt supportteam hjälper dig gärna med frågor om plattformen.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-teal-600" />
                    <a
                      href="mailto:support@handymate.se"
                      className="text-sky-700 hover:text-teal-700 font-medium text-sm transition-colors"
                    >
                      support@handymate.se
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-500 text-sm">
                      Svarstid: Inom 24 timmar
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
