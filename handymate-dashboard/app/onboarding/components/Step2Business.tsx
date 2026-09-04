'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ArrowRight,
  Clock,
  MapPin,
  Upload,
  Loader2,
  Mail,
  Lock,
  User,
  Phone,
  ChevronDown,
  Eye,
  EyeOff,
  Globe,
  Check,
} from 'lucide-react'
import OnboardingHeader from './OnboardingHeader'
import { OB_DOTS, OB_DOT_TOTAL } from '../constants'
import type { OnboardingFormData } from '../types-redesign'
import { TRADES } from '../constants'
import { normalizeWebsiteUrl, type ScrapedExtraction } from '@/lib/onboarding/website-scrape'
import { checkOrgNumber } from '@/lib/karin/org-number'
import { readStep2Draft, writeStep2Draft, clearStep2Draft } from '../step2-draft'

interface Step2Props {
  onNext: () => void
  onBack: () => void
  data: OnboardingFormData
  setData: (updater: (d: OnboardingFormData) => OnboardingFormData) => void
}

export default function Step2Business({ onNext, onBack, data, setData }: Step2Props) {
  const searchParams = useSearchParams()
  const refCode = searchParams?.get('ref') || ''
  const fileRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(data.logoDataUrl || null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showAccount, setShowAccount] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  /**
   * Andreas pilot-feedback (2026-06-03): "Måste visa vad som saknas för att
   * kunna gå vidare". attemptedNext sätts till true när användaren klickar
   * Nästa utan giltig form — då renderas en samlad lista med saknade fält
   * under knappen. Återställs när formen blir giltig.
   */
  const [attemptedNext, setAttemptedNext] = useState(false)

  // Fynd 1 — partner-attribution. Förifylls från ?ref= (nuvarande beteende),
  // men blir nu ett synligt, redigerbart fält istället för att bara skickas
  // med tyst i register-anropet. Valfritt — koden får ALDRIG blockera
  // registreringen, bara bekräftas/varnas om.
  const [referralCodeInput, setReferralCodeInput] = useState(refCode)
  const [partnerCheck, setPartnerCheck] = useState<{
    status: 'idle' | 'checking' | 'valid' | 'invalid'
    partnerName?: string
  }>({ status: 'idle' })

  async function validatePartnerCode(code: string) {
    const trimmed = code.trim()
    if (!trimmed) {
      setPartnerCheck({ status: 'idle' })
      return
    }
    setPartnerCheck({ status: 'checking' })
    try {
      const res = await fetch(`/api/partners/validate?code=${encodeURIComponent(trimmed)}`)
      const json = await res.json().catch(() => null)
      if (json?.valid) {
        setPartnerCheck({ status: 'valid', partnerName: json.partnerName })
      } else {
        setPartnerCheck({ status: 'invalid' })
      }
    } catch {
      // Nätverksfel — degradera tyst, koden skickas med ändå vid submit.
      setPartnerCheck({ status: 'idle' })
    }
  }

  // Validera direkt om koden kom förifylld från länken (?ref=) — annars
  // väntar vi på blur (se fältet nedan) för att inte spamma anrop per tecken.
  useEffect(() => {
    if (refCode) validatePartnerCode(refCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Hemsida-förgreningen (flyttad till BÖRJAN, 2026-07): aha-moment-
  // frågan visas nu FÖRST, innan kontot ens skapats — det är därför
  // extraktionen kan förifylla formuläret istället för att komma för sent.
  // Skrap-routen fungerar nu utan session (IP-baserad rate limit), se
  // app/api/onboarding/scrape-website/route.ts.
  // 'orgnr' → 'orgnrLookup' → 'question' → 'urlInput' → 'scraping' → 'form'
  // (förifyllt av Bolagsverket OCH/eller hemsidan) = normalflödet.
  // 'question' → Nej/Hoppa över → 'form' (tomt) = samma slutpunkt.
  // Redan besvarad (resume, eller tillbaka-navigering inom samma session)
  // hoppar rakt till 'form' — varken org.nr- eller hemsides-frågan ställs
  // två gånger. Org.nr frågas FÖRST (2026-08-15, backlog: Bolagsverket-
  // uppslag som start av onboarding) — den mest auktoritativa källan går
  // före hemsidans AI-gissning, så fill-only-empty-mönstret (se
  // applyExtraction nedan) automatiskt låter Bolagsverkets namn vinna.
  type WebPhase = 'form' | 'orgnr' | 'orgnrLookup' | 'question' | 'urlInput' | 'scraping'
  const [webPhase, setWebPhase] = useState<WebPhase>(
    () => (data.hasWebsite !== undefined ? 'form' : 'orgnr'),
  )
  const [webUrlInput, setWebUrlInput] = useState('')
  const [webInputError, setWebInputError] = useState('')
  const [webResultError, setWebResultError] = useState('')
  const [webFoundSummary, setWebFoundSummary] = useState<string[]>([])
  const [orgNumberInput, setOrgNumberInput] = useState(data.orgNumber || '')
  const [orgInputError, setOrgInputError] = useState('')
  const [orgResultError, setOrgResultError] = useState('')
  const [orgFoundSummary, setOrgFoundSummary] = useState<string[]>([])
  // Skiljer "uppslaget lyckades" från "fälten råkade redan vara ifyllda" —
  // company_profile_source ska bara bli 'bolagsverket' när Bolagsverket
  // faktiskt svarade, inte bara för att formuläret ser ifyllt ut.
  const [orgLookupSucceeded, setOrgLookupSucceeded] = useState(false)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const update = (updates: Partial<OnboardingFormData>) =>
    setData(d => ({ ...d, ...updates }))

  /**
   * Fynd 3 — hydrera ett sparat utkast (företagsnamn, org.nr, e-post) vid
   * mount. Skriver ALDRIG över fält som redan finns i state (resume/tillbaka-
   * navigering vinner alltid över sessionStorage-utkastet). Körs bara för en
   * ännu inte skapad användare — en redan registrerad kund har redan sin
   * riktiga data från DB.
   */
  useEffect(() => {
    if (data.businessId) return
    const draft = readStep2Draft()
    if (!draft) return
    const patch: Partial<OnboardingFormData> = {}
    if (draft.companyName && !data.companyName?.trim()) patch.companyName = draft.companyName
    if (draft.orgNumber && !data.orgNumber?.trim()) patch.orgNumber = draft.orgNumber
    if (draft.email && !data.email?.trim()) patch.email = draft.email
    if (Object.keys(patch).length > 0) update(patch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Fynd 3 — spara utkastet löpande medan användaren skriver, så en refresh
   * INNAN kontot skapats (t.ex. 401 på /api/onboarding-anropet i page.tsx)
   * inte längre raderar ifylld data. Lösenordet sparas ALDRIG.
   */
  useEffect(() => {
    if (data.businessId) return
    writeStep2Draft({
      companyName: data.companyName || '',
      orgNumber: data.orgNumber || '',
      email: data.email || '',
    })
  }, [data.businessId, data.companyName, data.orgNumber, data.email])

  /**
   * Best-effort — sparar website_url direkt OM en session redan finns
   * (resumande, redan registrerad användare som ser frågan igen). För en
   * helt ny användare finns ingen session än på denna punkt i flödet — då
   * 401:ar detta anrop tyst och website_url skickas istället med vid
   * register-anropet i handleSubmit (den primära persistensvägen, se där).
   */
  async function persistWebsiteUrl(url: string | null) {
    try {
      await fetch('/api/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { website_url: url } }),
      })
    } catch {
      // Silent — samma "aldrig fastna"-mönster som saveProgress i page.tsx.
      // website_url finns kvar i data.websiteUrl (skickas med vid register).
    }
  }

  /**
   * Bolagsverket-uppslag (2026-08-15) — samma fill-only-empty-disciplin som
   * applyExtraction nedan. Kommer FÖRE hemsides-scrapen i flödet, så när
   * scrapen (om den körs) når sina egna tomma-fält-kontroller är namn/adress
   * redan satta av den mer auktoritativa källan — ingen egen konfliktlösning
   * behövs.
   */
  function applyBolagsverketData(company: {
    name: string | null
    companyForm: string | null
    address: { street: string | null; postalCode: string | null; city: string | null } | null
  }) {
    const patch: Partial<OnboardingFormData> = {}
    if (company.name && !data.companyName?.trim()) patch.companyName = company.name
    if (company.companyForm && !data.companyForm?.trim()) patch.companyForm = company.companyForm
    if (company.address?.street && !data.addressStreet?.trim()) patch.addressStreet = company.address.street
    if (company.address?.postalCode && !data.addressPostalCode?.trim()) patch.addressPostalCode = company.address.postalCode
    if (company.address?.city && !data.addressCity?.trim()) patch.addressCity = company.address.city
    if (Object.keys(patch).length > 0) update(patch)
    setOrgLookupSucceeded(true)

    const found: string[] = []
    if (company.name) found.push('företagsnamn')
    if (company.companyForm) found.push('bolagsform')
    if (company.address) found.push('adress')
    setOrgFoundSummary(found)
  }

  /**
   * Slår upp org.nr hos Bolagsverket. ALDRIG blockerande — oavsett utfall
   * går flödet vidare till hemsides-frågan; org.nr-värdet är redan sparat
   * i data innan uppslaget ens startar, så ett misslyckat/långsamt/
   * ej-konfigurerat uppslag kan bara missa PREFYLLNINGEN, aldrig hindra
   * användaren från att fortsätta och fylla i manuellt.
   */
  async function runOrgLookup(formattedOrgNumber: string) {
    update({ orgNumber: formattedOrgNumber })
    setWebPhase('orgnrLookup')
    setOrgResultError('')
    const controller = new AbortController()
    // 25 s: OAuth-token + uppslag är två hopp mot Bolagsverket (se samma
    // resonemang vid runScrape).
    const clientTimeout = setTimeout(() => controller.abort(), 25_000)
    try {
      const res = await fetch('/api/onboarding/bolagsverket-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgNumber: formattedOrgNumber }),
        signal: controller.signal,
      })
      const json = await res.json().catch(() => null)
      if (!mountedRef.current) return
      if (json?.ok && json.data) {
        applyBolagsverketData(json.data)
      } else {
        setOrgResultError(json?.reason || 'Kunde inte slå upp företaget — fyll i manuellt istället.')
      }
    } catch {
      if (mountedRef.current) setOrgResultError('Kunde inte slå upp företaget — fyll i manuellt istället.')
    } finally {
      clearTimeout(clientTimeout)
    }
    if (mountedRef.current) setWebPhase('question')
  }

  function submitOrgNumber() {
    const check = checkOrgNumber(orgNumberInput)
    if (!check.valid) {
      setOrgInputError(check.error || 'Ogiltigt organisationsnummer')
      return
    }
    setOrgInputError('')
    runOrgLookup(check.formatted)
  }

  /** "Hoppa över" — inget att slå upp, gå rakt till hemsides-frågan. Org.nr fylls i manuellt längre ner i formuläret. */
  function skipOrgNumber() {
    setWebPhase('question')
  }

  /**
   * Förifyller ENDAST fält som fortfarande är tomma — skriver ALDRIG över
   * något användaren redan fyllt i. Mappar mot exakt de fält Step2Business
   * samlar in (se OnboardingFormData).
   */
  function applyExtraction(extracted: ScrapedExtraction) {
    const patch: Partial<OnboardingFormData> = {}
    if (extracted.business_name && !data.companyName?.trim()) {
      patch.companyName = extracted.business_name
    }
    if (extracted.org_number && !data.orgNumber?.trim()) {
      const formatted = formatOrg(extracted.org_number)
      if (formatted.length === 11) patch.orgNumber = formatted
    }
    if (extracted.phone && !data.phone?.trim()) {
      patch.phone = formatPhone(extracted.phone)
    }
    if (extracted.email && !data.email?.trim()) {
      patch.email = extracted.email
    }
    if (extracted.service_area && !data.area?.trim()) {
      patch.area = extracted.service_area
    }
    if (Object.keys(patch).length > 0) update(patch)

    // Rent informativ sammanfattning — visas i UI:t som bekräftelse på att
    // Matte faktiskt läste sidan, men dessa fält (utan onboarding-motsvarighet)
    // sparas inte separat.
    const found: string[] = []
    if (extracted.business_name) found.push('företagsnamn')
    if (extracted.org_number) found.push('org.nr')
    if (extracted.phone) found.push('telefon')
    if (extracted.email) found.push('e-post')
    if (extracted.service_area) found.push('område')
    if (extracted.services && extracted.services.length > 0) found.push(`${extracted.services.length} tjänster`)
    if (extracted.address) found.push('adress')
    if (extracted.opening_hours) found.push('öppettider')
    setWebFoundSummary(found)
  }

  async function runScrape(url: string) {
    setWebPhase('scraping')
    setWebResultError('')
    const controller = new AbortController()
    // 25 s, inte 10: servern får läsa sajten i upp till 8 s och sedan köra
    // Haiku-extraktionen. Det gamla taket på 10 s avbröt alltså anropet
    // från klientsidan medan servern fortfarande jobbade, och kunden fick
    // "kunde inte läsa sidan" för sajter som bara var lite långsamma.
    // Ligger under ruttens maxDuration (30 s) så servern hinner svara först.
    const clientTimeout = setTimeout(() => controller.abort(), 25_000)
    let normalizedUrl = url
    try {
      const res = await fetch('/api/onboarding/scrape-website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      })
      const json = await res.json().catch(() => null)
      normalizedUrl = json?.normalizedUrl || url
      if (!mountedRef.current) {
        // Komponenten hann avmonteras — spara ändå (best effort), rör ingen state.
        persistWebsiteUrl(normalizedUrl)
        return
      }
      if (json?.ok && json.extracted) {
        applyExtraction(json.extracted)
      } else {
        // Serverns skäl visas ALLTID, inte bara vid 429. Rutten svarar med
        // ett läsbart svenskt skäl för varje utfall ("Sidan innehöll för
        // lite text för att läsas", "Kunde inte nå sidan", ...) — att dölja
        // det bakom en generisk mening gjorde felet omöjligt att förstå
        // både för kunden och för oss.
        setWebResultError(json?.reason
          ? `${json.reason} — vi fyller i manuellt istället.`
          : 'Jag kunde inte läsa sidan — vi fyller i manuellt istället.')
      }
    } catch (err) {
      if (!mountedRef.current) {
        persistWebsiteUrl(normalizedUrl)
        return
      }
      const avbrutet = err instanceof Error && err.name === 'AbortError'
      setWebResultError(avbrutet
        ? 'Sidan tog för lång tid att läsa — vi fyller i manuellt istället.'
        : 'Jag kunde inte läsa sidan — vi fyller i manuellt istället.')
    } finally {
      clearTimeout(clientTimeout)
    }

    // Spara website_url OAVSETT om skrapningen lyckades (spec Del 3).
    // update() håller värdet i formuläret — persistWebsiteUrl är bara ett
    // best-effort-försök (se kommentar där); den riktiga sparningen sker via
    // register-anropet i handleSubmit när kontot skapas.
    update({ hasWebsite: true, websiteUrl: normalizedUrl })
    persistWebsiteUrl(normalizedUrl)
    // Blockerar aldrig: oavsett utfall går vi vidare till det (nu ev.
    // förifyllda) formuläret — aldrig fastna i mikro-flödet.
    if (mountedRef.current) setWebPhase('form')
  }

  /** "Nej" eller "Hoppa över" — inget att skrapa, gå rakt till (tomma) formuläret. */
  function answerNoWebsite() {
    update({ hasWebsite: false, websiteUrl: undefined })
    persistWebsiteUrl(null)
    setWebPhase('form')
  }

  /** Header-tillbaka inom mikro-flödet: ett steg bakåt i frågan, eller ut ur Step2 helt. */
  function goBackWebFlow() {
    if (webPhase === 'urlInput') { setWebPhase('question'); return }
    if (webPhase === 'scraping') { setWebPhase('urlInput'); return }
    if (webPhase === 'question') { setWebPhase('orgnr'); return }
    if (webPhase === 'orgnrLookup') { setWebPhase('orgnr'); return }
    onBack()
  }

  function submitWebsiteUrl() {
    const check = normalizeWebsiteUrl(webUrlInput)
    if (!check.ok) {
      setWebInputError(check.reason)
      return
    }
    setWebInputError('')
    runScrape(check.url)
  }

  const formatOrg = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 10)
    return digits.length > 6 ? `${digits.slice(0, 6)}-${digits.slice(6)}` : digits
  }

  const formatPhone = (v: string) => {
    let digits = v.replace(/\D/g, '')
    if (digits.startsWith('0')) digits = '46' + digits.substring(1)
    if (!digits.startsWith('46') && digits.length > 0) digits = '46' + digits
    if (digits.length === 0) return ''
    if (digits.length <= 2) return '+' + digits
    if (digits.length <= 4) return '+' + digits.substring(0, 2) + ' ' + digits.substring(2)
    if (digits.length <= 7) return '+' + digits.substring(0, 2) + ' ' + digits.substring(2, 4) + ' ' + digits.substring(4)
    return '+' + digits.substring(0, 2) + ' ' + digits.substring(2, 4) + ' ' + digits.substring(4, 7) + ' ' + digits.substring(7, 9) + ' ' + digits.substring(9, 11)
  }

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setLogoPreview(result)
      update({ logoDataUrl: result })
    }
    reader.readAsDataURL(f)
  }

  const validBusiness = !!(
    data.companyName?.trim() &&
    data.trade &&
    // Längdkontrollen släppte igenom feltryck. checkOrgNumber räknar
    // kontrollsiffran — se lib/karin/org-number.ts.
    checkOrgNumber(data.orgNumber).valid &&
    data.area?.trim() &&
    data.paymentMethod &&
    data.paymentNumber?.trim()
  )

  // Fynd 4a — enkel e-postformat-validering client-side, innan submit.
  // Servern (auth/route.ts) validerar också, men detta ger direkt svensk
  // feedback istället för att gå via ett API-anrop + rått Supabase-fel.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const validAccount = !!(
    data.contactName?.trim() &&
    data.email?.trim() &&
    EMAIL_RE.test(data.email.trim()) &&
    data.password &&
    data.password.length >= 6 &&
    data.phone &&
    data.phone.replace(/\D/g, '').length >= 10
  )

  // Already-registered users (auth-resume) skippar account-sektionen
  const alreadyRegistered = !!data.businessId

  const valid = validBusiness && (alreadyRegistered || validAccount)

  /**
   * Lista human-readable labels för fält som saknas. Endast obligatoriska
   * fält tas med — krav-listan matchar validBusiness + validAccount.
   */
  function getMissingFields(): string[] {
    const missing: string[] = []
    if (!data.companyName?.trim()) missing.push('företagsnamn')
    if (!data.trade) missing.push('bransch')
    // SAMMA validator som spärren (checkOrgNumber, kontrollsiffra) — inte en
    // egen längdkoll. De två gled isär (B7-fyndet 2026-08-09): ett org.nr med
    // rätt längd men fel kontrollsiffra gav "0 fält saknas" på en död knapp,
    // och användaren satt fast utan besked.
    if (!checkOrgNumber(data.orgNumber).valid) {
      missing.push(
        data.orgNumber?.length === 11
          ? 'org.nr — kontrollsiffran stämmer inte, kontrollera siffrorna'
          : 'org.nr (10 siffror)'
      )
    }
    if (!data.area?.trim()) missing.push('tjänsteområde')
    if (!data.paymentMethod) missing.push('betalmottagare-typ')
    if (!data.paymentNumber?.trim()) missing.push('betalmottagare-nummer')
    if (!alreadyRegistered) {
      if (!data.contactName?.trim()) missing.push('kontaktnamn')
      if (!data.email?.trim()) missing.push('e-post')
      else if (!EMAIL_RE.test(data.email.trim())) missing.push('giltig e-postadress')
      if (!data.password || data.password.length < 6) missing.push('lösenord (min 6 tecken)')
      if (!data.phone || data.phone.replace(/\D/g, '').length < 10) missing.push('privat mobilnummer')
    }
    return missing
  }

  async function handleSubmit() {
    if (submitting) return
    if (!valid) {
      setAttemptedNext(true)
      return
    }
    setAttemptedNext(false)
    setError('')

    if (alreadyRegistered) {
      // Kontot finns redan (resume/tillbaka-navigering) — hemsida-frågan är
      // redan besvarad (annars hade webPhase varit 'question' vid mount),
      // gå bara vidare.
      onNext()
      return
    }

    setSubmitting(true)
    try {
      const cleanPhone = '+' + (data.phone || '').replace(/\D/g, '')
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          data: {
            email: data.email,
            password: data.password,
            businessName: data.companyName,
            displayName: data.companyName,
            contactName: data.contactName,
            phone: cleanPhone,
            branch: data.trade,
            secondaryBranches: (data.secondaryTrades || []).filter(s => s && s !== data.trade),
            // F-skattsedeln har frågats i onboardingen sedan start (växeln
            // ovan) men värdet har ALDRIG skickats någonstans — kolumnen
            // f_skatt_registered stod därför på false för varje kund i
            // produktion, medan faktura- och ROT-koden läser den. Rättat
            // 2026-08-07; Karins bolagskalender behöver fältet dessutom för
            // att veta om preliminärskatten gäller.
            fSkatt: data.fSkatt !== false,
            serviceArea: data.area,
            orgNumber: data.orgNumber || null,
            bankgiro: data.paymentMethod === 'bankgiro' ? data.paymentNumber?.trim() : null,
            plusgiro: data.paymentMethod === 'plusgiro' ? data.paymentNumber?.trim() : null,
            bankAccount: data.paymentMethod === 'bankAccount' ? data.paymentNumber?.trim() : null,
            referralCode: referralCodeInput.trim() || undefined,
            // Primär persistensväg för website_url (hemsida-förgreningen,
            // flyttad till början) — frågan besvarades INNAN kontot fanns,
            // så det finns ingen session att spara via förrän nu.
            websiteUrl: data.hasWebsite ? (data.websiteUrl || null) : null,
            // Bolagsverket-uppslag (2026-08-15) — samma "ingen session än"-
            // logik: skickas med här, inte via en separat PUT.
            companyForm: data.companyForm || undefined,
            addressStreet: data.addressStreet || undefined,
            addressPostalCode: data.addressPostalCode || undefined,
            addressCity: data.addressCity || undefined,
            companyProfileSource: orgLookupSucceeded ? 'bolagsverket' : undefined,
          },
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Något gick fel')

      update({
        businessId: result.businessId,
        emailPending: !!result.emailConfirmationPending,
      })
      clearStep2Draft()
      onNext()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel vid registrering')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Hemsida-förgreningen: mikro-flöde ALLRA FÖRST i Step2, innan kontot
  // ens skapats ────────────────────────────────────────────────────────
  if (webPhase !== 'form') {
    return (
      <div className="ob-screen">
        <OnboardingHeader step={OB_DOTS.business} total={OB_DOT_TOTAL} onBack={goBackWebFlow} />
        <div className="ob-body" style={{ display: 'flex', flexDirection: 'column' }}>
          {webPhase === 'orgnr' && (
            <>
              <h1 className="ob-headline">Vad är ditt organisationsnummer?</h1>
              <p className="ob-sub">
                Matte slår upp företaget hos Bolagsverket och fyller i namn, adress och
                bolagsform åt dig.
              </p>
              <div className="ob-field">
                <label className="ob-label">Organisationsnummer</label>
                <input
                  className="ob-input"
                  placeholder="556677-8899"
                  autoFocus
                  inputMode="numeric"
                  value={orgNumberInput}
                  onChange={e => { setOrgNumberInput(formatOrg(e.target.value)); setOrgInputError('') }}
                  onKeyDown={e => e.key === 'Enter' && submitOrgNumber()}
                />
                {orgInputError && (
                  <p className="ob-help" style={{ color: '#B91C1C' }}>{orgInputError}</p>
                )}
                {orgResultError && (
                  <p className="ob-help" style={{ color: '#B91C1C' }}>{orgResultError}</p>
                )}
              </div>
            </>
          )}

          {webPhase === 'orgnrLookup' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px 0' }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  marginBottom: 16,
                  border: '3px solid var(--ob-primary-100)',
                  borderTopColor: 'var(--ob-primary-700)',
                  borderRadius: '50%',
                  animation: 'ob-spin 0.9s linear infinite',
                }}
              />
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ob-ink)' }}>
                Matte frågar Bolagsverket…
              </p>
              <p style={{ fontSize: 13, color: 'var(--ob-muted)', marginTop: 4 }}>
                Tar bara några sekunder
              </p>
            </div>
          )}

          {webPhase === 'question' && (
            <>
              <h1 className="ob-headline">Har du en hemsida?</h1>
              <p className="ob-sub">
                Har du redan en sajt läser Matte in den och förifyller det vi kan —
                annars hjälper vi dig komma igång ändå.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="ob-cta"
                  onClick={() => setWebPhase('urlInput')}
                >
                  <Globe size={18} /> Ja, här är adressen
                </button>
                <button
                  type="button"
                  className="ob-cta ghost"
                  onClick={answerNoWebsite}
                >
                  Nej, jag har ingen
                </button>
              </div>
            </>
          )}

          {webPhase === 'urlInput' && (
            <>
              <h1 className="ob-headline">Vad är adressen?</h1>
              <p className="ob-sub">Matte läser sidan och fyller i det han hittar.</p>
              <div className="ob-field">
                <label className="ob-label">Webbadress</label>
                <div style={{ position: 'relative' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: 14,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--ob-subtle)',
                    }}
                  >
                    <Globe size={18} />
                  </span>
                  <input
                    className="ob-input"
                    style={{ paddingLeft: 42 }}
                    placeholder="www.dittforetag.se"
                    autoFocus
                    value={webUrlInput}
                    onChange={e => { setWebUrlInput(e.target.value); setWebInputError('') }}
                    onKeyDown={e => e.key === 'Enter' && submitWebsiteUrl()}
                  />
                </div>
                {webInputError && (
                  <p className="ob-help" style={{ color: '#B91C1C' }}>{webInputError}</p>
                )}
              </div>
            </>
          )}

          {webPhase === 'scraping' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px 0' }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  marginBottom: 16,
                  border: '3px solid var(--ob-primary-100)',
                  borderTopColor: 'var(--ob-primary-700)',
                  borderRadius: '50%',
                  animation: 'ob-spin 0.9s linear infinite',
                }}
              />
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ob-ink)' }}>
                Matte läser din hemsida…
              </p>
              <p style={{ fontSize: 13, color: 'var(--ob-muted)', marginTop: 4 }}>
                Tar bara några sekunder
              </p>
            </div>
          )}
        </div>

        <div className="ob-footer">
          {webPhase === 'orgnr' && (
            <button type="button" className="ob-cta" onClick={submitOrgNumber} disabled={!orgNumberInput.trim()}>
              Slå upp <ArrowRight size={18} />
            </button>
          )}
          {webPhase === 'urlInput' && (
            <button type="button" className="ob-cta" onClick={submitWebsiteUrl} disabled={!webUrlInput.trim()}>
              Fortsätt <ArrowRight size={18} />
            </button>
          )}
          {(webPhase === 'orgnr' || webPhase === 'question' || webPhase === 'urlInput') && (
            <button
              type="button"
              className="ob-cta ghost"
              onClick={webPhase === 'orgnr' ? skipOrgNumber : answerNoWebsite}
              style={{ height: 44, fontSize: 13 }}
            >
              Hoppa över
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="ob-screen">
      <OnboardingHeader step={OB_DOTS.business} total={OB_DOT_TOTAL} onBack={onBack} />
      <div className="ob-body">
        <h1 className="ob-headline">Berätta om ditt företag</h1>
        <p className="ob-sub">
          <Clock size={14} /> Tar ca 60 sekunder
        </p>

        {/* Bolagsverket-uppslaget: samma diskreta bekräftelse-mönster som
            hemsides-scrapen nedan. Ingen låsning: fälten går att ändra. */}
        {(orgFoundSummary.length > 0 || orgResultError) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              background: orgResultError ? 'var(--ob-rose-50)' : 'var(--ob-green-50)',
              border: `1px solid ${orgResultError ? '#FECACA' : 'var(--ob-green-100)'}`,
              borderRadius: 'var(--ob-r-md)',
              padding: '10px 12px',
              fontSize: 13,
              color: orgResultError ? '#B91C1C' : 'var(--ob-green-600)',
              marginBottom: 16,
            }}
          >
            {orgResultError ? (
              <Globe size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            ) : (
              <Check size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            )}
            <span>
              {orgResultError
                ? orgResultError
                : <>Hämtat från Bolagsverket: <strong>{orgFoundSummary.join(', ')}</strong> — ändra gärna om något blivit fel.</>}
            </span>
          </div>
        )}

        {/* Hemsida-förgreningen: diskret bekräftelse att fälten nedan kom
            från kundens hemsida (eller vänligt fel om läsningen misslyckades)
            — visas bara om användaren faktiskt svarade "Ja" på frågan.
            Ingen låsning: fälten går att ändra precis som vanligt. */}
        {data.hasWebsite === true && (webFoundSummary.length > 0 || webResultError) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              background: webResultError ? 'var(--ob-rose-50)' : 'var(--ob-green-50)',
              border: `1px solid ${webResultError ? '#FECACA' : 'var(--ob-green-100)'}`,
              borderRadius: 'var(--ob-r-md)',
              padding: '10px 12px',
              fontSize: 13,
              color: webResultError ? '#B91C1C' : 'var(--ob-green-600)',
              marginBottom: 16,
            }}
          >
            {webResultError ? (
              <Globe size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            ) : (
              <Check size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            )}
            <span>
              {webResultError
                ? webResultError
                : <>Hämtat från din hemsida: <strong>{webFoundSummary.join(', ')}</strong> — ändra gärna om något blivit fel.</>}
            </span>
          </div>
        )}

        {error && (
          <div
            style={{
              background: 'var(--ob-rose-50)',
              border: '1px solid #FECACA',
              borderRadius: 'var(--ob-r-md)',
              padding: 12,
              fontSize: 13,
              color: '#B91C1C',
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {/* Logo */}
        <div className="ob-field">
          <label className="ob-label">Logotyp</label>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: '1.5px dashed var(--ob-border-strong)',
              borderRadius: 'var(--ob-r-lg)',
              padding: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              cursor: 'pointer',
              background: logoPreview ? 'var(--ob-surface)' : 'var(--ob-bg)',
              transition: 'all var(--ob-t-fast)',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 'var(--ob-r-md)',
                background: logoPreview
                  ? `url(${logoPreview}) center/cover`
                  : 'var(--ob-primary-50)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ob-primary-700)',
                fontWeight: 700,
                fontSize: 22,
                flexShrink: 0,
                border: logoPreview ? '1px solid var(--ob-border)' : 'none',
              }}
            >
              {!logoPreview &&
                (data.companyName?.[0]?.toUpperCase() || <Upload size={20} />)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ob-ink)' }}>
                {logoPreview ? 'Logotyp uppladdad' : 'Ladda upp logotyp'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ob-muted)', marginTop: 2 }}>
                {logoPreview ? 'Klicka för att byta' : 'PNG, JPG eller SVG'}
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleLogo}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {/* Company name */}
        <div className="ob-field">
          <label className="ob-label">Företagsnamn</label>
          <input
            className="ob-input"
            placeholder="t.ex. Andreas Bygg AB"
            value={data.companyName || ''}
            onChange={e => update({ companyName: e.target.value })}
          />
        </div>

        {/* Trade tiles */}
        <div className="ob-field">
          <label className="ob-label">Bransch</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {TRADES.map(t => {
              const TIcon = t.icon
              return (
                <button
                  type="button"
                  key={t.id}
                  className={`ob-tile ${data.trade === t.id ? 'selected' : ''}`}
                  onClick={() => update({
                    trade: t.id,
                    // Huvudbranschen får aldrig ligga kvar bland de extra —
                    // CHECK-villkoret i v93 avvisar raden, och en bransch som
                    // står två gånger är otydlig för den som läser den.
                    secondaryTrades: (data.secondaryTrades || []).filter(s => s !== t.id),
                  })}
                >
                  <span className="ob-tile-icon">
                    <TIcon size={22} />
                  </span>
                  <span className="ob-tile-label">{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Fler branscher — frivilligt, och visas först när huvudbranschen är
            vald så att valet inte konkurrerar med det viktigare. Sortimenten
            slås ihop; en hantverkare som gör både el och bygg ska inte behöva
            fylla halva artikelbanken för hand. */}
        {data.trade && (
          <div className="ob-field">
            <label className="ob-label">Gör du mer än så? (frivilligt)</label>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b' }}>
              Välj till fler områden så får du färdiga priser och artiklar för dem också.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TRADES.filter(t => t.id !== data.trade).map(t => {
                const vald = (data.secondaryTrades || []).includes(t.id)
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => update({
                      secondaryTrades: vald
                        ? (data.secondaryTrades || []).filter(s => s !== t.id)
                        : [...(data.secondaryTrades || []), t.id],
                    })}
                    style={{
                      minHeight: 44,
                      padding: '8px 14px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: vald ? 600 : 400,
                      border: `1px solid ${vald ? '#0F766E' : '#e2e8f0'}`,
                      background: vald ? '#f0fdfa' : '#fff',
                      color: vald ? '#0F766E' : '#334155',
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Org number */}
        <div className="ob-field">
          <label className="ob-label">Organisationsnummer</label>
          <input
            className="ob-input"
            placeholder="XXXXXX-XXXX"
            inputMode="numeric"
            value={data.orgNumber || ''}
            onChange={e => update({ orgNumber: formatOrg(e.target.value) })}
          />
          <p className="ob-help">
            Behövs för att skapa fakturor.{' '}
            <a
              href="https://www.bolagsverket.se/sok/sokforetagsfakta"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--ob-primary-700)', textDecoration: 'underline' }}
            >
              Vet du inte? Hitta hos Bolagsverket
            </a>
          </p>
        </div>

        {/* Betalmottagare för fakturor — TD-27 pre-flight */}
        <div className="ob-field">
          <label className="ob-label">Betalmottagare för fakturor</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {([
              { id: 'bankgiro' as const, label: 'Bankgiro' },
              { id: 'plusgiro' as const, label: 'Plusgiro' },
              { id: 'bankAccount' as const, label: 'Bankkonto' },
            ]).map(opt => (
              <button
                type="button"
                key={opt.id}
                onClick={() => update({ paymentMethod: opt.id, paymentNumber: '' })}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--ob-r-md)',
                  border: `1px solid ${data.paymentMethod === opt.id ? 'var(--ob-primary-700)' : 'var(--ob-border)'}`,
                  background: data.paymentMethod === opt.id ? 'var(--ob-primary-50)' : 'var(--ob-surface)',
                  color: data.paymentMethod === opt.id ? 'var(--ob-primary-700)' : 'var(--ob-ink)',
                  fontWeight: data.paymentMethod === opt.id ? 600 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all var(--ob-t-fast)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {data.paymentMethod && (
            <input
              className="ob-input"
              placeholder={
                data.paymentMethod === 'bankgiro'
                  ? '123-4567'
                  : data.paymentMethod === 'plusgiro'
                  ? '12 34 56-7'
                  : 'Clearing + kontonummer'
              }
              inputMode={data.paymentMethod === 'bankAccount' ? 'text' : 'numeric'}
              value={data.paymentNumber || ''}
              onChange={e => update({ paymentNumber: e.target.value })}
            />
          )}
          <p className="ob-help">
            Krävs för fakturor — Bokföringslagen kräver en betalmottagare på varje fakturahandling.
          </p>
        </div>

        {/* F-skatt */}
        <div className="ob-field">
          <div
            className="ob-toggle"
            onClick={() => update({ fSkatt: data.fSkatt === false })}
          >
            <div>
              <div className="ob-toggle-label">F-skattsedel</div>
              <div className="ob-toggle-help">Vi visar för kunderna att du är godkänd</div>
            </div>
            <div className={`ob-switch ${data.fSkatt !== false ? 'on' : ''}`} />
          </div>
        </div>

        {/* Area */}
        <div className="ob-field">
          <label className="ob-label">Tjänsteområde</label>
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ob-subtle)',
              }}
            >
              <MapPin size={18} />
            </span>
            <input
              className="ob-input"
              style={{ paddingLeft: 42 }}
              placeholder="t.ex. Stockholm eller 11122"
              value={data.area || ''}
              onChange={e => update({ area: e.target.value })}
            />
          </div>
          <p className="ob-help">Lisa berättar för kunder var du jobbar</p>
        </div>

        {/* Account section — endast om inte redan registrerad */}
        {!alreadyRegistered && (
          <>
            <div className="ob-divider" />

            <button
              type="button"
              onClick={() => setShowAccount(s => !s)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'transparent',
                border: 'none',
                padding: '0 0 12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ob-ink)' }}>
                  Skapa konto
                </div>
                <div style={{ fontSize: 12, color: 'var(--ob-muted)', marginTop: 2 }}>
                  {validAccount ? 'Klart — fortsätt nedan' : 'Vi behöver dina inloggningsuppgifter'}
                </div>
              </div>
              <ChevronDown
                size={20}
                style={{
                  color: 'var(--ob-muted)',
                  transform: showAccount ? 'rotate(180deg)' : 'none',
                  transition: 'transform var(--ob-t-fast)',
                }}
              />
            </button>

            {(showAccount || !validAccount) && (
              <div style={{ animation: 'ob-fade-in 280ms' }}>
                <div className="ob-field">
                  <label className="ob-label">Ditt namn</label>
                  <div style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: 14,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--ob-subtle)',
                      }}
                    >
                      <User size={18} />
                    </span>
                    <input
                      className="ob-input"
                      style={{ paddingLeft: 42 }}
                      placeholder="Förnamn Efternamn"
                      value={data.contactName || ''}
                      onChange={e => update({ contactName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="ob-field">
                  <label className="ob-label">E-post</label>
                  <div style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: 14,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--ob-subtle)',
                      }}
                    >
                      <Mail size={18} />
                    </span>
                    <input
                      className="ob-input"
                      style={{ paddingLeft: 42 }}
                      type="email"
                      placeholder="din@epost.se"
                      autoComplete="email"
                      value={data.email || ''}
                      onChange={e => update({ email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="ob-field">
                  <label className="ob-label">Privat mobilnummer</label>
                  <div style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: 14,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--ob-subtle)',
                      }}
                    >
                      <Phone size={18} />
                    </span>
                    <input
                      className="ob-input"
                      style={{ paddingLeft: 42 }}
                      type="tel"
                      placeholder="+46 70 123 45 67"
                      value={data.phone || ''}
                      onChange={e => update({ phone: formatPhone(e.target.value) })}
                    />
                  </div>
                  <p className="ob-help">Lisa kopplar vidare till detta nummer vid behov</p>
                </div>

                <div className="ob-field">
                  <label className="ob-label">Lösenord</label>
                  <div style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: 14,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--ob-subtle)',
                      }}
                    >
                      <Lock size={18} />
                    </span>
                    <input
                      className="ob-input"
                      style={{ paddingLeft: 42, paddingRight: 44 }}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minst 6 tecken"
                      autoComplete="new-password"
                      value={data.password || ''}
                      onChange={e => update({ password: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowPassword(v => !v) }}
                      aria-label={showPassword ? 'Dölj lösenord' : 'Visa lösenord'}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 32,
                        height: 32,
                        border: 0,
                        background: 'transparent',
                        color: 'var(--ob-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 'var(--ob-r-pill)',
                      }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Fynd 1 — partner-attribution, synlig och redigerbar (tidigare
                    tyst från ?ref=). Valfri — blockerar aldrig registreringen. */}
                <div className="ob-field">
                  <label className="ob-label">Partnerkod (valfritt)</label>
                  <input
                    className="ob-input"
                    placeholder="t.ex. P-1234"
                    value={referralCodeInput}
                    onChange={e => {
                      setReferralCodeInput(e.target.value)
                      if (partnerCheck.status !== 'idle') setPartnerCheck({ status: 'idle' })
                    }}
                    onBlur={() => validatePartnerCode(referralCodeInput)}
                  />
                  {partnerCheck.status === 'valid' && (
                    <p className="ob-help" style={{ color: 'var(--ob-green-600)' }}>
                      Hänvisad av {partnerCheck.partnerName} ✓
                    </p>
                  )}
                  {partnerCheck.status === 'invalid' && (
                    <p className="ob-help" style={{ color: 'var(--ob-amber-600)' }}>
                      Koden känns inte igen — kontrollera med din kontakt.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="ob-footer">
        {/* Validation-feedback (Andreas 2026-06-03): visa saknade fält
            efter att användaren försökt fortsätta utan giltig form. */}
        {attemptedNext && !valid && (() => {
          const missing = getMissingFields()
          if (missing.length === 0) return null
          return (
            <div
              role="alert"
              style={{
                marginBottom: 10,
                padding: '10px 12px',
                borderRadius: 'var(--ob-r-md)',
                background: 'var(--ob-rose-50)',
                border: '1px solid #FECACA',
                fontSize: 13,
                color: '#B91C1C',
              }}
            >
              <strong>Fyll i innan du fortsätter:</strong>{' '}
              {missing.join(', ')}
            </div>
          )
        })()}
        <button
          type="button"
          className="ob-cta"
          aria-disabled={!valid || submitting}
          onClick={handleSubmit}
          style={!valid && !submitting ? { opacity: 0.6, cursor: 'pointer' } : undefined}
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" /> Skapar konto…
            </>
          ) : !valid ? (
            <>
              Fortsätt → ({getMissingFields().length} {getMissingFields().length === 1 ? 'fält saknas' : 'fält saknas'})
            </>
          ) : (
            <>
              Fortsätt <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
