# Handymate MCP Server

MCP server for querying the Handymate database, fetching business configs, and reading SMS logs.

## Tools

| Tool | Description |
|------|-------------|
| `handymate_query_db` | Run read-only SQL (SELECT only) against Supabase |
| `handymate_get_business` | Get business config + stats for a business_id |
| `handymate_sms_log` | Get recent SMS logs for a business or phone |

## Setup

```bash
cd mcp/handymate-mcp
npm install
npm run build
```

## Environment Variables

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

## Claude Code Configuration

Add to your `.claude/settings.json` or project `.mcp.json`:

```json
{
  "mcpServers": {
    "handymate": {
      "command": "node",
      "args": ["mcp/handymate-mcp/dist/index.js"],
      "env": {
        "SUPABASE_URL": "your-url",
        "SUPABASE_SERVICE_KEY": "your-key"
      }
    }
  }
}
```

## Evaluations

```bash
npm run eval
```

## SQL Safety

`handymate_query_db` enforces:
- Query must start with `SELECT` or `WITH`
- Blocks INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE, EXEC
- Blocks multi-statement queries (no semicolons except trailing)
