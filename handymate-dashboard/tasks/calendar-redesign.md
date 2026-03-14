# Kalender-redesign — Progress

## Status: Klar

## Vad som byggts

### API: app/api/calendar/events/route.ts (OMSKRIVEN)
- [x] GET /api/calendar/events?start=YYYY-MM-DD&end=YYYY-MM-DD
- [x] Hämtar Handymate-bokningar med kundinfo (name, phone)
- [x] Hämtar Google Calendar-händelser via calendar_connection
- [x] Graceful fallback: google: [] om token saknas/expired
- [x] Auto-refresh av expired Google tokens
- [x] Returnerar `{ handymate, google, googleConnected }`

### Kalendervy: app/dashboard/calendar/page.tsx (OMSKRIVEN)
- [x] Ren CSS Grid-kalender — inget externt bibliotek
- [x] Veckoheader med pil-navigation och "Idag"-knapp
- [x] Datumvisning: "10–16 mars 2026"
- [x] Växlare: Vecka / Dag
- [x] 7 kolumner (mån–sön), timrader 06:00–20:00
- [x] Handymate-bokningar i teal (#0F766E) med kundnamn + jobbtyp
- [x] Google Calendar-händelser i grå/neutral färg med titel
- [x] Klick på bokning → sidopanel med detaljer + redigera/ta bort
- [x] Klick på tomt tidsfält → "Ny bokning"-modal med datum/tid förifyllt
- [x] Överlappande händelser sida vid sida
- [x] Röd linje för nuvarande tid (idag-markör)
- [x] Heldagshändelser i egen rad ovanför timgridet
- [x] "Koppla Google Calendar"-banner om ej ansluten
- [x] Mobilvy → dagvy som default (< 768px)
- [x] Dagväljare med pills i dagvy
- [x] "Ny bokning"-knapp i header (behållen)
- [x] All boknings-CRUD via /api/actions (oförändrad)

### Vad som tagits bort
- [x] Flik-navigation "Bokningar / Tidrapport"
- [x] Filter "Alla / Idag / Kommande"
- [x] Time entry UI (finns redan under /dashboard/time)
- [x] Bakgrundseffekter (blur blobs)

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build
