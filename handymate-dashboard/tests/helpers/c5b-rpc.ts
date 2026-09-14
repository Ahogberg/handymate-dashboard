import type { KernelDb } from '../../lib/financial-kernel/events/publish'
import type { receivablesDatabase } from './financial-receivables-database'

/** PostgREST shape: SETOF functions return arrays; scalar JSONB functions return their value. */
export function c5bRpc(f: Awaited<ReturnType<typeof receivablesDatabase>>): KernelDb {
  return { async rpc(name, args) {
    if (!/^[a-z_]+$/.test(name) || Object.keys(args).some(key => !/^p_[a-z_]+$/.test(key))) throw Error('Unsafe RPC')
    await f.db.exec('SAVEPOINT rpc_call')
    try {
      const parameters = Object.keys(args).map((key,i) => `${key}=>$${i+1}`).join(',')
      const set = ['claim_financial_events','begin_financial_event_attempt','fail_financial_event','get_financial_consumer_status','list_shadow_candidates','list_financial_kernel_work','list_shadow_divergences'].includes(name)
      const rows = (await f.db.query<{value:unknown}>(set ? `SELECT to_jsonb(r) value FROM ${name}(${parameters}) r` : `SELECT ${name}(${parameters}) value`, Object.values(args))).rows
      return {data:set ? rows.map(row=>row.value) : rows[0]?.value,error:null}
    } catch(error) {
      await f.db.exec('ROLLBACK TO SAVEPOINT rpc_call')
      return {data:null,error:{message:(error as Error).message}}
    } finally { await f.db.exec('RELEASE SAVEPOINT rpc_call') }
  } }
}
