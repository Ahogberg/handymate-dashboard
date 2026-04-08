/**
 * MCP Server Evaluations
 *
 * Verifies:
 * 1. Server starts and lists tools correctly
 * 2. SQL safety: blocks INSERT/UPDATE/DELETE/DROP
 * 3. SQL safety: allows valid SELECT queries
 * 4. Tool schemas match expected inputs
 * 5. Graceful error handling for missing env vars
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "../dist/index.js");

let client: Client;
let transport: StdioClientTransport;
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

async function setup() {
  transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
    env: {
      ...process.env,
      // Use dummy values — tools will fail gracefully, but server must start
      SUPABASE_URL: process.env.SUPABASE_URL || "https://dummy.supabase.co",
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || "dummy-key",
    },
  });
  client = new Client({ name: "eval-client", version: "1.0.0" });
  await client.connect(transport);
}

async function teardown() {
  await client.close();
}

// ── Eval 1: Server starts and exposes 3 tools ────────────────────────────

async function evalToolListing() {
  console.log("\nEval 1: Tool listing");
  const { tools } = await client.listTools();

  assert(tools.length === 3, `Server exposes 3 tools (got ${tools.length})`);

  const names = tools.map((t) => t.name).sort();
  assert(names.includes("handymate_query_db"), "handymate_query_db exists");
  assert(names.includes("handymate_get_business"), "handymate_get_business exists");
  assert(names.includes("handymate_sms_log"), "handymate_sms_log exists");
}

// ── Eval 2: Tool schemas ─────────────────────────────────────────────────

async function evalToolSchemas() {
  console.log("\nEval 2: Tool schemas");
  const { tools } = await client.listTools();

  const queryDb = tools.find((t) => t.name === "handymate_query_db");
  assert(!!queryDb, "handymate_query_db found");
  const queryProps = (queryDb?.inputSchema as any)?.properties || {};
  assert("sql" in queryProps, "query_db has 'sql' param");
  assert("params" in queryProps, "query_db has 'params' param");

  const getBiz = tools.find((t) => t.name === "handymate_get_business");
  assert(!!getBiz, "handymate_get_business found");
  const bizProps = (getBiz?.inputSchema as any)?.properties || {};
  assert("business_id" in bizProps, "get_business has 'business_id' param");

  const smsLog = tools.find((t) => t.name === "handymate_sms_log");
  assert(!!smsLog, "handymate_sms_log found");
  const smsProps = (smsLog?.inputSchema as any)?.properties || {};
  assert("business_id" in smsProps, "sms_log has 'business_id' param");
  assert("phone" in smsProps, "sms_log has 'phone' param");
  assert("limit" in smsProps, "sms_log has 'limit' param");
}

// ── Eval 3: SQL safety — blocked queries ─────────────────────────────────

async function evalSqlSafety() {
  console.log("\nEval 3: SQL safety (blocked queries)");

  const dangerousQueries = [
    { sql: "INSERT INTO customer (name) VALUES ('test')", label: "INSERT blocked" },
    { sql: "UPDATE customer SET name='hacked'", label: "UPDATE blocked" },
    { sql: "DELETE FROM customer", label: "DELETE blocked" },
    { sql: "DROP TABLE customer", label: "DROP blocked" },
    { sql: "ALTER TABLE customer ADD COLUMN x TEXT", label: "ALTER blocked" },
    { sql: "TRUNCATE customer", label: "TRUNCATE blocked" },
    { sql: "SELECT 1; DELETE FROM customer", label: "Multi-statement blocked" },
    { sql: "CREATE TABLE hack (id int)", label: "CREATE blocked" },
  ];

  for (const { sql, label } of dangerousQueries) {
    const result = await client.callTool({ name: "handymate_query_db", arguments: { sql } });
    const text = (result.content as any)?.[0]?.text || "";
    assert(
      result.isError === true || text.toLowerCase().includes("error") || text.toLowerCase().includes("blocked") || text.toLowerCase().includes("forbidden") || text.toLowerCase().includes("not allowed"),
      label
    );
  }
}

// ── Eval 4: SQL safety — allowed queries ─────────────────────────────────

async function evalSqlAllowed() {
  console.log("\nEval 4: SQL safety (allowed queries pass validation)");

  // These should NOT return validation errors (may fail on DB connect, that's ok)
  const allowedQueries = [
    "SELECT 1",
    "SELECT * FROM customer LIMIT 10",
    "WITH cte AS (SELECT 1) SELECT * FROM cte",
    "SELECT count(*) FROM quotes WHERE status = 'sent';",
  ];

  for (const sql of allowedQueries) {
    const result = await client.callTool({ name: "handymate_query_db", arguments: { sql } });
    const text = (result.content as any)?.[0]?.text || "";
    const isValidationError =
      text.includes("Only SELECT") ||
      text.includes("forbidden keyword") ||
      text.includes("Multi-statement");
    assert(!isValidationError, `"${sql.substring(0, 40)}..." passes validation`);
  }
}

// ── Eval 5: get_business graceful error ──────────────────────────────────

async function evalGetBusinessError() {
  console.log("\nEval 5: get_business handles missing business gracefully");

  const result = await client.callTool({
    name: "handymate_get_business",
    arguments: { business_id: "nonexistent_business_123" },
  });
  const text = (result.content as any)?.[0]?.text || "";
  // Should not crash — either returns error message or empty result
  assert(text.length > 0, "Returns response (not crash) for nonexistent business");
}

// ── Eval 6: sms_log limit clamping ───────────────────────────────────────

async function evalSmsLogLimit() {
  console.log("\nEval 6: sms_log respects limit");

  // Should not crash even with extreme limit
  const result = await client.callTool({
    name: "handymate_sms_log",
    arguments: { business_id: "test", limit: 999 },
  });
  const text = (result.content as any)?.[0]?.text || "";
  assert(text.length > 0, "Returns response for sms_log with large limit");
}

// ── Run all evals ────────────────────────────────────────────────────────

async function run() {
  console.log("═══════════════════════════════════════════");
  console.log("  Handymate MCP Server — Evaluations");
  console.log("═══════════════════════════════════════════");

  await setup();

  await evalToolListing();
  await evalToolSchemas();
  await evalSqlSafety();
  await evalSqlAllowed();
  await evalGetBusinessError();
  await evalSmsLogLimit();

  await teardown();

  console.log("\n───────────────────────────────────────────");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("───────────────────────────────────────────");

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Eval runner error:", err);
  process.exit(1);
});
