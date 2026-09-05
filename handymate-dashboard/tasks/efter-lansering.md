# Efter lansering — den enda ordnade listan

Uppdaterad 2026-09-05. Ersätter ordningarna i tasks/plan-sann-agentstatus.md,
docs/audits/WOW_GENOMLYSNING_2026-09-05.md och Codex granskningar. När den
här och en annan lista säger olika gäller den här.

Inget nedan byggs före 14 september. Före dess bara sådant som gör
befintliga löften sanna.

| # | Satsning | Dagar | Varför här | Byggstenar som finns |
|---|---|---|---|---|
| 1 | **Jobbet går att utföra** — tillträde, kundval, leverans bekräftade innan bilen åker | 3–4 | Värde varje arbetsdag, wow för den anställde, färre bomkörningar | `lib/job-preparation/load.ts` (laddar omfattning + checklistor, kontrollerar inget), utgående SMS-grind, godkännandekort. Saknas: tillstånd för de tre bekräftelserna; obesvarat = okänt, aldrig klart |
| 2 | **Överens om vad som ingår** — genomgång till kunden direkt efter signering | 2 | Billigast, hakar i bokningsloopen som lagades 5 sep, skyddar marginalen | `quote_items`, bortvalda tillval (`lib/quotes/margin.ts`), portalen, signeringsflödet. Invändningar blir kort, aldrig ändrade villkor |
| 3 | **Kundkortsmallar** — insikter som fyller i sig själva, med bevis | 3–4 | Ägaren styr vad teamet VET om varje kund, inte bara vad det prioriterar. Attio-mönstret (AI-attribut) anpassat till vår ärlighetsregel: varje värde pekar på raderna bakom | Motorerna finns spridda (Karin påminnelser, kassaradar, `lib/rot/*`, installationer, `customer_fact`). Saknas: mallregister, beräkning per kund, bevis-länk, UI på kundkortet. Beslut Andreas 2026-09-05: bygg lättillgängligt — färdiga mallar att slå på ("Betalningsvana", "ROT-kandidat", "Kräver förskott", "Tyst kund med installation"), egen regel på svenska via Matte med förhandsvisning på tre kunder innan den slås på, beviset alltid ett tryck bort |
| 4 | **Nästa jobb** — framtida affär fångad på plats | 2–3 | Enda genuint saknade primitiven | `lib/voice/analysis-scope.ts` (+ `future_job`), `lib/matte/intent-agent.ts`, `createLeadAndDeal` i `lib/leads/golden-path.ts`. Saknas: intent, `create_deal`-verktyg, `project_id` på deal |
| 5 | **Portalens boka igen** — förfrågan med installationen som kontext | 2 | Installationsregistret är byggt och synligt för kunden, bara knappen och vägen in saknas | `lib/installation/installation.ts`, `app/api/portal/[token]/installations`, `getCustomerFromPortalToken`. Saknas: `POST /api/portal/[token]/forfragan`, `installation_id` på lead/deal, cron för `service_interval_months` |
| 6 | **Dokumentera innan det byggs in** — rätt foto vid rätt moment | 4–5 | Bra tajming-wow, men kräver momentmodell | `project_workflow_stages`, `lib/egenkontroll/*`, checklistor. Saknas: koppling checklista → moment |
| 7 | **Avvikande fakturapris mot bekräftat inköpspris** | 3 | Den billiga delen av kostnadsbevakningen | `supplier_invoices`, `project_material.purchase_price`. Returer/kreditfakturor har inga tabeller alls — den delen kräver manuell registrering och väntar |
| 8 | **Fyll en avbokning** — accepterat obokat jobb som passar person och plats | 5+ | Intäkt, men flest beroenden | `lib/agents/hanna/capacity-fill.ts` (riktar sig mot nya kunder). Saknas: accepterade obokade jobb, kompetens, restid |
| 9 | **Förklarbar veckoplanering** | — | Först när restid och deadline finns i planeringsdatan | `lib/schedule/person-day.ts`, `DispatchReasoning` |

## Parkerat med skäl
- Rapportläget med foto i samma flöde (`/api/jobbuddy/photo` skapar inga händelser).
- `CURATED_TOOL_NAMES` i vanliga Matte-chatten saknar material/anteckning — eget beslut, projektlåsning saknas där.
- Tio uppskjutna idéer från genomlysningen, i prioritetsordning, i docs/audits/WOW_GENOMLYSNING_2026-09-05.md avsnitt 3.
- Mobil projektyta: beslut PWA vs `handymate-mobile` först.
- Bolagsverket-uppslaget: nycklar saknas och schemat är overifierat.
- `communication_settings`: tabellen finns inte, Kommunikation-sidan och Automationer-sidans sparning är döda. Peka om till `automation_settings`.

## Andreas egna punkter (inte kod)
- 46elks: fyll på, slå på automatisk påfyllning. SMS har varit dött sedan 13 aug.
- Kolla inkorgen efter "⚠️ Handymate driftlarm" från augusti — annars saknas Resend-nyckeln i Vercel.
- Push-prenumeration som obligatoriskt steg i uppstartsmötet.
- Stripe live, demokontot med riktig data, App Store-material, EAS-nycklar.
