'use client'
import type { QuoteItem } from '@/lib/types/quote'
export function QuotePriceMemory({items,onChange}:{items:QuoteItem[];onChange:(items:QuoteItem[])=>void}) {
  const rows=items.filter(row=>row.item_type==='item' && row.ai_price_missing && row.unit_price>0)
  if(!rows.length)return null
  return <details className="rounded-xl border border-teal-200 bg-white p-4">
    <summary className="min-h-[44px] cursor-pointer font-semibold text-teal-900">Priser för nästa jobb <span className="text-sm font-normal">· {rows.filter(row=>row.save_to_products===true).length} valda</span></summary>
    <p className="mb-3 text-sm text-slate-600">Priserna gäller den här offerten. Välj vilka du också vill spara i artikelregistret när du sparar offerten.</p>
    {rows.map(row=><label key={row.id} className="flex min-h-[44px] items-center gap-3 py-2 text-sm"><input type="checkbox" checked={row.save_to_products===true} onChange={e=>onChange(items.map(item=>item.id===row.id?{...item,save_to_products:e.target.checked}:item))}/><span>{row.description} · {row.unit_price.toLocaleString('sv-SE')} kr/{row.unit}<span className="block text-xs text-slate-500">{row.linked_product_id?'Uppdatera den kopplade artikelns standardpris':'Spara som artikel för framtida offerter'}</span></span></label>)}
  </details>
}
