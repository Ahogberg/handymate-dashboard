'use client'

import { useState } from 'react'

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

// ─── Color schemes ───────────────────────────────────────────────────

const COLORS: Record<string, { primary: string; primaryHover: string; primaryBg: string; primaryLight: string; ring: string }> = {
  blue:   { primary: 'bg-blue-600', primaryHover: 'hover:bg-blue-700', primaryBg: 'bg-blue-50', primaryLight: 'text-blue-600', ring: 'focus:ring-blue-500' },
  green:  { primary: 'bg-emerald-600', primaryHover: 'hover:bg-emerald-700', primaryBg: 'bg-emerald-50', primaryLight: 'text-emerald-600', ring: 'focus:ring-emerald-500' },
  teal:   { primary: 'bg-teal-600', primaryHover: 'hover:bg-teal-700', primaryBg: 'bg-teal-50', primaryLight: 'text-teal-600', ring: 'focus:ring-teal-500' },
  orange: { primary: 'bg-orange-600', primaryHover: 'hover:bg-orange-700', primaryBg: 'bg-orange-50', primaryLight: 'text-orange-600', ring: 'focus:ring-orange-500' },
  slate:  { primary: 'bg-slate-800', primaryHover: 'hover:bg-slate-900', primaryBg: 'bg-slate-50', primaryLight: 'text-slate-700', ring: 'focus:ring-slate-500' },
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
  const showContactForm = !isStarter   // Professional+
  const showReviews = !isStarter       // Professional+
  const showGallery = !isStarter       // Professional+
  const showAbout = !isStarter         // Professional+
  const showCustomColors = !isStarter  // Professional+
  const showChatbot = !isStarter       // Professional+

  const c = showCustomColors ? (COLORS[storefront.color_scheme] || COLORS.blue) : COLORS.blue
  const sections = storefront.sections || ['hero', 'services', 'about', 'gallery', 'reviews', 'contact']
  const phone = business.assigned_phone_number || business.phone_number || ''

  // Contact form state
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [formSending, setFormSending] = useState(false)
  const [formSent, setFormSent] = useState(false)
  const [formError, setFormError] = useState('')

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

  // Average review rating
  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.review_rating, 0) / reviews.length).toFixed(1)
    : null

  return (
    <div className="min-h-screen bg-white text-gray-900" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* ─── NAVBAR ─── */}
      <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <span className="font-bold text-lg text-gray-900">{business.business_name}</span>
          <div className="flex items-center gap-3">
            {phone && (
              <a href={`tel:${phone.replace(/\s/g, '')}`} className={`hidden sm:inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white ${c.primary} ${c.primaryHover} transition-colors`}>
                Ring {phone}
              </a>
            )}
            <a href="#contact" className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors`}>
              Kontakta oss
            </a>
          </div>
        </div>
      </nav>

      {/* ─── SECTIONS ─── */}
      {sections.map((section) => {
        switch (section) {

          // ═══════════ HERO ═══════════
          case 'hero':
            return (
              <section key="hero" className={`${c.primaryBg} py-16 sm:py-24`}>
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                  <div className={storefront.hero_image_url ? 'grid md:grid-cols-2 gap-12 items-center' : ''}>
                    <div>
                      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                        {storefront.hero_headline || business.business_name}
                      </h1>
                      {storefront.hero_description && (
                        <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                          {storefront.hero_description}
                        </p>
                      )}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <a href="#contact" className={`inline-flex items-center justify-center px-6 py-3.5 rounded-xl text-base font-semibold text-white ${c.primary} ${c.primaryHover} transition-colors shadow-sm`}>
                          Kontakta oss
                        </a>
                        {phone && (
                          <a href={`tel:${phone.replace(/\s/g, '')}`} className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl text-base font-medium border border-gray-200 text-gray-700 hover:bg-white transition-colors">
                            Ring {phone}
                          </a>
                        )}
                      </div>
                      {business.service_area && (
                        <p className="mt-6 text-sm text-gray-500">Verksamma i {business.service_area}</p>
                      )}
                    </div>
                    {storefront.hero_image_url && (
                      <div className="hidden md:block">
                        <img src={storefront.hero_image_url} alt={business.business_name} className="rounded-2xl shadow-lg w-full h-80 object-cover" />
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )

          // ═══════════ SERVICES ═══════════
          case 'services':
            if (business.services_offered.length === 0 && priceItems.length === 0) return null
            return (
              <section key="services" id="services" className="py-16 sm:py-20">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Våra tjänster</h2>
                  <p className="text-gray-500 mb-10">
                    {business.rot_enabled && 'ROT-avdrag: Ja, 30% ✓'}
                    {business.rot_enabled && business.rut_enabled && ' · '}
                    {business.rut_enabled && 'RUT-avdrag: Ja, 50% ✓'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {business.services_offered.map((service) => {
                      const desc = !isStarter ? storefront.service_descriptions?.[service] : null
                      const price = priceItems.find(p => p.name.toLowerCase() === service.toLowerCase())
                      return (
                        <div key={service} className="border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-colors">
                          <h3 className="font-semibold text-gray-900 mb-1">{service}</h3>
                          {desc && <p className="text-sm text-gray-500 mb-3">{desc}</p>}
                          {price && (
                            <p className={`text-sm font-medium ${c.primaryLight}`}>
                              Från {Math.round(price.unit_price)} kr/{price.unit}
                            </p>
                          )}
                        </div>
                      )
                    })}
                    {priceItems
                      .filter(p => !business.services_offered.some(s => s.toLowerCase() === p.name.toLowerCase()))
                      .map((item) => (
                        <div key={item.name} className="border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-colors">
                          <h3 className="font-semibold text-gray-900 mb-1">{item.name}</h3>
                          <p className={`text-sm font-medium ${c.primaryLight}`}>
                            Från {Math.round(item.unit_price)} kr/{item.unit}
                          </p>
                        </div>
                      ))}
                  </div>
                  {business.default_hourly_rate > 0 && (
                    <p className="mt-6 text-sm text-gray-500">
                      Timpris: {business.default_hourly_rate} kr/timme (exkl. moms)
                    </p>
                  )}
                </div>
              </section>
            )

          // ═══════════ ABOUT ═══════════
          case 'about':
            if (!showAbout || !storefront.about_text) return null
            return (
              <section key="about" id="about" className={`py-16 sm:py-20 ${c.primaryBg}`}>
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">Om oss</h2>
                  <div className="max-w-3xl space-y-4">
                    {storefront.about_text.split('\n\n').map((paragraph, i) => (
                      <p key={i} className="text-gray-600 leading-relaxed">{paragraph}</p>
                    ))}
                  </div>
                </div>
              </section>
            )

          // ═══════════ GALLERY ═══════════
          case 'gallery': {
            if (!showGallery) return null
            const images = storefront.gallery_images || []
            if (images.length === 0) return null
            return (
              <section key="gallery" id="gallery" className="py-16 sm:py-20">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">Bildgalleri</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {images.map((img: string, i: number) => (
                      <div key={i} className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                        <img src={img} alt={`Projekt ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )
          }

          // ═══════════ REVIEWS ═══════════
          case 'reviews':
            if (!showReviews || reviews.length === 0) return null
            return (
              <section key="reviews" id="reviews" className={`py-16 sm:py-20 ${c.primaryBg}`}>
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Vad våra kunder säger</h2>
                    {avgRating && (
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-400 text-lg">{'★'.repeat(Math.round(Number(avgRating)))}</span>
                        <span className="font-semibold text-gray-900">{avgRating}/5</span>
                        <span className="text-sm text-gray-500">({reviews.length} recensioner)</span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {reviews.map((review, i) => (
                      <div key={i} className="bg-white rounded-xl p-5 border border-gray-100">
                        <div className="text-yellow-400 mb-2">{'★'.repeat(review.review_rating)}</div>
                        {review.review_text && (
                          <p className="text-gray-600 text-sm mb-3">&ldquo;{review.review_text}&rdquo;</p>
                        )}
                        {review.customer?.name && (
                          <p className="text-sm font-medium text-gray-900">– {review.customer.name}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  {business.google_review_url && (
                    <div className="mt-6 text-center">
                      <a href={business.google_review_url} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-500 hover:text-gray-700 underline">
                        Visa alla recensioner på Google
                      </a>
                    </div>
                  )}
                </div>
              </section>
            )

          // ═══════════ CONTACT ═══════════
          case 'contact':
            return (
              <section key="contact" id="contact" className="py-16 sm:py-20">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">Kontakta oss</h2>
                  <div className={showContactForm ? 'grid md:grid-cols-2 gap-10' : 'max-w-xl'}>
                    {/* Contact info */}
                    <div className="space-y-4">
                      {phone && (
                        <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-center gap-3 text-gray-700 hover:text-gray-900">
                          <span className="text-xl">📞</span>
                          <span>{phone}</span>
                        </a>
                      )}
                      {business.contact_email && (
                        <a href={`mailto:${business.contact_email}`} className="flex items-center gap-3 text-gray-700 hover:text-gray-900">
                          <span className="text-xl">✉️</span>
                          <span>{business.contact_email}</span>
                        </a>
                      )}
                      {business.address && (
                        <div className="flex items-center gap-3 text-gray-700">
                          <span className="text-xl">📍</span>
                          <span>{business.address}</span>
                        </div>
                      )}
                      {business.service_area && (
                        <div className="flex items-center gap-3 text-gray-500 text-sm">
                          <span className="text-xl">🗺️</span>
                          <span>Serviceområde: {business.service_area}</span>
                        </div>
                      )}
                      {!showContactForm && phone && (
                        <a
                          href={`tel:${phone.replace(/\s/g, '')}`}
                          className={`inline-flex items-center justify-center px-6 py-3.5 rounded-xl text-base font-semibold text-white ${c.primary} ${c.primaryHover} transition-colors shadow-sm mt-4`}
                        >
                          Ring oss
                        </a>
                      )}
                    </div>

                    {/* Contact form (Professional+) */}
                    {showContactForm && (
                      <div className="bg-gray-50 rounded-2xl p-6">
                        {formSent ? (
                          <div className="text-center py-8">
                            <div className="text-4xl mb-3">✅</div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">Tack för din förfrågan!</h3>
                            <p className="text-gray-500">Vi återkommer till dig så snart som möjligt.</p>
                          </div>
                        ) : (
                          <form onSubmit={handleSubmitContact} className="space-y-4">
                            <h3 className="font-semibold text-gray-900 mb-1">Skicka en förfrågan</h3>
                            {/* Honeypot */}
                            <div className="hidden" aria-hidden="true">
                              <input type="text" name="_hp" tabIndex={-1} autoComplete="off" />
                            </div>
                            <div>
                              <input
                                type="text"
                                value={formName}
                                onChange={e => setFormName(e.target.value)}
                                required
                                placeholder="Ditt namn *"
                                className={`w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 ${c.ring} focus:border-transparent bg-white`}
                              />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <input
                                type="tel"
                                value={formPhone}
                                onChange={e => setFormPhone(e.target.value)}
                                placeholder="Telefon"
                                className={`w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 ${c.ring} focus:border-transparent bg-white`}
                              />
                              <input
                                type="email"
                                value={formEmail}
                                onChange={e => setFormEmail(e.target.value)}
                                placeholder="E-post"
                                className={`w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 ${c.ring} focus:border-transparent bg-white`}
                              />
                            </div>
                            <textarea
                              value={formMessage}
                              onChange={e => setFormMessage(e.target.value)}
                              placeholder="Beskriv vad du behöver hjälp med..."
                              rows={4}
                              className={`w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 ${c.ring} focus:border-transparent bg-white resize-none`}
                            />
                            {formError && <p className="text-sm text-red-600">{formError}</p>}
                            <button
                              type="submit"
                              disabled={formSending}
                              className={`w-full py-3.5 rounded-xl text-white font-semibold ${c.primary} ${c.primaryHover} transition-colors disabled:opacity-50`}
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
            )

          default:
            return null
        }
      })}

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <span>&copy; {new Date().getFullYear()} {business.business_name}</span>
          <a href="https://handymate.se" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 transition-colors">
            Skapad med Handymate
          </a>
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
