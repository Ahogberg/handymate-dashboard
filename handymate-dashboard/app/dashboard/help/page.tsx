'use client'

/**
 * Hjälpcenter — supportsidan i appen.
 *
 * Innehållsregler (samma ärlighetslinje som allt kundriktat material,
 * se tasks/capability-inventory.md):
 * - Ingen talande röst-AI: teamet FÅNGAR samtal, "svarar" aldrig i telefon.
 * - Inget "skickas automatiskt" i nutid — allt går via godkännande-kön.
 * - ROT/RUT/grön teknik-siffrorna kommer från lib/rot-rut-limits.ts —
 *   ändras reglerna där ska texten här ändras samtidigt.
 * - Fortnox nämns medvetet INTE (publika linjen är "på väg").
 * - Support-mailen är andreas@handymate.se — byt INTE till en adress
 *   utan bemannad inkorg.
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  HelpCircle,
  Search,
  ChevronDown,
  Mail,
  FileText,
  Phone,
  Users,
  CreditCard,
  Download,
  Calendar,
  Zap,
  ArrowRight,
  MessageSquare,
  CheckSquare,
  Leaf,
  RefreshCw,
  ShieldCheck,
  Bot,
} from 'lucide-react'

interface FAQItem {
  category: string
  question: string
  answer: string
  icon: React.ReactNode
}

const CATEGORY_ORDER = [
  'Komma igång & teamet',
  'Samtal & kunder',
  'Offerter & ROT',
  'Fakturor & pengar',
  'Serviceavtal & återkommande kunder',
  'Konto, betalning & din data',
]

const faqItems: FAQItem[] = [
  // ── Komma igång & teamet ──────────────────────────────────────────
  {
    category: 'Komma igång & teamet',
    question: 'Vad gör mitt AI-team egentligen?',
    answer:
      'Du har sex medhjälpare med var sitt ansvar: Lisa fångar samtalen du missar, Daniel följer upp offerter som blivit liggande, Karin förbereder fakturor och påminnelser, Lars håller koll på projekt och bokningar, Hanna hör av sig till gamla kunder, och Matte är assistenten du pratar med. Det de förbereder hamnar som förslag i din kö på Idag-vyn — inget går ut till en kund utan att du godkänt det.',
    icon: <Bot className="w-5 h-5" />,
  },
  {
    category: 'Komma igång & teamet',
    question: 'Varför måste jag godkänna allt teamet gör?',
    answer:
      'Det är en medveten konstruktion: teamet föreslår, du bestämmer. Varje förslag i kön kan du godkänna med ett tryck, ändra först, eller avvisa. Ju fler gånger du godkänner samma sorts ärende, desto närmare kommer teamet att få sköta det självständigt — men det är alltid du som sätter takten, och du kan alltid ta tillbaka ratten.',
    icon: <CheckSquare className="w-5 h-5" />,
  },
  {
    category: 'Komma igång & teamet',
    question: 'Hur pratar jag med Matte?',
    answer:
      'Öppna chatten med Matte i appen och skriv som du skulle skriva till en anställd — "boka in Svensson på torsdag", "hur ligger vi till med offerten till Karlsson?", "påminn mig om besiktningen". Matte kan svara på frågor om ditt företag och förbereda åtgärder, som vanligt via din kö när något ska ut till en kund.',
    icon: <MessageSquare className="w-5 h-5" />,
  },

  // ── Samtal & kunder ───────────────────────────────────────────────
  {
    category: 'Samtal & kunder',
    question: 'Vad händer när jag missar ett samtal?',
    answer:
      'Samtalet fångas av Lisa: kunden får ett SMS om att du hört av dig, och ett ärende dyker upp i din kö så att inget faller mellan stolarna. Du ser hela samtalshistoriken under Samtal. Ingen robot pratar med dina kunder i telefon — Lisa fångar, du ringer tillbaka.',
    icon: <Phone className="w-5 h-5" />,
  },
  {
    category: 'Samtal & kunder',
    question: 'Hur kopplar jag mitt telefonnummer?',
    answer:
      'Under Inställningar → Telefon kopplar du ditt företagsnummer. Inkommande samtal vidarekopplas till din mobil, och missade samtal fångas upp av teamet. Där ställer du också in vart samtalen ska kopplas.',
    icon: <Phone className="w-5 h-5" />,
  },
  {
    category: 'Samtal & kunder',
    question: 'Hur lägger jag in mina kunder?',
    answer:
      'Gå till Kunder och klicka på importknappen — du kan ladda upp en fil från Excel (CSV) med namn, telefon, e-post och adress, och systemet visar en förhandsgranskning innan något sparas. Du kan förstås också lägga till kunder en i taget, och när du skapar en ny kund kan du samtidigt skapa en deal så att inget tappas bort.',
    icon: <Users className="w-5 h-5" />,
  },

  // ── Offerter & ROT ────────────────────────────────────────────────
  {
    category: 'Offerter & ROT',
    question: 'Hur skapar jag en offert?',
    answer:
      'Gå till Jobb → Offerter och klicka "Ny offert" — eller skapa den direkt från kundkortet, så är kunduppgifterna redan ifyllda. Välj en av dina mallar eller börja tomt, lägg till rader och skicka. Kunden öppnar offerten på sin mobil, kan kryssa i tillval och signera direkt.',
    icon: <FileText className="w-5 h-5" />,
  },
  {
    category: 'Offerter & ROT',
    question: 'Hur räknas ROT- och RUT-avdraget?',
    answer:
      'ROT är 30 % av arbetskostnaden inklusive moms (max 50 000 kr per person och år), RUT är 50 % (max 75 000 kr) — och det gemensamma taket är 75 000 kr per person och år. Handymate räknar ut avdraget på arbetsandelen rad för rad enligt Skatteverkets regler, så materialet aldrig räknas med av misstag, och kunden ser sitt pris efter avdrag direkt i offerten.',
    icon: <CreditCard className="w-5 h-5" />,
  },
  {
    category: 'Offerter & ROT',
    question: 'Vad gäller för grön teknik-avdrag?',
    answer:
      'Grön teknik är ett eget avdrag, skilt från ROT och RUT: 15 % för solceller och 50 % för batteri och laddbox, med ett tak på 50 000 kr per person och år. Handymate håller isär grön teknik och ROT åt dig — till exempel räknas service av en befintlig värmepump som ROT, inte grön teknik.',
    icon: <Leaf className="w-5 h-5" />,
  },
  {
    category: 'Offerter & ROT',
    question: 'Jag ändrade mina priser — varför ändras inte gamla offerter?',
    answer:
      'Det är meningen. Varje offert fryses när den skapas, som ett kvitto: det kunden fick är det som gäller, oavsett vad du ändrar i prislistan efteråt. Nya offerter använder alltid dina aktuella priser.',
    icon: <FileText className="w-5 h-5" />,
  },

  // ── Fakturor & pengar ─────────────────────────────────────────────
  {
    category: 'Fakturor & pengar',
    question: 'Hur skickar jag en faktura?',
    answer:
      'Enklast: konvertera en godkänd offert till faktura med ett klick — allt följer med. Du kan också skapa en ny faktura under Jobb → Fakturor. Kunden får en länk där fakturan går att betala med Swish direkt från mobilen.',
    icon: <CreditCard className="w-5 h-5" />,
  },
  {
    category: 'Fakturor & pengar',
    question: 'Vad händer när en kund inte betalar i tid?',
    answer:
      'Karin håller koll på förfallodatum och förbereder en vänlig påminnelse som hamnar i din kö — du godkänner med ett tryck, så slipper du det obekväma samtalet. När du litar på teamet kan du låta påminnelserna gå ut på egen hand, i din takt.',
    icon: <RefreshCw className="w-5 h-5" />,
  },
  {
    category: 'Fakturor & pengar',
    question: 'Kan kunden betala med Swish?',
    answer:
      'Ja — fakturan kunden får innehåller en Swish-kod att skanna. När kunden betalat kan hen trycka "Jag har betalat", och du får en bekräftelse i din kö att stämma av mot kontot.',
    icon: <CreditCard className="w-5 h-5" />,
  },

  // ── Serviceavtal & återkommande kunder ────────────────────────────
  {
    category: 'Serviceavtal & återkommande kunder',
    question: 'Vad är "Väck kundbasen"?',
    answer:
      'Hanna går igenom ditt kundregister, matchar gamla jobb mot serviceavtal som passar — värmepumpsservice, takgenomgång, våtrumskontroll och liknande — och lägger färdiga, personliga erbjudanden i din kö. Du godkänner de du vill skicka. Ditt kundregister är en guldgruva; det här är sättet att gräva i den utan att själv sitta en kväll med telefonlistan.',
    icon: <Users className="w-5 h-5" />,
  },
  {
    category: 'Serviceavtal & återkommande kunder',
    question: 'Hur fungerar serviceavtal?',
    answer:
      'Ett serviceavtal på kundkortet betyder återkommande besök — till exempel årlig service. Lars föreslår besökstider i veckor där du har luckor i schemat, och efter varje utfört besök förbereder Karin fakturan åt dig. Allt via din kö, som vanligt.',
    icon: <Calendar className="w-5 h-5" />,
  },

  // ── Konto, betalning & din data ───────────────────────────────────
  {
    category: 'Konto, betalning & din data',
    question: 'Hur byter jag abonnemang?',
    answer:
      'Gå till Inställningar → Fakturering. Där ser du din nuvarande plan och kan byta — ändringen gäller från nästa betalningsperiod. Det finns ingen bindningstid, och funkar inte Handymate för dig får du pengarna tillbaka.',
    icon: <CreditCard className="w-5 h-5" />,
  },
  {
    category: 'Konto, betalning & din data',
    question: 'Min betalning gick inte igenom — vad gör jag?',
    answer:
      'Du får ett mail från oss om det händer, och kontot pausas tills betalningen är löst. Oftast beror det på ett utgånget kort eller en tillfällig spärr — gå till Inställningar → Fakturering och uppdatera kortet, så är allt igång igen direkt.',
    icon: <CreditCard className="w-5 h-5" />,
  },
  {
    category: 'Konto, betalning & din data',
    question: 'Hur får jag ut min data?',
    answer:
      'Du äger din data och kan ladda ner den när du vill: gå till Inställningar → Företagsinformation och klicka "Exportera min data". Du får en fil med kunder, offerter, fakturor, bokningar, tidrapporter och projekt. Personnummer är maskerade som standard i exporten.',
    icon: <Download className="w-5 h-5" />,
  },
  {
    category: 'Konto, betalning & din data',
    question: 'Hur får jag Handymate som app i mobilen?',
    answer:
      'Öppna app.handymate.se i mobilens webbläsare och välj "Lägg till på hemskärmen" (på iPhone: dela-knappen → Lägg till på hemskärmen). Då får du Handymate som en app-ikon och kan slå på notiser, så att du ser direkt när något väntar på ditt OK. På iPhone måste appen ligga på hemskärmen för att notiserna ska fungera.',
    icon: <ShieldCheck className="w-5 h-5" />,
  },
]

const quickLinks = [
  {
    title: 'Skapa offert',
    description: 'Ny offert från mall eller tom',
    href: '/dashboard/quotes/new',
    icon: <FileText className="w-6 h-6" />,
    color: 'from-primary-700 to-primary-600',
  },
  {
    title: 'Kunder',
    description: 'Hantera din kunddatabas',
    href: '/dashboard/customers',
    icon: <Users className="w-6 h-6" />,
    color: 'from-emerald-500 to-primary-600',
  },
  {
    title: 'Schema',
    description: 'Se och hantera dina bokningar',
    href: '/dashboard/schedule',
    icon: <Calendar className="w-6 h-6" />,
    color: 'from-primary-600 to-primary-700',
  },
  {
    title: 'Samtal',
    description: 'Samtalshistorik och ärenden',
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
  const [openKey, setOpenKey] = useState<string | null>(null)

  const filteredFAQ = faqItems.filter(
    (item) =>
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const visibleCategories = CATEGORY_ORDER.filter((cat) =>
    filteredFAQ.some((item) => item.category === cat)
  )

  function toggleFAQ(key: string) {
    setOpenKey(openKey === key ? null : key)
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary-700 shadow-sm mb-4">
            <HelpCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">
            Hjälpcenter
          </h1>
          <p className="text-slate-500 text-lg">
            Hitta svar på vanliga frågor eller hör av dig till oss
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
              setOpenKey(null)
            }}
            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0F766E] focus:border-primary-600 transition-all text-base"
          />
        </div>

        {/* FAQ grupperat per kategori */}
        <section className="mb-12">
          {filteredFAQ.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
              <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">
                Inga frågor matchade din sökning. Hittar du inte svaret? Hör av
                dig till oss längst ner på sidan.
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-3 text-primary-700 hover:text-primary-800 text-sm font-medium transition-colors"
              >
                Rensa sökning
              </button>
            </div>
          ) : (
            visibleCategories.map((cat) => (
              <div key={cat} className="mb-8">
                <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary-700" />
                  {cat}
                </h2>
                <div className="space-y-3">
                  {filteredFAQ
                    .filter((item) => item.category === cat)
                    .map((item) => {
                      const key = item.question
                      const isOpen = openKey === key
                      return (
                        <div
                          key={key}
                          className="bg-white border border-slate-200 rounded-xl overflow-hidden transition-all"
                        >
                          <button
                            onClick={() => toggleFAQ(key)}
                            className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[#F8FAFC] transition-colors"
                          >
                            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-50 to-primary-50 border border-primary-100 flex items-center justify-center text-primary-700">
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
                    })}
                </div>
              </div>
            ))
          )}
        </section>

        {/* Quick Links */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary-700" />
            Snabblänkar
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-primary-300 transition-all"
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

        {/* Kontakt */}
        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary-700" />
            Hör av dig
          </h2>
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-primary-700 flex items-center justify-center text-white shadow-sm">
                <Mail className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  Hittade du inte svaret?
                </h3>
                <p className="text-slate-500 text-sm mb-4">
                  Maila oss — du får svar från grundarna, inte en svarsrobot. Vi
                  läser varje mail.
                </p>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary-700" />
                  <a
                    href="mailto:andreas@handymate.se"
                    className="text-primary-700 hover:text-primary-800 font-medium text-sm transition-colors"
                  >
                    andreas@handymate.se
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
