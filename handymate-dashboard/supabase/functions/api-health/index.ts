import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface HealthResponse {
  status: "healthy" | "degraded"
  version: string
  timestamp: string
  services: {
    database: "healthy" | string
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  // Only allow GET requests
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    )
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  let databaseStatus: "healthy" | string = "healthy"
  let overallStatus: "healthy" | "degraded" = "healthy"

  try {
    // Verify database connection with SELECT 1
    const { error } = await supabase
      .from("business_config")
      .select("1")
      .limit(1)

    if (error) {
      databaseStatus = error.message
      overallStatus = "degraded"
    }
  } catch (err) {
    databaseStatus = err instanceof Error ? err.message : "Unknown database error"
    overallStatus = "degraded"
  }

  const response: HealthResponse = {
    status: overallStatus,
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    services: {
      database: databaseStatus
    }
  }

  return new Response(
    JSON.stringify(response, null, 2),
    {
      status: overallStatus === "healthy" ? 200 : 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  )
})
