# Säkerhet och betalning, 12 september 2026

- [x] Begränsa databasroller, skydda systemfält och privata filer; verifiera i isolerad PostgreSQL.
- [x] Företagsavgränsa båda vägarna för ombokning och testa främmande bokningar.
- [x] Spara genomförda betalningar, hantera Stripe-fel och förhindra dubbla abonnemang.
- [x] Kör regressioner, typkontroll och bygge. Leverera ändringar för granskning.

Stripe Business-nycklar, nya pris-ID:n och ett riktigt betalningsprov kräver kontokonfiguration och ingår inte som antagna värden i kodändringen.

Verifierat: produktionsbygge (Next 15.5.25), 1942 kontraktstester + 1 förhandsmarkerad skip, 14 React-test, 17 customer-preparation-test, test:six-outcomes och test:launch-security. npm audit: 0 sårbarheter. SQL-migreringarna är införda och efterkontrollerade i produktion.

Byggmiljön hade ett annat projekts ESLint-konfiguration i hemkatalogen. En tillfällig, ej incheckad tom .eslintrc.json avgränsade det här repot, som saknar egna lintregler. Typkontroll och produktionsbygge kördes fullt.

Kvar: publicera appändringen, konfigurera Stripe Business (live-nycklar/priser/portal/webhooks), stäm av gamla konto-ID:n och verifiera verkligt köp/planbyte/uppsägning. Inga riktiga betalningar har gjorts.
