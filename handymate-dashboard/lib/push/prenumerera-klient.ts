/**
 * prenumerera-klient — EN gemensam push-prenumerationslogik för klienten.
 *
 * Bakgrund (docs/audits/AUTOPILOT_REVISION_2026-09-04.md, avsnitt 1): innan
 * detta pass fanns samma logik bara inne i components/PWAInstallBanner.tsx,
 * och ingen annanstans gick att slå på notiser medvetet. Den här modulen
 * bryts ut så att BÅDE bannern och "Notiser"-kortet i inställningarna
 * (app/dashboard/settings/page.tsx) kör exakt samma kod — ingen dubblerad
 * `pushManager.subscribe`.
 *
 * Ingen 'use client'-direktiv här — det här är en vanlig modul, inte en
 * komponent. Den använder bara webbläsar-API:er (window/navigator/
 * localStorage) och får därför bara anropas från klientkod.
 */

// _v2 (Pass A, 2026-09-04): tabellen push_subscriptions saknades i produktion
// fram till v198 (2 sep) — varje prenumerationsförsök gav 500, men den gamla
// nyckeln sattes ändå oavsett svar, så pilotens webbläsare TRODDE sig
// prenumererad medan servern hade ingenting, och flaggan stoppade alla nya
// försök. Nytt namn = alla som låstes då får en ny chans automatiskt.
export const PUSH_SUBSCRIBED_KEY = 'handymate_push_subscribed_v2'

export const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

/** iOS kräver att appen är installerad (hemskärmen) för att push ska fungera
 *  alls — Android och desktop-Chrome klarar push i en vanlig flik (CLAUDE.md). */
export function arIOS(): boolean {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from(Array.from(rawData).map(c => c.charCodeAt(0)))
}

/**
 * 'pa'        — webbläsaren HAR en prenumeration och servern känner till den.
 * 'ur_synk'   — webbläsaren har en, servern har ingen. Ingen push når fram.
 * 'av'        — ingen prenumeration.
 * 'blockerad' — personen har nekat notiser i webbläsaren.
 *
 * 'ur_synk' finns för att "Notiser var redan på" och "noll rader i
 * push_subscriptions" båda var sanna samtidigt 2026-09-10. Statusen läste
 * `reg.pushManager.getSubscription()` — webbläsaren — och frågade aldrig
 * servern. En webbläsare kan bära en fullt giltig prenumeration som servern
 * inte känner till, och då skickas ingen push, eftersom avsändaren läser sin
 * egen databas. Två vägar dit har hänt här: prenumerationen postades till en
 * annan instans (repot bygger två Vercel-projekt mot olika databaser), eller
 * POST:en misslyckades tyst (tabellen saknades före v198).
 *
 * Läget är läkbart utan att personen gör något: `prenumereraPaPush` postar om
 * även en BEFINTLIG prenumeration, och rutten upsertar.
 */
export type PushStatus = 'pa' | 'ur_synk' | 'av' | 'blockerad'

/** Serverns svar från GET /api/push/status. */
export interface PushServerStatus {
  registrerad: boolean
  enheter: number
  pa_kontot: number
  osaker?: boolean
}

/**
 * Frågar servern om DEN känner till en prenumeration för den inloggade.
 * Nätfel eller ett oväntat svar räknas som "inte registrerad" — en falsk
 * "på" är precis felet den här funktionen finns för att avskaffa.
 */
export async function hamtaServerStatus(): Promise<PushServerStatus> {
  try {
    const res = await fetch('/api/push/status')
    if (!res.ok) return { registrerad: false, enheter: 0, pa_kontot: 0, osaker: true }
    const data = (await res.json()) as PushServerStatus
    return { ...data, registrerad: data.registrerad === true }
  } catch {
    return { registrerad: false, enheter: 0, pa_kontot: 0, osaker: true }
  }
}

/**
 * Varför en prenumeration inte gick igenom.
 *
 * 2026-09-10: `prenumereraPaPush` returnerade ett naket `false` för sex
 * genuint olika skäl, och båda ytorna sa samma sak för alla — "Kunde inte
 * aktivera notiser — försök igen". Är skälet att VAPID-nyckeln saknas i
 * bygget är det rådet falskt: knappen kan aldrig lyckas hur många gånger den
 * än trycks, och felet är vårt, inte kundens. Mot databasen samma dag hade
 * push_subscriptions noll rader i hela historien — vilket är precis vad ett
 * tyst, oåtgärdbart fel ser ut som.
 */
export type PushMisslyckande =
  | 'stods_ej'           // webbläsaren kan inte push alls
  | 'ej_konfigurerad'    // VAPID-nyckeln saknas i bygget — VÅRT fel
  | 'nekad'              // personen sa nej i webbläsarens dialog
  | 'servern_nekade'     // POST /api/push/subscribe svarade fel
  | 'ovantat_fel'

export type PushPrenumeration =
  | { ok: true }
  | { ok: false; skal: PushMisslyckande; detalj?: string }

/** Text att visa för kunden. Aldrig "försök igen" när ett nytt försök är omöjligt. */
export const PUSH_MISSLYCKANDE_TEXT: Record<PushMisslyckande, string> = {
  stods_ej: 'Den här webbläsaren stödjer inte notiser. Installera appen på hemskärmen och försök därifrån.',
  ej_konfigurerad: 'Notiser är inte påslagna hos oss ännu — det är inget du kan göra åt. Vi har fått larmet och hör av oss.',
  nekad: 'Du avvisade notiser i webbläsarens dialog. Tillåt dem i webbläsarens inställningar för den här sidan och försök igen.',
  servern_nekade: 'Vi kunde inte spara din enhet. Försök igen om en stund.',
  ovantat_fel: 'Något gick fel när notiser skulle slås på. Försök igen.',
}

/**
 * Läser nuvarande push-status utan att be om tillstånd eller prenumerera.
 * Används av "Notiser"-kortet i inställningarna för att visa "På" / "Av" /
 * "Blockerad i webbläsaren" innan kunden trycker på något.
 */
export async function hamtaPushStatus(): Promise<PushStatus> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'av'
  if (Notification.permission === 'denied') return 'blockerad'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'av'

  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (!existing) return 'av'
    // Webbläsaren räcker INTE. Servern skickar från sin egen databas, så det
    // är den som avgör om en push kan nå fram. Se PushStatus ovan.
    const server = await hamtaServerStatus()
    return server.registrerad ? 'pa' : 'ur_synk'
  } catch {
    return 'av'
  }
}

/**
 * Prenumererar på push för den inloggade användaren. Samma kod för bannern
 * och inställningssidan.
 *
 * Returnerar `true` bara när prenumerationen faktiskt finns hos servern
 * (eller redan fanns i webbläsaren) — `PUSH_SUBSCRIBED_KEY` sätts BARA då.
 * Ett kvitto utan täckning (svar aldrig läst) var precis buggen som gjorde
 * att ingen pilot någonsin fick en push: flaggan sattes ändå, och stoppade
 * sedan alla framtida försök. Vid fel: `console.warn`, flaggan lämnas orörd
 * så nästa besök försöker igen.
 */
export async function prenumereraPaPush(): Promise<PushPrenumeration> {
  if (typeof window === 'undefined') return { ok: false, skal: 'stods_ej' }
  if (!('PushManager' in window) || !('serviceWorker' in navigator)) return { ok: false, skal: 'stods_ej' }
  // VÅRT fel, inte kundens — och ett nytt försök hjälper aldrig.
  if (!PUBLIC_VAPID_KEY) {
    console.warn('Push subscription omöjlig: NEXT_PUBLIC_VAPID_PUBLIC_KEY saknas i bygget')
    return { ok: false, skal: 'ej_konfigurerad' }
  }

  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()

    // En befintlig webbläsarprenumeration är INTE sanningen. Servern är.
    //
    // Varje pilot som försökte före v198 har exakt det här läget: webbläsaren
    // bär en riktig, native prenumeration, men servern har ingen rad — POST:en
    // gav 500 för att tabellen inte fanns. Sätts flaggan här på "existing"
    // ensamt låses de om igen, nu med v2-nyckeln, och hela poängen med det
    // nya nyckelnamnet går förlorad. Därför skickas även en befintlig
    // prenumeration till servern (rutten gör upsert, så det är idempotent),
    // och flaggan sätts först när servern sagt ja.
    let subscription = existing
    if (!subscription) {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return { ok: false, skal: 'nekad' }
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
      })
    }

    const { endpoint, keys } = subscription.toJSON() as {
      endpoint: string
      keys: { p256dh: string; auth: string }
    }

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
    })

    if (res.ok) {
      localStorage.setItem(PUSH_SUBSCRIBED_KEY, '1')
      return { ok: true }
    }

    console.warn('Push subscription failed: servern svarade', res.status)
    return { ok: false, skal: 'servern_nekade', detalj: String(res.status) }
  } catch (err) {
    console.warn('Push subscription failed:', err)
    return { ok: false, skal: 'ovantat_fel', detalj: err instanceof Error ? err.message : undefined }
  }
}
