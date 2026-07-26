---
typ: agent-artikel
målsökord: projektstyrning hantverkare, håller tiden bygge, koll på jobben hantverksföretag
status: UTKAST — ej godkänd
---

# Lars — den som håller koll på att jobben går som de ska

## Problemet

Ett jobb som drar över med tjugo procent syns sällan förrän det är klart. Under
tiden känns det bara som att veckan blev lite rörigare än planerat.

Det är först när fakturan ska skrivas som insikten kommer: det där badrummet
tog fyrtio timmar, inte trettio. Marginalen som såg bra ut i offerten finns inte
kvar. Och eftersom nästa badrum offereras på samma sätt som förra upprepas det.

## Vad Lars gör

Lars är teamets projektledare. Han håller ordning på det som rör tid, bokningar
och hur jobben faktiskt går:

- **Håller reda på bokningar och vad som ska hända härnäst**, så att dagen har
  en plan innan den börjar.
- **Följer projektens hälsa** — hur mycket tid som gått jämfört med vad som
  planerades, och flaggar när något börjar dra iväg.
- **Sammanställer läget** så du ser vad som rullar utan att öppna fem vyer.

Poängen är inte att producera rapporter. Poängen är att avvikelsen ska synas
medan du fortfarande kan göra något åt den — inte när jobbet är fakturerat.

## Varför "tiden gick över" är dyrare än man tror

Övertid på ett fastprisjobb äts inte av marginalen bara en gång. Den sätter
också priset på nästa jobb, om du offererar utifrån vad du *tror* att arbetet
tar snarare än vad det faktiskt tog.

Det är därför skillnaden mellan offererad och verklig tid är en av de mest
värdefulla siffror en hantverksfirma kan ha — och en av de mest sällan
uppmätta, eftersom ingen hinner sammanställa den.

## Varför det hör hemma i ett team

En rapport kräver att någon läser den och drar slutsatser. En kollega säger
till. Skillnaden är att Lars är byggd för att lyfta det som avviker, inte för
att producera ännu en vy du ska komma ihåg att öppna.

---

## Källkontroll

| Påstående | Stöd | Bedömning |
|---|---|---|
| Håller reda på bokningar/dagens plan | Lars projekt-/bokningskoordinering **BYGGT**; "Dagens plan"-kort i Idag-vyn **LIVE** | OK |
| Följer projekthälsa, flaggar avvikelse | `project-health` (veckovis), **BYGGT**; scope-creep-beräkning finns | OK — funktionellt |
| Offererad vs verklig tid som nyckeltal | Efterkalkyl-funktionalitet finns byggd (Motor 1, ny) | ⚠ se flagga |
| Resonemang om övertid/prissättning | Allmänt branschresonemang | OK |

**⚠ STATUS-FLAGGA 1:** Lars är **BYGGT**. Inventeringen noterar dessutom att
projektflyttar via UI *aldrig fungerade* före fixen 2026-07-10 — ödmjukhet är
befogad. Texten innehåller därför inga påståenden om precision eller resultat.

**⚠ STATUS-FLAGGA 2:** Stycket om offererad vs verklig tid ligger nära den nya
efterkalkyl-motorn, som är deployad men **helt oanvänd** (ingen kund har stängt
ett projekt genom den än). Texten beskriver därför bara *varför siffran är
värdefull* — inte att vi levererar den automatiskt. Vill du vara strängare:
stryk stycket helt tills första riktiga efterkalkylen finns.

**Medvetet utelämnat:** allt om lönsamhetssiffror per projekt, marginal-
prognoser, "AI som prissätter åt dig", tidrapporteringens mobilfunktioner.
