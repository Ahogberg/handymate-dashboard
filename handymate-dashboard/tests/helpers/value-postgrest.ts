import type { PGlite } from '@electric-sql/pglite'
/** A real SQL-backed subset of PostgREST, used to test I/O not just pure cohort math. */
export function valuePostgrest(db: PGlite) {
 return { from(table:string) {
  if(!['value_events','pending_approvals','invoice','project_change'].includes(table)) throw Error(table)
  let columns='*',order='',limit='',params:unknown[]=[],where:string[]=[]
  const ident=(s:string)=>{if(!/^[a-z_]+$/.test(s)) throw Error(s);return '"'+s+'"'}
  const add=(key:string,op:string,val:unknown)=>{params.push(val);where.push(`${ident(key)} ${op} $${params.length}`);return q}
  const q:any={
   select(s:string){columns=s==='*'?'*,seq::text AS seq,amount_minor::text AS amount_minor':s.split(',').map(x=>{const [name,cast]=x.trim().split('::');if(cast && cast!=='text') throw Error(cast);return ident(name)+(cast?'::text AS '+ident(name):'')}).join(',');return q},
   eq:(k:string,v:unknown)=>add(k,'=',v),gt:(k:string,v:unknown)=>add(k,'>',v),gte:(k:string,v:unknown)=>add(k,'>=',v),lt:(k:string,v:unknown)=>add(k,'<',v),
   in(k:string,vals:unknown[]){params.push(vals);where.push(`${ident(k)} = ANY($${params.length})`);return q},
   order(k:string,opts:{ascending:boolean}){order=` ORDER BY ${ident(table)}.${ident(k)} ${opts.ascending?'ASC':'DESC'}`;return q},
   limit(n:number){limit=` LIMIT ${n}`;return q},
   then(resolve:any,reject:any){return db.query(`SELECT ${columns} FROM ${ident(table)} WHERE ${where.join(' AND ')||'true'}${order}${limit}`,params).then(r=>resolve({data:JSON.parse(JSON.stringify(r.rows)),error:null}),e=>resolve({data:null,error:e})).catch(reject)},
  };return q
 }} as any
}
