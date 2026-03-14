import { getServerSupabase } from '@/lib/supabase'

interface ExpoPushMessage {
  to: string
  title: string
  body: string
  sound?: 'default' | null
  data?: Record<string, unknown>
}

/**
 * Hämta alla Expo push-tokens för ett business.
 */
async function getExpoPushTokens(businessId: string): Promise<string[]> {
  const supabase = getServerSupabase()

  const { data, error } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('business_id', businessId)

  if (error) {
    console.error('Kunde inte hämta push-tokens:', error)
    return []
  }

  return (data || []).map((row) => row.token)
}

/**
 * Skicka push-notis till alla registrerade enheter för ett business.
 * Använder Expo Push API direkt (ingen SDK-dependency behövs).
 */
export async function sendExpoPushNotification(
  businessId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  const tokens = await getExpoPushTokens(businessId)

  if (tokens.length === 0) {
    console.log(`Inga push-tokens för business ${businessId}`)
    return
  }

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token,
    title,
    body,
    sound: 'default',
    data,
  }))

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Expo Push API fel:', errorText)
    }

    // Uppdatera last_used_at
    const supabase = getServerSupabase()
    await supabase
      .from('push_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .in('token', tokens)
  } catch (error) {
    console.error('Push-notis misslyckades:', error)
  }
}
