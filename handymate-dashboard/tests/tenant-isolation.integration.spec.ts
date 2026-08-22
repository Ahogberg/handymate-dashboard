/**
 * Produktionslikt RLS-bevis mot en riktig, disponibel Supabase-databas.
 *
 * Kör endast med:
 *   copy .env.integration.example .env.integration
 *   npm run test:tenant-isolation
 *
 * Testet använder service_role endast för fixtures och cleanup. Alla SELECT,
 * INSERT, UPDATE och DELETE som verifierar isoleringen görs med två riktiga
 * authenticated-sessioner från olika företag. Direkt PostgreSQL-URL är
 * valfri: utan den körs fortfarande hela RLS-provet, medan de två separata
 * katalogkontrollerna för SECURITY DEFINER och grants markeras som hoppade.
 */
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Pool } from 'pg'

const TABLES = [
  'project',
  'project_change',
  'project_material',
  'time_entry',
  'supplier_invoices',
  'business_config',
] as const

type TableName = typeof TABLES[number]
type Side = 'A' | 'B'
type JsonRow = Record<string, unknown>

const PRIMARY_KEY: Record<TableName, string> = {
  project: 'project_id',
  project_change: 'change_id',
  project_material: 'material_id',
  time_entry: 'time_entry_id',
  supplier_invoices: 'id',
  business_config: 'business_id',
}

const UPDATE_PATCH: Record<TableName, JsonRow> = {
  project: { description: 'cross-tenant update probe' },
  project_change: { description: 'cross-tenant update probe' },
  project_material: { notes: 'cross-tenant update probe' },
  time_entry: { description: 'cross-tenant update probe' },
  supplier_invoices: { notes: 'cross-tenant update probe' },
  business_config: { business_name: 'cross-tenant update probe' },
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Saknar ${name} i .env.integration`)
  return value
}

function loadTestConfig() {
  const config = {
    supabaseUrl: required('TENANT_TEST_SUPABASE_URL'),
    anonKey: required('TENANT_TEST_SUPABASE_ANON_KEY'),
    serviceRoleKey: required('TENANT_TEST_SUPABASE_SERVICE_ROLE_KEY'),
    databaseUrl: process.env.TENANT_TEST_DATABASE_URL?.trim() || null,
    databaseSsl: process.env.TENANT_TEST_DATABASE_SSL || 'require',
    expectedProjectRef: required('TENANT_TEST_EXPECTED_PROJECT_REF'),
    destructiveConfirmation: required('TENANT_TEST_ALLOW_DESTRUCTIVE_RLS_PROBE'),
    A: {
      email: required('TENANT_A_EMAIL'),
      password: required('TENANT_A_PASSWORD'),
      businessId: required('TENANT_A_BUSINESS_ID'),
    },
    B: {
      email: required('TENANT_B_EMAIL'),
      password: required('TENANT_B_PASSWORD'),
      businessId: required('TENANT_B_BUSINESS_ID'),
    },
  }

  if (config.destructiveConfirmation !== 'YES_DELETE_DISPOSABLE_TENANTS') {
    throw new Error('Säkerhetsspärren är inte bekräftad: testet kan DELETE:a testföretagens business_config om RLS är trasig')
  }
  if (config.A.businessId === config.B.businessId || config.A.email === config.B.email) {
    throw new Error('Tenant A och B måste vara två olika konton i två olika företag')
  }

  const actualProjectRef = new URL(config.supabaseUrl).hostname.split('.')[0]
  if (actualProjectRef !== config.expectedProjectRef) {
    throw new Error(`Supabase-ref ${actualProjectRef} matchar inte TENANT_TEST_EXPECTED_PROJECT_REF`)
  }
  if (config.databaseUrl) {
    const databaseUrl = new URL(config.databaseUrl)
    const databaseIdentity = `${databaseUrl.hostname} ${databaseUrl.username}`
    if (!databaseIdentity.includes(config.expectedProjectRef)) {
      throw new Error('TENANT_TEST_DATABASE_URL verkar inte peka på samma projekt som TENANT_TEST_SUPABASE_URL')
    }
  }

  return config
}

const config = loadTestConfig()
const runId = `rls_it_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

let service: SupabaseClient
let clients: Record<Side, SupabaseClient>
let fixtures: Record<Side, Record<Exclude<TableName, 'business_config'>, JsonRow>>
let originalBusinessNames: Record<Side, string | null>
let pool: Pool | null = null

function fixtureRows(side: Side): Record<Exclude<TableName, 'business_config'>, JsonRow> {
  const suffix = side.toLowerCase()
  const businessId = config[side].businessId
  const projectId = `${runId}_${suffix}_project`

  return {
    project: {
      project_id: projectId,
      business_id: businessId,
      name: `${runId} tenant ${side}`,
      status: 'planning',
    },
    project_change: {
      change_id: `${runId}_${suffix}_change`,
      business_id: businessId,
      project_id: projectId,
      change_type: 'addition',
      description: `${runId} tenant ${side}`,
      amount: 0,
      status: 'draft',
    },
    project_material: {
      material_id: `${runId}_${suffix}_material`,
      business_id: businessId,
      project_id: projectId,
      name: `${runId} tenant ${side}`,
      quantity: 1,
      unit: 'st',
    },
    time_entry: {
      time_entry_id: `${runId}_${suffix}_time`,
      business_id: businessId,
      project_id: projectId,
      description: `${runId} tenant ${side}`,
      work_date: new Date().toISOString().slice(0, 10),
      duration_minutes: 15,
      is_billable: true,
    },
    supplier_invoices: {
      id: `${runId}_${suffix}_supplier_invoice`,
      business_id: businessId,
      project_id: projectId,
      supplier_name: `${runId} tenant ${side}`,
      amount_excl_vat: 100,
      vat_amount: 25,
      total_amount: 125,
      status: 'unpaid',
    },
  }
}

async function authenticatedClient(side: Side): Promise<SupabaseClient> {
  const client = createClient(config.supabaseUrl, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({
    email: config[side].email,
    password: config[side].password,
  })
  if (error || !data.session) {
    throw new Error(`Kunde inte autentisera tenant ${side}: ${error?.message || 'session saknas'}`)
  }
  return client
}

async function insertFixture(table: Exclude<TableName, 'business_config'>, row: JsonRow) {
  const { error } = await service.from(table).insert(row)
  if (error) throw new Error(`Fixture ${table} kunde inte skapas: ${error.code} ${error.message}`)
}

async function cleanupRows() {
  if (!service || !fixtures) return
  const cleanupOrder: Exclude<TableName, 'business_config'>[] = [
    'supplier_invoices', 'time_entry', 'project_material', 'project_change', 'project',
  ]

  for (const table of cleanupOrder) {
    const pk = PRIMARY_KEY[table]
    const ids = [
      fixtures.A[table][pk],
      fixtures.B[table][pk],
      `${runId}_a_attacks_b_${table}`,
      `${runId}_b_attacks_a_${table}`,
    ].filter((value): value is string => typeof value === 'string')
    await service.from(table).delete().in(pk, ids)
  }

  for (const side of ['A', 'B'] as const) {
    if (originalBusinessNames?.[side] !== undefined) {
      await service
        .from('business_config')
        .update({ business_name: originalBusinessNames[side] })
        .eq('business_id', config[side].businessId)
    }
  }
}

test.beforeAll(async () => {
  service = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  clients = {
    A: await authenticatedClient('A'),
    B: await authenticatedClient('B'),
  }
  if (config.databaseUrl) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl === 'disable' ? false : { rejectUnauthorized: false },
      max: 1,
    })
  }

  const { data: businesses, error: businessError } = await service
    .from('business_config')
    .select('business_id, business_name')
    .in('business_id', [config.A.businessId, config.B.businessId])
  if (businessError || businesses?.length !== 2) {
    throw new Error(`De två disponibla testföretagen saknas: ${businessError?.message || businesses?.length}`)
  }
  originalBusinessNames = {
    A: businesses.find(row => row.business_id === config.A.businessId)?.business_name ?? null,
    B: businesses.find(row => row.business_id === config.B.businessId)?.business_name ?? null,
  }

  fixtures = { A: fixtureRows('A'), B: fixtureRows('B') }
  for (const side of ['A', 'B'] as const) {
    await insertFixture('project', fixtures[side].project)
    await insertFixture('project_change', fixtures[side].project_change)
    await insertFixture('project_material', fixtures[side].project_material)
    await insertFixture('time_entry', fixtures[side].time_entry)
    await insertFixture('supplier_invoices', fixtures[side].supplier_invoices)
  }
})

test.afterAll(async () => {
  await cleanupRows()
  await Promise.allSettled([
    clients?.A?.auth.signOut(),
    clients?.B?.auth.signOut(),
  ])
  await pool?.end()
})

test('is_business_member är faktiskt SECURITY DEFINER i testdatabasen', async () => {
  test.skip(!pool, 'TENANT_TEST_DATABASE_URL saknas — katalogkontrollen körs separat av databasägaren')
  if (!pool) return
  const result = await pool.query<{ security_definer: boolean }>(`
    SELECT p.prosecdef AS security_definer
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_business_member'
  `)
  expect(result.rows, 'is_business_member saknas eller har oväntade overloads').toHaveLength(1)
  expect(result.rows[0].security_definer).toBe(true)
})

test('authenticated har DML-grants på tenant-tabellerna men ingen SELECT-grant på credentials', async () => {
  test.skip(!pool, 'TENANT_TEST_DATABASE_URL saknas — katalogkontrollen körs separat av databasägaren')
  if (!pool) return
  const result = await pool.query<{
    table_name: TableName
    can_select: boolean
    can_insert: boolean
    can_update: boolean
    can_delete: boolean
  }>(`
    SELECT
      requested.table_name,
      has_table_privilege('authenticated', format('%I.%I', 'public', requested.table_name), 'SELECT') AS can_select,
      has_table_privilege('authenticated', format('%I.%I', 'public', requested.table_name), 'INSERT') AS can_insert,
      has_table_privilege('authenticated', format('%I.%I', 'public', requested.table_name), 'UPDATE') AS can_update,
      has_table_privilege('authenticated', format('%I.%I', 'public', requested.table_name), 'DELETE') AS can_delete
    FROM unnest($1::TEXT[]) AS requested(table_name)
    ORDER BY requested.table_name
  `, [TABLES])

  expect(result.rows).toHaveLength(TABLES.length)
  for (const row of result.rows) {
    expect(row, `authenticated saknar avsedd DML-grant på ${row.table_name}`).toMatchObject({
      can_select: true,
      can_insert: true,
      can_update: true,
      can_delete: true,
    })
  }

  const credentialsGrant = await pool.query<{ can_select: boolean }>(`
    SELECT has_table_privilege(
      'authenticated',
      'public.business_integration_credentials',
      'SELECT'
    ) AS can_select
  `)
  expect(credentialsGrant.rows[0].can_select).toBe(false)
})

test('båda kontona är medlemmar endast i sitt eget testföretag', async () => {
  for (const side of ['A', 'B'] as const) {
    const other: Side = side === 'A' ? 'B' : 'A'
    const own = await clients[side].rpc('is_business_member', {
      target_business_id: config[side].businessId,
    })
    const foreign = await clients[side].rpc('is_business_member', {
      target_business_id: config[other].businessId,
    })
    expect(own.error, `tenant ${side}: egen medlemskontroll`).toBeNull()
    expect(own.data).toBe(true)
    expect(foreign.error, `tenant ${side}: främmande medlemskontroll`).toBeNull()
    expect(foreign.data).toBe(false)
  }
})

test('policyerna är inte all-deny: båda kontona kan läsa sina egna rader', async () => {
  for (const side of ['A', 'B'] as const) {
    for (const table of TABLES) {
      const pk = PRIMARY_KEY[table]
      const id = table === 'business_config'
        ? config[side].businessId
        : fixtures[side][table][pk]
      const { data, error } = await clients[side].from(table).select(pk).eq(pk, id)
      expect(error, `tenant ${side} kan inte läsa egen ${table}-rad`).toBeNull()
      expect(data, `tenant ${side} ser inte egen ${table}-rad`).toHaveLength(1)
    }
  }
})

test('business_integration_credentials är helt oläsbar för authenticated', async () => {
  for (const side of ['A', 'B'] as const) {
    const { data, error } = await clients[side]
      .from('business_integration_credentials')
      .select('business_id')
      .limit(1)
    expect(data).toBeNull()
    expect(error?.code, `tenant ${side} fick oväntat läsa credentials eller tabellen saknas`).toBe('42501')
  }
})

function expectMutationDenied(
  result: { data: unknown[] | null; error: { code?: string; message?: string } | null },
  label: string,
) {
  // UPDATE/DELETE på en rad som USING-policyn döljer ska lyckas med noll
  // träffar. 42501 här skulle kunna betyda att tabellgranten saknas helt
  // och vore därför ett falskt bevis på fungerande tenant-RLS.
  expect(result.error, `${label}: nekades av grant/schema i stället för tenant-RLS`).toBeNull()
  expect(result.data, `${label}: mutationen träffade främmande rad`).toEqual([])
}

function foreignTarget(attacker: Side, table: TableName) {
  const victim: Side = attacker === 'A' ? 'B' : 'A'
  const pk = PRIMARY_KEY[table]
  const victimId = table === 'business_config'
    ? config[victim].businessId
    : fixtures[victim][table][pk]
  return { client: clients[attacker], pk, victim, victimId }
}

// Varje operation är ett separat test. En SELECT-läcka får därmed inte
// hindra att INSERT, UPDATE och DELETE faktiskt provas och rapporteras.
for (const table of TABLES) {
  for (const attacker of ['A', 'B'] as const) {
    test(`tenant ${attacker}: SELECT nekas på den andra tenantens ${table}`, async () => {
      const { client, pk, victimId } = foreignTarget(attacker, table)
      const selected = await client.from(table).select(pk).eq(pk, victimId)
      expect(selected.error, `${table} cross-tenant SELECT gav schema-/privilegie-fel`).toBeNull()
      expect(selected.data, `${table} cross-tenant SELECT läckte en rad`).toEqual([])
    })
  }
}

for (const table of TABLES) {
  for (const attacker of ['A', 'B'] as const) {
    test(`tenant ${attacker}: INSERT nekas med den andra tenantens business_id i ${table}`, async () => {
      const { client, pk, victim, victimId } = foreignTarget(attacker, table)
      const insertProbe = table === 'business_config'
        ? {
            business_id: victimId,
            business_name: `${runId} forbidden insert`,
          }
        : {
            ...fixtures[victim][table],
            [pk]: `${runId}_${attacker.toLowerCase()}_attacks_${victim.toLowerCase()}_${table}`,
          }
      const inserted = await client.from(table).insert(insertProbe).select(pk)
      expect(inserted.error?.code, `${table} cross-tenant INSERT nekades inte av RLS`).toBe('42501')
    })
  }
}

for (const table of TABLES) {
  for (const attacker of ['A', 'B'] as const) {
    test(`tenant ${attacker}: UPDATE nekas på den andra tenantens ${table}`, async () => {
      const { client, pk, victimId } = foreignTarget(attacker, table)
      const updated = await client
        .from(table)
        .update(UPDATE_PATCH[table])
        .eq(pk, victimId)
        .select(pk)
      expectMutationDenied(updated, `${table} cross-tenant UPDATE`)
    })
  }
}

for (const table of TABLES) {
  for (const attacker of ['A', 'B'] as const) {
    test(`tenant ${attacker}: DELETE nekas på den andra tenantens ${table}`, async () => {
      const { client, pk, victimId } = foreignTarget(attacker, table)
      const deleted = await client.from(table).delete().eq(pk, victimId).select(pk)
      expectMutationDenied(deleted, `${table} cross-tenant DELETE`)
    })
  }
}
