#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase client (service role — full read access)
// ---------------------------------------------------------------------------

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables"
    );
  }
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// SQL safety: only allow SELECT statements
// ---------------------------------------------------------------------------

const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE)\b/i;

function assertReadOnly(sql: string): void {
  const trimmed = sql.trim();

  // Must start with SELECT or WITH (CTE)
  if (!/^(SELECT|WITH)\b/i.test(trimmed)) {
    throw new Error("Only SELECT queries are allowed (query must start with SELECT or WITH)");
  }

  // Block dangerous keywords anywhere in the query
  if (FORBIDDEN_KEYWORDS.test(trimmed)) {
    throw new Error(
      "Query contains forbidden keyword (INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/TRUNCATE/GRANT/REVOKE/EXEC are blocked)"
    );
  }

  // Block semicolons (prevent multi-statement injection)
  // Allow semicolon only at the very end
  const withoutTrailingSemicolon = trimmed.replace(/;\s*$/, "");
  if (withoutTrailingSemicolon.includes(";")) {
    throw new Error("Multi-statement queries are not allowed (no semicolons except trailing)");
  }
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "handymate-mcp",
  version: "1.0.0",
});

// ── Tool 1: handymate_query_db ──────────────────────────────────────────────

server.tool(
  "handymate_query_db",
  "Run a read-only SQL query against the Handymate Supabase database. Only SELECT queries are allowed. Returns JSON rows.",
  {
    sql: z.string().describe("SQL SELECT query to execute"),
    params: z.array(z.unknown()).optional().describe("Optional query parameters (positional $1, $2, ...)"),
  },
  async ({ sql, params }) => {
    try {
      assertReadOnly(sql);
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }

    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc("exec_sql", {
        query: sql,
        params: params || [],
      });

      // Fallback: if exec_sql RPC doesn't exist, use supabase-js REST
      if (error?.message?.includes("function") && error?.message?.includes("does not exist")) {
        // Parse table name from simple SELECT queries and use .from()
        return {
          content: [{
            type: "text" as const,
            text: `Note: exec_sql RPC not available. Use handymate_get_business or handymate_sms_log for structured queries, or create the exec_sql function in Supabase.\n\nTo enable raw SQL, run in Supabase SQL Editor:\n\nCREATE OR REPLACE FUNCTION exec_sql(query text, params jsonb DEFAULT '[]')\nRETURNS jsonb AS $$\nDECLARE result jsonb;\nBEGIN\n  EXECUTE query INTO result;\n  RETURN result;\nEND;\n$$ LANGUAGE plpgsql SECURITY DEFINER;`,
          }],
        };
      }

      if (error) {
        return {
          content: [{ type: "text" as const, text: `SQL Error: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(data, null, 2),
        }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool 2: handymate_get_business ──────────────────────────────────────────

server.tool(
  "handymate_get_business",
  "Get business configuration and stats for a specific business. Returns plan, subscription status, automation settings, and key metrics.",
  {
    business_id: z.string().describe("The business_id to look up"),
  },
  async ({ business_id }) => {
    try {
      const supabase = getSupabase();

      // Fetch business config
      const { data: config, error: configErr } = await supabase
        .from("business_config")
        .select(
          `business_id, business_name, display_name, org_number,
           plan, subscription_status, trial_ends_at,
           auto_reminder_enabled, auto_reminder_days, reminder_fee,
           four_eyes_enabled, four_eyes_threshold_sek,
           auto_invoice_on_complete,
           assigned_phone_number, forward_phone_number,
           swish_number, bankgiro,
           google_review_url,
           onboarding_step,
           created_at`
        )
        .eq("business_id", business_id)
        .single();

      if (configErr || !config) {
        return {
          content: [{
            type: "text" as const,
            text: `Business not found: ${configErr?.message || "No data"}`,
          }],
          isError: true,
        };
      }

      // Fetch automation settings
      const { data: autoSettings } = await supabase
        .from("v3_automation_settings")
        .select("*")
        .eq("business_id", business_id)
        .maybeSingle();

      // Fetch counts
      const [customers, quotes, invoices, projects, leads] = await Promise.all([
        supabase.from("customer").select("*", { count: "exact", head: true }).eq("business_id", business_id),
        supabase.from("quotes").select("*", { count: "exact", head: true }).eq("business_id", business_id),
        supabase.from("invoice").select("*", { count: "exact", head: true }).eq("business_id", business_id),
        supabase.from("project").select("*", { count: "exact", head: true }).eq("business_id", business_id),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("business_id", business_id),
      ]);

      // Determine number strategy
      const numberStrategy = config.assigned_phone_number
        ? "dedicated"
        : config.forward_phone_number
          ? "forwarding"
          : "none";

      const result = {
        ...config,
        number_strategy: numberStrategy,
        automation_settings: autoSettings || null,
        stats: {
          customers: customers.count || 0,
          quotes: quotes.count || 0,
          invoices: invoices.count || 0,
          projects: projects.count || 0,
          leads: leads.count || 0,
        },
      };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool 3: handymate_sms_log ───────────────────────────────────────────────

server.tool(
  "handymate_sms_log",
  "Get recent SMS logs for a business or phone number. Returns sender, recipient, message type, status, and timestamps.",
  {
    business_id: z.string().describe("The business_id to filter by"),
    phone: z.string().optional().describe("Optional phone number to filter by (matches both sender and recipient)"),
    limit: z.number().default(20).describe("Number of records to return (default 20, max 100)"),
  },
  async ({ business_id, phone, limit }) => {
    try {
      const supabase = getSupabase();
      const clampedLimit = Math.min(Math.max(limit, 1), 100);

      let query = supabase
        .from("sms_log")
        .select("*")
        .eq("business_id", business_id)
        .order("created_at", { ascending: false })
        .limit(clampedLimit);

      if (phone) {
        query = query.eq("phone_number", phone);
      }

      const { data, error } = await query;

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(
            {
              count: data?.length || 0,
              business_id,
              ...(phone ? { filtered_by_phone: phone } : {}),
              logs: data || [],
            },
            null,
            2
          ),
        }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Handymate MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
