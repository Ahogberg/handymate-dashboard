/**
 * V8 Referral — Kodgenerering och upplösning
 *
 * Format: 3 bokstäver från företagsnamn + "-" + 4 siffror
 * Exempel: "BEE-4821"
 */

import { getServerSupabase } from '@/lib/supabase'

/**
 * Generera en unik referralkod baserad på företagsnamn.
 * Sparar till business_config.referral_code.
 */
export async function generateReferralCode(
  businessId: string,
  companyName: string
): Promise<string> {
  const supabase = getServerSupabase()

  // Ta 3 bokstäver från företagsnamnet (rensa bort icke-alfanumeriska)
  const letters = companyName
    .replace(/[^a-zA-ZåäöÅÄÖ]/g, '')
    .substring(0, 3)
    .toUpperCase()
    .padEnd(3, 'X') // Säkerställ 3 tecken

  // Försök generera unik kod (max 10 försök)
  for (let attempt = 0; attempt < 10; attempt++) {
    const digits = String(Math.floor(1000 + Math.random() * 9000)) // 4 siffror
    const code = `${letters}-${digits}`

    // Kontrollera att koden inte redan finns
    const { data: existing } = await supabase
      .from('business_config')
      .select('business_id')
      .eq('referral_code', code)
      .single()

    if (!existing) {
      // Spara koden
      await supabase
        .from('business_config')
        .update({ referral_code: code })
        .eq('business_id', businessId)

      return code
    }
  }

  // Fallback: använd business_id-baserad kod
  const fallback = `${letters}-${businessId.substring(4, 8).toUpperCase()}`
  await supabase
    .from('business_config')
    .update({ referral_code: fallback })
    .eq('business_id', businessId)

  return fallback
}

/**
 * Hitta referrer business_id från en referralkod.
 */
export async function resolveReferralCode(
  code: string
): Promise<string | null> {
  const supabase = getServerSupabase()

  const { data } = await supabase
    .from('business_config')
    .select('business_id')
    .eq('referral_code', code.toUpperCase())
    .single()

  return data?.business_id || null
}

/**
 * Kontrollera om ett företag har minst en konverterad referral.
 */
export async function hasAnyReferralConverted(
  businessId: string
): Promise<boolean> {
  const supabase = getServerSupabase()

  const { count } = await supabase
    .from('referrals')
    .select('*', { count: 'exact', head: true })
    .eq('referrer_business_id', businessId)
    .in('status', ['active', 'rewarded'])

  return (count || 0) > 0
}
