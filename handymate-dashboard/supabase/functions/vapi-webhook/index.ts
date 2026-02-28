// Vapi Webhook — handles call.completed events and triggers the AI agent
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

interface VapiCallMessage {
  message: {
    type: string
    call?: {
      id: string
      type: string
      status: string
      phoneNumber?: { number: string }
      customer?: { number: string }
      transcript?: string
      summary?: string
      startedAt?: string
      endedAt?: string
      recordingUrl?: string
      analysis?: {
        summary?: string
        structuredData?: Record<string, unknown>
      }
    }
  }
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
    const body: VapiCallMessage = await req.json()
    const messageType = body.message?.type

    console.log(`[VapiWebhook] Received: ${messageType}`)

    // We only process end-of-call reports
    if (messageType !== "end-of-call-report" && messageType !== "call.completed") {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const call = body.message.call
    if (!call) {
      return new Response(JSON.stringify({ error: "No call data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Find the business by the Vapi phone number
    const vapiNumber = call.phoneNumber?.number
    if (!vapiNumber) {
      console.error("[VapiWebhook] No phone number in call data")
      return new Response(JSON.stringify({ error: "No phone number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: business } = await supabase
      .from("business_config")
      .select("business_id")
      .eq("assigned_phone_number", vapiNumber)
      .single()

    if (!business) {
      console.warn(
        `[VapiWebhook] No business found for number: ${vapiNumber}`
      )
      return new Response(
        JSON.stringify({ error: "Business not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    // Calculate duration
    let durationSeconds = 0
    if (call.startedAt && call.endedAt) {
      durationSeconds = Math.round(
        (new Date(call.endedAt).getTime() -
          new Date(call.startedAt).getTime()) /
          1000
      )
    }

    const customerNumber = call.customer?.number || "unknown"
    const transcript =
      call.transcript || call.analysis?.summary || "(Ingen transkription)"

    // Store in conversations table for history
    const convId =
      "conv_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    await supabase.from("conversations").insert({
      conversation_id: convId,
      business_id: business.business_id,
      type: "phone_call",
      phone_number: customerNumber,
      content: transcript,
      metadata: {
        vapi_call_id: call.id,
        duration_seconds: durationSeconds,
        recording_url: call.recordingUrl || null,
        analysis: call.analysis || null,
      },
      created_at: new Date().toISOString(),
    })

    // Trigger the AI agent
    console.log(
      `[VapiWebhook] Triggering agent for business ${business.business_id}`
    )

    const agentUrl = `${supabaseUrl}/functions/v1/agent`
    const agentResponse = await fetch(agentUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        trigger_type: "phone_call",
        business_id: business.business_id,
        trigger_data: {
          transcript,
          phone_number: customerNumber,
          duration_seconds: durationSeconds,
          vapi_call_id: call.id,
          recording_url: call.recordingUrl,
          conversation_id: convId,
        },
      }),
    })

    const agentResult = await agentResponse.json()
    console.log(
      `[VapiWebhook] Agent response: ${agentResponse.status}`,
      JSON.stringify(agentResult).substring(0, 300)
    )

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
    console.error("[VapiWebhook] Error:", err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Webhook processing error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})
