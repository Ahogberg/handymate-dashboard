import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import type { SupabaseClient } from '@supabase/supabase-js'

/** PostgREST-shaped adapter executing real SQL against isolated PostgreSQL. */
export async function standardDatabase() {
  const pg = new PGlite()
  await pg.exec(`CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE TABLE business_config (business_id text PRIMARY KEY, user_id uuid);
    CREATE TABLE business_users (id text PRIMARY KEY);
    CREATE TABLE deal (id text PRIMARY KEY, business_id text);
    INSERT INTO business_config VALUES ('a', NULL), ('b', NULL);`)
  const create = (file: string, table: string) => {
    const sql = readFileSync(file, 'utf8')
    const match = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`))
    if (!match) throw Error(`Missing schema for ${table}`)
    return match[0]
  }
  await pg.exec(readFileSync('sql/v_job_types.sql', 'utf8'))
  await pg.exec(create('sql/quote_overhaul.sql', 'quote_templates'))
  await pg.exec(readFileSync('sql/v187_quote_template_job_type.sql', 'utf8'))
  await pg.exec(create('sql/v12_products.sql', 'products'))
  await pg.exec('ALTER TABLE products ADD COLUMN default_labor_share numeric;')
  await pg.exec(create('sql/v67_produktbank.sql', 'product_components'))
  const calls: { table: string; action: string; filters: unknown[] }[] = []
  let failTable = ''
  const identifier = (name: string) => { if (!/^[a-z_]+$/.test(name)) throw Error('Invalid identifier'); return `"${name}"` }
  const adapter = { from(table: string) {
    let action = 'read', payload: any, upsert = false, conflict = '', one = false, columns = '*', start = 0, limit: number | undefined
    const filters: { column: string; op: string; value: any }[] = [], orders: string[] = []
    const query: any = {
      select(value = '*') { columns = value; return query },
      eq(column: string, value: any) { filters.push({ column, op: '=', value }); return query },
      is(column: string, value: any) { filters.push({ column, op: 'IS', value }); return query },
      in(column: string, value: any[]) { filters.push({ column, op: 'IN', value }); return query },
      order(column: string, options?: { ascending?: boolean }) { orders.push(`${identifier(column)} ${options?.ascending === false ? 'DESC' : 'ASC'}`); return query },
      range(from: number, to: number) { start = from; limit = to - from + 1; return query },
      limit(n: number) { limit = n; return query },
      insert(value: any) { action = 'insert'; payload = value; return query },
      upsert(value: any, options: any) { action = 'insert'; payload = value; upsert = true; conflict = options.onConflict; return query },
      update(value: any) { action = 'update'; payload = value; return query },
      maybeSingle() { one = true; return query }, single() { one = true; return query },
      then(resolve: any, reject: any) { return execute().then(resolve, reject) },
    }
    async function execute() {
      calls.push({ table, action, filters: structuredClone(filters) })
      if (failTable === table) return { data: null, error: { code: 'XX000', message: 'Injected database failure' } }
      const args: any[] = [], param = (v: any) => { args.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v); return `$${args.length}` }
      const fields = columns === '*' ? '*' : columns.split(',').map(v => identifier(v.trim())).join(',')
      const where = () => filters.length ? ' WHERE ' + filters.map(f => f.op === 'IS' ? `${identifier(f.column)} IS NULL`
        : f.op === 'IN' ? `${identifier(f.column)} IN (${f.value.map(param).join(',')})`
        : `${identifier(f.column)} = ${param(f.value)}`).join(' AND ') : ''
      let sql: string
      if (action === 'read') sql = `SELECT ${fields} FROM ${identifier(table)}${where()}${orders.length ? ' ORDER BY ' + orders.join(',') : ''}${limit !== undefined ? ` LIMIT ${limit}` : ''} OFFSET ${start}`
      else if (action === 'update') sql = `UPDATE ${identifier(table)} SET ${Object.keys(payload).map(k => `${identifier(k)} = ${param(payload[k])}`).join(',')}${where()} RETURNING ${fields}`
      else {
        const rows = Array.isArray(payload) ? payload : [payload], keys = Object.keys(rows[0])
        sql = `INSERT INTO ${identifier(table)} (${keys.map(identifier).join(',')}) VALUES ${rows.map(row => '(' + keys.map(k => param(row[k])).join(',') + ')').join(',')}${upsert ? ` ON CONFLICT (${conflict.split(',').map(identifier).join(',')}) DO NOTHING` : ''} RETURNING ${fields}`
      }
      try {
        const result = await pg.query(sql, args)
        const rows = JSON.parse(JSON.stringify(result.rows))
        return { data: one ? rows[0] || null : rows, error: null }
      } catch (error: any) { return { data: null, error: { code: error.code, message: error.message } } }
    }
    return query
  } }
  return { pg, db: adapter as unknown as SupabaseClient, calls, fail: (table: string) => { failTable = table }, close: () => pg.close() }
}
