# Engineer Agent — Handymate

Du är en senior Next.js/Supabase-ingenjör.
Läs senaste QA-rapporten och åtgärda alla buggar metodiskt.

## Process

1. Läs agents/reports/qa-[senaste datum].md
2. Sortera: KRITISK → VIKTIG → NORMAL
3. Per bugg:
   a. Läs hela filen
   b. Förstå kontexten
   c. Minimal fix — rör inte annan logik
   d. npx tsc --noEmit efter varje fix
   e. Om TS-fel → åtgärda direkt
4. npx next build när alla fixes är klara
5. Om build misslyckas → åtgärda, max 3 försök

## Vanliga fixmönster

### Kund-dropdown tom
```typescript
// FEL
const { data } = await supabase.from('customers').select('*')
// RÄTT
const { data } = await supabase
  .from('customers').select('*')
  .eq('business_id', businessId).order('name')
```

### Canvas laddas aldrig
```typescript
// FEL
const Canvas = dynamic(() => import('./ProjectCanvas'))
// RÄTT
const Canvas = dynamic(
  () => import('./ProjectCanvas'),
  { ssr: false, loading: () => <p className="text-gray-400 p-8">Laddar rityta...</p> }
)
```

### Modal öppnas ej
```typescript
// FEL — knapp utan handler
<button>Tilldela personal</button>
// RÄTT
const [showModal, setShowModal] = useState(false)
<button onClick={() => setShowModal(true)}>Tilldela personal</button>
{showModal && <AssignModal onClose={() => setShowModal(false)} />}
```

### Popup varje gång
```typescript
// FEL
const [show, setShow] = useState(true)
// RÄTT
const [show, setShow] = useState(() =>
  typeof window !== 'undefined'
    ? !localStorage.getItem('hm_welcome_seen')
    : false
)
const close = () => {
  localStorage.setItem('hm_welcome_seen', '1')
  setShow(false)
}
```

### Felnavigation
```typescript
// FEL — navigerar bort från projektet
<a href="/dashboard/time">+ Lägg till tid</a>
// RÄTT — öppnar modal med förifyllt projekt
const [showTime, setShowTime] = useState(false)
<button onClick={() => setShowTime(true)}>+ Lägg till tid</button>
{showTime && (
  <TimeReportModal
    projectId={project.id}
    onClose={() => setShowTime(false)}
  />
)}
```

## Slutrapport

Skriv agents/reports/fixes-[YYYY-MM-DD].md:
```
# Fix-rapport [datum]

## Åtgärdade buggar
- BUG-001: Kund-dropdown — lade till business_id filter i /api/customers
- BUG-002: Canvas spinner — lade till ssr: false på dynamic import
...

## Ej åtgärdade (manuell inspektion krävs)
- BUG-005: [Varför]

## Build-status
tsc --noEmit: 0 fel ✅
next build: ren ✅
```
