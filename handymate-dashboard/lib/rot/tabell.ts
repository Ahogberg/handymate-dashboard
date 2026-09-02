import type { RotRad } from './ratt'

/**
 * ROT_TABELL — genererad ur granskat underlag (tasks/plan-rot-ratt.md, Del 2).
 *
 * URVAL: bara rader i docs/bransch/*.md som är märkta ROT, RUT, GT eller Nej
 * UTAN asterisk och UTAN "?" (dvs. inte ROT*, inte "?"), och som INTE är en
 * av de fyra rader den mekaniska kontrollen underkände
 * (docs/bransch/granskning/MEKANISK_KONTROLL_2026-09-02.md): El rad 4
 * ("Elrenovering"), El rad 6 ("El vid kök-/badrumsrenovering"), El rad 7
 * ("Montering/byte av eluttag") och Allround rad 3 ("Reparation av vitvaror
 * i bostaden"). Alla andra jobbtyper — inklusive alla ROT*-, RUT*- och
 * "?"-märkta rader — är MEDVETET utelämnade. bedomAvdrag() i lib/rot/ratt.ts
 * ger då 'okant' för dem, vilket är hela poängen: den här tabellen bär bara
 * det som faktiskt är källbelagt, inte en gissning om resten.
 *
 * HEDERLIGHETSPRINCIPEN FÖR bostadsratt: fältet sätts bara till ett konkret
 * värde ('rot'/'rut'/'gron_teknik'/'inget') när branschfilen (radens egen
 * anmärkning, eller en uttrycklig branschfakta-formulering i SAMMA fil för
 * exakt den sortens arbete) faktiskt säger något om bostadsrätt. I annat
 * fall är värdet 'okant' — ALDRIG en gissning om att bostadsrätt beter sig
 * som småhus (docs/bransch/README.md, tvärgående fynd #1: samma arbete kan
 * ge ROT i småhus men inte i bostadsrätt). Två genomgående undantag som INTE
 * är gissningar utan uttryckligen belagda mönster i källmaterialet:
 *   - RUT-rader: ingen av de tio branschfilerna visar någon gång att RUT
 *     skiljer sig mellan boendeformer (RUT är hushållsnära, personbundet —
 *     inte fastighetsbundet som ROT). bostadsratt sätts därför lika med
 *     smahus för alla RUT-rader.
 *   - Rader där smahus är 'inget' av en anledning som inte har med
 *     boendeform att göra (staket/murar, service/kontroll/felsökning,
 *     grävning för pool, filmning av avloppsrör, sten/plattor direkt på
 *     mark, nyanläggning av tomt, nybyggnation): bostadsratt sätts också
 *     till 'inget', eftersom en bostadsrätt aldrig har STÖRRE ROT-rätt än
 *     ett småhus — det är golvet, inte en gissning uppåt.
 * Allt annat som inte är uttryckligen belagt lämnas som 'okant' — även när
 * det hade varit rimligt att gissa att det troligen är likadant. Se t.ex.
 * VVS "Installation av värmepump" eller El:s grön teknik-rader: schablon-
 * eller produktionsvillkor nämns, men ingen av dem är ett uttryckligt
 * ja/nej-svar för bostadsrätt, så fältet är 'okant'.
 *
 * `granskad: true` gäller alla rader i den här tabellen — det är själva
 * urvalsvillkoret (se ovan), inte ett fält som varierar rad för rad.
 */

const SKV_ROT = 'SKV-ROT — https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrotavdrag.4.5c1163881590be297b5173bf.html'
const SKV_GT = 'SKV-GT — https://www.skatteverket.se/privat/fastigheterochbostad/gronteknik.4.676f4884175c97df4192860.html'
// Två skilda SKV-sidor för RUT citeras i branschfilerna (samma sakinnehåll,
// olika URL:er i respektive fils källtabell) — vi återger den som filen
// själv angav i stället för att slå ihop dem till en påhittad gemensam.
const SKV_RUT_MARK = 'SKV-RUT — https://www.skatteverket.se/privat/fastigheterochbostad/rotochrutarbete/rutarbeten.106.5c1163881590be297b53de7.html'
const SKV_RUT_FORETAG = 'SKV-RUT — https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrutavdrag.4.2ef18e6a125660db8b080001531.html'

export const ROT_TABELL: RotRad[] = [
  // ── El (electrician) — el.md, 11 rader ──────────────────────────────
  {
    slug: 'electrician-byte-av-elcentral', namn: 'Byte av elcentral', bransch: 'electrician',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "installera och komplettera elcentraler (proppskåp)" ger ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'electrician-ny-eldragning', namn: 'Ny eldragning / kabeldragning', bransch: 'electrician',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "dra in el" ger ROT; el i trädgården ingår inte.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'electrician-byte-till-jordade-uttag', namn: 'Byte till jordade uttag', bransch: 'electrician',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "byta och montera vägguttag" ger ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'electrician-infallda-spotlights', namn: 'Infällda spotlights', bransch: 'electrician',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Listad ordagrant hos Skatteverket som ROT-arbete.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'electrician-laddbox', namn: 'Installation av laddbox', bransch: 'electrician',
    smahus: 'gron_teknik', bostadsratt: 'okant',
    grund: 'Grön teknik 50 % — laddningspunkt och kabel till elcentral ingår. Reparation av laddbox ger varken ROT eller grön teknik.',
    kalla: SKV_GT, granskad: true,
  },
  {
    slug: 'electrician-solceller', namn: 'Installation av solceller', bransch: 'electrician',
    smahus: 'gron_teknik', bostadsratt: 'okant',
    grund: 'Grön teknik 15 %. Skatteverket: "installera, reparera och byta ut solceller".',
    kalla: SKV_GT, granskad: true,
  },
  {
    slug: 'electrician-batterilagring', namn: 'Installation av batterilagring', bransch: 'electrician',
    smahus: 'gron_teknik', bostadsratt: 'okant',
    grund: 'Grön teknik 50 % — kräver egen elproduktion (solceller) på fastigheten.',
    kalla: SKV_GT, granskad: true,
  },
  {
    slug: 'electrician-felsokning', namn: 'Felsökning av elfel', bransch: 'electrician',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Skatteverket: "enbart felsöka" ger inte ROT — bara den reparation som eventuellt följer.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'electrician-varmepump-elinstallation', namn: 'Värmepump — elinstallation', bransch: 'electrician',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'ROT med schablon: luftvärmepump 30 %, vätska-vatten/bergvärme 35 % av totalkostnaden räknas som arbete — inte grön teknik.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'electrician-larm-passagesystem', namn: 'Larm och passagesystem', bransch: 'electrician',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Skatteverket: "installera och reparera larm eller övervakningskameror" ger inte ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'electrician-laddstolpe-brf-foretag', namn: 'Laddstolpe / laddstation (BRF, företag)', bransch: 'electrician',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Skatteverket: fristående laddstolpe ger inte ROT för privatperson; för BRF/företag är installationen B2B.',
    kalla: SKV_ROT, granskad: true,
  },

  // ── VVS (plumber) — vvs.md, 16 rader ────────────────────────────────
  {
    slug: 'plumber-blandare', namn: 'Byte/reparation av blandare (kök, dusch, tvättställ)', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "installera och reparera ... blandare, kranar" ger ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-toalettstol', namn: 'Byte av toalettstol', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "toalett" ger ROT, liksom byte av flottör, packningar och silar.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-handfat-kommod', namn: 'Byte av handfat / kommod', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "handfat" ger ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-dusch', namn: 'Montering av dusch (duschvägg, duschkabin, takdusch)', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "dusch, badkar" ger ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-vattenmatarkonsol', namn: 'Byte av vattenmätarkonsol', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket ordagrant: "vattenmätarkonsol".',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-varmepump', namn: 'Installation av värmepump (luft/vatten, bergvärme, frånluft)', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "installera, reparera och byta ... värmepumpar" — schablon 30 % (luftvärmepump) eller 35 % (t.ex. bergvärme) av totalkostnaden räknas som arbete; inte grön teknik.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-element-radiator', namn: 'Byte av element / radiator', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "element, termostat" ger ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-nya-ledningar', namn: 'Nya vatten-/avloppsledningar (rördragning)', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'inget',
    grund: 'Skatteverket småhus: "dra in och reparera el-, vatten- och avloppsledningar" ger ROT. I bostadsrätt gäller bara arbete i eller på vägg inom bostadens gränser — att dra in ledningar "från början" ger inte ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-enskilt-avlopp', namn: 'Enskilt avlopp (trekammarbrunn, minireningsverk)', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "anlägga avlopp (trekammarbrunnar, infiltrationsbäddar)" ger ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-badrumsrenovering-vvs', namn: 'Badrumsrenovering — VVS-delen', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: toalett, dusch, badkar, handfat och kakel-/klinkersättningar ger ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-golvbrunn', namn: 'Byte av golvbrunn', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'rot',
    grund: 'Skatteverket bostadsrätt uttryckligen: "Byta golvbrunn" ger ROT (till skillnad från att flytta den, som inte gör det).',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-varmepanna', namn: 'Byte av värmepanna', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "värmepannor" ger ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-fjarrvarmevaxlare', namn: 'Fjärrvärmeväxlare', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "(till exempel bergvärme och fjärrvärme): 35 procent" räknas som arbetskostnad.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-solvarmesystem', namn: 'Solvärmesystem', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "solvärmesystem: 30 procent" räknas som arbetskostnad — inte grön teknik.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-vattenfelsbrytare', namn: 'Vattenfelsbrytare / vattenlarm', bransch: 'plumber',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket ordagrant: "vattenfelsbrytare" ger ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'plumber-rorinspektion', namn: 'Rörinspektion / avloppsfilmning', bransch: 'plumber',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Skatteverket: "Filmning av avloppsrör" ger inte ROT.',
    kalla: SKV_ROT, granskad: true,
  },

  // ── Måleri (painter) — maleri.md, 8 rader ───────────────────────────
  {
    slug: 'painter-invandig-malning', namn: 'Invändig målning av väggar och tak', bransch: 'painter',
    smahus: 'rot', bostadsratt: 'rot',
    grund: 'Skatteverket: "måla golv, tak, väggar, fönster och element" ger ROT — gäller uttryckligen både småhus och bostadsrätt.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'painter-innertak', namn: 'Målning av innertak', bransch: 'painter',
    smahus: 'rot', bostadsratt: 'rot',
    grund: 'Del av samma Skatteverket-citat som invändig målning ("måla golv, tak, väggar"), bekräftat för både småhus och bostadsrätt.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'painter-tapetsering', namn: 'Tapetsering', bransch: 'painter',
    smahus: 'rot', bostadsratt: 'rot',
    grund: 'Skatteverket: "tapetsera" ger ROT — gäller uttryckligen både småhus och bostadsrätt.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'painter-dorrar-foder-snickerier', namn: 'Målning av dörrar, foder och snickerier', bransch: 'painter',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "måla eller lacka dörrar och köksluckor" ger ROT (gäller inte arbete i företagets egna lokaler).',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'painter-golvslipning', namn: 'Golvslipning, lackning och oljning av trägolv', bransch: 'painter',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Del av Skatteverkets "slipa och byta golv, tak och väggmaterial".',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'painter-golvlaggning', namn: 'Golvläggning / byte av golv (parkett, laminat, trä)', bransch: 'painter',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "...byta golv... material" — nytt golv i befintlig bostad, inte nyproduktion.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'painter-trapphus', namn: 'Målning av trapphus', bransch: 'painter',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Trapphus är normalt fastighetens/BRF:ens gemensamma yta och upphandlas av föreningen — ger inte den enskilda medlemmens ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'painter-staket-plank-murar', namn: 'Målning av staket, plank och murar', bransch: 'painter',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Skatteverket säger uttryckligen nej för både småhus och bostadsrätt: "måla staket eller murar".',
    kalla: SKV_ROT, granskad: true,
  },

  // ── Snickeri (carpenter) — snickeri.md, 6 rader ─────────────────────
  {
    slug: 'carpenter-platsbyggd-forvaring', namn: 'Platsbyggd förvaring (garderober, bokhyllor, skåp)', bransch: 'carpenter',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket ordagrant: "montera platsbyggda fasta möbler, exempelvis garderober och bokhyllor".',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'carpenter-staket-plank-mur', namn: 'Staket, plank och mur', bransch: 'carpenter',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Skatteverket säger nej i tre separata skrivningar: reparation/underhåll, byggande, och gräv-/markarbete för staket, plank och murar.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'carpenter-dorrar', namn: 'Dörrar (byte/reparation, lås och handtag)', bransch: 'carpenter',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "byta och reparera köksluckor, dörrar, dörrlås, dörrhandtag och fönsterbleck" ger ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'carpenter-fonster', namn: 'Fönster (byte/reparation)', bransch: 'carpenter',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "reparera eller byta ut fönster samt montera bullerglas och isolerglas" ger ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'carpenter-golv', namn: 'Golv (trägolv/parkett — läggning, slipning, byte)', bransch: 'carpenter',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "slipa och byta golv, tak och väggmaterial" ger ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'carpenter-fasad', namn: 'Fasad (klädsel, panel, reparation)', bransch: 'carpenter',
    smahus: 'rot', bostadsratt: 'inget',
    grund: 'Skatteverket: "byta och reparera fasader, hängrännor och takpannor" ger ROT för småhus; fasad räknas som gemensam egendom i BRF och ger inte den enskilda medlemmens ROT.',
    kalla: SKV_ROT, granskad: true,
  },

  // ── Bygg (construction) — bygg.md, 7 rader ──────────────────────────
  {
    slug: 'construction-tillbyggnad', namn: 'Tillbyggnad av bostadshus', bransch: 'construction',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket ordagrant: "göra tillbyggnad av bostadshus, förråd, garage, carport eller gäststuga".',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'construction-rivning-ombyggnad-planlosning', namn: 'Rivning och ombyggnad av planlösning (invändigt)', bransch: 'construction',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "riva väggar och bygga om planlösningen i ett hus samt arbeta med tilläggsisolering".',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'construction-murning-putsning', namn: 'Murning och putsning (fasad, skorsten, murstock)', bransch: 'construction',
    smahus: 'rot', bostadsratt: 'inget',
    grund: 'Skatteverket: "mura och reparera skorstenar, murstockar, öppna spisar och kakelugnar" samt fasader/entrétrappor — men gemensam fasad i BRF ger inte ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'construction-badrumsrenovering', namn: 'Badrumsrenovering (våtrum)', bransch: 'construction',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "sätta kakel och klinker" samt installation av toalett, dusch, badkar och handfat.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'construction-fasadrenovering', namn: 'Fasadrenovering (puts, lagning — ej målning)', bransch: 'construction',
    smahus: 'rot', bostadsratt: 'inget',
    grund: 'Skatteverket: "byta och reparera fasader, hängrännor och takpannor" — gemensam fasad i BRF/flerbostadshus ger inte ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'construction-altanbygge', namn: 'Altanbygge (trä eller gjuten platta)', bransch: 'construction',
    smahus: 'rot', bostadsratt: 'inget',
    grund: 'Skatteverket: "bygga altan och balkong ... i trä eller på gjuten platta" ger ROT för småhus; för bostadsrätt/BRF ger det inte ROT om altanen inte är ihopbyggd med bostaden, och gräv-/markarbetet för den ger aldrig ROT i BRF.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'construction-stensattning-plattsattning-utomhus', namn: 'Stensättning/plattsättning utomhus (gårdsplan, uppfart, gårdsbjälklag)', bransch: 'construction',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Skatteverket uttryckligen: "lägga sten och plattor direkt på mark" ger inte ROT.',
    kalla: SKV_ROT, granskad: true,
  },

  // ── Tak (roofing) — tak.md, 6 rader ──────────────────────────────────
  {
    slug: 'roofing-takomlaggning', namn: 'Takomläggning / takbyte (tegel, betong, plåt, papp)', bransch: 'roofing',
    smahus: 'rot', bostadsratt: 'inget',
    grund: 'Skatteverket: "reparera, rengöra eller byta ut plåttak" samt "byta ... takpannor" ger ROT för småhus. Tak räknas som gemensam egendom i bostadsrätt och ger inte medlemmens ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'roofing-reparation-lagning', namn: 'Reparation och lagning av tak', bransch: 'roofing',
    smahus: 'rot', bostadsratt: 'inget',
    grund: 'Skatteverket: "byta och reparera fasader, hängrännor och takpannor" ger ROT för småhus. Tak är gemensam egendom i bostadsrätt.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'roofing-taktvatt-mossbekampning', namn: 'Taktvätt / mossbekämpning / algbehandling', bransch: 'roofing',
    smahus: 'rot', bostadsratt: 'inget',
    grund: 'Skatteverket (Rengöring, småhus): "rengöra altandäck, fasader, tak, takpannor, hängrännor och solceller" ger ROT — inte RUT trots att det ligger nära gräsmattans mossbekämpning. Tak är gemensam egendom i bostadsrätt.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'roofing-snoskottning-tak', namn: 'Snöskottning från tak', bransch: 'roofing',
    smahus: 'rut', bostadsratt: 'rut',
    grund: 'Skatteverket RUT ordagrant: "Rutavdrag ges för att skotta snö på uppfarter, hus- och garagetak samt gårdsplaner" samt att ta bort istappar.',
    kalla: SKV_RUT_FORETAG, granskad: true,
  },
  {
    slug: 'roofing-hangrannor-stupror', namn: 'Hängrännor och stuprör (byte, reparation, rensning)', bransch: 'roofing',
    smahus: 'rot', bostadsratt: 'inget',
    grund: 'Skatteverket ordagrant: "hängrännor och stuprör" ger ROT för småhus. Tak och hängrännor räknas som gemensam egendom i bostadsrätt.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'roofing-platarbeten', namn: 'Plåtarbeten / plåtslageri (bandtäckning, nock, plåtdetaljer)', bransch: 'roofing',
    smahus: 'rot', bostadsratt: 'inget',
    grund: 'Del av samma Skatteverket-citat som takomläggning ("byta ut plåttak"). Gemensam egendom i bostadsrätt.',
    kalla: SKV_ROT, granskad: true,
  },

  // ── Mark (groundworks) — mark.md, 12 rader ──────────────────────────
  {
    slug: 'groundworks-dranering-husgrund', namn: 'Dränering av husgrund', bransch: 'groundworks',
    smahus: 'rot', bostadsratt: 'inget',
    grund: 'Skatteverket ordagrant: "dränera husgrunder" ger ROT för småhus. I bostadsrätt ger bara gräv-, mark- och sprängarbete för att bygga ut husgrunden ROT — alla andra markarbeten, dränering inräknat, ger inte ROT för en BRF-medlem.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'groundworks-enskilt-avlopp', namn: 'Enskilt avlopp / avloppsanläggning (infiltration, markbädd, minireningsverk, trekammarbrunn)', bransch: 'groundworks',
    smahus: 'rot', bostadsratt: 'inget',
    grund: 'Skatteverket: "göra markarbeten för avlopp" samt "avloppsbrunnar, till exempel trekammarbrunnar" ger ROT för småhus. Avloppsarbete på tomten ger uttryckligen inte ROT för en BRF-medlem.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'groundworks-borrning-bergvarme-brunn', namn: 'Borrning för bergvärme / brunn', bransch: 'groundworks',
    smahus: 'rot', bostadsratt: 'inget',
    grund: 'Skatteverket: "göra markarbeten för värmeförsörjning" ger ROT för småhus (schablon 35 % av entreprenadpriset). Värmeförsörjning på tomten ger uttryckligen inte ROT för en BRF-medlem.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'groundworks-poolschakt', namn: 'Poolschakt / grävning för pool', bransch: 'groundworks',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Skatteverket uttryckligen: "gräva för att anlägga en pool" ger inte ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'groundworks-stenlaggning-plattsattning', namn: 'Stenläggning / plattsättning (uppfart, gångar, uteplats)', bransch: 'groundworks',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Skatteverket: "asfaltera, lägga sten eller plattor samt anlägga uppfarter, gräsmattor och trädgårdsgångar" ger inte ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'groundworks-asfaltering', namn: 'Asfaltering (uppfart, gårdsplan)', bransch: 'groundworks',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Samma Skatteverket-formulering som stenläggning/plattsättning — ger inte ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'groundworks-staket-murar', namn: 'Staket och murar (inkl. stödmur)', bransch: 'groundworks',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Skatteverket ordagrant: "bygga staket och murar" ger inte ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'groundworks-tradgardsanlaggning', namn: 'Trädgårdsanläggning / nyanläggning av tomt', bransch: 'groundworks',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Ger varken ROT eller RUT — Skatteverket ROT: "anlägga gräsmattor och trädgårdsgångar" ger inte ROT; Skatteverket RUT: att plantera/omplantera samt asfaltera/lägga sten/plattor/anlägga gräsmattor ger inte heller rutavdrag.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'groundworks-snorojning-halkbekampning', namn: 'Snöröjning och halkbekämpning', bransch: 'groundworks',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Löpande fastighetsservice, inte renovering — tas inte upp alls i Skatteverkets ROT-lista.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'groundworks-bredband-fiber', namn: 'Markarbete för bredband/fiber/elledningar (kanalisation)', bransch: 'groundworks',
    smahus: 'rot', bostadsratt: 'inget',
    grund: 'Skatteverket: "göra markarbeten för ledningar av elektronisk kommunikation, till exempel bredband och fiber" ger ROT för småhus. Ledningar för el och elektronisk kommunikation på tomten ger uttryckligen inte ROT för en BRF-medlem.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'groundworks-tradgardsskotsel', namn: 'Trädgårdsskötsel (gräsklippning, häckklippning, ogräsrensning, röjning)', bransch: 'groundworks',
    smahus: 'rut', bostadsratt: 'rut',
    grund: 'Skatteverket RUT: "klippa gräs, häckar, rosor och buskar", "rensa ogräs och bekämpa mossa", "röja sly, vass och tång på tomten".',
    kalla: SKV_RUT_MARK, granskad: true,
  },
  {
    slug: 'groundworks-tradfallning-beskarning', namn: 'Trädfällning och beskärning', bransch: 'groundworks',
    smahus: 'rut', bostadsratt: 'rut',
    grund: 'Skatteverket RUT: "fälla och beskära träd", "stubbfräsning eller annat arbete för att ta bort stubbar".',
    kalla: SKV_RUT_MARK, granskad: true,
  },

  // ── Ventilation (hvac) — ventilation.md, 10 rader ───────────────────
  {
    slug: 'hvac-ovk-besiktning', namn: 'OVK-besiktning', bransch: 'hvac',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Skatteverket: "göra servicearbeten eller kontroll och översyn av maskiner och inventarier" ger inte ROT — besiktning/kontroll faller under samma princip.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'hvac-ventilationsservice', namn: 'Ventilationsservice / underhåll (filterbyte, kontroll av komponenter, remmar)', bransch: 'hvac',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Samma Skatteverket-undantag: "servicearbeten eller kontroll och översyn" ger inte ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'hvac-nytt-ventilationssystem', namn: 'Installation av nytt ventilationssystem / FTX-aggregat', bransch: 'hvac',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket: "installera ... ventilation" ger ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'hvac-luftvarmepump', namn: 'Installation av luftvärmepump (luft-luft)', bransch: 'hvac',
    smahus: 'rot', bostadsratt: 'rot',
    grund: 'Skatteverket ägarlägenhet: "installera och reparera en AC eller en luftvärmepump"; Skatteverket namnger generiskt "värmepumpar" som ROT-grundande för både småhus och bostadsrätt.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'hvac-luft-vattenvarmepump', namn: 'Installation av luft-vattenvärmepump', bransch: 'hvac',
    smahus: 'rot', bostadsratt: 'rot',
    grund: 'Samma generiska "värmepumpar"-formulering som luftvärmepump — gäller enligt Skatteverket för både småhus och bostadsrätt.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'hvac-bergvarmepump', namn: 'Installation av bergvärmepump', bransch: 'hvac',
    smahus: 'rot', bostadsratt: 'rot',
    grund: 'Samma generiska "värmepumpar"-formulering som ger ROT för både småhus och bostadsrätt; borrningsdelen specifikt är inte separat utredd.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'hvac-reparation-varmepump', namn: 'Reparation av värmepump', bransch: 'hvac',
    smahus: 'rot', bostadsratt: 'rot',
    grund: 'Skatteverket: "installera och reparera värmepannor, värmepumpar och solvärmesystem" — den generiska "värmepumpar"-formuleringen gäller för både småhus och bostadsrätt; rotavdrag och grön teknik kan inte ges för samma arbete.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'hvac-service-varmepump', namn: 'Service av värmepump (filterrengöring, kontroll av kompressor/pump)', bransch: 'hvac',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Samma Skatteverket-undantag som OVK/ventilationsservice: "servicearbeten eller kontroll och översyn" ger inte ROT.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'hvac-projektering-ventilationssystem', namn: 'Projektering / ritning av ventilationssystem (CAD)', bransch: 'hvac',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Planering/ritning nämns inte som godkänt arbete hos Skatteverket.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'hvac-felsokning-varmepump', namn: 'Felsökning av värmepump (utan reparation)', bransch: 'hvac',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Skatteverket skiljer "installera och reparera" (godkänt) från ren felsökning/kontroll (inte godkänt).',
    kalla: SKV_ROT, granskad: true,
  },

  // ── Totalentreprenad (general_contractor) — totalentreprenad.md, 3 rader ──
  {
    slug: 'general_contractor-badrumsrenovering-nyckelfardigt', namn: 'Badrumsrenovering, nyckelfärdigt', bransch: 'general_contractor',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Ordinär renovering av befintligt badrum ger ROT enligt Skatteverket — samma regel oavsett om totalentreprenören eller en enskild VVS-firma utför arbetet.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'general_contractor-koksrenovering-nyckelfardigt', namn: 'Köksrenovering, nyckelfärdigt', bransch: 'general_contractor',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket nämner uttryckligen "byta och reparera köksluckor"; övriga köksmoment följer den allmänna ROT-regeln för renovering.',
    kalla: SKV_ROT, granskad: true,
  },
  {
    slug: 'general_contractor-attefallshus', namn: 'Attefallshus / komplementbyggnad', bransch: 'general_contractor',
    smahus: 'inget', bostadsratt: 'inget',
    grund: 'Skatteverket uttryckligen: inget avdrag för "ett helt nytt hus eller en friggebod, ett garage... eller liknande fristående byggnad" — attefallshus är nybyggnation.',
    kalla: SKV_ROT, granskad: true,
  },

  // ── Allround (other) — allround.md, 5 rader ─────────────────────────
  {
    slug: 'other-mobelmontering-fristaende', namn: 'Möbelmontering (lösa/fristående möbler: säng, soffa, byrå, garderob, skrivbord)', bransch: 'other',
    smahus: 'rut', bostadsratt: 'rut',
    grund: 'Skatteverket RUT ordagrant: "förflytta, montera och demontera möbler och lösöre" — gäller fristående möbler (platsbyggda fasta möbler är i stället ROT).',
    kalla: SKV_RUT_FORETAG, granskad: true,
  },
  {
    slug: 'other-gardiner', namn: 'Uppsättning av gardiner, gardinstänger och rullgardiner', bransch: 'other',
    smahus: 'rut', bostadsratt: 'rut',
    grund: 'Skatteverket RUT ordagrant: "sätta upp och ta ner gardiner samt montera gardinstänger och rullgardiner".',
    kalla: SKV_RUT_FORETAG, granskad: true,
  },
  {
    slug: 'other-snoskottning', namn: 'Snöskottning (uppfart, tak, gårdsplan)', bransch: 'other',
    smahus: 'rut', bostadsratt: 'rut',
    grund: 'Skatteverket RUT ordagrant: "skotta snö på uppfarter, hus- och garagetak samt gårdsplaner".',
    kalla: SKV_RUT_FORETAG, granskad: true,
  },
  {
    slug: 'other-tradgardsskotsel', namn: 'Trädgårdsskötsel (gräsklippning, häck-/buskklippning, ogräsrensning)', bransch: 'other',
    smahus: 'rut', bostadsratt: 'rut',
    grund: 'Skatteverket RUT ordagrant: "klippa gräs, häckar, rosor och buskar" och "rensa ogräs och bekämpa mossa".',
    kalla: SKV_RUT_FORETAG, granskad: true,
  },
  {
    slug: 'other-koksluckor-fronter', namn: 'Montering av köksluckor/fronter (byte, ej nyinstallation)', bransch: 'other',
    smahus: 'rot', bostadsratt: 'okant',
    grund: 'Skatteverket ordagrant (småhus): "byta och reparera köksluckor, dörrar, dörrlås, dörrhandtag och fönsterbleck" — detta är ROT, inte RUT, trots att det säljs av en fixarfirma.',
    kalla: SKV_ROT, granskad: true,
  },
]
