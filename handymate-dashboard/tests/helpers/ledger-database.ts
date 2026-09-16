/**
 * PGlite-fixtur för Ledger (Paket C8): riktiga roller, riktig is_business_member
 * (ur sql/testbed_tenant_isolation.sql), v235 + v236, financial_lock/financial_append
 * ur v238 (v238 i sin helhet kräver invoice-tabellen) och v251 — allt kört som
 * deployer så att ägarskap, RLS och grants är de som produktionen får.
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import type { KernelDb } from '../../lib/financial-kernel/events/publish'

/** v235/v236-funktioner som returnerar TABLE (PostgREST: array). Ledgerns åtta RPC:er är skalära JSONB. */
const SET_RETURNING = ['append_financial_event', 'claim_financial_events', 'begin_financial_event_attempt', 'ack_financial_event', 'fail_financial_event', 'release_financial_consumer_lease', 'get_financial_consumer_status', 'resume_financial_consumer']

export const USER_A = '00000000-0000-0000-0000-000000000001'
export const USER_B = '00000000-0000-0000-0000-000000000002'

export async function ledgerDatabase(): Promise<{ db: PGlite; rpc: KernelDb }> {
  const db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE deployer NOSUPERUSER NOBYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE business_config(business_id text PRIMARY KEY, user_id uuid);
    CREATE TABLE business_users(business_id text, user_id uuid, is_active boolean);
    INSERT INTO business_config VALUES ('a', NULL), ('b', '${USER_B}');
    INSERT INTO business_users VALUES ('a', '${USER_A}', true);
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT USAGE, CREATE ON SCHEMA public TO deployer;
    GRANT REFERENCES ON business_config TO deployer;
    ALTER DEFAULT PRIVILEGES FOR ROLE deployer IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE deployer IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;`)
  const tenantSql = readFileSync('sql/testbed_tenant_isolation.sql', 'utf8')
  const member = tenantSql.match(/CREATE OR REPLACE FUNCTION public\.is_business_member[\s\S]*?\$function\$;/)
  if (!member) throw Error('Missing real membership function')
  await db.exec(member[0])
  await db.exec('REVOKE ALL ON FUNCTION public.is_business_member(text) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.is_business_member(text) TO authenticated, service_role;')
  const receivables = readFileSync('sql/v238_financial_receivables.sql', 'utf8')
  const kernelHelpers = receivables.match(/CREATE OR REPLACE FUNCTION public\.financial_(?:lock|append)\([\s\S]*?\$fn\$;/g)
  if (!kernelHelpers || kernelHelpers.length !== 2) throw Error('Missing financial_lock/financial_append in v238')
  await db.exec('SET ROLE deployer')
  try {
    await db.exec(readFileSync('sql/v235_financial_events.sql', 'utf8'))
    await db.exec(readFileSync('sql/v236_financial_event_consumers.sql', 'utf8'))
    await db.exec(kernelHelpers.join('\n'))
    await db.exec(readFileSync('sql/v251_ledger_posting_engine.sql', 'utf8'))
  } finally { await db.exec('RESET ROLE') }
  const rpc: KernelDb = {
    async rpc(name, args) {
      if (!/^[a-z_]+$/.test(name) || Object.keys(args).some(k => !/^p_[a-z_]+$/.test(k))) throw Error('Unsafe test RPC')
      const entries = Object.entries(args)
      const parameters = entries.map(([k], i) => `${k} => $${i + 1}`).join(',')
      // Som PostgREST: SETOF-funktioner ger en array, skalära JSONB-funktioner sitt värde,
      // och ett misslyckat anrop lämnar inte transaktionen avbruten.
      const set = SET_RETURNING.includes(name)
      await db.exec('SAVEPOINT rpc_call')
      try {
        const rows = await db.query<{ value: unknown }>(
          set ? `SELECT to_jsonb(r) value FROM ${name}(${parameters}) r` : `SELECT ${name}(${parameters}) value`,
          entries.map(([, v]) => typeof v === 'object' && v !== null ? JSON.stringify(v) : v))
        await db.exec('RELEASE SAVEPOINT rpc_call')
        return { data: set ? rows.rows.map(r => r.value) : rows.rows[0]?.value ?? null, error: null }
      } catch (error) {
        await db.exec('ROLLBACK TO SAVEPOINT rpc_call; RELEASE SAVEPOINT rpc_call')
        return { data: null, error: { message: (error as Error).message } }
      }
    },
  }
  return { db, rpc }
}

/** Skalärt RPC-anrop med positionsargument; JSON-värden kommer tillbaka som objekt. */
export async function scalar<T = Record<string, unknown>>(db: PGlite, name: string, args: unknown[]): Promise<T> {
  const r = await db.query<{ value: T }>(`SELECT ${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)
  return r.rows[0].value
}
export async function rows<T = Record<string, unknown>>(db: PGlite, sql: string, args: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, args)).rows
}

export type LineJson = { account: string; debit_minor: string; credit_minor: string; [k: string]: unknown }
export const line = (account: string, debit: string, credit: string, extra: Record<string, unknown> = {}): LineJson =>
  ({ account, debit_minor: debit, credit_minor: credit, ...extra })
/** Faktura 10 000 ex moms: 1510 D 12 500 / 3001 K 10 000 / 2611 K 2 500 — kontonumren är fixtur, inte beslut. */
export const ISSUE_LINES: LineJson[] = [line('1510', '1250000', '0'), line('3001', '0', '1000000'), line('2611', '0', '250000')]

export type EntryJson = {
  id: string; series: string; fiscal_year_id: string; period_id: string; voucher_number: number; journal_type: string
  effective_date: string; total_minor: string; description: string; source_event_id: string | null; correlation_id: string
  posting_rule_id: string; posting_rule_version: number; reversal_of_entry_id: string | null; reversed_by_entry_id: string | null
  status: string; posted_event_id: string; inserted: boolean; reversed_event_id?: string
  lines: Array<{ line_no: number; account: string; debit_minor: string; credit_minor: string }>
}
export type FiscalYearJson = { id: string; starts_on: string; ends_on: string; status: string; periods: Array<{ id: string; starts_on: string; ends_on: string; status: string }> }

export const openFy = (db: PGlite, biz: string, from: string, to: string) => scalar<FiscalYearJson>(db, 'open_ledger_fiscal_year', [biz, from, to])
export const journal = (db: PGlite, biz: string, series: string, name = 'Serie ' + series) => scalar<{ id: string; series: string; name: string }>(db, 'ensure_ledger_journal', [biz, series, name])
export const account = (db: PGlite, biz: string, number: string, type: string, opts: { name?: string; source?: string; confirmedBy?: string | null; active?: boolean } = {}) =>
  scalar<{ id: string; number: string; type: string; confirmed_by: string | null; active: boolean }>(db, 'upsert_ledger_account',
    [biz, number, opts.name || 'Konto ' + number, type, opts.source || 'proposal', opts.confirmedBy ?? null, opts.active ?? true])
/** Ett kärnevent att peka på som källa. Skrivs genom C2:s RPC så kuvertet är riktigt. */
export async function sourceEvent(db: PGlite, biz: string, key = 'inv-1', corr = 'fin_invoice_F-1', type = 'invoice_issued', date = '2026-03-10'): Promise<string> {
  const r = await db.query<{ id: string }>(
    `SELECT id FROM append_financial_event($1,$2,1,now(),$5,'invoice','F-1',$3,NULL,$4,'SEK',1250000,'{"invoice_id":"F-1"}','system',NULL)`,
    [biz, type, corr, key, date])
  return r.rows[0].id
}
export type PostOpts = {
  series?: string; type?: string; date?: string; desc?: string; lines?: LineJson[]; sourceEvent?: string | null
  rule?: string; version?: number; key?: string; actorType?: string; actorId?: string | null; currency?: string
}
export const post = (db: PGlite, biz: string, opts: PostOpts = {}) => scalar<EntryJson>(db, 'post_journal_entry', [
  biz, opts.series || 'A', opts.type || 'standard', opts.date || '2026-03-10', opts.desc || 'Faktura F-1',
  JSON.stringify(opts.lines || ISSUE_LINES), 'sourceEvent' in opts ? opts.sourceEvent : null, opts.rule || 'se.customer_invoice',
  opts.version ?? 1, opts.key || 'k1', opts.actorType || 'system', opts.actorId ?? null, opts.currency || 'SEK'])
export const reverse = (db: PGlite, biz: string, id: string, opts: { date?: string; reason?: string; key?: string; actorType?: string; actorId?: string | null } = {}) =>
  scalar<EntryJson>(db, 'reverse_journal_entry', [biz, id, opts.date || '2026-03-15', 'reason' in opts ? opts.reason : 'Fel konto', opts.key || 'rev1', opts.actorType || 'user', opts.actorId ?? 'u1'])
export const lock = (db: PGlite, biz: string, periodId: string, actor = 'u1') => scalar<{ id: string; status: string; changed: boolean; event_id?: string }>(db, 'lock_ledger_period', [biz, periodId, actor])
export const unlock = (db: PGlite, biz: string, periodId: string, actor = 'u1', reason = 'Rättelse') => scalar<{ id: string; status: string; changed: boolean; event_id?: string }>(db, 'unlock_ledger_period', [biz, periodId, actor, reason])
export const readEntry = (db: PGlite, biz: string, id: string) => scalar<EntryJson | null>(db, 'read_ledger_entry', [biz, id])
export type EventRow = { id: string; event_type: string; causation_id: string | null; correlation_id: string; amount_minor: string | null; actor_id: string | null; payload: Record<string, unknown>; eff: string | null }
export const events = (db: PGlite, type: string) => rows<EventRow>(db, 'SELECT id, event_type, causation_id, correlation_id, amount_minor::text AS amount_minor, actor_id, payload, effective_date::text AS eff FROM financial_events WHERE event_type=$1 ORDER BY seq', [type])

/** Standardläge för de flesta kontroller: 2026 öppet, serier A och B, fem konton, ett källevent. */
export async function seeded(db: PGlite) {
  const fy = await openFy(db, 'a', '2026-01-01', '2026-12-31')
  await journal(db, 'a', 'A'); await journal(db, 'a', 'B')
  for (const [n, t] of [['1510', 'asset'], ['1930', 'asset'], ['3001', 'revenue'], ['2611', 'liability'], ['3740', 'revenue']]) await account(db, 'a', n, t)
  const src = await sourceEvent(db, 'a')
  return { fy, src, periods: fy.periods }
}
