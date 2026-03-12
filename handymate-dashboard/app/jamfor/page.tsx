'use client'

import { useState } from 'react'


// ── Types ──────────────────────────────────────────────────────────────────────

type Status = 'full' | 'partial' | 'planned' | 'none'

interface FeatureItem {
  name: string
  handymate: Status
  easoft: Status
  bygglet: Status
  highlight?: boolean
}

interface FeatureCategory {
  category: string
  items: FeatureItem[]
}

// ── Data ───────────────────────────────────────────────────────────────────────

const features: FeatureCategory[] = [
  {
    category: 'AI & Automation',
    items: [
      { name: 'AI-assistent som svarar på samtal', handymate: 'full', easoft: 'none', bygglet: 'none', highlight: true },
      { name: 'Automatisk SMS-svar till kunder', handymate: 'full', easoft: 'none', bygglet: 'none', highlight: true },
      { name: 'AI-kvalificering av leads', handymate: 'full', easoft: 'none', bygglet: 'none', highlight: true },
      { name: 'Proaktiv offertuppföljning', handymate: 'full', easoft: 'none', bygglet: 'none', highlight: true },
      { name: 'Morgonrapport med dagöversikt', handymate: 'full', easoft: 'none', bygglet: 'none', highlight: true },
      { name: 'Automatisk fakturapåminnelse', handymate: 'full', easoft: 'partial', bygglet: 'partial' },
    ],
  },
  {
    category: 'Offert & Faktura',
    items: [
      { name: 'Skapa offerter', handymate: 'full', easoft: 'full', bygglet: 'full' },
      { name: 'Digital signering', handymate: 'full', easoft: 'full', bygglet: 'full' },
      { name: 'ROT/RUT-avdrag automatiskt', handymate: 'full', easoft: 'full', bygglet: 'full' },
      { name: 'Swish QR-kod på faktura', handymate: 'full', easoft: 'none', bygglet: 'none', highlight: true },
      { name: 'Betalningsplan med delfakturor', handymate: 'full', easoft: 'full', bygglet: 'partial' },
      { name: 'AI skapar offert från samtal', handymate: 'full', easoft: 'none', bygglet: 'none', highlight: true },
    ],
  },
  {
    category: 'Projekthantering',
    items: [
      { name: 'Projektöversikt', handymate: 'full', easoft: 'full', bygglet: 'full' },
      { name: 'Tidrapportering (GPS)', handymate: 'full', easoft: 'full', bygglet: 'full' },
      { name: 'Arbetsorder', handymate: 'full', easoft: 'full', bygglet: 'full' },
      { name: 'Resursplanering / schema', handymate: 'partial', easoft: 'full', bygglet: 'full' },
      { name: 'Lönsamhetsuppföljning per projekt', handymate: 'partial', easoft: 'full', bygglet: 'full' },
    ],
  },
  {
    category: 'Kundhantering',
    items: [
      { name: 'CRM / kundregister', handymate: 'full', easoft: 'full', bygglet: 'full' },
      { name: 'Kundtidslinje (all historik)', handymate: 'full', easoft: 'partial', bygglet: 'none', highlight: true },
      { name: 'Lead-pipeline med scoring', handymate: 'full', easoft: 'none', bygglet: 'none', highlight: true },
      { name: 'Automatisk kunduppföljning', handymate: 'full', easoft: 'none', bygglet: 'none', highlight: true },
    ],
  },
  {
    category: 'Integrationer',
    items: [
      { name: 'Google Calendar', handymate: 'full', easoft: 'partial', bygglet: 'partial' },
      { name: 'Gmail', handymate: 'full', easoft: 'none', bygglet: 'none' },
      { name: 'Fortnox', handymate: 'planned', easoft: 'full', bygglet: 'full' },
      { name: 'Egen hemsida med SEO', handymate: 'full', easoft: 'none', bygglet: 'none', highlight: true },
    ],
  },
  {
    category: 'Användarvänlighet',
    items: [
      { name: 'Mobilanpassad app', handymate: 'full', easoft: 'full', bygglet: 'full' },
      { name: 'Onboarding på 15 minuter', handymate: 'full', easoft: 'none', bygglet: 'partial' },
      { name: 'AI-chatbot för support', handymate: 'full', easoft: 'none', bygglet: 'none' },
      { name: 'Allt på svenska', handymate: 'full', easoft: 'full', bygglet: 'full' },
    ],
  },
]

const faqs = [
  {
    q: 'Är Handymate dyrare än Bygglet?',
    a: 'Handymates startpris (2 495 kr/mån) är högre än Bygglets billigaste paket (1 089 kr/mån). Men Handymate inkluderar AI-assistent, automatisk offerthantering och lead-pipeline — funktioner som varken Bygglet eller Easoft erbjuder. Den tid du sparar betalar sig redan första veckan.',
  },
  {
    q: 'Kan jag byta från Easoft till Handymate?',
    a: 'Ja! Vi hjälper dig migrera kunder, offerter och projektdata. De flesta är igång inom 24 timmar. Kontakta oss för en kostnadsfri migrering.',
  },
  {
    q: 'Har Handymate Fortnox-integration?',
    a: 'Fortnox-integration lanseras Q3 2026. Tills dess kan du exportera fakturor och bokföringsunderlag manuellt.',
  },
  {
    q: 'Funkar det för stora team?',
    a: 'Ja. Handymate Enterprise stödjer obegränsat antal användare med rollbaserad åtkomst, godkännandeflöden och löneexport.',
  },
  {
    q: 'Vad händer om AI:n gör fel?',
    a: 'Du har full kontroll. I AI-inställningarna bestämmer du exakt vad agenten får göra automatiskt och vad som kräver ditt godkännande. Varje åtgärd loggas och syns i dashboarden.',
  },
]

// ── Status icon ────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: Status }) {
  if (status === 'full') {
    return (
      <div style={{ width: 24, height: 24, borderRadius: 12, background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 7.5L5.5 10L11 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }
  if (status === 'partial') {
    return (
      <div style={{ width: 24, height: 24, borderRadius: 12, background: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 7H11" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    )
  }
  if (status === 'planned') {
    return (
      <div style={{ width: 24, height: 24, borderRadius: 12, background: '#0369A1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white', fontWeight: 700, flexShrink: 0 }}>
        Q3
      </div>
    )
  }
  return (
    <div style={{ width: 24, height: 24, borderRadius: 12, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3 3L9 9M9 3L3 9" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function JamforPage() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  const [showAllFeatures, setShowAllFeatures] = useState(false)

  const displayFeatures = showAllFeatures ? features : features.slice(0, 3)

  const plans = [
    {
      name: 'Handymate',
      price: '2 495',
      range: '2 495 – 11 995',
      color: '#0F766E',
      bg: '#F0FDFA',
      border: '#99F6E4',
      tagline: 'AI back office',
      perks: ['AI-assistent som svarar & agerar', 'Offert på minuter, inte dagar', 'Alla planer inkl. AI'],
      featured: true,
    },
    {
      name: 'Bygglet',
      price: '1 089',
      range: '1 089 – 2 289',
      color: '#64748B',
      bg: '#F8FAFC',
      border: '#E2E8F0',
      tagline: 'Projektverktyg',
      perks: ['Bra projekthantering', 'Enkel tidrapportering', 'Fokuserat på bygg'],
      featured: false,
    },
    {
      name: 'Easoft',
      price: '~3 500',
      range: 'Kontakta för pris',
      color: '#64748B',
      bg: '#F8FAFC',
      border: '#E2E8F0',
      tagline: 'Enterprise ERP',
      perks: ['Komplett ERP-system', 'Fortnox-integration', 'Stort för stora team'],
      featured: false,
    },
  ]

  const whyItems = [
    { icon: '📞', title: 'Missa aldrig ett samtal', desc: 'AI:n svarar när du inte kan. Kvalificerar kunden, skapar lead, föreslår tid.' },
    { icon: '📋', title: 'Offert på minuter', desc: 'Från samtal till skickad offert med digital signering — utan att du lyfter ett finger.' },
    { icon: '🔄', title: 'Automatisk uppföljning', desc: 'Ingen offert glöms bort. Agenten följer upp efter 72h och påminner om förfallna fakturor.' },
    { icon: '☀️', title: 'Morgonrapport', desc: 'Vakna till en sammanfattning: dagens bokningar, heta leads, vad som behöver uppmärksamhet.' },
    { icon: '🌐', title: 'Egen hemsida', desc: 'Professionell hemsida med kontaktformulär som matar din lead-pipeline automatiskt.' },
    { icon: '📱', title: 'Byggt för fältet', desc: 'Ljust tema, stora knappar, svenska. Designat för att användas med smutsiga händer på bygget.' },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FAFBFC',
      fontFamily: "'Outfit', 'DM Sans', system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fadeUp 0.6s ease forwards; }
        .fade-up-1 { animation-delay: 0.1s; opacity: 0; }
        .fade-up-2 { animation-delay: 0.2s; opacity: 0; }
        .fade-up-3 { animation-delay: 0.3s; opacity: 0; }
        .feature-row:hover { background: #F0FDFA !important; }
        .highlight-row { background: #F0FDFA; }
        .cta-btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .cta-btn { transition: all 0.2s ease; }
        .faq-btn:hover { background: #F8FAFC; }
      `}</style>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0F2A35 0%, #134E4A 40%, #0F766E 100%)',
        padding: '48px 24px 64px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'rgba(20,184,166,0.08)' }} />
        <div style={{ position: 'absolute', bottom: -80, left: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(14,165,233,0.06)' }} />

        <div style={{ maxWidth: 800, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div className="fade-up" style={{
            display: 'inline-block', padding: '6px 16px', borderRadius: 20,
            background: 'rgba(20,184,166,0.2)', border: '1px solid rgba(20,184,166,0.3)',
            color: '#5EEAD4', fontSize: 13, fontWeight: 600, letterSpacing: '0.03em', marginBottom: 24,
          }}>
            JÄMFÖRELSE 2026
          </div>

          <h1 className="fade-up fade-up-1" style={{
            fontSize: 'clamp(28px,5vw,48px)', fontWeight: 800, color: 'white',
            lineHeight: 1.15, marginBottom: 16, letterSpacing: '-0.02em',
          }}>
            Handymate vs Easoft vs Bygglet
          </h1>

          <p className="fade-up fade-up-2" style={{
            fontSize: 'clamp(16px,2.5vw,20px)', color: '#94A3B8', lineHeight: 1.6,
            maxWidth: 600, margin: '0 auto 32px',
          }}>
            Vilket system passar ditt hantverksföretag bäst? Vi jämför funktioner, priser och — framför allt — vad som faktiskt sparar dig tid.
          </p>

          <div className="fade-up fade-up-3" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="https://handymate.se" className="cta-btn" style={{
              padding: '14px 32px', borderRadius: 12, background: '#0D9488',
              color: 'white', fontWeight: 700, fontSize: 16, textDecoration: 'none',
            }}>
              Testa Handymate gratis →
            </a>
            <a href="#jamforelse" style={{
              padding: '14px 32px', borderRadius: 12, background: 'transparent',
              color: '#94A3B8', fontWeight: 600, fontSize: 16, textDecoration: 'none',
              border: '1px solid rgba(148,163,184,0.3)',
            }}>
              Se jämförelsen
            </a>
          </div>
        </div>
      </div>

      {/* ── Differentiator banner ─────────────────────────────────────────────── */}
      <div style={{ background: '#0F766E', padding: '20px 24px', textAlign: 'center' }}>
        <p style={{ color: 'white', fontSize: 16, fontWeight: 600, maxWidth: 700, margin: '0 auto' }}>
          💡 Handymate är det enda systemet med en{' '}
          <span style={{ color: '#5EEAD4' }}>AI-assistent som faktiskt utför uppgifter</span>
          {' '}— inte bara organiserar dem
        </p>
      </div>

      {/* ── Pricing cards ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px 32px' }}>
        <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
          Prisöversikt
        </h2>
        <p style={{ textAlign: 'center', color: '#64748B', marginBottom: 36, fontSize: 15 }}>
          Månadspriser exkl. moms. Alla plattformar erbjuder tester.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
          {plans.map((plan, i) => (
            <div key={i} style={{
              background: plan.bg, borderRadius: 16, padding: '28px 24px',
              border: `2px solid ${plan.border}`, position: 'relative', overflow: 'hidden',
              transform: plan.featured ? 'scale(1.02)' : 'none',
              boxShadow: plan.featured ? '0 8px 30px rgba(15,118,110,0.12)' : 'none',
            }}>
              {plan.featured && (
                <div style={{
                  position: 'absolute', top: 16, right: -32, background: '#0D9488',
                  color: 'white', fontSize: 11, fontWeight: 700, padding: '4px 40px',
                  transform: 'rotate(45deg)', letterSpacing: '0.05em',
                }}>
                  SMART VAL
                </div>
              )}
              <div style={{ fontSize: 12, color: plan.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                {plan.tagline}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>
                {plan.name}
              </div>
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: plan.color }}>{plan.price}</span>
                <span style={{ fontSize: 14, color: '#94A3B8' }}> kr/mån</span>
              </div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 16 }}>
                Prisintervall: {plan.range} kr/mån
              </div>
              {plan.perks.map((perk, j) => (
                <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 9, background: `${plan.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5.5L4 7.5L8 3" stroke={plan.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span style={{ fontSize: 14, color: '#334155' }}>{perk}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature comparison table ──────────────────────────────────────────── */}
      <div id="jamforelse" style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 48px' }}>
        <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
          Funktionsjämförelse
        </h2>
        <p style={{ textAlign: 'center', color: '#64748B', marginBottom: 12, fontSize: 15 }}>
          Detaljerad jämförelse av alla funktioner
        </p>

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 32, fontSize: 13, color: '#64748B', flexWrap: 'wrap' }}>
          {(['full', 'partial', 'planned', 'none'] as Status[]).map((s) => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StatusIcon status={s} />
              {s === 'full' ? 'Ingår' : s === 'partial' ? 'Delvis' : s === 'planned' ? 'Kommer' : 'Saknas'}
            </span>
          ))}
        </div>

        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px',
            padding: '16px 24px', borderBottom: '2px solid #E2E8F0',
            background: '#F8FAFC', position: 'sticky', top: 0, zIndex: 10,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Funktion</div>
            <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#0F766E' }}>Handymate</div>
            <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#64748B' }}>Easoft</div>
            <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#64748B' }}>Bygglet</div>
          </div>

          {displayFeatures.map((cat, ci) => (
            <div key={ci}>
              <div style={{
                padding: '12px 24px', background: '#F1F5F9',
                borderBottom: '1px solid #E2E8F0',
                borderTop: ci > 0 ? '1px solid #E2E8F0' : 'none',
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>{cat.category}</span>
              </div>

              {cat.items.map((item, fi) => (
                <div
                  key={fi}
                  className={`feature-row${item.highlight ? ' highlight-row' : ''}`}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px',
                    padding: '12px 24px', borderBottom: '1px solid #F1F5F9',
                    alignItems: 'center', transition: 'background 0.15s',
                  }}
                >
                  <div style={{ fontSize: 14, color: '#334155', fontWeight: item.highlight ? 600 : 400, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {item.name}
                    {item.highlight && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: '#0F766E',
                        background: '#CCFBF1', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.03em',
                      }}>
                        UNIKT
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><StatusIcon status={item.handymate} /></div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><StatusIcon status={item.easoft} /></div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><StatusIcon status={item.bygglet} /></div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {!showAllFeatures && (
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button
              onClick={() => setShowAllFeatures(true)}
              style={{
                padding: '12px 28px', borderRadius: 10, background: 'white',
                border: '1px solid #E2E8F0', color: '#334155', fontWeight: 600,
                fontSize: 14, cursor: 'pointer',
              }}
            >
              Visa alla {features.length} kategorier ↓
            </button>
          </div>
        )}
      </div>

      {/* ── Why Handymate ─────────────────────────────────────────────────────── */}
      <div style={{ background: '#0F2A35', padding: '56px 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: 'white', marginBottom: 12 }}>
            Varför hantverkare väljer Handymate
          </h2>
          <p style={{ color: '#94A3B8', fontSize: 16, marginBottom: 40, lineHeight: 1.6 }}>
            Bygglet och Easoft är bra verktyg för projekthantering. Men de kräver att du gör allt jobb själv — skapa offerter, svara på samtal, följa upp kunder. Handymate gör det åt dig.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 20, textAlign: 'left' }}>
            {whyItems.map((item, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '24px 20px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{item.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FAQ ───────────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '56px 24px' }}>
        <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: 700, color: '#0F172A', marginBottom: 32 }}>
          Vanliga frågor
        </h2>
        {faqs.map((faq, i) => (
          <div key={i} style={{
            marginBottom: 12, background: 'white', borderRadius: 12,
            border: '1px solid #E2E8F0', overflow: 'hidden',
          }}>
            <button
              className="faq-btn"
              onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
              style={{
                width: '100%', padding: '18px 24px', background: 'none', border: 'none',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#0F172A',
                textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.15s',
              }}
            >
              {faq.q}
              <span style={{
                color: '#94A3B8', fontSize: 22, flexShrink: 0, marginLeft: 16,
                transform: expandedFaq === i ? 'rotate(45deg)' : 'none',
                transition: 'transform 0.2s',
                display: 'inline-block',
              }}>+</span>
            </button>
            {expandedFaq === i && (
              <div style={{ padding: '0 24px 18px', fontSize: 14, color: '#64748B', lineHeight: 1.7 }}>
                {faq.a}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Final CTA ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg,#0F766E,#0D9488)',
        padding: '56px 24px', textAlign: 'center',
      }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: 'white', marginBottom: 12 }}>
          Redo att sluta jaga pappersarbete?
        </h2>
        <p style={{ color: '#B2DFDB', fontSize: 16, maxWidth: 500, margin: '0 auto 28px', lineHeight: 1.6 }}>
          14 dagars gratis test. Ingen bindningstid. Vi hjälper dig igång på 15 minuter.
        </p>
        <a href="https://handymate.se" className="cta-btn" style={{
          display: 'inline-block', padding: '16px 40px', borderRadius: 12,
          background: 'white', color: '#0F766E', fontWeight: 700, fontSize: 17,
          textDecoration: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
        }}>
          Testa Handymate gratis →
        </a>
        <p style={{ color: '#B2DFDB', fontSize: 13, marginTop: 16 }}>
          Eller ring oss: +46 708 379 552
        </p>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
        © 2026 Handymate. Jämförelsen baseras på offentligt tillgänglig information per mars 2026.
      </div>
    </div>
  )
}
