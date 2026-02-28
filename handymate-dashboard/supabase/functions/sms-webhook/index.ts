// SMS Webhook — receives inbound SMS from 46elks and triggers the AI agent
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // 46elks sends form-encoded data
    const formData = await req.formData()
    const from = formData.get("from") as string
    const to = formData.get("to") as string
    const message = formData.get("message") as string

    console.log(`[SmsWebhook] Incoming SMS from ${from} to ${to}: "${message?.substring(0, 100)}"`)

    if (!from || !message) {
      return new Response(JSON.stringify({ error: "Missing from or message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Find business by assigned phone number
    const { data: business } = await supabase
      .from("business_config")
      .select("business_id, business_name")
      .eq("assigned_phone_number", to)
      .single()

    if (!business) {
      console.warn(`[SmsWebhook] No business found for number: ${to}`)
      return new Response(
        JSON.stringify({ received: true, handled: false }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    // Load conversation history for context
    const { data: history } = await supabase
      .from("sms_conversation")
      .select("role, content, created_at")
      .eq("business_id", business.business_id)
      .eq("phone_number", from)
      .order("created_at", { ascending: false })
      .limit(10)

    const conversationHistory = (history || [])
      .reverse()
      .map((msg: { role: string; content: string; created_at: string }) => `[${msg.role}] ${msg.content}`)
      .join("\n")

    // Store inbound message
    await supabase.from("sms_conversation").insert({
      business_id: business.business_id,
      phone_number: from,
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
    })

    // Store in conversations table
    const convId =
      "conv_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    await supabase.from("conversations").insert({
      conversation_id: convId,
      business_id: business.business_id,
      type: "sms",
      phone_number: from,
      content: message,
      metadata: {
        direction: "inbound",
        elks_to: to,
      },
      created_at: new Date().toISOString(),
    })

    // Trigger the AI agent
    console.log(
      `[SmsWebhook] Triggering agent for business ${business.business_id}`
    )

    const agentUrl = `${supabaseUrl}/functions/v1/agent`
    const agentResponse = await fetch(agentUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        trigger_type: "incoming_sms",
        business_id: business.business_id,
        trigger_data: {
          phone_number: from,
          message,
          conversation_history: conversationHistory,
          conversation_id: convId,
        },
      }),
    })

    const agentResult = await agentResponse.json()
    console.log(
      `[SmsWebhook] Agent response: ${agentResponse.status}`,
      JSON.stringify(agentResult).substring(0, 300)
    )

    // The agent will send the SMS reply via send_sms tool
    // Return success to 46elks
    return new Response(
      JSON.stringify({
        received: true,
        agent_triggered: true,
        run_id: agentResult.run_id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  } catch (err) {
    console.error("[SmsWebhook] Error:", err)
    return new Response(
      JSON.stringify({
        error:
          err instanceof Error ? err.message : "Webhook processing error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})
