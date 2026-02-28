// Communications tools — SMS via 46elks, email via Resend
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

// ── SMS via 46elks ──────────────────────────────────────

export async function sendSms(
  supabase: SupabaseClient,
  businessId: string,
  params: { to: string; message: string },
  context: { businessName: string }
): Promise<ToolResult> {
  console.log(`[Tool] send_sms: to=${params.to}, length=${params.message.length}`)

  // Validate phone number format
  if (!params.to.startsWith("+")) {
    return {
      success: false,
      error: "Telefonnumret måste vara i E.164-format (börja med +46...)",
    }
  }

  // Check time — don't send SMS between 21:00 and 08:00
  const now = new Date()
  // Swedish timezone: UTC+1 (CET) or UTC+2 (CEST)
  const swedenOffset = isCEST(now) ? 2 : 1
  const swedenHour = (now.getUTCHours() + swedenOffset) % 24
  if (swedenHour >= 21 || swedenHour < 8) {
    return {
      success: false,
      error: `Det är ${swedenHour}:${String(now.getUTCMinutes()).padStart(2, "0")} i Sverige. SMS skickas inte mellan 21:00 och 08:00.`,
    }
  }

  // Message length check
  if (params.message.length > 1600) {
    return {
      success: false,
      error: `Meddelandet är ${params.message.length} tecken (max 1600)`,
    }
  }

  const elksUser = Deno.env.get("ELKS_API_USER")
  const elksPassword = Deno.env.get("ELKS_API_PASSWORD")

  if (!elksUser || !elksPassword) {
    return {
      success: false,
      error: "46elks API-uppgifter saknas i miljövariablerna",
    }
  }

  const senderName = (context.businessName || "Handymate").substring(0, 11)

  try {
    const response = await fetch("https://api.46elks.com/a1/sms", {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${elksUser}:${elksPassword}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        from: senderName,
        to: params.to,
        message: params.message,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: `46elks-fel: ${result.message || response.statusText}`,
      }
    }

    // Log SMS
    const logId = "sms_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    await supabase.from("sms_log").insert({
      sms_id: logId,
      business_id: businessId,
      direction: "outbound",
      phone_from: senderName,
      phone_to: params.to,
      message: params.message,
      status: "sent",
      elks_id: result.id,
      created_at: new Date().toISOString(),
    }).catch(() => {
      // Non-blocking — log failure shouldn't break the flow
      console.warn("[Tool] send_sms: Failed to log SMS to database")
    })

    return {
      success: true,
      data: {
        message: `SMS skickat till ${params.to}`,
        sms_id: result.id,
        cost: result.cost,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Nätverksfel vid SMS-utskick: ${err instanceof Error ? err.message : "Okänt fel"}`,
    }
  }
}

// ── Email via Resend ────────────────────────────────────

export async function sendEmail(
  _supabase: SupabaseClient,
  _businessId: string,
  params: { to: string; subject: string; body: string },
  context: { businessName: string; contactEmail: string }
): Promise<ToolResult> {
  console.log(`[Tool] send_email: to=${params.to}, subject="${params.subject}"`)

  // Basic email validation
  if (!params.to.includes("@")) {
    return { success: false, error: "Ogiltig e-postadress" }
  }

  const resendKey = Deno.env.get("RESEND_API_KEY")
  if (!resendKey) {
    return {
      success: false,
      error: "Resend API-nyckel saknas i miljövariablerna",
    }
  }

  const fromAddress = context.contactEmail
    ? `${context.businessName} <${context.contactEmail}>`
    : `${context.businessName} <noreply@handymate.se>`

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: params.to,
        subject: params.subject,
        text: params.body,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: `E-postfel: ${result.message || response.statusText}`,
      }
    }

    return {
      success: true,
      data: {
        message: `E-post skickad till ${params.to}`,
        email_id: result.id,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Nätverksfel vid e-post: ${err instanceof Error ? err.message : "Okänt fel"}`,
    }
  }
}

// ── Helpers ─────────────────────────────────────────────

/** Check if a date falls in Central European Summer Time */
function isCEST(date: Date): boolean {
  const year = date.getFullYear()
  // CEST starts last Sunday in March, ends last Sunday in October
  const marchLast = new Date(year, 2, 31)
  const cestStart = new Date(
    year, 2, 31 - marchLast.getDay(), 2, 0, 0
  )
  const octLast = new Date(year, 9, 31)
  const cestEnd = new Date(
    year, 9, 31 - octLast.getDay(), 3, 0, 0
  )
  return date >= cestStart && date < cestEnd
}
