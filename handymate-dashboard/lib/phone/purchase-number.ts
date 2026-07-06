/**
 * Köp + koppla ett 46elks-nummer till ett företag. Extraherad ur
 * app/api/onboarding/phone (delas nu med onboarding/phone/reserve).
 * Idempotent: har företaget redan assigned_phone_number returneras det.
 * Sätter voice_start-webhooken VID KÖPET → numret är aktivt direkt.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PurchaseResult {
  ok: boolean
  phone_number?: string
  /** 46elks nummer-id — behövs av onboarding/phone-routens svarsformat */
  number_id?: string
  already_assigned?: boolean
  error?: string
  /** Rå feltext från 46elks/databasen (för routens `details`-fält) */
  details?: string
}

export async function purchaseAndAssignNumber(
  supabase: SupabaseClient,
  businessId: string
): Promise<PurchaseResult> {
  // 1. Idempotens: redan tilldelat?
  const { data: biz } = await supabase
    .from('business_config')
    .select('assigned_phone_number, elks_number_id')
    .eq('business_id', businessId)
    .maybeSingle()
  if (biz?.assigned_phone_number) {
    return {
      ok: true,
      phone_number: biz.assigned_phone_number,
      number_id: biz.elks_number_id || undefined,
      already_assigned: true,
    }
  }

  // 2. Env-check → ärligt otillgängligt (dev utan 46elks)
  const ELKS_API_USER = process.env.ELKS_API_USER
  const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  if (!ELKS_API_USER || !ELKS_API_PASSWORD) {
    return { ok: false, error: 'elks_env_missing' }
  }

  // 3. Köp nummer från 46elks (flyttat oförändrat från app/api/onboarding/phone)
  console.log('Purchasing number from 46elks for onboarding...')

  const purchaseResponse = await fetch('https://api.46elks.com/a1/numbers', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      country: 'se',
      voice_start: `${APP_URL}/api/voice/incoming`,
      sms_url: `${APP_URL}/api/sms/incoming`
    }).toString()
  })

  if (!purchaseResponse.ok) {
    const errorText = await purchaseResponse.text()
    console.error('46elks purchase error:', errorText)
    return { ok: false, error: '46elks_purchase_failed', details: errorText }
  }

  const numberData = await purchaseResponse.json()
  console.log('Number purchased:', numberData)

  // Spara numret i business_config
  const { error: updateError } = await supabase
    .from('business_config')
    .update({
      assigned_phone_number: numberData.number,
      elks_number_id: numberData.id,
      call_recording_enabled: true,
      call_recording_consent_message: 'Detta samtal kan komma att spelas in för kvalitets- och utbildningsändamål.',
    })
    .eq('business_id', businessId)

  if (updateError) {
    console.error('Database update error:', updateError)
    // Försök ta bort numret från 46elks
    await fetch(`https://api.46elks.com/a1/numbers/${numberData.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64')
      }
    })

    return { ok: false, error: 'db_save_failed', details: updateError.message }
  }

  return { ok: true, phone_number: numberData.number, number_id: numberData.id }
}
