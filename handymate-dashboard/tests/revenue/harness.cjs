const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  { PGlite } = require('@electric-sql/pglite')
const { NextRequest, NextResponse } = require('next/server')
function load(entry, overrides = {}) {
  const cache = {}
  function add(file) {
    file = path.resolve(file)
    if (cache[file]) return cache[file].exports
    const module = { exports: {} }
    cache[file] = module
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText
    new Function('require', 'module', 'exports', code)(
      (name) => {
        if (name in overrides) return overrides[name]
        if (name.startsWith('@/') || name.startsWith('.')) {
          const base = name.startsWith('@/')
            ? path.resolve(name.slice(2))
            : path.resolve(path.dirname(file), name)
          const resolved = [
            base,
            base + '.ts',
            base + '.tsx',
            base + '.cjs',
          ].find((p) => fs.existsSync(p) && fs.statSync(p).isFile())
          if (resolved) return add(resolved)
        }
        return require(name)
      },
      module,
      module.exports,
    )
    return module.exports
  }
  return add(entry)
}
function adapter(db) {
  return {
    async rpc(name, args) {
      try {
        const keys = Object.keys(args)
        const placeholders = keys.map((k, i) => `${k} => $${i + 1}`).join(',')
        const data = (
          await db.query(
            `select public.${name}(${placeholders}) as result`,
            Object.values(args),
          )
        ).rows[0].result
        return { data: JSON.parse(JSON.stringify(data)), error: null }
      } catch (error) {
        return { data: null, error }
      }
    },
    from(table) {
      let fields = '*',
        filters = [],
        order = [],
        limit = null,
        operation = 'select',
        payload,
        one = false
      const q = {
        select(s = '*') {
          fields = s
          return q
        },
        eq(k, v) {
          filters.push([k, v])
          return q
        },
        order(k, { ascending = true } = {}) {
          order.push(`${k} ${ascending ? 'asc' : 'desc'}`)
          return q
        },
        limit(n) {
          limit = n
          return q
        },
        maybeSingle() {
          one = true
          return q
        },
        insert(v) {
          operation = 'insert'
          payload = v
          return q
        },
        update(v) {
          operation = 'update'
          payload = v
          return q
        },
        then(resolve, reject) {
          return run().then(resolve, reject)
        },
      }
      async function run() {
        try {
          const values = []
          const put = (v) => {
            values.push(v)
            return '$' + values.length
          }
          let sql
          if (operation === 'select') sql = `select ${fields} from ${table}`
          if (operation === 'insert')
            sql = `insert into ${table}(${Object.keys(payload).join(',')}) values(${Object.values(payload).map(put).join(',')})`
          if (operation === 'update')
            sql = `update ${table} set ${Object.entries(payload)
              .map(([k, v]) => `${k}=${put(v)}`)
              .join(',')}`
          if (filters.length)
            sql +=
              ' where ' +
              filters.map(([k, v]) => `${k}=${put(v)}`).join(' and ')
          if (order.length) sql += ' order by ' + order.join(',')
          if (limit !== null) sql += ` limit ${limit}`
          if (operation !== 'select') sql += ' returning *'
          const rows = (await db.query(sql, values)).rows
          return {
            data: JSON.parse(JSON.stringify(one ? rows[0] || null : rows)),
            error: null,
          }
        } catch (error) {
          return { data: null, error }
        }
      }
      return q
    },
  }
}
async function harness() {
  const db = new PGlite()
  await db.exec(
    'create role anon; create role authenticated; create role service_role bypassrls; create table gtm_suppression(id uuid default gen_random_uuid(),org_number text,email text,phone text);',
  )
  await db.exec(
    fs
      .readFileSync('sql/revenue_os_v1.sql', 'utf8')
      .replace('create extension if not exists pgcrypto;', ''),
  )
  await db.exec(fs.readFileSync('sql/v231_sales_case.sql', 'utf8'))
  await db.exec(fs.readFileSync('sql/v2_revenue_os.sql', 'utf8'))
  await db.exec(fs.readFileSync('supabase/migrations/20260914213502_revenue_sales_workflow.sql', 'utf8'))
  // Minimal existing partner schema; partner JWT verification has separate coverage.
  await db.exec('create table partners(id uuid primary key, name text, company text, email text, status text, agreement_version text);')
  await db.exec(fs.readFileSync('supabase/migrations/20260914220545_revenue_partner_leads.sql', 'utf8'))
  const ctx = {
    userId: '10000000-0000-4000-8000-000000000001',
    email: 'a@handymate.se',
    manager: true,
    businessId: null,
    db: adapter(db),
  }
  let allowed = true
  let partner = null
  const agreement = { AGREEMENT_VERSION: '1.0', hasAcceptedCurrentAgreement: p => p.agreement_version === '1.0' }
  const adminPartnerApi = load('app/api/admin/revenue/partner-leads/route.ts', {
    '@/lib/revenue/auth': { requireRevenue: async () => allowed ? ctx : null },
    '@/lib/partners/agreement': agreement,
  })
  const partnerApi = load('app/api/partners/leads/route.ts', {
    '@/lib/partners/auth': { getPartnerTokenFromRequest: () => partner ? 'verified-test-token' : null, getPartnerFromToken: async () => partner?.status === 'active' ? partner : null },
    '@/lib/partners/agreement': agreement,
    '@/lib/supabase': { getServerSupabase: () => ctx.db },
  })
  const api = load('app/api/admin/revenue/route.ts', {
    '@/lib/revenue/auth': {
      requireRevenue: async () => (allowed ? ctx : null),
    },
    '@/lib/revenue/source': {
      fetchCandidates: async () => [
        {
          company_name: 'Elkällan AB',
          org_number: '5561234567',
          source: 'Platsbanken',
          external_id: 'verified-ad',
          title: 'Elektriker sökes',
          source_url:
            'https://arbetsformedlingen.se/platsbanken/annonser/verified-ad',
          observed_at: new Date().toISOString(),
        },
      ],
    },
  })
  async function request(method, url, body, headers = {}) {
    const req = new NextRequest(url, {
      method,
      ...(body
        ? {
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body),
          }
        : {}),
    })
    const pathname = new URL(url).pathname
    const handler = pathname === '/api/admin/revenue/partner-leads' ? adminPartnerApi : pathname === '/api/partners/leads' ? partnerApi : api
    return handler[method](req)
  }
  return {
    db,
    ctx,
    setAllowed: (v) => (allowed = v),
    setPartner: (v) => (partner = v),
    request,
    load,
    adapter: ctx.db,
  }
}
module.exports = { harness, load }
