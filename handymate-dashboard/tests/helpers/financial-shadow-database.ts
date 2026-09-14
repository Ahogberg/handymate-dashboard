import { readFileSync } from 'fs'
import { receivablesDatabase } from './financial-receivables-database'
import { c5bRpc } from './c5b-rpc'
export async function shadowDatabase() {
  const f = await receivablesDatabase()
  await f.db.exec('ALTER TABLE invoice ADD COLUMN sent_at timestamptz, ADD COLUMN fortnox_document_number text; SET ROLE deployer')
  await f.db.exec(readFileSync('sql/v242_financial_kernel_shadow.sql','utf8'))
  await f.db.exec('RESET ROLE')
  return { ...f, rpc: c5bRpc(f) }
}
