/**
 * ROT/RUT/grön teknik som DATERAD REGEL — en sanning (spår 5, 2026-09-18).
 *
 * BAKGRUND: procentsatserna och årstaken låg triplicerade som konstanter i
 * `lib/rot-rut-limits.ts`, `lib/rot-rut.ts` och `lib/skv/validate-rot-request.ts`
 * (plus grön teknik-satserna i `lib/quote-calculations.ts`). Ingen av dem hade
 * ett datum. Det gjorde två fel möjliga samtidigt: en satsändring måste hittas
 * på fyra ställen, och en faktura som betalades under 2025 års TILLFÄLLIGT
 * höjda ROT-sats räknades med 2026 års sats — eller tvärtom. Nu finns satserna
 * på EXAKT ETT ställe, med giltighetsperiod, och koden frågar efter datum.
 *
 * VILKET DATUM STYR: Skatteverket knyter avdraget till BETALNINGSDATUMET —
 * inte till när arbetet utfördes eller när fakturan skrevs. Den regeln är
 * implementerad där betalningsdatumet finns (`lib/skv/validate-rot-request.ts`
 * läser `paid_at`). På vägar som bara känner fakturadatum eller offertdatum
 * används det som BÄSTA KÄNDA DATUM — en faktura som skapas idag betalas i
 * praktiken inom samma regelperiod — och varje sådan väg är kommenterad.
 *
 * DEN HÄR MODULENS ENDA REGEL: aldrig en tyst gissning i en pengaberäkning.
 * Ett datum utanför tabellen ger närmaste regel MED `verifierad: false` och en
 * `console.warn` — aldrig ett tyst påhittat tal. Samma princip som
 * `lib/rot/ratt.ts` (ROT-RÄTTEN per jobbtyp/boendeform), som är ett ANNAT
 * lager: `ratt.ts` svarar "ger arbetet rätt till avdrag?", den här filen
 * svarar "hur mycket, och upp till vilket tak, vid det här datumet?".
 *
 * KÄLLOR (Skatteverket, via docs/bransch/allround.md):
 * - Så fungerar rotavdraget för företag:
 *   https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/safungerarrotavdraget.4.2ef18e6a125660db8b080002709.html
 * - Ger arbetet rätt till rotavdrag:
 *   https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrotavdrag.4.5c1163881590be297b5173bf.html
 * - Ger arbetet rätt till rutavdrag:
 *   https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrutavdrag.4.2ef18e6a125660db8b080001531.html
 *
 * SIFFRORNA: ROT 30 % av arbetskostnaden, max 50 000 kr/person/år (2026).
 * Tillfälligt höjd till 50 % för arbete betalt 2025-05-12..2025-12-31.
 * RUT 50 %, max 75 000 kr/person/år. ROT + RUT tillsammans max 75 000 kr.
 * Grön teknik: solceller 15 %, lagring 50 %, laddpunkt 50 %, tak 50 000 kr/år
 * (satserna flyttade hit oförändrade från lib/quote-calculations.ts).
 */

/** Grön teknik-satserna per kategori — en % av HELA radtotalen (arbete + material). */
export interface GronTeknikAndelar {
  gron_solceller: number
  gron_lagring: number
  gron_laddpunkt: number
}

export interface RotRegel {
  /** Första dag regeln gäller, 'YYYY-MM-DD'. */
  giltig_fran: string
  /** Sista dag regeln gäller, 'YYYY-MM-DD'. null = gäller tills vidare. */
  giltig_till: string | null
  rot_andel: number
  rot_tak: number
  rut_andel: number
  rut_tak: number
  /** Gemensamt tak för ROT + RUT per person och år. */
  totalt_tak: number
  gron_teknik_tak: number
  gron_teknik_andelar?: GronTeknikAndelar
  kalla: string
  /**
   * true = datumet låg i tabellen, siffrorna är källbelagda.
   * false = datumet låg UTANFÖR tabellen och närmaste regel lånades ut.
   * Anropare som visar pengar för en kund ska aldrig behandla false som fakta.
   */
  verifierad: boolean
}

const GRON_ANDELAR: GronTeknikAndelar = {
  gron_solceller: 0.15,
  gron_lagring: 0.50,
  gron_laddpunkt: 0.50,
}

const SKV_ROT = 'Skatteverket — Så fungerar rotavdraget för företag (skatteverket.se/foretag/skatterochavdrag/rotochrut)'

/**
 * Tabellen. Raderna ligger i kronologisk ordning och får inte överlappa.
 * En ny sats läggs till som en NY rad — en befintlig rad skrivs aldrig om,
 * eftersom gamla fakturor måste kunna räknas om med sin egen tids regel.
 */
export const ROT_REGLER: RotRegel[] = [
  {
    giltig_fran: '2025-01-01',
    giltig_till: '2025-05-11',
    rot_andel: 0.30,
    rot_tak: 50000,
    rut_andel: 0.50,
    rut_tak: 75000,
    totalt_tak: 75000,
    gron_teknik_tak: 50000,
    gron_teknik_andelar: GRON_ANDELAR,
    kalla: `${SKV_ROT} — ordinarie ROT-sats 30 % fram till den tillfälliga höjningen`,
    verifierad: true,
  },
  {
    giltig_fran: '2025-05-12',
    giltig_till: '2025-12-31',
    rot_andel: 0.50,
    rot_tak: 50000,
    rut_andel: 0.50,
    rut_tak: 75000,
    totalt_tak: 75000,
    gron_teknik_tak: 50000,
    gron_teknik_andelar: GRON_ANDELAR,
    kalla: `${SKV_ROT} — TILLFÄLLIGT höjd ROT-sats 50 % för arbete betalt 2025-05-12..2025-12-31`,
    verifierad: true,
  },
  {
    giltig_fran: '2026-01-01',
    giltig_till: null,
    rot_andel: 0.30,
    rot_tak: 50000,
    rut_andel: 0.50,
    rut_tak: 75000,
    totalt_tak: 75000,
    gron_teknik_tak: 50000,
    gron_teknik_andelar: GRON_ANDELAR,
    kalla: `${SKV_ROT} — ROT tillbaka på 30 % från 2026-01-01`,
    verifierad: true,
  },
]

const DATUM_MONSTER = /^\d{4}-\d{2}-\d{2}/

/**
 * Normalisera ett datum till 'YYYY-MM-DD'. En Date tolkas i svensk tid
 * (Europe/Stockholm) — regeln är svensk och servern kör UTC, så ett
 * `new Date()` strax efter midnatt den 1 januari skulle annars kunna landa
 * på fel år. En redan datum-formad sträng används ordagrant.
 */
export function datumTillDag(datum: Date | string): string | null {
  if (typeof datum === 'string') {
    if (DATUM_MONSTER.test(datum)) return datum.slice(0, 10)
    const tolkat = new Date(datum)
    if (isNaN(tolkat.getTime())) return null
    return svenskDag(tolkat)
  }
  if (!(datum instanceof Date) || isNaN(datum.getTime())) return null
  return svenskDag(datum)
}

function svenskDag(d: Date): string {
  // sv-SE ger redan 'YYYY-MM-DD'.
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Året ett datum tillhör — samma normalisering som regelFor använder. */
export function arsFor(datum: Date | string = new Date()): number {
  const dag = datumTillDag(datum)
  return dag ? Number(dag.slice(0, 4)) : new Date().getFullYear()
}

/**
 * Regeln som gällde vid ett givet datum. Kastar ALDRIG — en pengaberäkning
 * ska inte krascha på ett saknat datum. Ligger datumet utanför tabellen (eller
 * går inte att tolka) returneras NÄRMASTE regel med `verifierad: false` och en
 * console.warn, så att det syns i loggen i stället för att tyst bli ett tal.
 */
export function regelFor(datum: Date | string = new Date()): RotRegel {
  const dag = datumTillDag(datum)

  if (!dag) {
    const senaste = ROT_REGLER[ROT_REGLER.length - 1]
    console.warn('[rot/regler] Otolkbart datum — lånar senaste regeln, verifierad=false', { datum })
    return { ...senaste, verifierad: false }
  }

  for (const regel of ROT_REGLER) {
    if (dag >= regel.giltig_fran && (regel.giltig_till === null || dag <= regel.giltig_till)) {
      return regel
    }
  }

  // Utanför tabellen: före första raden (äldre fakturor) eller i ett glapp.
  const forsta = ROT_REGLER[0]
  const senaste = ROT_REGLER[ROT_REGLER.length - 1]
  const narmaste = dag < forsta.giltig_fran ? forsta : senaste
  console.warn(
    '[rot/regler] Datum utanför regeltabellen — lånar närmaste regel, verifierad=false',
    { datum: dag, lanad_fran: narmaste.giltig_fran },
  )
  return { ...narmaste, verifierad: false }
}

/** Procentsatsen för ROT eller RUT vid ett datum. */
export function andelFor(typ: 'rot' | 'rut', datum: Date | string = new Date()): number {
  const regel = regelFor(datum)
  return typ === 'rot' ? regel.rot_andel : regel.rut_andel
}

/** Årstaket för ROT eller RUT vid ett datum. */
export function takFor(typ: 'rot' | 'rut', datum: Date | string = new Date()): number {
  const regel = regelFor(datum)
  return typ === 'rot' ? regel.rot_tak : regel.rut_tak
}

/** Grön teknik-satserna vid ett datum (tomt objekt finns aldrig i tabellen). */
export function gronTeknikAndelarFor(datum: Date | string = new Date()): GronTeknikAndelar {
  return regelFor(datum).gron_teknik_andelar ?? GRON_ANDELAR
}
