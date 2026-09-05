# Leverans 3: från intäktsfynd till nästa handling

## Beslut
Befintlig intäktsåtervinning följer redan direktreferenser från godkännande
till ÄTA, projekt, faktura och betalning. Hemytan visar högst tre ärenden.
Bygg en samlad arbetskö på Pengar där alla lästa ärenden kan hittas och tas
vidare. Ingen ny AI-detektor eller parallell faktureringsväg.

## Acceptans
- Befintligt GET får explicit view=queue; standardurvalet på hemsidan förblir tre.
- Samma owner/admin-grind och befintliga databasfrågor; inga nya queries eller migrationer.
- Filter för Din tur, Väntar, Behöver kontrolleras och Avslutade; sökning på projekt och fakturanummer.
- Nästa steg med befintliga länkar. Fel och okänd kedja blir aldrig grönt eller betalt.
- Belopp märks som identifierat underlag respektive fakturabelopp. Ingen totalsumma över ärenden som kan dela faktura/källor.
- Ärendets skapandedatum visas; det är inte ett förfallodatum eller tid i aktuell fas.
- Ingen kundkontakt eller ekonomisk skrivning sker från kön.
- Synliga läs-/behörighetsfel, manuell uppdatering och återläsning när sidan får fokus.
- Ändrat företag avmonterar tidigare data och avbryter pågående hämtning.

## Marknadsunderlag
Fieldly och Bygglet har redan tid/material/ÄTA/fakturering. Den här förbättringen
prioriterar sammanhängande uppföljning och nästa handling i Handymates befintliga
intäktskedja; ingen verifierad exklusivitet på marknaden påstås.
https://sv.fieldly.com/produkt/fakturering
https://bygglet.com/funktion/fakturahantering/

## Verifiering
31 tester godkända: befintlig härledning av intäktskedjan, urval för hem/kö,
sortering, sökning, den riktiga GET-handlern med simulerade beroenden (401,
403, företagsavgränsning, 500), samt fyra Chromiumtester för mobil/desktop,
läsfel/återförsök och byte av företag. API-svaren i UI-testerna är simulerade.
Skärmbilder granskade vid 375 och 1280 px, inget horisontellt överflöde.
Typkontroll och produktionsbygg godkända. Befintliga varningar om Sentry,
metadata och saknade externa miljöberoenden kvarstår; bygget är inget skarpprov.

Inloggat prov med verkliga poster återstår. Kontrollera owner/admin respektive
anställd, ett ärende i varje fas, fler än tre fynd, direktlänkar, samt faktisk
betalningsstatus på källfakturan. Inga utskick eller nya ekonomiska poster
ska skapas när kön öppnas. Ingen ny databasfråga eller migration har tillkommit.
Ärendetiteln kommer från redan läst approval.title och hjälper skilja flera
fynd på samma projekt.
 Befintlig gräns på 1000 källgodkännanden
kvarstår och ger synligt fel när den överskrids, aldrig tyst trunkerad kö.
