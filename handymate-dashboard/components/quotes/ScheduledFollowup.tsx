'use client'
import { useEffect,useRef,useState } from 'react'
import { followupLabels,followupReasons,type FollowupItem } from '@/lib/followup/presentation'
const fmt=(s:string)=>new Date(s).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm',dateStyle:'short',timeStyle:'short'})
export function ScheduledFollowup({quoteId}:{quoteId:string}) {
 const [data,setData]=useState<{enabled:boolean;healthy?:boolean;canSchedule?:boolean;items:FollowupItem[]}|null>(null)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[due,setDue]=useState(''),[tick,setTick]=useState(0)
 const key=useRef('')
 useEffect(()=>{
  let active=true;const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),12000)
  setData(null);setError('')
  fetch(`/api/quotes/${encodeURIComponent(quoteId)}/followup`,{cache:'no-store',signal:ctl.signal}).then(async r=>{if(!r.ok)throw Error();const d=await r.json();if(!Array.isArray(d.items))throw Error();if(active)setData(d)}).catch(()=>{if(active)setError('Den planerade uppföljningen kunde inte kontrolleras.')}).finally(()=>clearTimeout(timer))
  const refresh=()=>{if(document.visibilityState==='visible')setTick(t=>t+1)};document.addEventListener('visibilitychange',refresh)
  return()=>{active=false;ctl.abort();clearTimeout(timer);document.removeEventListener('visibilitychange',refresh)}
 },[quoteId,tick])
 async function mutate(id?:string){
  if(busy)return;setBusy(true);setError('');const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),15000)
  try {
   if(!id&&!key.current)key.current=crypto.randomUUID()
   const r=await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/followup${id?'?id='+encodeURIComponent(id):''}`,{method:id?'DELETE':'POST',signal:ctl.signal,headers:{'Content-Type':'application/json'},body:id?undefined:JSON.stringify({due_at:new Date(due).toISOString(),request_key:key.current})})
   const d=await r.json();if(!r.ok)throw Error(d.error||'Kunde inte spara uppföljningen.')
   key.current='';setTick(t=>t+1)
  }catch(e){setError(e instanceof Error&&e.name!=='AbortError'?e.message:'Svaret uteblev. Kontrollera igen innan du planerar något nytt.')}finally{clearTimeout(timer);setBusy(false)}
 }
 if(data?.enabled===false)return null
 const open=data?.items.find(x=>['scheduled','prepared'].includes(x.state))
 return <div className="mt-4 border-t border-teal-100 pt-4" aria-label="Planerad offertuppföljning">
  <h3 className="text-sm font-semibold text-teal-900">Låt Daniel förbereda uppföljningen</h3>
  <p className="mt-1 text-sm text-slate-600">Daniel kontrollerar offerten och förbereder ett SMS även när appen är stängd. Du granskar innan det skickas.</p>
  {error&&<p role="alert" className="mt-2 text-sm text-amber-800">{error} <button className="min-h-[44px] underline" onClick={()=>setTick(t=>t+1)}>Kontrollera igen</button></p>}
  {!data&&!error&&<p role="status">Kontrollerar planeringen…</p>}
  {data&&!data.healthy&&<p role="status" className="mt-2 text-sm text-amber-800">Teamets körning kan inte bekräftas just nu. En sparad tid är inte ett bevis på att kontrollen har utförts.</p>}
  {data?.items.map(item=><div key={item.id} className="my-3 rounded-lg bg-slate-50 p-3 text-sm">
   <p className="font-medium">{followupLabels[item.state]||'Behöver kontrolleras'} · {fmt(item.due_at)}</p>
   <p className="mt-1 text-slate-600">{followupReasons[item.reason||'']||'Kontrollen görs från den planerade tiden. Resultatet visas här.'}</p>
   {item.approval_id&&<a className="inline-flex min-h-[44px] items-center text-teal-800 underline" href={`/dashboard/approvals?highlight=${encodeURIComponent(item.approval_id)}`}>Öppna beslut och kvittens</a>}
   {['scheduled','prepared'].includes(item.state)&&!item.send_claimed_at&&<button disabled={busy} onClick={()=>void mutate(item.id)} className="ml-3 min-h-[44px] text-slate-700 underline">Avbryt uppföljningen</button>}
  </div>)}
  {data&&!open&&data.canSchedule===false&&<p className="mt-3 text-sm text-slate-600">Uppföljning kan planeras när offerten är skickad och fortfarande öppen.</p>}
  {data&&!open&&data.canSchedule!==false&&<div className="mt-3">
   <label className="block text-sm">När ska Daniel kontrollera offerten?<input type="datetime-local" value={due} disabled={busy} onChange={e=>{setDue(e.target.value);key.current=''}} className="my-2 block min-h-[44px] w-full max-w-full rounded-lg border p-2" /></label>
   <p className="mb-2 text-xs text-slate-500">Tiden anges i din enhets tidszon. {due&&Number.isFinite(Date.parse(due))?`I svensk tid: ${fmt(new Date(due).toISOString())}.`:''}</p>
   <button disabled={busy||!due||!data.healthy} onClick={()=>void mutate()} className="min-h-[44px] rounded-lg bg-teal-700 px-4 py-2 font-medium text-white disabled:opacity-50">{busy?'Sparar…':'Planera förberedelsen'}</button>
  </div>}
 </div>
}
