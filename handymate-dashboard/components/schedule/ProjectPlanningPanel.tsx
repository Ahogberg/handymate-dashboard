'use client'
export interface PlanningProject {
 project_id:string; name:string; budget_hours:number|null; actual_hours:number; remaining_hours:number|null; planned_hours:number; scheduled_member_ids:string[]
}
export function ProjectPlanningPanel({projects,selected,onSelect,onPlan,error,loading,onRetry,members}: {projects:PlanningProject[];selected:string;onSelect:(id:string)=>void;onPlan:()=>void;error:string;loading:boolean;onRetry:()=>void;members:{id:string;name:string}[]}) {
 const p=projects.find(p=>p.project_id===selected)
 const hours=(v:number|null)=>v==null?'Ej angivet':`${v.toLocaleString('sv-SE')} h`
 return <section aria-label="Jobb och bemanning" className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
  <h2 className="font-semibold mb-3">Jobb och bemanning</h2>
  <div className="flex flex-wrap gap-3"><select aria-label="Valt jobb" value={selected} onChange={e=>onSelect(e.target.value)} className="border rounded-lg p-2 min-w-0 flex-1"><option value="">Välj jobb</option>{selected && !p && <option value={selected}>Valt jobb är inte tillgängligt</option>}{projects.map(p=><option key={p.project_id} value={p.project_id}>{p.name}</option>)}</select><button onClick={onPlan} disabled={loading || !!error || !!selected&&!p} className="rounded-lg bg-primary-700 text-white px-4 py-2 disabled:opacity-50">Planera personal</button></div>
  {loading && <p role="status">Hämtar timunderlag…</p>}
  {error && <p role="alert">{error} <button onClick={onRetry} className="underline">Försök igen</button></p>}
  {selected&&!p&&!loading&&!error && <p role="alert">Jobbet kan vara avslutat eller sakna behörighet. Välj ett tillgängligt jobb.</p>}
  {p && <><dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">{[['Budget',p.budget_hours],['Rapporterat',p.actual_hours],[p.remaining_hours!=null&&p.remaining_hours<0?'Över budget':'Kvar',p.remaining_hours==null?null:Math.abs(p.remaining_hours)],['Schemalagt team',p.planned_hours]].map(([label,value])=><div key={String(label)}><dt className="text-sm text-gray-500">{label}</dt><dd className="font-semibold text-lg">{hours(value as number|null)}</dd></div>)}</dl><p className="text-sm mt-3">Planerad personal: {members.filter(m=>p.scheduled_member_ids.includes(m.id)).map(m=>m.name).join(', ')||'Ingen ännu'}</p><p className="text-xs text-gray-500 mt-2">Timmar för hela jobbet. Schemalagt team räknar även tidigare pass, med 8 h per person och heldag. Kundbokningar ingår inte. Schemalagt är inte rapporterad tid.</p></>}
 </section>
}
