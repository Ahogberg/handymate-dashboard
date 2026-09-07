'use client'

/**
 * Inställningar → Företag → "Så ser dina kunder dig" (2026-09-07).
 *
 * ═══ VARFÖR SIDAN FINNS ═══
 *
 * Varumärkeslagret (lib/branding, lib/email-templates) gör att allt vi
 * skickar åt hantverkaren går i hens namn: logotyp, accentfärg, kontakt-
 * uppgifter. Men ett varumärke man inte kan SE är ett påstående. Den här
 * sidan visar hela kundresan — sju kontaktpunkter från offertmail till
 * omdömesförfrågan — renderade av exakt samma byggare som sändvägarna,
 * med reglagen bredvid. Ändra färgen, se alla sju följa med.
 *
 * Exempeldata (Anna Lindqvist / Badrumsrenovering) i alla vyer: stabilt,
 * tydligt markerat, aldrig en riktig kunds siffror. Mail och SMS hämtas
 * från POST /api/settings/kundvy/preview; sidorna (offertsida, portal,
 * jobbpass) är React-mockuper i components/settings/kundvy/mocks.tsx.
 *
 * Sparning: accent_color och quote_template_style skrivs direkt i
 * business_config (samma mönster som quote-style-sidan); logotypen går via
 * POST /api/business/logo som själv uppdaterar logo_url. Ägare/admin bara.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { useToast } from '@/components/Toast'
import { isDemoBusinessId } from '@/lib/demo/is-demo-client'
import { normalizeAccentColor } from '@/lib/branding/get-branding'
import { sanitizeSenderId } from '@/lib/sms/sender-id'
import { readyRows, smsSignatur, type KundvyPreview, type TouchpointId } from '@/lib/branding/kundvy'
import type { TemplateStyle } from '@/lib/quote-templates/meta'
import BrandControls from '@/components/settings/kundvy/BrandControls'
import ReadyMeter from '@/components/settings/kundvy/ReadyMeter'
import TouchpointCards from '@/components/settings/kundvy/TouchpointCards'
import PreviewModal from '@/components/settings/kundvy/PreviewModal'
import { StampNote, DemoBanner } from '@/components/settings/kundvy/Notes'
import BookingLinkCard from '@/components/settings/kundvy/BookingLinkCard'

type ConfigRow = Record<string, unknown> & {
  business_name?: string | null
  display_name?: string | null
  logo_url?: string | null
  accent_color?: string | null
  quote_template_style?: string | null
  google_review_url?: string | null
  /** sql/v222 — saknas kolumnen (migration ej körd) är fältet undefined → AV. */
  booking_visit_free?: boolean | null
}

const DEMO_HIDE_KEY = 'kundvy_demo_banner_hidden'

export default function KundvyPage() {
  const router = useRouter()
  const business = useBusiness()
  const { isOwnerOrAdmin, loading: userLoading } = useCurrentUser()
  const toast = useToast()

  const [cfg, setCfg] = useState<ConfigRow | null>(null)
  const [laddar, setLaddar] = useState(true)
  const [accent, setAccent] = useState<string>(normalizeAccentColor(null))
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [templateStyle, setTemplateStyle] = useState<TemplateStyle>('modern')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [previews, setPreviews] = useState<Record<string, KundvyPreview>>({})
  const [previewLoading, setPreviewLoading] = useState(false)
  const [open, setOpen] = useState<TouchpointId | null>(null)
  const [sendingTest, setSendingTest] = useState(false)
  const [demoHidden, setDemoHidden] = useState(true)
  const logoPickerRef = useRef<() => void>(() => {})
  const accentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const registerLogoPicker = useCallback((fn: () => void) => { logoPickerRef.current = fn }, [])

  useEffect(() => {
    if (!userLoading && !isOwnerOrAdmin) router.replace('/dashboard/settings')
  }, [userLoading, isOwnerOrAdmin, router])

  useEffect(() => {
    try { setDemoHidden(window.localStorage.getItem(DEMO_HIDE_KEY) === '1') } catch { setDemoHidden(false) }
  }, [])

  // ── Läs in företagets rad ────────────────────────────────────────────
  useEffect(() => {
    if (!business?.business_id) return
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('business_config')
        .select('*')
        .eq('business_id', business.business_id)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) {
        toast.error('Kunde inte läsa företagets inställningar')
        setLaddar(false)
        return
      }
      const row = data as ConfigRow
      setCfg(row)
      setAccent(normalizeAccentColor(row.accent_color))
      setLogoUrl(row.logo_url || null)
      setTemplateStyle((row.quote_template_style as TemplateStyle) || 'modern')
      setLaddar(false)
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.business_id])

  // ── Förhandsvisningarna följer reglagen (debounce 300 ms) ────────────
  useEffect(() => {
    if (laddar || !cfg) return
    let cancelled = false
    setPreviewLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/settings/kundvy/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accent_color: accent, logo_url: logoUrl }),
        })
        if (!res.ok) throw new Error(String(res.status))
        const json = await res.json() as { previews: KundvyPreview[] }
        if (cancelled) return
        const map: Record<string, KundvyPreview> = {}
        for (const p of json.previews) map[p.id] = p
        setPreviews(map)
      } catch {
        if (!cancelled) toast.error('Förhandsvisningen kunde inte byggas')
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laddar, cfg, accent, logoUrl])

  // ── Sparning ─────────────────────────────────────────────────────────
  const saveAccent = useCallback(async (hex: string) => {
    if (!business?.business_id) return
    const { error } = await supabase
      .from('business_config')
      .update({ accent_color: hex })
      .eq('business_id', business.business_id)
    if (error) toast.error('Färgen kunde inte sparas')
    else setCfg((c) => (c ? { ...c, accent_color: hex } : c))
  }, [business?.business_id, toast])

  function handleAccentChange(hex: string) {
    const normalized = normalizeAccentColor(hex)
    setAccent(normalized)
    if (accentSaveTimer.current) clearTimeout(accentSaveTimer.current)
    accentSaveTimer.current = setTimeout(() => { void saveAccent(normalized) }, 500)
  }

  async function handleTemplateChange(style: TemplateStyle) {
    if (!business?.business_id || style === templateStyle) return
    setSavingTemplate(true)
    const { error } = await supabase
      .from('business_config')
      .update({ quote_template_style: style })
      .eq('business_id', business.business_id)
    if (error) toast.error('Mallen kunde inte sparas')
    else {
      setTemplateStyle(style)
      setCfg((c) => (c ? { ...c, quote_template_style: style } : c))
    }
    setSavingTemplate(false)
  }

  async function handleLogo(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logotypen får vara högst 2 MB')
      return
    }
    setUploadingLogo(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/business/logo', { method: 'POST', body: form })
      const json = await res.json().catch(() => ({})) as { logo_url?: string; error?: string }
      if (!res.ok || !json.logo_url) throw new Error(json.error || 'Uppladdningen misslyckades')
      setLogoUrl(json.logo_url)
      setCfg((c) => (c ? { ...c, logo_url: json.logo_url } : c))
      toast.success('Logotypen är uppladdad')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Uppladdningen misslyckades')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function sendTest(id: TouchpointId) {
    setSendingTest(true)
    try {
      const res = await fetch('/api/settings/kundvy/testmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kontaktpunkt: id }),
      })
      const json = await res.json().catch(() => ({})) as { to?: string; error?: string }
      if (!res.ok) throw new Error(json.error || 'Mailet kunde inte skickas')
      toast.success(`Testmail skickat till ${json.to}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Mailet kunde inte skickas')
    } finally {
      setSendingTest(false)
    }
  }

  // ── Härledda värden ──────────────────────────────────────────────────
  // Samma ordning som brandingFromConfig — det här är namnet kunden ser i mail och SMS.
  const businessName = (cfg?.business_name || cfg?.display_name || business?.business_name || 'Ditt företag').trim()
  const brand = useMemo(() => ({ businessName, accent, logoUrl }), [businessName, accent, logoUrl])
  const rows = useMemo(
    () => readyRows({ ...(cfg ?? {}), accent_color: accent, logo_url: logoUrl }),
    [cfg, accent, logoUrl],
  )
  const reviewUrl = (cfg?.google_review_url as string | null | undefined) || null
  const isDemo = isDemoBusinessId(business?.business_id)

  if (userLoading || !isOwnerOrAdmin || laddar) {
    return (
      <div className="p-6 flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Laddar…
      </div>
    )
  }

  return (
    // pt på mobil: sidmenyknappen ligger fast uppe till vänster (48 px + 16 px) under md.
    <div className="p-4 pt-[76px] sm:p-6 sm:pt-[76px] md:pt-6 max-w-6xl mx-auto">
      {/* Sidhuvud */}
      <div className="flex items-start gap-3 mb-5">
        <Link href="/dashboard/settings" className="mt-1 text-slate-500 hover:text-slate-900" aria-label="Tillbaka till inställningar">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-slate-500 mb-0.5">Inställningar › Företag</div>
          <h1 className="text-[22px] sm:text-[26px] font-bold text-slate-900 m-0 leading-tight">Så ser dina kunder dig</h1>
          <p className="text-slate-500 text-sm mt-1 m-0 max-w-2xl">
            Ladda upp logotypen och välj färg. Allt vi skickar åt dig, från offert till omdömesförfrågan, går i {businessName}:s namn.
          </p>
        </div>
        <button
          type="button"
          disabled={sendingTest}
          onClick={() => sendTest('offertmail')}
          className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-[13px] font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
        >
          <Send className="w-3.5 h-3.5" />
          {sendingTest ? 'Skickar…' : 'Skicka ett testmail till mig'}
        </button>
      </div>

      {isDemo && !demoHidden && (
        <div className="mb-5">
          <DemoBanner onHide={() => { setDemoHidden(true); try { window.localStorage.setItem(DEMO_HIDE_KEY, '1') } catch { /* privat läge */ } }} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* Reglagen */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-6 self-start">
            <BrandControls
              businessName={businessName}
              logoUrl={logoUrl}
              accent={accent}
              templateStyle={templateStyle}
              smsSignatur={smsSignatur(businessName).trim()}
              uploadingLogo={uploadingLogo}
              savingTemplate={savingTemplate}
              onPickLogo={handleLogo}
              onAccentChange={handleAccentChange}
              onTemplateChange={handleTemplateChange}
              registerLogoPicker={registerLogoPicker}
            />
            <ReadyMeter rows={rows} onLocalAction={(id) => { if (id === 'logo') logoPickerRef.current() }} />
            {business?.business_id && (
              <BookingLinkCard
                businessId={business.business_id}
                visitFree={cfg ? cfg.booking_visit_free === true : null}
                onVisitFreeChange={(v) => setCfg((c) => (c ? { ...c, booking_visit_free: v } : c))}
              />
            )}
          </div>

          {/* Kundresan */}
          <div className="flex flex-col gap-4 min-w-0">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900 m-0">Kundresan i din färg</h2>
              <p className="text-[12px] text-slate-500 mt-0.5 m-0">
                Exempeldata: Anna Lindqvist, badrumsrenovering. Tryck på ett kort för stor vy.
              </p>
            </div>
            <TouchpointCards brand={brand} smsSender={sanitizeSenderId(businessName)} reviewUrl={reviewUrl} onOpen={setOpen} />
            <StampNote />
          </div>
      </div>

      <button
        type="button"
        disabled={sendingTest}
        onClick={() => sendTest('offertmail')}
        className="md:hidden mt-5 w-full h-12 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white text-[14px] font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
      >
        <Send className="w-4 h-4" />
        {sendingTest ? 'Skickar…' : 'Skicka ett testmail till mig'}
      </button>

      {open && (
        <PreviewModal
          id={open}
          brand={brand}
          preview={previews[open]}
          previewLoading={previewLoading}
          sendingTest={sendingTest}
          onNavigate={setOpen}
          onSendTest={sendTest}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
