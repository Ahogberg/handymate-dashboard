# Reservationsmotorn — ingen persona, men den renaste jobbspecen av alla

Inkluderad som bonus: den här matchar podd-avsnittets mall nästan perfekt
rakt av, trots att den aldrig fått ett agentnamn i UI:t. Bra referens-
exempel för hur en "riktig" agent-jobbspec ser ut när man designar en ny.

## Käll-kod

- `lib/reservations/match.ts` — ren matchningslogik, ingen I/O.
- `app/dashboard/quotes/_shared/useReservationSuggestions.ts` — hooken,
  triggerlogiken.
- `app/dashboard/quotes/_shared/ReservationReviewSheet.tsx` — godkännande-UI.
- `app/api/reservations/decisions/route.ts` — beslutsskrivning + tystnings-
  logik.

## Jobbspec

**Källa**: offertens radlista (`items`) + förbehållsbiblioteket (hämtat en
gång vid mount från `/api/reservations?include=triggers`).

**Triggas**: `useMemo` vid varje ändring av rader/bibliotek/snapshot/
avvisade-i-sessionen. **Inget serveranrop vid tangenttryck** — allt
matchas lokalt i webbläsaren.

**Filtrerar bort**: redan tillagda förbehåll, avvisade i den här sessionen
(ej sparat), inaktiva/tystade (`suggest_enabled=false`). Rubrik/fritext/
delsumma/rabatt-rader räknas aldrig som matchbara.

**Output**: rendrat direkt i offertdokumentets egen Reservationer-sektion
(flyttades dit från en fristående banner 2026-09-01) + granskningsvyn.

**Kräver godkännande**: ja — förslag är förbockade som standard ("ett
tryck ska räcka"), men texten är redigerbar innan accept, och det är den
redigerade (inte bibliotekets) texten som fryses in i offerten.

**Mått som räknas**: `times_suggested`/`times_accepted`/
`consecutive_rejects` per förbehåll, skrivet direkt i
`reservation_texts`-tabellen vid varje beslut. **Ingen vy visar
acceptansgraden** (`times_accepted / times_suggested`) trots att räknarna
finns — enkel vinst.

**Skriver tillbaka till minnet**: `consecutive_rejects` är den enda
bestående "lärdomen" — tre avvisningar i rad (utan en accept emellan)
tystar förbehållet permanent (`suggest_enabled=false`). En accept
nollställer räknaren. Medvetet ingen händelselogg ("ingen ny tabell, ingen
fråga om hur länge vi sparar hantverkarens beteendedata").

## Varför den här är ett bra referensexempel

Ingen LLM inblandad, ingen "hypoteslista", inget kostnadsanrop — ändå har
den ALLA delarna i jobbspec-mallen, tydligt separerade. Om ni designar en
ny liten agent från scratch: bygg den så här, sedan lägg LLM ovanpå bara
där det faktiskt behövs (textformulering), inte i beslutslogiken.
