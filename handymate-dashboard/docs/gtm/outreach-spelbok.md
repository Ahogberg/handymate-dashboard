# Outreach-spelboken — actionpunkter avstämda mot byggd status

> Källa: extern GTM-research 2026-08-30 ("Personaliserad outreach i volym")
> korskörd av Claude mot vad som faktiskt finns i prod. Detta är ett
> arbetsdokument — bocka av, stryk, komplettera. Rapportens fullständiga
> resonemang och källor ligger i chatthistoriken; här finns bara det
> exekverbara.

## Läge vid skrivande

Acceptanspasset (Matte-röstläget + oinspelad Lisa-telefoni) pågår.
**Regel: ingen outreach som genererar demobokningar förrän golden
path-provet är godkänt.** En bokad demo mot en produkt som fäller sitt
eget acceptanstest är värsta möjliga första intryck mot en skeptisk
målgrupp.

---

## A. Redan byggt — kräver ingen utveckling, bara exekvering

| Rapportens rekommendation | Status i produkten |
|---|---|
| Bonusmånader vid helårsbetalning ("betala 10, få 12") | **I PROD.** `YEARLY_MONTHS_FREE = 2`, kronor-inramning, årstoggle i onboarding + billing. Facit: `tests/yearly-plan.spec.ts`. |
| 46elks som SMS-motor | **I PROD.** Strypunkt (`sendSmsViaElks`), nattspärr, STOPP-hantering, kvoter. |
| Pengarna-tillbaka-garanti som friktionssänkare | **BESLUTAD MODELL.** Ingen trial; betala direkt + garanti. Återstår: betona den hårdare i outreach-copy. |
| Referral-program (Jobber-spelboken) | **I PROD.** Partnerprogram v2 sedan 2026-08-11. |
| Demo från skarpt konto | **BYGGT.** Demoläget med seedade wow-ytor + omkörbar onboarding. Betona "riktigt konto, inte demomiljö" i inbjudan. |
| "Hantverkarrapport" som PR-motor (ESSVE-spelboken) | **EMBRYO FINNS.** Företagskollen live på handymate.se/foretagskollen — kan bli datamotorn bakom en rapport i stället för enkät från noll. |
| Juridisk försiktighet kring outbound | **INFRA FINNS.** `gtm_account`/`gtm_activity`/`gtm_suppression` (permissioned outbound-spåret). Linjen är redan permission-first. |

## B. Öppna luckor rapporten träffar — gör FÖRST

- [ ] **Calendly-länken på Företagskollen** — har legat som "kvar" sedan
      sajten gick live 2026-08-11. Rapportens starkaste operativa poäng:
      friktion i bokningen är den dolda läckan (bekräftad tid inom 24h
      eller 8x sämre konvertering; same-day-demo 6,9 % no-show mot 23 %
      vid 8+ dagar). *Ägare: Andreas (Calendly-konto).*
- [ ] **SMS-svar → bokningslänk** — hela SMS-infran finns; det som saknas
      är kopplingen så ett prospekt kan svara på ett SMS och få en
      tidslänk direkt. Litet bygge, hög hävstång. *Ägare: dev.*
- [ ] **SMS-påminnelse 1h före demo** + "rescue"-SMS med enklicks-
      ombokning efter no-show. *Ägare: dev (befintlig SMS-motor).*

## C. Net-new värt att göra — i prioritetsordning

1. - [ ] **Video-outreach med riktig hantverkare framför kameran.**
       Största oanvända tillgången. Filmfabriken, inspelningspipelinen
       och Mattes klonade röst finns redan (annonskampanjen) — pivoten
       från annonsfilm till 45-sek personliga säljvideor är liten.
       Börja gratis: Loom (≤25 videor) eller Vidyard free. Uppgradera
       till Sendspark (AI-röstkloning + dynamisk bakgrund) först när
       volymen kräver det. Håll videor < 45 sek.
2. - [ ] **Founder's rate med hårt utgångsdatum.** T.ex. "gäller de
       första 50 firmorna / t.o.m. 2026-12-31", låst så länge kunden är
       kvar. Skyddar prisintegriteten (ingen platt rabatt), kombineras
       med befintliga bonusmånaderna. Kräver: beslut om nivå + nya
       Stripe-price-id:n + copy. *Beslut: Andreas.*
3. - [ ] **Mikroinfluencer-test.** Börja med liten profil vars publik är
       kollegor (~7k följare, typ @platslagerifornordar), mät bokade
       demos per krona. Skala mot Erik Öst (@erikbygger ~229k) / Filip
       Berti (~114k) bara om testet bär.
4. - [ ] **Branschorganisationernas kanaler.** Byggföretagen (~4 000
       medlemsföretag, sökbart register), Installatörsföretagen (4 200),
       Måleriföretagen (~1 200): nyhetsbrev/event-sponsring. Sannolikt
       den mest GDPR-rena vägen till volym — för oss (permission-first)
       bättre risk/reward än cold email-stackar, inte ett "steg 3".
5. - [ ] **"Hantverkarrapport 2026" ur Företagskollen-data** → PR-vinkel
       → återanvänd i outreach (ESSVE-spelboken i miniatyr).
6. - [ ] **Google Ads mot "Bygglet-alternativ"/"Easoft-alternativ"** med
       landningssida per sökordsgrupp. Skala först när bokningsflödet
       (sektion B) är tätat.

## D. Medvetet bortvalt — och varför

- **Smartlead/Instantly-volymmejl:** 3,43 % svarsfrekvens är argumentet
  *mot* kanalen. Svensk MFL: enmansfirmor kan klassas som privatpersoner
  → samtyckeskrav. 1–3 säljare med videovapen behöver inte inbox-rotation.
- **Ringless voicemail:** juridiskt känsligast av allt, marginellt värde
  ovanpå SMS + video. Hoppa över helt.
- **Clay:** 4–6 veckors upprampning, ~800 USD/mån. Omvärdera först när en
  säljare kan äga verktyget på heltid.
- **LinkedIn som primärkanal:** målgruppen finns på Facebook/Instagram/
  TikTok och i branschmedia. LinkedIn är sekundärt.

## E. Benchmarks som ändrar strategin

| Signal | Tolkning | Åtgärd |
|---|---|---|
| Video-svarsfrekvens < 10 % | Manus/personalisering för svag, inte kanalen | Skärp öppningen, inte volymen |
| Demo-no-show > 20 % | För lång tid intresse → bokning | Same-day-slots + 1h-SMS-påminnelse |
| < 30 % väljer årsavtal | Erbjudandet för svagt | Öka bonusmånader / stärk ROI-inramning INNAN prissänkning |

## F. Juridiska räcken (sammanfattning — konsultera SWEDMA/jurist före volym)

- Elektronisk DM (SMS/mejl) till fysiska personer kräver i regel aktivt
  samtycke. B2B-mejl OK vid intresseavvägning om innehållet är uppenbart
  yrkesrelevant + opt-out finns — men **enskild firma ≈ privatperson**.
- Kall SMS till mobiler är känsligast. All outbound går genom
  `gtm_suppression` + STOPP-hanteringen — inga sidovägar.
- Leverantörsstatistik (25–30 % svarsfrekvens för video, "200–300 %")
  är tak under ideala förhållanden, inte baseline.
