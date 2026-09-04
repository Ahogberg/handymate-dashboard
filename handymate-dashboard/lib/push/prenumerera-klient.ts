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

export type PushStatus = 'pa' | 'av' | 'blockerad'

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
    return existing ? 'pa' : 'av'
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
export async function prenumereraPaPush(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!('PushManager' in window) || !('serviceWorker' in navigator)) return false
  if (!PUBLIC_VAPID_KEY) return false

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
      if (permission !== 'granted') return false
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
      return true
    }

    console.warn('Push subscription failed: servern svarade', res.status)
    return false
  } catch (err) {
    console.warn('Push subscription failed:', err)
    return false
  }
}
