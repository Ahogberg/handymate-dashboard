# Offertflödet — status 2026-08-05

Alla SQL körda av Andreas: v88 (kategoristädning), v89 (RLS), v90 (dold rad),
v91 (reservationer).

## KLART OCH DEPLOYAT

**Etapp 1 — artikelbanken** (`2a5e24ed`)
- lib/product-defaults.ts äger branschsortimentet, genererar både `products`
  och `price_list` → telefonen och offerten kan inte säga olika pris
- 13 branscher × 9–24 artiklar (var 3–6), med artikelnummer, arbetsandel, ROT/RUT
- seedProducts i onboarding + admin-rutt för backfill (torrkörning som default)
- Tokeniserad sökning: "fasad mål" hittar Fasadmålning. Synonymer + rankning
- sql/v88 kategoristädning, v89 RLS (separat p.g.a. anon-klient-risken)

**Etapp 2 — rad-UX på mobilen** (`58bcfa60`)
- AddRowSheet: sök i artikelbanken från canvasen (~9 → 2–3 interaktioner)
- Delad useProductSearch i alla fyra sökytor
- "+ Lägg till rad" ut ur den skalade A4:an (träffyta ~15px → 44px)
- Flytta rad via moveItemById + upp/ned i RowEditSheet
- Dölj rad (v90): osynlig för kund, priset ingår i summan
- show_components_to_customer fick sitt första gränssnitt

**Etapp 3 — reservationsmotorn** (`1713f84c`)
- v91: reservation_texts + reservation_triggers (produkt/kategori/nyckelord)
- Dedupe gratis via union per reservation
- Snapshot på quotes.reservations_snapshot — offerten juridiskt fristående
- Tyst banner → granskningsvy med förbockade, redigerbara förslag
- Inlärning: tystas efter 3 avvisningar i rad, med Ångra
- Rendering i alla fyra vägarna (canvas/Modern, premium, friendly, jsPDF)
- 27 seedade reservationer, facit-test vaktar att vi aldrig åberopar ABS 18

**Trackingfixar + idé 1** (`6450f971`, `d918c765`)
- ÖPPNAD sattes nästan aldrig — portalen loggade inget. Nu delad
  lib/quotes/track-open.ts som pixeln OCH portalen använder
- PORTALENS ACCEPT var stympad (inget projekt, ingen deal, ingen bekräftelse).
  Nu delad lib/quotes/finalize-accepted.ts i båda vägarna + 409 vid 0 rader
- PORTALENS AVBÖJANDE tappade declined_at och skäl — lagat
- FYRA-ÖGON-AVSLAG lämnade offerten i pending_approval (osynlig) — återställs
  nu till utkast
- is_hidden saknades i select:en → gårdagens läckagefix var verkningslös
- **Idé 1:** notifyQuoteOpened — "Anna läser din offert nu", bara första gången

**Idé 3 — marginalen live** (`e0e91b76`)
- QuoteMarginCard i assistentkolumnen på båda editorytorna
- Saknat inköpspris räknas ALDRIG som noll (hade gett falska 100 %)
- Självgardande: syns bara när minst en rad har känt inköpspris

**Idé 2 — strukturerat nej** (`53335950`, `b640025e`)
- lib/quotes/decline-reasons.ts: fyra val, kod + valfri fritext
- 'not_now' matar återaktiveringsmotorn i stället för att skrivas av
- buildDeclineInsight påstår aldrig en trend på tunt underlag
  (≥5 avböjda, ≥40 % andel OCH ≥3 i kategorin)
- Kundvyn och portalen skickar nu samma reason_code

## KVAR ATT BYGGA

**Idé 2b — förlustanalysens yta.** Motorn och datat finns; det som saknas är
kortet som visar `summarizeDeclineReasons` + `buildDeclineInsight` för
hantverkaren. Naturlig plats: /dashboard/analytics eller ett kort på
offertlistan. Litet jobb nu när aggregeringen är facit-testad.

**Idé 4 — signera → boka direkt.** Kapacitetsmotorn (lib/capacity) finns.
Efter signering: "Vi har plats vecka 38 — passar det?" i signeringsflödet.

**Idé 5 — kundens fråga per rad.** Kunden trycker på en rad i kundvyn och
frågar; frågan landar som kort i godkännande-kön. Gör offerten till en kanal.

**Idé 6 — automatiska referensfoton.** project_photos finns. Bifoga 2–3 foton
från tidigare liknande jobb i kundvyn.

**Etapp 4 — offertkoll före utskick.** Regelbaserad checklista i
skickadialogen: rader på 0 kr, osedda reservationsförslag, ROT utan
personnummer, passerat giltighetsdatum, betalplan som inte summerar.

## ÖPPNA PUNKTER

- **v89 (RLS) behöver ögonkontroll:** logga in som ägare OCH som anställd,
  öppna Ny offert och kontrollera att snabbvalsknapparna visar artiklar.
  Blir de tomma finns återställningen i filhuvudet på sql/v89_products_rls.sql.
- **Backfill av produktbanken** för befintliga konton körs via
  POST /api/admin/backfill-products (dryRun: true först).
- **Prisnivåerna i seed-datan** behöver Christoffers branschkoll.
- **`signed` skrivs aldrig** till quotes.status — WON_QUOTE_STATUSES har en
  död medlem. Ofarligt men värt att städa.
- **E2E-sviten** (comprehensive/navigation/api/buttons/sms/quote, 127 tester)
  kräver inloggad session och kan inte köras med --no-deps.
