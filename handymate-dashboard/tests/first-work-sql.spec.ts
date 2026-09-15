import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
let db: PGlite
test.beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE deployer;
 GRANT CREATE,USAGE ON SCHEMA public TO deployer; GRANT USAGE ON SCHEMA public TO authenticated,service_role;
 SET ROLE deployer; CREATE TABLE business_config(business_id text PRIMARY KEY);
 CREATE TABLE quotes(quote_id text PRIMARY KEY,business_id text NOT NULL REFERENCES business_config,title text,sent_at timestamptz);
 INSERT INTO business_config VALUES('a'),('b'); GRANT SELECT,INSERT,UPDATE,DELETE ON quotes TO authenticated,service_role;`)
  await db.exec(readFileSync('sql/v244_first_work.sql', 'utf8'))
  await db.exec('RESET ROLE')
})
test.afterAll(async () => {
  await db?.close()
})
test.beforeEach(async () => {
  await db.exec('BEGIN')
})
test.afterEach(async () => {
  await db.exec('ROLLBACK; RESET ROLE')
})
async function begin(biz = 'a') {
  return (await db.query<any>('SELECT begin_first_work($1) w', [biz])).rows[0].w
}
async function reject(sql: string, reason: string) {
  await db.exec('SAVEPOINT bad')
  try {
    await expect(db.exec(sql)).rejects.toThrow(reason)
  } finally {
    await db.exec('ROLLBACK TO SAVEPOINT bad')
  }
}
test('stable start survives retries, preparation is not an action, only saved quote links', async () => {
  await db.exec('SET ROLE service_role')
  const work = await begin()
  expect(await begin()).toEqual(work)
  await db.query('SELECT prepare_first_work($1,$2)', ['a', work.id])
  let row = (await db.query<any>('SELECT * FROM first_work')).rows[0]
  expect(row.prepared_at).not.toBeNull()
  expect(row.quote_id).toBeNull()
  expect(row.first_action_at).toBeNull()
  await db.query(
    'INSERT INTO quotes(quote_id,business_id,first_work_id) VALUES($1,$2,$3)',
    ['q', 'a', work.id],
  )
  row = (await db.query<any>('SELECT * FROM first_work')).rows[0]
  expect(row.quote_id).toBe('q')
  expect(row.first_action_at).toBeNull()
  await db.exec("UPDATE quotes SET sent_at=now() WHERE quote_id='q'")
  row = (await db.query<any>('SELECT * FROM first_work')).rows[0]
  expect(row.first_action_at).not.toBeNull()
  expect(Date.parse(row.first_action_at)).toBeGreaterThanOrEqual(
    Date.parse(row.started_at),
  )
  await db.exec("UPDATE quotes SET sent_at=now() WHERE quote_id='q'")
  expect(
    (await db.query<any>('SELECT first_action_at FROM first_work')).rows[0]
      .first_action_at,
  ).toEqual(row.first_action_at)
})
test('member writes trigger safely without direct receipt access; RPCs are service only', async () => {
  const work = await begin()
  await db.exec('SET ROLE authenticated')
  await reject("SELECT begin_first_work('a')", 'permission denied')
  await reject('SELECT * FROM first_work', 'permission denied')
  await db.query(
    'INSERT INTO quotes(quote_id,business_id,first_work_id) VALUES($1,$2,$3)',
    ['q', 'a', work.id],
  )
  await db.exec(
    "UPDATE quotes SET sent_at=now() WHERE quote_id='q'; SET ROLE service_role",
  )
  expect(
    (await db.query<any>('SELECT first_action_at FROM first_work')).rows[0]
      .first_action_at,
  ).not.toBeNull()
  await reject(
    'UPDATE first_work SET first_action_at=NULL',
    'permission denied',
  )
})
test('tenant and uniqueness constraints prevent a second first-job quote', async () => {
  const work = await begin()
  await db.exec('SET ROLE service_role')
  await reject(
    `INSERT INTO quotes(quote_id,business_id,first_work_id) VALUES('other','b','${work.id}')`,
    'quote_first_work_tenant',
  )
  await db.query(
    'INSERT INTO quotes(quote_id,business_id,first_work_id) VALUES($1,$2,$3)',
    ['q', 'a', work.id],
  )
  await reject(
    `INSERT INTO quotes(quote_id,business_id,first_work_id) VALUES('duplicate','a','${work.id}')`,
    'quote_first_work_once',
  )
  await reject(
    "UPDATE quotes SET first_work_id=NULL WHERE quote_id='q'",
    'first_work_link_immutable',
  )
})
test('deleting a quote or failed creation clears linkage and action evidence, permitting a real retry', async () => {
  const work = await begin()
  await db.exec('SET ROLE service_role')
  await db.query(
    'INSERT INTO quotes(quote_id,business_id,first_work_id,sent_at) VALUES($1,$2,$3,now())',
    ['q', 'a', work.id],
  )
  await db.exec("DELETE FROM quotes WHERE quote_id='q'")
  expect(
    (await db.query<any>('SELECT quote_id,first_action_at FROM first_work'))
      .rows,
  ).toEqual([{ quote_id: null, first_action_at: null }])
  await db.query(
    'INSERT INTO quotes(quote_id,business_id,first_work_id) VALUES($1,$2,$3)',
    ['retry', 'a', work.id],
  )
  expect(
    (await db.query<any>('SELECT quote_id,first_action_at FROM first_work'))
      .rows,
  ).toEqual([{ quote_id: 'retry', first_action_at: null }])
})
test('account erasure removes first-job metadata after quotes without altering another business', async () => {
  const a = await begin(),
    b = await begin('b')
  await db.exec('SET ROLE service_role')
  await db.query(
    'INSERT INTO quotes(quote_id,business_id,first_work_id) VALUES($1,$2,$3),($4,$5,$6)',
    ['qa', 'a', a.id, 'qb', 'b', b.id],
  )
  await db.exec(
    "DELETE FROM quotes WHERE business_id='a'; DELETE FROM first_work WHERE business_id='a'",
  )
  expect(
    (await db.query<any>('SELECT business_id FROM first_work')).rows,
  ).toEqual([{ business_id: 'b' }])
  expect((await db.query<any>('SELECT quote_id FROM quotes')).rows).toEqual([
    { quote_id: 'qb' },
  ])
})
