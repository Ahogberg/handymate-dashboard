# Design-brief 5 — Bokningsflödet

Skapad 2026-09-07. Att klistra in i Claude Design. Bokningsflödet (`/site/{slug}/boka`) som en fristående sida i hantverkarens varumärke — samma logotyp och accentfärg som offert, portal och faktura — avsedd att länkas från firmans EGEN hemsida, Google-profilen och SMS.

**Beslut 2026-09-07 (Andreas):** hemsidan (`/site/{slug}`) designas INTE om. ICP (5–20 anställda) har redan en hemsida; "din hemsida ingår" är inget argument för dem. Storefronten lever kvar som den är för dem som saknar sajt. Bokningslänken är det ICP inte har. Design levererad: `Bokning.dc.html`.

---

## Prompt

Du designar **bokningsflödet** för en hantverkarfirma i Handymate. Handymate är ett AI-drivet back-office för svenska hantverkarfirmor med 5–20 anställda. Firman har en egen hemsida — bokningslänken är det som saknas på den: en sida där kunden väljer en tid för ett besök, i firmans varumärke, länkad från hemsidans "Boka besök"-knapp, Google-profilen eller ett SMS-svar. Besökaren är en privatperson (eller BRF) i mobilen som vill att någon kommer ut och tittar på jobbet.

Sidan bär **hantverkarens** varumärke (logotyp, accentfärg), inte Handymates. Handymate syns bara som stämpeln "Skickat via Handymate" i sidfoten.

### Problemet sidan löser

Dagens bokningssida är repots sämsta kundyta:
- Fristående sida utan logotyp, utan firmanamn, utan länk tillbaka. Rubriken "Boka tid" — besökaren vet inte vems tid hen bokar.
- Alla färger hårdkodade i **Handymates teal** (#0F766E) oavsett firma.
- 14 dagchips i rad, rutnät av tider, formulär som dyker upp under (rubrik med stavfel "Din uppgifter"). Ingen förklaring av vad man bokar.
- Bekräftelsen: vit ruta, bock, "Tiden är bokad! Vi har bokat 2026-09-14 kl 09:00." — ISO-datum, ingen firma, inget "vad händer nu".

### Vad som faktiskt händer när kunden bokar

- Lediga tider = firmans **arbetstider** per veckodag minus befintliga bokningar, i **60-minutersluckor**. Ingen tjänstelista. Det som bokas är **ett besök** (någon kommer ut och tittar), inte ett arbete.
- Kunden får ett **SMS** direkt: "Hej Anna! Din tid hos Ekström Bygg AB är bokad: tis 15 sep kl 09:00. Vi hör av oss om något behöver ändras." Hantverkaren får ett SMS. Bokningen hamnar i kalendern (+ Google Kalender om kopplad). Kunden blir lead + affär.
- Kunden kan **inte** avboka/omboka själv — bara ringa. Säg det ärligt.
- Tiden hann tas (409) → "Tiden är tyvärr inte längre ledig. Välj en annan tid." + omladdad lista. Max 5 försök/timme/IP (429).
- Ingen betalning, inget konto, ingen BankID.

### Designsystem

- Text `#0F172A / #1E293B / #64748B / #94A3B8`. Kort vita, radie 16, kant `#E2E8F0`. Grund `#F1F5F9`.
- **Accent ur hantverkarens varumärke** (hex → ramp 50–700), default amber `#F59E0B`. Aldrig Handymate-teal. Visa samma sida i två andra accenter + en ljus där texten på accentyta blir mörk.
- Primärknappar `#0F172A`. Accent bara för sidhuvudslinje, valda chips, stegnummer.
- Systemtypsnitt, svenska, du-tilltal. Inga emojis. Ingen dekorativ animation. Mobil 390 först, desktop 1280.

### Flödet

Sidhuvud (logotyp eller firmanamn, accentlinje), sedan tre lugna steg på EN sida:
1. **Välj dag** — närmaste två veckorna; dagar utan arbetstid syns inte, dagar utan lediga tider syns nedtonade. Svenska korta format.
2. **Välj tid** — chips; tomt läge: "Inga lediga tider den dagen" + länk "Nästa lediga: …".
3. **Dina uppgifter** — vald tid som rad med "Ändra" ovanför formuläret; namn, mobilnummer ("Bekräftelsen kommer som SMS"), e-post valfri, "Vad gäller det?" valfri. En rad om vad man bokar (ett besök, ungefär en timme). Knapp "Boka besöket". Fel (409/429/ogiltigt nummer) som lugna inline-rutor.
4. **Bekräftelse** — "Tack Anna. Besöket är bokat." + dag/tid på svenska + "Lägg i kalendern" (ICS) + **Vad händer nu** (SMS nu · firman kommer på utsatt tid · du får en offert efteråt) + "Behöver du ändra tiden? Ring oss på …". Ingen avboka-knapp.

### Sanningsregler

- Kunden bokar ett besök, inte ett arbete. Ingen betalning. Kan inte avboka själv.
- Inga löften som inte gäller alla firmor: "kostar inget" bara om firman valt det; "fast pris" sägs inte; vem som kommer sägs bara om firman har en kontaktperson — annars firmanamnet.
- Exempeldata: **Ekström Bygg AB**, org.nr 556123-4567, F-skatt, 070-123 45 67, mån–fre 07–16. Kund Anna Lindqvist, 070-987 65 43, "Badrum som ska renoveras, ca 6 kvm". Bokning tis 15 sep 2026 kl 09:00–10:00.
- "Skickat via Handymate" i sidfoten.

### Leverabler

Mobil 390: välj dag/tid, uppgifter, bokat, tiden togs, för många försök, dag utan tider. Desktop 1280 en vy. Tre andra accenter. Komponentlista: WeekPicker, SlotGrid, BookingSummary, ContactForm, Confirmation.

---

## Kodfakta för bygget (inte till Design)

- Sidan: `app/site/[slug]/boka/page.tsx` (130 rader, inline-stilar, hårdkodad #0F766E). Enda länken dit i kodbasen: storefrontens "Boka tid" (`StorefrontClient.tsx:389`) — ICP når den aldrig förrän länken exponeras.
- API: `GET /api/public/availability/[slug]?date&duration` (working_hours − booking, duration 15–480), `POST /api/public/book/[slug]` (force-dynamic, 5/h/IP via `checkPublicRateLimitDb`, 409 vid krock, Golden Path kund+lead+deal, SMS kund + hantverkare, kalendersynk).
- Varumärke: `lib/branding/get-branding.ts` (`loadBranding` → logo_url, accent_color, business_name, contact_name, f_skatt_registered, org_number, public_phone) — boka-sidan läser INTE den i dag. Stämpel via `lib/branding/attribution.ts`.
- Nytt i bygget: ICS-fil för "Lägg i kalendern" (klientgenererad, ingen route); "Din bokningslänk" med kopiera-knapp i `/dashboard/settings/kundvy`; texten "kostar inget" bakom en inställning (default av).
- Efter lansering (ny feature, inte nu): Lisa/Matte skickar bokningslänken i SMS när uppringaren vill ha besök.
