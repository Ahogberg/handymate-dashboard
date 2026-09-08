const {readdirSync} = require('node:fs')
const {spawnSync} = require('node:child_process')
// Alphabetic order puts job-report generation before its PDF browser probe.
for (const file of readdirSync('tests/approvals').filter(name => name.endsWith('-harness.cjs')).sort()) {
  const result = spawnSync(process.execPath, [`tests/approvals/${file}`], {stdio:'inherit'})
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
