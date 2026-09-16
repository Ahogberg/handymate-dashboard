import { expect, test } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

/**
 * De 30 SQL-kontrollerna i ARIKLAR_MALLAR_ROT_BRIEF §6, mot riktig
 * PostgreSQL-semantik i isolerad PGlite. Migrationen körs aldrig mot Supabase
 * här; varje testsession bygger en v12/v67-formad minidatabas lokalt.
 */
let db: PGlite
test.describe.configure({ mode: 'serial' })

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0]
}

test.beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE public.business_config(business_id text primary key);
    INSERT INTO public.business_config VALUES ('a');

    CREATE TABLE public.products(
      id text primary key,
      business_id text not null references public.business_config(business_id),
      name text not null,
      category text,
      default_labor_share numeric check (default_labor_share is null or (default_labor_share >= 0 and default_labor_share <= 1)),
      rot_eligible boolean default false,
      rut_eligible boolean default false
    );

    CREATE TABLE public.product_components(
      id text primary key,
      product_id text not null references public.products(id) on delete cascade,
      business_id text not null references public.business_config(business_id),
      component_type text not null check (component_type in ('arbete', 'material')),
      description text not null,
      quantity_per_unit numeric not null default 1,
      unit text not null default 'st',
      unit_cost numeric not null default 0
    );

    CREATE TABLE public.quotes(
      quote_id text primary key,
      business_id text not null references public.business_config(business_id)
    );

    CREATE TABLE public.quote_items(
      id text primary key,
      quote_id text not null references public.quotes(quote_id),
      item_type text not null default 'item',
      category_slug text,
      unit text,
      total numeric,
      labor_amount numeric,
      material_amount numeric,
      is_rot_eligible boolean default false,
      is_rut_eligible boolean default false
    );

    INSERT INTO public.products(id,business_id,name,category,default_labor_share,rot_eligible,rut_eligible) VALUES
      ('p_work','a','Arbetstid','arbete',null,true,false),
      ('p_material','a','Skruv','material',null,false,false),
      ('p_rent','a','Maskinhyra','hyra',null,false,false),
      ('p_existing','a','Blandad artikel','arbete',0.6,true,false),
      ('p_travel','a','Servicebil standard','arbete',null,true,true),
      ('p_spare','a','Reservdel till pump','material',null,false,false);

    INSERT INTO public.product_components(id,product_id,business_id,component_type,description,quantity_per_unit,unit,unit_cost) VALUES
      ('pc_work','p_existing','a','arbete','Montage',1,'tim',500),
      ('pc_material','p_existing','a','material','Fästdon',2,'st',50);

    INSERT INTO public.quotes VALUES ('q1','a'),('q2','a');
    INSERT INTO public.quote_items(id,quote_id,item_type,category_slug,unit,total,labor_amount,material_amount,is_rot_eligible,is_rut_eligible) VALUES
      ('qi_work','q1','item','arbete_el','st',100,null,null,false,false),
      ('qi_travel','q1','item','resa','st',200,null,null,false,false),
      ('qi_material','q1','item','material_el','st',300,null,null,false,false),
      ('qi_rent','q1','item','hyra','st',400,null,null,false,false),
      ('qi_hours','q1','item',null,'tim',500,null,null,false,false),
      ('qi_rot','q1','item',null,'st',600,null,null,true,false),
      ('qi_plain','q1','item',null,'st',700,null,null,false,false),
      ('qi_existing','q1','item',null,'st',100,60,null,true,false),
      ('qi_exact','q1','item',null,'st',1234.56,740.74,493.82,true,false),
      ('qi_heading','q1','heading',null,null,0,null,null,false,false),
      ('qi_discount','q1','discount',null,'st',-50,null,null,false,false),
      ('qi_q2_travel','q2','item','resa','st',55,null,null,false,false);
  `)
  await db.exec(readFileSync('sql/v252_line_split_travel.sql', 'utf8'))
})

test.afterAll(async () => { await db.close() })

test('01 arbete utan andel blir 100 procent arbete och 0 resa', async () => {
  expect(await one("select default_labor_share::text labor,default_travel_share::text travel from products where id='p_work'"))
    .toEqual({ labor: '1', travel: '0' })
})

test('02 material och hyra utan andel blir 0 arbete och 0 resa', async () => {
  const rows = await db.query<{ id: string; labor: string; travel: string }>("select id,default_labor_share::text labor,default_travel_share::text travel from products where id in ('p_material','p_rent') order by id")
  expect(rows.rows).toEqual([
    { id: 'p_material', labor: '0', travel: '0' },
    { id: 'p_rent', labor: '0', travel: '0' },
  ])
})

test('03 befintlig arbetsandel bevaras', async () => {
  expect(await one("select default_labor_share::text labor from products where id='p_existing'"))
    .toEqual({ labor: '0.6' })
})

test('04 snävt reseprefix ger 100 procent resa och aldrig ROT eller RUT', async () => {
  expect(await one("select default_labor_share::text labor,default_travel_share::text travel,rot_eligible,rut_eligible from products where id='p_travel'"))
    .toEqual({ labor: '0', travel: '1', rot_eligible: false, rut_eligible: false })
})

test('05 Reservdel träffas inte av reseheuristiken', async () => {
  expect(await one("select default_travel_share::text travel from products where id='p_spare'"))
    .toEqual({ travel: '0' })
})

test('06 ogiltig enkelandel och summa över 1 avvisas, summa 1 godtas', async () => {
  await expect(db.exec("insert into products(id,business_id,name,default_labor_share,default_travel_share) values('bad_one','a','Fel',1.01,0)"))
    .rejects.toThrow(/products_default_labor_share_check/)
  await expect(db.exec("insert into products(id,business_id,name,default_labor_share,default_travel_share) values('bad_travel','a','Fel',0,1.01)"))
    .rejects.toThrow(/products_default_travel_share_check/)
  await expect(db.exec("insert into products(id,business_id,name,default_labor_share,default_travel_share) values('bad_sum','a','Fel',0.8,0.3)"))
    .rejects.toThrow(/products_share_sum_check/)
  await db.exec("insert into products(id,business_id,name,default_labor_share,default_travel_share) values('good_sum','a','Rätt',0.8,0.2)")
})

test('07 ny artikel får reseandel 0', async () => {
  await db.exec("insert into products(id,business_id,name) values('new_default','a','Ny')")
  expect(await one("select default_travel_share::text travel from products where id='new_default'"))
    .toEqual({ travel: '0' })
})

test('08 befintligt ursprung är seed, nytt owner och okänd källa avvisas', async () => {
  expect(await one("select share_source from products where id='p_work'")).toEqual({ share_source: 'seed' })
  expect(await one("select share_source from products where id='new_default'")).toEqual({ share_source: 'owner' })
  await expect(db.exec("insert into products(id,business_id,name,share_source) values('bad_source','a','Fel','model')"))
    .rejects.toThrow(/products_share_source_check/)
})

test('09 komponenttypen resa godtas och okänd typ avvisas', async () => {
  await db.exec("insert into product_components(id,product_id,business_id,component_type,description) values('pc_travel','p_existing','a','resa','Framkörning')")
  await expect(db.exec("insert into product_components(id,product_id,business_id,component_type,description) values('pc_bad','p_existing','a','övrigt','Fel')"))
    .rejects.toThrow(/product_components_component_type_check/)
})

test('10 delat komponentschema godtas, resa defaultar ROT av och material+ROT avvisas', async () => {
  await db.exec("insert into product_components(id,product_id,business_id,component_type,description,article_number,unit,quantity_per_unit,unit_cost,unit_price) values('pc_schema','p_existing','a','arbete','Montör','A-1','tim',2,400,750)")
  expect(await one("select article_number,unit,quantity_per_unit::text quantity,unit_cost::text cost,unit_price::text price,is_rot_eligible from product_components where id='pc_schema'"))
    .toEqual({ article_number: 'A-1', unit: 'tim', quantity: '2', cost: '400', price: '750', is_rot_eligible: false })
  expect(await one("select is_rot_eligible from product_components where id='pc_travel'")).toEqual({ is_rot_eligible: false })
  await expect(db.exec("insert into product_components(id,product_id,business_id,component_type,description,is_rot_eligible) values('pc_material_rot','p_existing','a','material','Fel',true)"))
    .rejects.toThrow(/product_components_rot_only_labour/)
})

test('11 katalogkoppling godtas och okänd artikel avvisas', async () => {
  await db.exec("update product_components set linked_product_id='p_material' where id='pc_schema'")
  await expect(db.exec("update product_components set linked_product_id='missing' where id='pc_schema'"))
    .rejects.toThrow(/foreign key constraint/i)
})

const split = async (id: string) => one<{ labor: string; material: string; travel: string }>(
  'select labor_amount::text labor,material_amount::text material,travel_amount::text travel from quote_items where id=$1', [id],
)

test('12 arbete_* backfillas till arbete', async () => expect(await split('qi_work')).toEqual({ labor: '100', material: '0', travel: '0' }))
test('13 resa backfillas till resa', async () => expect(await split('qi_travel')).toEqual({ labor: '0', material: '0', travel: '200' }))
test('14 material_* backfillas till material', async () => expect(await split('qi_material')).toEqual({ labor: '0', material: '300', travel: '0' }))
test('15 hyra backfillas till material', async () => expect(await split('qi_rent')).toEqual({ labor: '0', material: '400', travel: '0' }))
test('16 timenhet backfillas till arbete', async () => expect(await split('qi_hours')).toEqual({ labor: '500', material: '0', travel: '0' }))
test('17 styckrad med ROT-flagga backfillas till arbete', async () => expect(await split('qi_rot')).toEqual({ labor: '600', material: '0', travel: '0' }))
test('18 styckrad utan flagga backfillas till material', async () => expect(await split('qi_plain')).toEqual({ labor: '0', material: '700', travel: '0' }))
test('19 befintlig arbetsdel får resten material och 0 resa', async () => expect(await split('qi_existing')).toEqual({ labor: '60', material: '40.00', travel: '0' }))
test('20 befintlig exakt delning behålls öre-exakt', async () => expect(await split('qi_exact')).toEqual({ labor: '740.74', material: '493.82', travel: '0' }))

test('21 rubrik och rabatt lämnas utan delning', async () => {
  const rows = await db.query("select id from quote_items where id in ('qi_heading','qi_discount') and labor_amount is null and material_amount is null and travel_amount is null order by id")
  expect(rows.rows).toEqual([{ id: 'qi_discount' }, { id: 'qi_heading' }])
})

test('22 ingen item-rad saknar delning', async () => {
  expect(await one("select count(*)::int count from quote_items where item_type='item' and (labor_amount is null or material_amount is null or travel_amount is null)"))
    .toEqual({ count: 0 })
})

test('23 delningsvillkoret är validerat', async () => {
  expect(await one("select convalidated from pg_constraint where conrelid='public.quote_items'::regclass and conname='quote_items_split_sum'"))
    .toEqual({ convalidated: true })
})

test('24 item-rad utan delning avvisas', async () => {
  await expect(db.exec("insert into quote_items(id,quote_id,item_type,total) values('inv_missing','q1','item',10)"))
    .rejects.toThrow(/quote_items_split_sum/)
})

test('25 delar som inte summerar avvisas', async () => {
  await expect(db.exec("insert into quote_items(id,quote_id,item_type,total,labor_amount,material_amount,travel_amount) values('inv_sum','q1','item',10,4,4,1)"))
    .rejects.toThrow(/quote_items_split_sum/)
})

test('26 exakt delning godtas, även negativ item-rad', async () => {
  await db.exec("insert into quote_items(id,quote_id,item_type,total,labor_amount,material_amount,travel_amount) values('inv_exact','q1','item',10,4,5,1),('inv_negative','q1','item',-10,-4,-5,-1)")
})

test('27 rubrik utan delning godtas', async () => {
  await db.exec("insert into quote_items(id,quote_id,item_type,total) values('inv_heading','q1','heading',0)")
})

test('28 totaländring som bryter summan avvisas', async () => {
  await expect(db.exec("update quote_items set total=11 where id='inv_exact'"))
    .rejects.toThrow(/quote_items_split_sum/)
})

test('29 quotes.travel_total är summan av resedelen', async () => {
  expect(Number((await one<{ travel: string }>("select travel_total::text travel from quotes where quote_id='q1'")).travel)).toBe(200)
  expect(Number((await one<{ travel: string }>("select travel_total::text travel from quotes where quote_id='q2'")).travel)).toBe(55)
})

test('30 migrationen är idempotent', async () => {
  await db.exec(readFileSync('sql/v252_line_split_travel.sql', 'utf8'))
  expect(await one("select count(*)::int count from quote_items where item_type='item' and abs(labor_amount+material_amount+travel_amount-coalesce(total,0)) >= 0.01"))
    .toEqual({ count: 0 })
  expect(await one("select share_source from products where id='p_work'"))
    .toEqual({ share_source: 'seed' })
})
