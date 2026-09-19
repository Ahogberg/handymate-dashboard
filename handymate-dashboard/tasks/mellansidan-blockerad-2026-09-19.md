# Mellansidan går inte att koppla ännu — kanvasen bär exempeldata

**2026-09-19.** Båda kanvaserna kompilerar rent:

```
Mellansidan-webb.dc.html  → 209 JSX-rader, props: ordning, antalJobbtyper, harRader, visaRaknare
App-mellansidan.dc.html   → 201 JSX-rader, samma props
```

Men de går inte att montera mot verkligheten, och det beror inte på en bugg.

## Vad som saknas

Logikklassen i kanvasen bär **exempeldata och tomma handlare**. Ur den
genererade filen:

```js
// Exempeldata. I produktion: GET /api/job-types (företagsegna, sorterade efter användning).
JOBTYPES = [ … ]
jobTypes: jobTypes.map((j, i) => ({ …j, start: () => {} }))
onNyttFlode: () => {}, onAlla: () => {}
onBlank: () => {}, onClose: () => {}
```

Claude Design har alltså skrivit ut vad som ska hända — men lämnat kopplingen
öppen.

## Varför det inte går att lösa på vår sida

`lib/dc/runtime.tsx` är avsiktligt tom:

> *"Basklassen finns bara för att ge klassen ett `this.state`, `this.setState`
> och React-livscykeln. Den lägger inte till något beteende — en basklass som
> tolkar props eller state hade blivit en andra sanning om hur designen
> fungerar."*

De enda injektionspunkterna är de fyra deklarerade props:en, och ingen av dem
bär data eller handlare. Att kringgå det kräver att man handredigerar den
genererade filen — vilket är precis det som är förbjudet, av samma skäl.

## Precedensen säger samma sak

`app/admin/sales/page.tsx` monterar sin genererade komponent **rakt av**, utan
omslag. Den fungerar för att säljytans kanvas bär det RIKTIGA API-anropet i
sin egen logikklass. Filens egen kommentar:

> *"kanvasens iframe har ingen nätutgång bortom sin egen origin, så CTA:n kunde
> aldrig nå vårt API därifrån … **Porteringen ÄR kopplingen.**"*

Mönstret är alltså: kanvasens logikklass bär beteendet, och porteringen gör
det körbart. Mellansidans kanvas gör inte det ännu.

## Vad som ska beställas av Claude Design

En export till, med tre saker i logikklassen:

1. **Jobbtyperna ur servern** i stället för `JOBTYPES`-konstanten —
   `GET /api/job-types/quote-setup` ger `{ jobTypes, templates, products,
   linkingAvailable }` (`lib/quotes/job-type-setup.ts`). Sorterade efter
   användning, med `antalAlla` ur samma svar.
2. **Riktiga handlare:** `start(jobbtyp)` → frågeflödet, `onNyttFlode` →
   `/dashboard/settings/job-types`, `onAlla` → hela listan, `onBuild` →
   samma väg som dagens "Bygg utkast", `onBlank` → dokumentet, `onClose` →
   tillbaka.
3. **`visaRaknare: default false`.** Kontrollräknaren är vårt verktyg, inte
   kundens information — "9 av 12 kontroller" i en hantverkares huvud är ett
   tekniskt ord i UI, mot CLAUDE.md.

## Rättelse

Jag sa 2026-09-19 att ingen ny export behövdes. **Det gällde bara räknaren** —
den går att släcka med en prop på anropsstället. Kopplingen till riktiga
jobbtyper och handlare kräver en export till. Jag borde ha sagt det när jag
svarade, inte upptäckt det vid bygget.

## Beslutat och oförändrat

- Räknaren släckt (Andreas 2026-09-19).
- `ordning: offert-forst` — beskrivningsvägen fungerar för alla direkt, medan
  17 av 34 jobbtyper hos riktiga kunder saknar upplägg tills kom-ikapp körts.
  Omprövas när kom-ikapp körts och frågeflödet leder någonstans för alla.
