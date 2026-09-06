'use client'
import { useEffect, useState } from 'react'
import { TEMPLATES, type Preparation } from '@/lib/customer-preparation/contract'
import type { ReviewFinding } from '@/lib/customer-preparation/review-contract'

export default function LarsPreparationReview({row,customerId,onChanged}:{row:Preparation;customerId:string;onChanged:()=>Promise<void>}) {
  const [projects,setProjects]=useState<Array<{project_id:string;name:string}>>([])
  const [projectId,setProjectId]=useState(row.project_id || '')
  const [projectError,setProjectError]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [description,setDescription]=useState('')
  const review=row.lars_review
  useEffect(()=>{setProjectId(row.project_id || '');setDescription(review?.result.possible_additions.map(item=>item.text).join('\n') || '')},[row.project_id,review?.fingerprint])
  useEffect(()=>{
    const controller=new AbortController()
    void (async()=>{try{
      const res=await fetch(`/api/projects?customerId=${encodeURIComponent(customerId)}`,{cache:'no-store',signal:controller.signal})
      const data=await res.json()
      if(!res.ok || !Array.isArray(data.projects)) throw new Error('Kunde inte läsa kundens projekt. Läs in kundkortet igen.')
      if(!controller.signal.aborted) setProjects(data.projects)
    }catch(e){if(!controller.signal.aborted)setProjectError(e instanceof Error?e.message:'Projekt kunde inte läsas.')}})()
    return ()=>controller.abort()
  },[customerId])
  async function act(action:'review'|'link'|'approve'|'ata') {
    if(busy)return
    setBusy(true);setError('')
    try{
      const res=await fetch('/api/customer-preparation/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id,action,project_id:projectId || null,fingerprint:review?.fingerprint,description})})
      const data=await res.json()
      if(!res.ok) throw new Error(data.error || 'Åtgärden kunde inte slutföras.')
      await onChanged()
    }catch(e){setError(e instanceof Error?e.message:'Kunde inte nå företagskontoret. Läs in igen för att kontrollera resultatet.')}
    finally{setBusy(false)}
  }
  function sourceLabel(key:string) {
    if(key==='context')return 'Arbetsbeskrivningen'
    if(key==='project')return 'Projektbeskrivningen'
    if(/^image[1-3]$/.test(key))return `Kundens bild ${key.slice(-1)}`
    return TEMPLATES[row.template].questions.find(q=>q.id===key)?.label || 'Kundens svar'
  }
  function findings(title:string,items:ReviewFinding[]) {return items.length>0 && <div><h5 className="font-medium">{title}</h5><ul className="mt-2 space-y-3">{items.map((item,index)=><li key={index} className="text-sm"><p>{item.text}</p><p className="mt-1 text-xs text-slate-500">Underlag: {item.sources.map(sourceLabel).join(' · ')}</p></li>)}</ul></div>}
  return <section className="my-4 space-y-4 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
    <h4 className="font-semibold text-teal-900">Lars kontroll av kundunderlaget</h4>
    {!Object.prototype.hasOwnProperty.call(row,'lars_review') ? <p className="text-sm">Kontrollen är inte aktiverad ännu. Du kan fortfarande granska svaren själv.</p> : <>
      <p className="text-sm text-slate-600">Lars hjälper dig hitta sådant som behöver förberedas eller stämmas av. Du gör den slutliga bedömningen.</p>
      {projectError && <p role="alert" className="text-sm text-red-700">{projectError}</p>}
      <label className="block text-sm font-medium">Projekt för detta underlag<select value={projectId} disabled={busy || !!row.ata_approval_id} onChange={e=>setProjectId(e.target.value)} className="mt-1 block min-h-[44px] w-full rounded-lg border bg-white p-2"><option value="">Inför offert — inget projekt valt</option>{projects.map(p=><option key={p.project_id} value={p.project_id}>{p.name}</option>)}</select></label>
      {projectId!==(row.project_id || '') && <button type="button" disabled={busy} onClick={()=>void act('link')} className="min-h-[44px] rounded-lg border border-teal-700 px-3 text-sm text-teal-800">Spara projektkoppling</button>}
      {notice && <p role="status" className="text-sm text-teal-800">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="button" disabled={busy || projectId!==(row.project_id || '')} onClick={()=>void act('review')} className="min-h-[44px] rounded-lg bg-teal-700 px-3 text-sm text-white disabled:opacity-50">{busy?'Arbetar…':review?'Kontrollera att bedömningen är aktuell':'Låt Lars kontrollera svar och bilder'}</button>
      {review && <div className="space-y-4 rounded-lg bg-white p-3">
        <p className="text-xs text-slate-500">Kontroll sparad {new Date(review.created_at).toLocaleString('sv-SE')} · {review.image_count} bilder ingick</p>
        <p className="whitespace-pre-wrap text-sm">{review.result.summary}</p>
        {findings('Kontrollera före arbetet',review.result.checks)}
        {findings('Frågor att stämma av med kunden',review.result.questions)}
        {findings('Möjliga tillägg att bedöma',review.result.possible_additions)}
        {review.result.questions.length>0 && <button type="button" className="min-h-[44px] text-sm text-teal-800 underline" onClick={async()=>{try{await navigator.clipboard.writeText(review.result.questions.map(i=>i.text).join('\n'));setNotice('Frågorna är kopierade. Inget meddelande har skickats.')}catch{setError('Markera frågorna och kopiera dem manuellt.')}}}>Kopiera kompletteringsfrågorna</button>}
        {row.status==='submitted' && <button type="button" disabled={busy || projectId!==(row.project_id || '')} onClick={()=>void act('approve')} className="block min-h-[44px] rounded-lg bg-teal-700 px-3 text-sm text-white">Jag har granskat underlaget och Lars kontroll</button>}
        {row.ata_approval_id ? <p className="text-sm">Ett ÄTA-förslag har registrerats från underlaget. <a href="/dashboard/approvals" className="text-teal-800 underline">Öppna godkännandekön</a> eller <a href="/dashboard/pengar" className="text-teal-800 underline">följ ärendet i Pengar</a>.</p> : row.status==='reviewed' && row.project_id && <details><summary className="cursor-pointer py-3 text-sm font-medium text-teal-800">Förbered ett ÄTA-förslag</summary><p className="mb-2 text-xs text-slate-600">Kontrollera avtalets omfattning. Det här skapar ett internt förslag för granskning, inte ett kundutskick eller en faktura.</p><label className="block text-sm">Tillägg som du vill föreslå<textarea value={description} maxLength={4000} onChange={e=>setDescription(e.target.value)} className="mt-1 w-full rounded-lg border p-3" rows={4}/></label><button type="button" disabled={busy || description.trim().length<10 || projectId!==row.project_id} onClick={()=>void act('ata')} className="min-h-[44px] rounded-lg bg-teal-700 px-3 text-sm text-white disabled:opacity-50">Skapa internt ÄTA-förslag</button></details>}
      </div>}
    </>}
  </section>
}
