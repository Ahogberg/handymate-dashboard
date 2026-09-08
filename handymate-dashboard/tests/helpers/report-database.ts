import {followupDatabase,type FollowupDatabase} from './followup-database'
import fs from 'fs'
export async function reportDatabase(){
 const db=await followupDatabase()
 await db.exec(`CREATE TABLE public.project(project_id text primary key,business_id text,name text,customer_id text);
 CREATE TABLE public.project_assignment(id text,business_id text,business_user_id text,project_id text);
 CREATE TABLE public.time_entry(time_entry_id text primary key,business_id text,business_user_id text,project_id text,work_date date,duration_minutes integer,description text,created_at timestamptz default now(),check_in_time timestamptz,check_out_time timestamptz);
 CREATE TABLE public.time_checkins(id text,business_id text,business_user_id text,checked_out_at timestamptz);
 CREATE TABLE public.project_log(id text primary key,business_id text,business_user_id text,order_id text,date date);
 CREATE TABLE public.project_material(material_id text primary key,business_id text,project_id text,name text,quantity numeric,unit text,purchase_price numeric,sell_price numeric,markup_percent numeric,total_purchase numeric,total_sell numeric,notes text);
 ALTER TABLE pending_approvals ADD COLUMN routing_role text;
 INSERT INTO business_config(business_id) VALUES('b'),('other');INSERT INTO business_users VALUES('u','b',true,'owner');INSERT INTO project VALUES('p','b','Köket',null);
 `)
 await db.exec(fs.readFileSync('sql/v2_report_continuity.sql','utf8'))
 return db
}
const rowJson=(row:any)=>row&&Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Date?(['work_date','date'].includes(k)?v.toISOString().slice(0,10):v.toISOString()):v]))
const ident=(s:string)=>{s=s.trim();if(!/^[a-z_]+$/.test(s))throw Error('invalid identifier '+s);return '"'+s+'"'}
/** Minimal PostgREST-shaped adapter backed by REAL PostgreSQL/PGlite. */
export function reportClient(db:FollowupDatabase){
 let failFinish=false
 const client:any={failNextFinish:()=>{failFinish=true},rpc:async(name:string,args:any)=>{
  if(name==='finish_work_report_step'&&failFinish){failFinish=false;return {data:null,error:{message:'receipt response unavailable'}}}
  try{const r=await db.query(`SELECT * FROM public.${ident(name)}(${Object.keys(args).map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(args).map(v=>v&&typeof v==='object'?JSON.stringify(v):v));return {data:rowJson(r.rows[0]),error:null}}catch(e:any){return {data:null,error:e}}
 },from(table:string){const where:string[]=[],params:any[]=[];let fields='*',limit=500,single=false,count=false,values:any=null,order=''
 const bind=(v:any)=>{params.push(v);return '$'+params.length}
 const q:any={select(s:string,o:any={}){fields=s;count=!!o.count;return q},eq(k:string,v:any){where.push(`${ident(k)}=${bind(v)}`);return q},is(k:string,_v:any){where.push(`${ident(k)} IS NULL`);return q},not(k:string,_op:string,_v:any){where.push(`${ident(k)} IS NOT NULL`);return q},contains(k:string,v:any){where.push(`${ident(k)} @> ${bind(JSON.stringify(v))}::jsonb`);return q},order(k:string,o:any={}){order=` ORDER BY ${ident(k)} ${o.ascending===false?'DESC':'ASC'}`;return q},limit(n:number){limit=n;return q},maybeSingle(){single=true;return q},single(){single=true;return q},insert(v:any){values=v;return q},then(resolve:any,reject:any){return (async()=>{try{let result:any;if(values){const keys=Object.keys(values);result=await db.query(`INSERT INTO public.${ident(table)}(${keys.map(ident).join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,keys.map(k=>values[k]&&typeof values[k]==='object'?JSON.stringify(values[k]):values[k]))}else result=await db.query(`SELECT ${count?'count(*)::int AS count':fields.split(',').map(ident).join(',')} FROM public.${ident(table)}${where.length?' WHERE '+where.join(' AND '):''}${count?'':order+' LIMIT '+limit}`,params);return {data:single?rowJson(result.rows[0])||null:result.rows.map(rowJson),error:null,count:count?result.rows[0].count:null}}catch(e:any){return {data:null,error:e}}})().then(resolve,reject)}};return q}}
 return client
}
