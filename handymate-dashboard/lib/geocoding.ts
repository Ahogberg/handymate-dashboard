/**
 * Reverse geocoding via Nominatim (OpenStreetMap) – gratis, inga API-nycklar
 * Cachar resultat i minnet för att undvika duplicerade anrop
 */

const cache = new Map<string, string>()

function cacheKey(lat: number, lng: number): string {
  // Avrunda till ~11m precision för caching
  return `${lat.toFixed(4)},${lng.toFixed(4)}`
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = cacheKey(lat, lng)
  if (cache.has(key)) return cache.get(key)!

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=sv`,
      {
        headers: { 'User-Agent': 'Handymate/1.0 (tidrapportering)' },
        signal: AbortSignal.timeout(5000),
      }
    )

    if (!res.ok) return null

    const data = await res.json()
    const addr = data.address
    if (!addr) return data.display_name || null

    // Bygg en kort adressrad
    const parts: string[] = []
    if (addr.road) {
      parts.push(addr.road + (addr.house_number ? ' ' + addr.house_number : ''))
    }
    if (addr.city || addr.town || addr.village || addr.municipality) {
      parts.push(addr.city || addr.town || addr.village || addr.municipality)
    }

    const address = parts.length > 0 ? parts.join(', ') : data.display_name || null
    if (address) cache.set(key, address)
    return address
  } catch {
    return null
  }
}
