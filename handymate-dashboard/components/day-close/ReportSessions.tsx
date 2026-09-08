'use client'
import { useEffect, useState, useRef } from 'react'
import { REPORT_LABELS, type ReportTool } from '@/lib/matte/day-close-client'
export interface SavedReportView {id:string;date:string;projectId:string;state:string;busy:boolean;uncertain:boolean;expired:boolean;completed:number;parts:Array<{tool:ReportTool;summary:string;saved:boolean}>}
export function ReportSessions({projectId,date,revision,onResume,disabled}:{projectId:string;date:string;revision:number;onResume:(body:any)=>void;disabled:boolean}) {
 const alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const [reports,setReports]=useState<SavedReportView[]>([]),[error,setError]=useState(''),[enabled,setEnabled]=useState(false),[loading,setLoading]=useState(true),[more,setMore]=useState(false),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false)
 useEffect(()=>{let active=true;const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);setLoading(true);setReports([]);setError('')
 fetch(`/api/day-close?${new URLSearchParams({view:'reports',projectId,date})}`,{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok||!Array.isArray(d.reports))throw Error();if(active){setEnabled(d.enabled===true);setReports(d.reports);setMore(d.hasMore===true)}}).catch(()=>{if(active)setError('Sparade rapporter kunde inte kontrolleras. Läs igen innan du börjar om med samma uppgifter.')}).finally(()=>{clearTimeout(timeout);if(active)setLoading(false)})
 return()=>{active=false;controller.abort();clearTimeout(timeout)}
 },[projectId,date,revision,retry])
 async function resume(id:string, action='resume'){setBusy(true);setError('');try{const r=await fetch('/api/day-close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id})});const d=await r.json();if(!r.ok)throw Error(d.error||'Rapporten kunde inte öppnas.');if(d.report?.projectId!==projectId||d.report?.date!==date)throw Error('Rapporten matchar inte jobbet och datumet.');if(alive.current)onResume(d);if(alive.current)setRetry(n=>n+1)}catch(e){setError(e instanceof Error?e.message:'Rapporten kunde inte öppnas.')}finally{setBusy(false)}}
 if(!loading&&!enabled&&!error)return null
 return <div className="rounded-lg border border-slate-200 p-3 text-sm"><h3 className="font-medium">Rapporter du kan återvända till</h3>
 {loading&&<p role="status">Läser sparade rapporter…</p>}{error&&<p role="alert" className="mt-2 text-amber-900">{error}</p>}
 {!loading&&!error&&reports.length===0&&<p className="mt-2">Ingen rapportkedja finns sparad här ännu. Tidigare registrerat arbete visas i sammanställningen ovan.</p>}
 {reports.map(r=><div key={r.id} className="mt-3 border-t pt-3"><p>{r.completed} av {r.parts.length} delar bekräftat sparade · {r.state==='discarded'?'återstående delar avstådda':r.state==='finished'?'granskade delar sparade':r.expired?'tidsgränsen har passerat':'rapporten är öppen'}</p>
 {r.uncertain&&<p className="mt-1 text-amber-900">En sparning kan ha gjorts utan kvittens. Återuppta samma rapport för att kontrollera; börja inte om med samma uppgifter.</p>}
 <details className="mt-2"><summary>Visa rapportens delar</summary>{r.parts.map((p,i)=><div key={i} className="mt-2"><strong>{REPORT_LABELS[p.tool]} · {p.saved?'sparat vid bekräftelsen':'inte bekräftat sparat'}</strong><p className="whitespace-pre-wrap">{p.summary}</p></div>)}</details>
 {r.state==='open'&&!r.expired&&<button type="button" disabled={disabled||busy||r.busy} onClick={()=>void resume(r.id)} className="min-h-[44px] text-teal-800 underline disabled:opacity-50">{r.busy?'Sparning pågår — läs igen strax':'Återuppta och granska nästa del'}</button>}
 {r.state==='open'&&!r.busy&&<button type="button" disabled={disabled||busy} onClick={()=>void resume(r.id,'discard')} className="ml-3 min-h-[44px] text-slate-600 underline">Avstå från återstående förslag</button>}
 </div>)}{more&&<p className="mt-2">De tio senaste rapporterna visas.</p>}
 <button type="button" disabled={disabled||busy} onClick={()=>setRetry(n=>n+1)} className="min-h-[44px] text-teal-800 underline">Läs rapporterna igen</button>
 </div>
}
