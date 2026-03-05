'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Phone,
  Mail,
  MapPin,
  Map,
  Menu,
  X,
  Zap,
  Wrench,
  Lightbulb,
  BatteryCharging,
  Home,
  ClipboardCheck,
  Hammer,
  Droplets,
  Paintbrush,
  Building,
  Settings2,
  CheckCircle,
  Star,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────

interface StorefrontData {
  id: string
  business_id: string
  slug: string
  hero_headline: string | null
  hero_description: string | null
  about_text: string | null
  hero_image_url: string | null
  gallery_images: string[]
  color_scheme: string
  service_descriptions: Record<string, string>
  sections: string[]
  show_chat_widget: boolean
}

interface BusinessData {
  business_id: string
  business_name: string
  contact_name: string | null
  contact_email: string | null
  phone_number: string | null
  assigned_phone_number: string | null
  address: string | null
  service_area: string | null
  branch: string | null
  services_offered: string[]
  default_hourly_rate: number
  rot_enabled: boolean
  rut_enabled: boolean
  google_review_url: string | null
  widget_enabled: boolean
  plan: string | null
}

interface PriceItem {
  name: string
  category: string
  unit: string
  unit_price: number
}

interface Review {
  review_rating: number
  review_text: string | null
  customer?: { name: string } | null
  sent_at: string
}

// ─── Color scheme system ─────────────────────────────────────────────

interface ColorScheme {
  gradient: string
  accent: string
  accentBg: string
  accentLight: string
  accentHover: string
  accentText: string
  ring: string
}

const COLOR_SCHEMES: Record<string, ColorScheme> = {
  blue: {
    gradient: 'from-teal-700 via-blue-700 to-indigo-900',
    accent: 'bg-teal-700',
    accentBg: 'bg-teal-50',
    accentLight: 'bg-teal-700/10',
    accentHover: 'hover:bg-teal-800',
    accentText: 'text-sky-700',
    ring: 'focus:ring-teal-500',
  },
  green: {
    gradient: 'from-green-600 via-emerald-700 to-teal-900',
    accent: 'bg-green-600',
    accentBg: 'bg-green-50',
    accentLight: 'bg-green-600/10',
    accentHover: 'hover:bg-green-700',
    accentText: 'text-green-600',
    ring: 'focus:ring-green-500',
  },
  teal: {
    gradient: 'from-teal-600 via-teal-700 to-teal-900',
    accent: 'bg-teal-600',
    accentBg: 'bg-teal-50',
    accentLight: 'bg-teal-600/10',
    accentHover: 'hover:bg-teal-700',
    accentText: 'text-teal-600',
    ring: 'focus:ring-teal-500',
  },
  orange: {
    gradient: 'from-orange-500 via-orange-600 to-red-800',
    accent: 'bg-orange-600',
    accentBg: 'bg-orange-50',
    accentLight: 'bg-orange-600/10',
    accentHover: 'hover:bg-orange-700',
    accentText: 'text-orange-600',
    ring: 'focus:ring-orange-500',
  },
  slate: {
    gradient: 'from-slate-700 via-slate-800 to-gray-900',
    accent: 'bg-slate-800',
    accentBg: 'bg-slate-50',
    accentLight: 'bg-slate-800/10',
    accentHover: 'hover:bg-slate-900',
    accentText: 'text-slate-700',
    ring: 'focus:ring-slate-500',
  },
}

// ─── Service icon mapper ─────────────────────────────────────────────

const SERVICE_ICONS: Record<string, typeof Zap> = {
  installation: Zap,
  elinstallation: Zap,
  el: Zap,
  felsökning: Wrench,
  reparation: Wrench,
  belysning: Lightbulb,
  lampa: Lightbulb,
  elbilsladdare: BatteryCharging,
  laddbox: BatteryCharging,
  'smart hem': Home,
  smarthome: Home,
  besiktning: ClipboardCheck,
  elbesiktning: ClipboardCheck,
  renovering: Hammer,
  bygg: Hammer,
  vvs: Droplets,
  vatten: Droplets,
  rörmokare: Droplets,
  målning: Paintbrush,
  måleri: Paintbrush,
  tak: Building,
  fasad: Building,
}

function getServiceIcon(name: string) {
  const lower = name.toLowerCase()
  for (const [key, icon] of Object.entries(SERVICE_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return Settings2
}

// ─── Scroll animation hook ───────────────────────────────────────────

function useScrollAnimation() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-in')
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )

    const targets = el.querySelectorAll('[data-animate]')
    targets.forEach((t) => observer.observe(t))

    return () => observer.disconnect()
  }, [])

  return ref
}

// ─── Component ───────────────────────────────────────────────────────

export default function StorefrontClient({
  storefront,
  business,
  priceItems,
  reviews,
}: {
  storefront: StorefrontData
  business: BusinessData
  priceItems: PriceItem[]
  reviews: Review[]
}) {
  const plan = (business.plan || 'starter') as string
  const isStarter = plan === 'starter'

  // Feature gating per plan
  const showContactForm = !isStarter
  const showReviews = !isStarter
  const showGallery = !isStarter
  const showAbout = !isStarter
  const showCustomColors = !isStarter
  const showChatbot = !isStarter

  const c = showCustomColors
    ? (COLOR_SCHEMES[storefront.color_scheme] || COLOR_SCHEMES.blue)
    : COLOR_SCHEMES.blue
  const sections = storefront.sections || ['hero', 'services', 'about', 'gallery', 'reviews', 'contact']
  const phone = business.assigned_phone_number || business.phone_number || ''

  // State
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [formSending, setFormSending] = useState(false)
  const [formSent, setFormSent] = useState(false)
  const [formError, setFormError] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const animRef = useScrollAnimation()

  // Scroll detection for header shadow
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Lock body scroll when mobile menu or lightbox open
  useEffect(() => {
    document.body.style.overflow = (mobileMenuOpen || lightboxIndex !== null) ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileMenuOpen, lightboxIndex])

  async function handleSubmitContact(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setFormSending(true)
    try {
      const res = await fetch('/api/storefront/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.business_id,
          name: formName,
          phone: formPhone,
          email: formEmail,
          message: formMessage,
        }),
      })
      if (res.ok) {
        setFormSent(true)
      } else {
        const data = await res.json()
        setFormError(data.error || 'Något gick fel')
      }
    } catch {
      setFormError('Kunde inte skicka förfrågan')
    } finally {
      setFormSending(false)
    }
  }

  // Review stats
  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.review_rating, 0) / reviews.length).toFixed(1)
    : null
  const hasReviewData = showReviews && reviews.length > 0

  // Navigation links
  const navLinks: { label: string; href: string }[] = []
  if (sections.includes('services')) navLinks.push({ label: 'Tjänster', href: '#services' })
  if (sections.includes('about') && showAbout && storefront.about_text) navLinks.push({ label: 'Om oss', href: '#about' })
  if (sections.includes('reviews') && hasReviewData) navLinks.push({ label: 'Recensioner', href: '#reviews' })
  navLinks.push({ label: 'Kontakt', href: '#contact' })

  const smoothScroll = useCallback((href: string) => {
    setMobileMenuOpen(false)
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Gallery images
  const galleryImages = storefront.gallery_images || []

  return (
    <div ref={animRef} className="min-h-screen bg-white text-gray-900" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      {/* Google Fonts */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        html { scroll-behavior: smooth; }
        [data-animate] { opacity: 0; transform: translateY(30px); transition: opacity 0.6s ease, transform 0.6s ease; }
        [data-animate].animate-in { opacity: 1; transform: translateY(0); }
        [data-animate-delay="1"] { transition-delay: 0.1s; }
        [data-animate-delay="2"] { transition-delay: 0.2s; }
        [data-animate-delay="3"] { transition-delay: 0.3s; }
        [data-animate-delay="4"] { transition-delay: 0.4s; }
        [data-animate-delay="5"] { transition-delay: 0.5s; }
        @keyframes float { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-20px) scale(1.05); } }
        .hero-blob { position: absolute; border-radius: 50%; background: rgba(255,255,255,0.08); }
        .hero-blob-1 { width: 300px; height: 300px; top: 10%; right: 10%; animation: float 20s ease-in-out infinite; }
        .hero-blob-2 { width: 200px; height: 200px; bottom: 15%; left: 5%; animation: float 25s ease-in-out infinite 3s; }
        .hero-blob-3 { width: 150px; height: 150px; top: 60%; right: 30%; animation: float 18s ease-in-out infinite 6s; }
        .hero-blob-4 { width: 100px; height: 100px; top: 20%; left: 20%; animation: float 22s ease-in-out infinite 2s; }
        .hero-blob-5 { width: 80px; height: 80px; bottom: 30%; right: 5%; animation: float 15s ease-in-out infinite 4s; }
      `}} />

      {/* ═══════════ STICKY HEADER ═══════════ */}
      <nav className={`sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b transition-shadow duration-300 ${scrolled ? 'shadow-sm border-gray-200' : 'border-transparent'}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <span className="font-bold text-xl text-gray-900">{business.business_name}</span>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map(link => (
              <button
                key={link.href}
                onClick={() => smoothScroll(link.href)}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                {link.label}
              </button>
            ))}
            {phone && (
              <a
                href={`tel:${phone.replace(/\s/g, '')}`}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white ${c.accent} ${c.accentHover} transition-colors shadow-sm`}
              >
                <Phone className="w-4 h-4" />
                Ring oss
              </a>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Öppna meny"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <span className="font-bold text-lg text-gray-900">{business.business_name}</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-1">
              {navLinks.map(link => (
                <button
                  key={link.href}
                  onClick={() => smoothScroll(link.href)}
                  className="block w-full text-left px-4 py-3 rounded-xl text-base font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {link.label}
                </button>
              ))}
            </nav>
            {phone && (
              <div className="p-4 border-t border-gray-100">
                <a
                  href={`tel:${phone.replace(/\s/g, '')}`}
                  className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-white font-semibold ${c.accent} ${c.accentHover} transition-colors`}
                >
                  <Phone className="w-4 h-4" />
                  Ring {phone}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ HERO ═══════════ */}
      {sections.includes('hero') && (
        storefront.hero_image_url ? (
          /* Variant A: With hero image */
          <section className="relative min-h-[70vh] md:min-h-[85vh] flex items-center overflow-hidden">
            <img
              src={storefront.hero_image_url}
              alt={business.business_name}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
            <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 w-full">
              <div className="max-w-2xl" data-animate>
                <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold text-white tracking-tight leading-[1.1]">
                  {storefront.hero_headline || business.business_name}
                </h1>
              </div>
              {storefront.hero_description && (
                <p className="text-xl md:text-2xl text-white/80 max-w-2xl mt-6 leading-relaxed" data-animate data-animate-delay="1">
                  {storefront.hero_description}
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-4 mt-10" data-animate data-animate-delay="2">
                <a
                  href="#contact"
                  onClick={(e) => { e.preventDefault(); smoothScroll('#contact') }}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-lg font-semibold bg-white text-gray-900 hover:bg-white/90 shadow-lg shadow-black/20 transition-all"
                >
                  Kontakta oss <ArrowRight className="w-5 h-5" />
                </a>
                {phone && (
                  <a
                    href={`tel:${phone.replace(/\s/g, '')}`}
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-lg font-medium border-2 border-white/40 text-white hover:bg-white/10 transition-all"
                  >
                    <Phone className="w-5 h-5" />
                    Ring {phone}
                  </a>
                )}
              </div>
              {hasReviewData && avgRating && (
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 text-white/90 text-sm mt-8" data-animate data-animate-delay="3">
                  <span className="text-yellow-400">{'★'.repeat(Math.round(Number(avgRating)))}</span>
                  <span>{avgRating}/5 baserat på {reviews.length} recensioner</span>
                </div>
              )}
              {business.service_area && (
                <p className="text-white/60 text-sm mt-4" data-animate data-animate-delay="3">
                  <MapPin className="w-4 h-4 inline mr-1" />Verksamma i {business.service_area}
                </p>
              )}
            </div>
          </section>
        ) : (
          /* Variant B: Gradient hero (default) */
          <section className={`relative min-h-[70vh] md:min-h-[85vh] flex items-center overflow-hidden bg-gradient-to-br ${c.gradient}`}>
            {/* Decorative blobs */}
            <div className="hero-blob hero-blob-1" />
            <div className="hero-blob hero-blob-2" />
            <div className="hero-blob hero-blob-3" />
            <div className="hero-blob hero-blob-4" />
            <div className="hero-blob hero-blob-5" />

            <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 w-full">
              <div data-animate>
                <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold text-white tracking-tight leading-[1.1] max-w-4xl">
                  {storefront.hero_headline || business.business_name}
                </h1>
              </div>
              {storefront.hero_description && (
                <p className="text-xl md:text-2xl font-normal text-white/80 max-w-2xl mt-6 leading-relaxed" data-animate data-animate-delay="1">
                  {storefront.hero_description}
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-4 mt-10" data-animate data-animate-delay="2">
                <a
                  href="#contact"
                  onClick={(e) => { e.preventDefault(); smoothScroll('#contact') }}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-lg font-semibold bg-white text-gray-900 hover:bg-white/90 shadow-lg shadow-black/20 transition-all"
                >
                  Kontakta oss <ArrowRight className="w-5 h-5" />
                </a>
                {phone && (
                  <a
                    href={`tel:${phone.replace(/\s/g, '')}`}
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-lg font-medium border-2 border-white/40 text-white hover:bg-white/10 transition-all"
                  >
                    <Phone className="w-5 h-5" />
                    Ring {phone}
                  </a>
                )}
              </div>
              {hasReviewData && avgRating && (
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 text-white/90 text-sm mt-8" data-animate data-animate-delay="3">
                  <span className="text-yellow-400">{'★'.repeat(Math.round(Number(avgRating)))}</span>
                  <span>{avgRating}/5 baserat på {reviews.length} recensioner</span>
                </div>
              )}
              {business.service_area && (
                <p className="text-white/60 text-sm mt-4" data-animate data-animate-delay="3">
                  <MapPin className="w-4 h-4 inline mr-1" />Verksamma i {business.service_area}
                </p>
              )}
            </div>
          </section>
        )
      )}

      {/* ═══════════ SOCIAL PROOF BAR ═══════════ */}
      {hasReviewData && avgRating && (
        <div className="relative z-20 -mt-8 px-4 sm:px-6" data-animate>
          <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 py-6 px-8">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12">
              <div className="flex items-center gap-3">
                <span className="text-yellow-400 text-xl">{'★'.repeat(Math.round(Number(avgRating)))}</span>
                <span className="text-2xl font-bold text-gray-900">{avgRating}/5</span>
              </div>
              <div className="hidden sm:block w-px h-8 bg-gray-200" />
              <div className="text-center">
                <span className="text-2xl font-bold text-gray-900">{reviews.length}</span>
                <span className="text-sm text-gray-500 ml-1">recensioner</span>
              </div>
              {business.services_offered.length > 0 && (
                <>
                  <div className="hidden sm:block w-px h-8 bg-gray-200" />
                  <div className="text-center">
                    <span className="text-2xl font-bold text-gray-900">{business.services_offered.length}+</span>
                    <span className="text-sm text-gray-500 ml-1">tjänster</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ SERVICES ═══════════ */}
      {sections.includes('services') && (business.services_offered.length > 0 || priceItems.length > 0) && (
        <section id="services" className="bg-gray-50 py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center" data-animate>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Vad vi kan hjälpa dig med</h2>
              {business.service_area && (
                <p className="text-lg text-gray-500 max-w-2xl mx-auto mt-4">
                  Professionella tjänster i {business.service_area}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-16">
              {business.services_offered.map((service, i) => {
                const desc = !isStarter ? storefront.service_descriptions?.[service] : null
                const price = priceItems.find(p => p.name.toLowerCase() === service.toLowerCase())
                const Icon = getServiceIcon(service)
                return (
                  <div
                    key={service}
                    className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                    data-animate
                    data-animate-delay={String(Math.min(i + 1, 5))}
                  >
                    <div className={`w-14 h-14 rounded-xl ${c.accentLight} flex items-center justify-center`}>
                      <Icon className={`w-7 h-7 ${c.accentText}`} />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mt-6">{service}</h3>
                    {desc && <p className="text-gray-500 mt-3 text-sm leading-relaxed">{desc}</p>}
                    {price && (
                      <p className={`text-lg font-medium ${c.accentText} mt-3`}>
                        Från {Math.round(price.unit_price)} kr/{price.unit}
                      </p>
                    )}
                  </div>
                )
              })}
              {priceItems
                .filter(p => !business.services_offered.some(s => s.toLowerCase() === p.name.toLowerCase()))
                .map((item, i) => {
                  const Icon = getServiceIcon(item.name)
                  return (
                    <div
                      key={item.name}
                      className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                      data-animate
                      data-animate-delay={String(Math.min(business.services_offered.length + i + 1, 5))}
                    >
                      <div className={`w-14 h-14 rounded-xl ${c.accentLight} flex items-center justify-center`}>
                        <Icon className={`w-7 h-7 ${c.accentText}`} />
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 mt-6">{item.name}</h3>
                      <p className={`text-lg font-medium ${c.accentText} mt-3`}>
                        Från {Math.round(item.unit_price)} kr/{item.unit}
                      </p>
                    </div>
                  )
                })}
            </div>

            {/* ROT/RUT badge + hourly rate */}
            <div className="text-center mt-12 space-y-3" data-animate>
              {(business.rot_enabled || business.rut_enabled) && (
                <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 rounded-full px-5 py-2.5 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  {business.rot_enabled && 'ROT-avdrag 30%'}
                  {business.rot_enabled && business.rut_enabled && ' · '}
                  {business.rut_enabled && 'RUT-avdrag 50%'}
                </div>
              )}
              {business.default_hourly_rate > 0 && (
                <p className="text-sm text-gray-500">
                  Timpris: {business.default_hourly_rate} kr/h (exkl. moms)
                  {business.rot_enabled && (
                    <span className="text-green-600 ml-2">
                      · Du betalar {Math.round(business.default_hourly_rate * 0.7)} kr/h efter ROT
                    </span>
                  )}
                </p>
              )}
              <div className="pt-4">
                <a
                  href="#contact"
                  onClick={(e) => { e.preventDefault(); smoothScroll('#contact') }}
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-full text-white font-semibold ${c.accent} ${c.accentHover} transition-colors shadow-sm`}
                >
                  Begär offert <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════ ABOUT ═══════════ */}
      {sections.includes('about') && showAbout && storefront.about_text && (
        <section id="about" className="bg-white py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              {/* Left: visual */}
              <div className={`${c.accentBg} rounded-3xl aspect-square flex items-center justify-center`} data-animate>
                <Hammer className={`w-32 h-32 ${c.accentText} opacity-20`} />
              </div>
              {/* Right: text */}
              <div data-animate data-animate-delay="1">
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Om {business.business_name}</h2>
                <div className="mt-6 space-y-4">
                  {storefront.about_text.split('\n\n').map((paragraph, i) => (
                    <p key={i} className="text-lg text-gray-600 leading-relaxed">{paragraph}</p>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-16 pt-16 border-t border-gray-100" data-animate>
              {hasReviewData && avgRating && (
                <div className="text-center">
                  <p className={`text-4xl font-bold ${c.accentText}`}>{avgRating}</p>
                  <p className="text-sm text-gray-500 mt-1">Snittbetyg</p>
                </div>
              )}
              {reviews.length > 0 && (
                <div className="text-center">
                  <p className={`text-4xl font-bold ${c.accentText}`}>{reviews.length}+</p>
                  <p className="text-sm text-gray-500 mt-1">Nöjda kunder</p>
                </div>
              )}
              {business.services_offered.length > 0 && (
                <div className="text-center">
                  <p className={`text-4xl font-bold ${c.accentText}`}>{business.services_offered.length}</p>
                  <p className="text-sm text-gray-500 mt-1">Tjänster</p>
                </div>
              )}
              <div className="text-center">
                <p className={`text-4xl font-bold ${c.accentText}`}>F-skatt</p>
                <p className="text-sm text-gray-500 mt-1">Godkänd</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════ GALLERY ═══════════ */}
      {sections.includes('gallery') && showGallery && galleryImages.length > 0 && (
        <section id="gallery" className="bg-gray-50 py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-12" data-animate>
              Våra senaste projekt
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-animate>
              {galleryImages.map((img, i) => (
                <div
                  key={i}
                  className={`rounded-2xl overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform duration-300 ${
                    i === 0 ? 'col-span-2 row-span-2' : ''
                  }`}
                  onClick={() => setLightboxIndex(i)}
                >
                  <img
                    src={img}
                    alt={`Projekt ${i + 1}`}
                    className="w-full h-full object-cover aspect-square"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && galleryImages.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setLightboxIndex(null)}>
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white p-2"
            onClick={() => setLightboxIndex(null)}
          >
            <X className="w-8 h-8" />
          </button>
          {lightboxIndex > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1) }}
            >
              <ChevronLeft className="w-10 h-10" />
            </button>
          )}
          {lightboxIndex < galleryImages.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1) }}
            >
              <ChevronRight className="w-10 h-10" />
            </button>
          )}
          <img
            src={galleryImages[lightboxIndex]}
            alt={`Projekt ${lightboxIndex + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ═══════════ REVIEWS ═══════════ */}
      {sections.includes('reviews') && hasReviewData && (
        <section id="reviews" className="bg-white py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-12" data-animate>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Vad våra kunder säger</h2>
              {avgRating && (
                <div className="flex items-center justify-center gap-2 mt-3">
                  <span className="text-yellow-400 text-xl">{'★'.repeat(Math.round(Number(avgRating)))}</span>
                  <span className="text-lg font-semibold text-gray-900">{avgRating} av 5</span>
                </div>
              )}
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {reviews.map((review, i) => (
                <div key={i} className="bg-gray-50 rounded-2xl p-8" data-animate data-animate-delay={String(Math.min(i + 1, 3))}>
                  <div className="text-6xl leading-none font-serif opacity-20 mb-2" style={{ color: 'currentColor' }}>
                    {'\u201C'}
                  </div>
                  {review.review_text && (
                    <p className="text-gray-700 text-base leading-relaxed">{review.review_text}</p>
                  )}
                  <div className="text-yellow-400 mt-4">{'★'.repeat(review.review_rating)}</div>
                  {review.customer?.name && (
                    <div className="flex items-center gap-3 mt-4">
                      <div className={`w-10 h-10 rounded-full ${c.accentLight} flex items-center justify-center`}>
                        <span className={`text-sm font-semibold ${c.accentText}`}>
                          {review.customer.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="font-medium text-gray-900">{review.customer.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {business.google_review_url && (
              <div className="text-center mt-10" data-animate>
                <a
                  href={business.google_review_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Se alla recensioner på Google <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════ CONTACT ═══════════ */}
      {sections.includes('contact') && (
        <section id="contact" className={`relative py-24 overflow-hidden bg-gradient-to-br ${c.gradient}`}>
          {/* Decorative blobs */}
          <div className="hero-blob hero-blob-1 opacity-50" />
          <div className="hero-blob hero-blob-2 opacity-50" />

          <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6">
            <div className={showContactForm ? 'grid md:grid-cols-2 gap-16' : 'max-w-xl mx-auto text-center'}>
              {/* Contact info */}
              <div data-animate>
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-8">Kontakta oss</h2>
                <div className="space-y-5">
                  {phone && (
                    <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-center gap-4 text-white/90 hover:text-white transition-colors">
                      <Phone className="w-6 h-6 text-white/60" />
                      <span className="text-lg">{phone}</span>
                    </a>
                  )}
                  {business.contact_email && (
                    <a href={`mailto:${business.contact_email}`} className="flex items-center gap-4 text-white/90 hover:text-white transition-colors">
                      <Mail className="w-6 h-6 text-white/60" />
                      <span className="text-lg">{business.contact_email}</span>
                    </a>
                  )}
                  {business.address && (
                    <div className="flex items-center gap-4 text-white/90">
                      <MapPin className="w-6 h-6 text-white/60" />
                      <span className="text-lg">{business.address}</span>
                    </div>
                  )}
                  {business.service_area && (
                    <div className="flex items-center gap-4 text-white/70 text-sm">
                      <Map className="w-6 h-6 text-white/40" />
                      <span>Serviceområde: {business.service_area}</span>
                    </div>
                  )}
                </div>
                {!showContactForm && phone && (
                  <a
                    href={`tel:${phone.replace(/\s/g, '')}`}
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-lg font-semibold bg-white text-gray-900 hover:bg-white/90 shadow-lg shadow-black/20 transition-all mt-8"
                  >
                    <Phone className="w-5 h-5" />
                    Ring oss
                  </a>
                )}
              </div>

              {/* Contact form (Professional+) */}
              {showContactForm && (
                <div className="bg-white rounded-2xl p-8 shadow-2xl" data-animate data-animate-delay="1">
                  {formSent ? (
                    <div className="text-center py-12">
                      <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                      <h3 className="text-2xl font-semibold text-gray-900 mb-2">Tack!</h3>
                      <p className="text-gray-500">Vi återkommer inom 24 timmar.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitContact} className="space-y-4">
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">Skicka en förfrågan</h3>
                      {/* Honeypot */}
                      <div className="hidden" aria-hidden="true">
                        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                      </div>
                      <input
                        type="text"
                        value={formName}
                        onChange={e => setFormName(e.target.value)}
                        required
                        placeholder="Ditt namn *"
                        className={`w-full h-12 px-4 bg-gray-50 border-0 rounded-xl text-base focus:ring-2 ${c.ring} focus:border-transparent`}
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="tel"
                          value={formPhone}
                          onChange={e => setFormPhone(e.target.value)}
                          placeholder="Telefon"
                          className={`w-full h-12 px-4 bg-gray-50 border-0 rounded-xl text-base focus:ring-2 ${c.ring} focus:border-transparent`}
                        />
                        <input
                          type="email"
                          value={formEmail}
                          onChange={e => setFormEmail(e.target.value)}
                          placeholder="E-post"
                          className={`w-full h-12 px-4 bg-gray-50 border-0 rounded-xl text-base focus:ring-2 ${c.ring} focus:border-transparent`}
                        />
                      </div>
                      <textarea
                        value={formMessage}
                        onChange={e => setFormMessage(e.target.value)}
                        placeholder="Beskriv vad du behöver hjälp med..."
                        rows={4}
                        className={`w-full px-4 py-3 bg-gray-50 border-0 rounded-xl text-base focus:ring-2 ${c.ring} focus:border-transparent resize-none`}
                      />
                      {formError && <p className="text-sm text-red-600">{formError}</p>}
                      <button
                        type="submit"
                        disabled={formSending}
                        className={`w-full h-12 rounded-xl text-white font-semibold text-lg ${c.accent} ${c.accentHover} transition-all disabled:opacity-50`}
                      >
                        {formSending ? 'Skickar...' : 'Skicka förfrågan'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="bg-gray-900 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
            <span>&copy; {new Date().getFullYear()} {business.business_name}</span>
            <a
              href="https://handymate.se"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              Skapad med Handymate
            </a>
          </div>
        </div>
      </footer>

      {/* ─── WIDGET EMBED (Professional+) ─── */}
      {showChatbot && storefront.show_chat_widget && business.widget_enabled && (
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                var s=document.createElement('script');
                s.src='${typeof window !== 'undefined' ? window.location.origin : ''}/widget/loader.js';
                s.setAttribute('data-business-id','${business.business_id}');
                s.async=true;
                document.body.appendChild(s);
              })();
            `,
          }}
        />
      )}
    </div>
  )
}
