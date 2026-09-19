'use client'
import { useEffect, useRef, useState } from 'react'
import { readRecovery, recoveryKey, type RecoveryCopy } from '@/lib/quotes/draft-recovery'

/**
 * Flikens återställningskopia av en påbörjad offert.
 *
 * RIVNINGEN A3 (2026-09-17): kopian återställs AUTOMATISKT när den finns.
 * Tidigare stod en helskärmsfråga — "Du har en påbörjad offert · Återställ /
 * Börja om" — innan hantverkaren ens såg offerten. Ingen vill svara på det;
 * han vill se sitt arbete. Nu ligger arbetet på plats när sidan laddar, med
 * en rad i statusytan ("Återställt från den här fliken") och en knapp
 * "Börja om" som tömmer både offerten (`onReset`) och kopian.
 *
 * `autoRestore: false` behåller frågan-först-beteendet (`pending` + `restore`)
 * — det är vad tests/quote-experience.ui.spec.ts monterar med egen host, så
 * det kontraktet står kvar orört.
 */
export function useQuoteRecovery<T>({userId,businessId,scope,enabled,value,hasContent,onRestore,onReset,autoRestore=false}: {userId:string;businessId:string;scope:string;enabled:boolean;value:T;hasContent:boolean;onRestore:(value:T)=>void;onReset?:()=>void;autoRestore?:boolean}) {
  const [pending,setPending] = useState<RecoveryCopy<T> | null>(null)
  const [ready,setReady] = useState(false)
  const [status,setStatus] = useState('')
  const [restored,setRestored] = useState(false)
  const disabled = useRef(false)
  const current = useRef({value,hasContent,onRestore,onReset}); current.current={value,hasContent,onRestore,onReset}
  const key=userId ? recoveryKey(userId,businessId,scope) : null
  useEffect(()=>{
    setReady(false);setPending(null);setStatus('');setRestored(false);disabled.current=false
    if(!enabled || !key)return
    let copy: RecoveryCopy<T> | null = null
    try {copy=readRecovery<T>(sessionStorage.getItem(key))}
    catch {setStatus('Den tidigare återställningskopian kunde inte läsas. Spara det nya arbetet som utkast.'); try{sessionStorage.removeItem(key)}catch{}}
    if (copy && autoRestore) {
      // Kopian läggs på plats direkt. Misslyckas det står kopian kvar som
      // pending — hellre frågan än ett tyst tapp.
      try { current.current.onRestore(copy.value); setStatus('Återställt från den här fliken · inte sparat på servern') }
      catch { setPending(copy); setStatus('Kopian kunde inte återställas automatiskt.') }
      setRestored(true)
    } else setPending(copy)
    setReady(true)
  },[key,enabled,autoRestore])
  // One mutable snapshot per scope. Old cleanup must never read the new customer's value.
  const scopeSnapshot = useRef({ key, value, hasContent })
  if (scopeSnapshot.current.key !== key) scopeSnapshot.current = { key, value, hasContent }
  const snapshot = scopeSnapshot.current
  snapshot.value = value; snapshot.hasContent = hasContent
  function persist(announce = true) {
    if (!enabled || !key || !ready || pending || disabled.current) return
    try {
      if (!snapshot.hasContent) { sessionStorage.removeItem(key); return }
      sessionStorage.setItem(key, JSON.stringify({version:1,savedAt:Date.now(),value:snapshot.value}))
      if (announce && !restored) setStatus('Återställningskopia i den här fliken · spara utkast för att behålla på servern')
    } catch { if (announce) setStatus('Återställningskopian kunde inte sparas. Spara utkast innan du lämnar sidan.') }
  }
  const serialized=JSON.stringify(value)
  useEffect(() => {
    const timer = setTimeout(() => persist(), 500)
    return () => clearTimeout(timer)
  }, [serialized, hasContent, enabled, key, ready, pending])
  useEffect(() => {
    const onHide = () => persist()
    window.addEventListener('pagehide', onHide)
    return () => { window.removeEventListener('pagehide', onHide); persist(false) }
    // Only lifecycle changes flush. Typing is handled by the debounce above.
  }, [enabled, key, ready, pending])
  function clear(){disabled.current=true;if(key)try{sessionStorage.removeItem(key)}catch{};setPending(null);setStatus('');setRestored(false)}
  function restore(){if(!pending)return;try{current.current.onRestore(pending.value);setPending(null);setStatus('Arbetet är återställt. Kontrollera offerten och spara utkast.')}catch{setStatus('Kopian kunde inte återställas. Börja om eller behåll fliken medan du kontaktar support.')}}
  function discard(){if(key)try{sessionStorage.removeItem(key)}catch{};setPending(null);setStatus('Tidigare återställningskopia borttagen.')}
  /** "Börja om" efter automatisk återställning: tömmer offerten OCH kopian. */
  function discardRestored(){
    if(key)try{sessionStorage.removeItem(key)}catch{}
    current.current.onReset?.()
    setPending(null);setRestored(false);setStatus('Börjar om från tom offert.')
  }
  return {pending,status,restored,clear,restore,discard,discardRestored}
}
