# Offertupplevelsen — skiss och leverans

## Skiss
En arbetsyta med tydligt dokumentfokus. Ingen tvingad stegvis guide.

| Placering | Innehåll | Handling |
| --- | --- | --- |
| Överkant | Titel, sparstatus, sammanfattad nästa fråga | Spara utkast / Granska och skicka |
| Dokument | Arbete, antal, priser, kundens innehåll | Redigera på plats, mobilens befintliga radpanel |
| Vägledning | Viktigaste öppna frågan, övriga avsnitt expanderbara | Hoppa till rätt dokumentdel |
| Prisminne | Endast relevanta AI-rader som fått pris | Bara denna offert som standard; aktivt val att spara i artikelregistret |
| Vid återbesök | Påbörjat arbete i samma flik, tidpunkt | Återställ eller börja om, aldrig tyst överskrivning |
| Avslut | Befintlig offert- och utskicksgranskning | Samma serverväg och mottagarbekräftelse |

## Bevarade kontrakt
applyProductToItem, komponent-/prissnapshot, reservationsmotorn,
beräkningsmotorn, artikelkopplingar, ROT/RUT, betalplan och /api/quotes/send.
Skicka-etiketten förtydligas eftersom knappen först sparar och öppnar granskning.

## Spartrygghet
Nya offerter får en versionsmärkt återställningskopia i sessionStorage, separat
per inloggad användare, företag och startkontext. Återställning sker explicit.
Ingen ny DB-query eller serverautosparväg. Kopian överlever omladdning i samma
flik; den ersätter inte Spara utkast eller synk mellan enheter. Lagringsfel visas.
Kopia tas bort först efter bekräftad serversparning. Pågående arbete får inte
skriva över en väntande återställning. Befintligt edit-autospar behålls.

## Granskning
Bygg verkliga komponenter, testa återställning/fel/isolering och prisvalets
skrivgräns samt befintliga artikel-/reservationskontrakt. Mobil och desktop
visuellt granskas. Typkontroll och produktionsbygg. Separat PR för sidgranskning.

## Levererat och verifierat
- 91 riktade kontrakts-/enhetstester godkända för bland annat artikelkoppling,
  reservationer, edit-autospar och ensamma Spara/Skicka-knappar per skärmstorlek.
- 9 Chromiumtester godkända: 375/1280 px, vägledning, aktivt registerprisval,
  återställning med kopplingar, lagringsfel, kundförhandsvisning utan utskick,
  den verkliga sparhookens POST/PUT-val och utebliven rensning utan bekräftat id.
  UI-anrop och sparhookens externa beroenden är simulerade i testerna.
- Typkontroll och slutligt produktionsbygg godkända (exit 0). Befintliga
  Sentry-/metadata-/miljövarningar kvarstår; bygget är inget skarpprov.
- [Öppningsbar skiss](review.html) exporterad från riktiga nya kontrollkomponenter
  med ett förenklat exempeldokument. Den kan öppnas fristående utan nätverk och
  har verifierats efter export. Detta är inte en inloggad produktionsoffert.
- desktop.png och mobile.png visar skissen. Artikel-/reservationsmotorerna,
  beräkningar och servervägar för sparning och utskick återanvänds.

## Granska på grenen före merge
1. Ny offert via beskrivning, mall och manuell start. Prova utan vald kund.
2. Lägg till artikel, justera mängd/pris, acceptera ett förbehåll och lägg betalplan.
3. Ladda om samma flik: återställ eller börja om. Kontrollera priser, kopplingar,
   förbehåll, bilagor och inställningar. Återställningskopian gäller i högst 24 h.
4. Kontrollera att priset bara gäller offerten tills registervalet görs aktivt.
5. Spara, öppna igen och kontrollera riktig serverdata. Växla konto/företag.
6. Granska och skicka: öppna kundens dokument i dialogen och kontrollera mottagare.
7. Prova fysisk mobil med tangentbord, dålig anslutning och uppladdade bilagor.

Skarpa prov med inloggat konto, verkliga lagringslänkar och leverantörer är inte
utförda i denna miljö. Inga nya API-rutter, SQL-migrationer eller databasfrågor.
PR #8:s paketjämförelse ligger i separat gren och ingår inte i denna leverans.
