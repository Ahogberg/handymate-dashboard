'use client'
import { useEffect, useRef, useState } from 'react'
import { readRecovery, recoveryKey, type RecoveryCopy } from '@/lib/quotes/draft-recovery'

export function useQuoteRecovery<T>({userId,businessId,scope,enabled,value,hasContent,onRestore}: {userId:string;businessId:string;scope:string;enabled:boolean;value:T;hasContent:boolean;onRestore:(value:T)=>void}) {
  const [pending,setPending] = useState<RecoveryCopy<T> | null>(null)
  const [ready,setReady] = useState(false)
  const [status,setStatus] = useState('')
  const disabled = useRef(false)
  const current = useRef({value,hasContent,onRestore}); current.current={value,hasContent,onRestore}
  const key=userId ? recoveryKey(userId,businessId,scope) : null
  useEffect(()=>{
    setReady(false);setPending(null);setStatus('');disabled.current=false
    if(!enabled || !key)return
    try {setPending(readRecovery<T>(sessionStorage.getItem(key)))}
    catch {setStatus('Den tidigare återställningskopian kunde inte läsas. Spara det nya arbetet som utkast.'); try{sessionStorage.removeItem(key)}catch{}}
    setReady(true)
  },[key,enabled])
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
      if (announce) setStatus('Återställningskopia i den här fliken · spara utkast för att behålla på servern')
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
  function clear(){disabled.current=true;if(key)try{sessionStorage.removeItem(key)}catch{};setPending(null);setStatus('')}
  function restore(){if(!pending)return;try{current.current.onRestore(pending.value);setPending(null);setStatus('Arbetet är återställt. Kontrollera offerten och spara utkast.')}catch{setStatus('Kopian kunde inte återställas. Börja om eller behåll fliken medan du kontaktar support.')}}
  function discard(){if(key)try{sessionStorage.removeItem(key)}catch{};setPending(null);setStatus('Tidigare återställningskopia borttagen.')}
  return {pending,status,clear,restore,discard}
}
