/**
 * Reservationsbiblioteket — förbehåll hantverkaren får med sig från dag 1.
 *
 * Varför seedat: hantverkare skriver aldrig egna reservationer. Utan ett
 * bibliotek som redan är kopplat till artiklar och nyckelord blir motorn en
 * tom yta ingen fyller — och då hade vi lika gärna kunnat låta bli att bygga
 * den.
 *
 * HÅLLNING: texterna är NEUTRALA FORMULERINGSMALLAR skrivna av oss, inom
 * vanlig branschpraxis. Vi citerar eller åberopar ALDRIG ABS 18,
 * Hantverkarformuläret eller AB 04 — det vore att låtsas om en juridisk
 * auktoritet vi inte har. UI:t säger uttryckligen "formuleringsmallar som
 * stöd, inte juridisk rådgivning", och hantverkaren kan redigera varje text
 * innan den läggs på offerten.
 *
 * Triggers är medvetet breda på nyckelord (fångar AI- och fritextrader, som
 * saknar både produktkoppling och kategori) och smala på kategori.
 */

export interface ReservationDefaultTrigger {
  type: 'category' | 'keyword'
  value: string
}

export interface ReservationDefault {
  /** Stabil nyckel — seed-idempotens och inlärning över omseedningar. */
  system_key: string
  title: string
  content: string
  triggers: ReservationDefaultTrigger[]
  /** Branscher som får reservationen i sitt startbibliotek. */
  branches: string[]
}

const BYGG = ['construction', 'carpenter', 'roofing', 'flooring', 'plumber', 'electrician', 'painter', 'hvac']
const ALLA = [...BYGG, 'gardening', 'cleaning', 'moving', 'locksmith', 'other']

const RESERVATIONS: ReservationDefault[] = [
  // ── Gäller i stort sett alla uppdrag ──────────────────────────────
  {
    system_key: 'res_tilltrade',
    title: 'Tillträde och framkomlighet',
    content:
      'Priset förutsätter fritt tillträde till arbetsytan under överenskomna arbetstider samt att ytan är utrymd och framkomlig vid arbetets start. Väntetid eller extra arbete som beror på utebliven åtkomst debiteras enligt löpande räkning.',
    triggers: [{ type: 'keyword', value: 'arbete' }, { type: 'keyword', value: 'installation' }, { type: 'keyword', value: 'montering' }],
    branches: ALLA,
  },
  {
    system_key: 'res_ata',
    title: 'Tilläggsarbeten',
    content:
      'Arbete utöver vad som anges i denna offert utförs först efter överenskommelse och debiteras enligt löpande räkning om inget annat avtalats skriftligt.',
    triggers: [{ type: 'keyword', value: 'arbete' }, { type: 'keyword', value: 'renovering' }, { type: 'keyword', value: 'installation' }],
    branches: ALLA,
  },
  {
    system_key: 'res_omfattning',
    title: 'Arbetets omfattning',
    content:
      'Priset bygger på de uppgifter och den omfattning som angetts vid offerttillfället. Visar det sig på plats att omfattningen är större än beskrivet stämmer vi av med beställaren innan arbetet fortsätter.',
    triggers: [
      { type: 'keyword', value: 'arbete' },
      { type: 'keyword', value: 'jobb' },
      { type: 'keyword', value: 'service' },
      { type: 'keyword', value: 'timme' },
      { type: 'keyword', value: 'tim' },
    ],
    branches: ALLA,
  },
  {
    system_key: 'res_dolda_fel',
    title: 'Dolda fel och skador',
    content:
      'Reservation görs för dolda fel och skador i konstruktionen som inte kunnat upptäckas vid besiktning före arbetets start. Åtgärder av sådana fel ingår inte i priset och debiteras efter separat överenskommelse.',
    triggers: [
      { type: 'category', value: 'arbete_bygg' },
      { type: 'keyword', value: 'rivning' },
      { type: 'keyword', value: 'renovering' },
      { type: 'keyword', value: 'demontering' },
    ],
    branches: BYGG,
  },
  {
    system_key: 'res_myndighetskrav',
    title: 'Tillstånd och myndighetskrav',
    content:
      'Priset förutsätter att erforderliga tillstånd finns och att inga ytterligare myndighetskrav tillkommer. Bygglov, anmälan och avgifter till myndighet ingår inte om det inte uttryckligen anges.',
    triggers: [
      { type: 'keyword', value: 'tillbyggnad' },
      { type: 'keyword', value: 'renovering' },
      { type: 'keyword', value: 'håltagning' },
      { type: 'keyword', value: 'installation' },
    ],
    branches: BYGG,
  },
  {
    system_key: 'res_materialpris',
    title: 'Materialpriser',
    content:
      'Angivna materialpriser gäller vid offertdatum. Vid väsentliga prisförändringar hos leverantör före leverans förbehåller vi oss rätten att justera priset efter avstämning med beställaren.',
    triggers: [
      { type: 'category', value: 'material_bygg' },
      { type: 'category', value: 'material_el' },
      { type: 'category', value: 'material_vvs' },
    ],
    branches: BYGG,
  },

  // ── Rivning, bygg och konstruktion ────────────────────────────────
  {
    system_key: 'res_asbest',
    title: 'Asbest och annat farligt material',
    content:
      'Om asbest, PCB eller annat hälsofarligt material påträffas avbryts arbetet omedelbart. Provtagning och sanering ingår inte i priset och utförs av behörig entreprenör mot separat debitering.',
    triggers: [
      { type: 'keyword', value: 'rivning' },
      { type: 'keyword', value: 'demontering' },
      { type: 'keyword', value: 'bilning' },
      { type: 'keyword', value: 'badrumsrenovering' },
    ],
    branches: ['construction', 'carpenter', 'plumber', 'flooring', 'roofing'],
  },
  {
    system_key: 'res_bjalklag',
    title: 'Bjälklag och bärighet',
    content:
      'Priset förutsätter att befintligt bjälklag är i fullgott skick och har tillräcklig bärighet för avsett ändamål. Förstärkning eller byte av skadade konstruktionsdelar tillkommer.',
    triggers: [
      { type: 'keyword', value: 'bjälklag' },
      { type: 'keyword', value: 'golv' },
      { type: 'keyword', value: 'badrumsrenovering' },
      { type: 'keyword', value: 'håltagning' },
    ],
    branches: ['construction', 'carpenter', 'flooring', 'plumber'],
  },
  {
    system_key: 'res_fukt',
    title: 'Fukt- och mögelskador',
    content:
      'Reservation görs för fukt- och mögelskador som upptäcks först när ytskikt eller konstruktion öppnats. Uttorkning, sanering och återställning av sådana skador ingår inte i priset.',
    triggers: [
      { type: 'keyword', value: 'badrum' },
      { type: 'keyword', value: 'tätskikt' },
      { type: 'keyword', value: 'rivning' },
      { type: 'keyword', value: 'dränering' },
    ],
    branches: ['construction', 'plumber', 'flooring', 'carpenter'],
  },
  {
    system_key: 'res_barande',
    title: 'Bärande konstruktion',
    content:
      'Ingrepp i bärande konstruktion förutsätter konstruktörsberäkning och i förekommande fall bygglov eller anmälan. Kostnad för beräkning, avväxling och tillstånd ingår inte om det inte uttryckligen anges.',
    triggers: [
      { type: 'keyword', value: 'håltagning' },
      { type: 'keyword', value: 'bärande' },
      { type: 'keyword', value: 'vägg' },
    ],
    branches: ['construction', 'carpenter'],
  },

  // ── VVS ───────────────────────────────────────────────────────────
  {
    system_key: 'res_tatskikt',
    title: 'Befintligt tätskikt',
    content:
      'Priset förutsätter att befintligt tätskikt är helt och fackmässigt utfört. Om tätskiktet är skadat eller inte uppfyller gällande branschregler krävs komplett omläggning, vilket tillkommer.',
    triggers: [
      { type: 'keyword', value: 'tätskikt' },
      { type: 'keyword', value: 'kakel' },
      { type: 'keyword', value: 'klinker' },
      { type: 'keyword', value: 'golvbrunn' },
    ],
    branches: ['plumber', 'construction', 'flooring'],
  },
  {
    system_key: 'res_stammar',
    title: 'Befintliga rör och stammar',
    content:
      'Priset förutsätter att befintliga rör och stammar är i brukbart skick och går att ansluta till. Byte av uttjänta ledningar eller anpassning till avvikande dimensioner debiteras separat.',
    triggers: [
      { type: 'category', value: 'arbete_vvs' },
      { type: 'keyword', value: 'blandare' },
      { type: 'keyword', value: 'wc' },
      { type: 'keyword', value: 'avlopp' },
    ],
    branches: ['plumber', 'hvac'],
  },

  // ── El ────────────────────────────────────────────────────────────
  {
    system_key: 'res_elcentral',
    title: 'Befintlig elcentral och kapacitet',
    content:
      'Priset förutsätter att befintlig elcentral har ledigt utrymme och tillräcklig kapacitet för den nya installationen. Uppgradering av central, huvudsäkring eller serviceledning tillkommer.',
    triggers: [
      { type: 'category', value: 'arbete_el' },
      { type: 'keyword', value: 'laddbox' },
      { type: 'keyword', value: 'elgrupp' },
      { type: 'keyword', value: 'installation' },
    ],
    branches: ['electrician', 'hvac'],
  },
  {
    system_key: 'res_dolda_ledningar',
    title: 'Dolda ledningar',
    content:
      'Reservation görs för dolda el-, vatten- och värmeledningar i väggar och bjälklag. Skador som uppstår trots normal aktsamhet vid håltagning, och åtgärder för att flytta ledningar, ingår inte i priset.',
    triggers: [
      { type: 'keyword', value: 'håltagning' },
      { type: 'keyword', value: 'dragning' },
      { type: 'keyword', value: 'infräsning' },
      { type: 'keyword', value: 'spotlight' },
    ],
    branches: ['electrician', 'construction', 'carpenter', 'plumber'],
  },

  // ── Måleri ────────────────────────────────────────────────────────
  {
    system_key: 'res_underlag_maleri',
    title: 'Underlagets skick',
    content:
      'Priset förutsätter att underlaget är torrt, rent och i målningsbart skick. Omfattande spackling, lagning av sprickor eller borttagning av befintliga skikt som inte håller tillkommer.',
    triggers: [
      { type: 'category', value: 'arbete_maleri' },
      { type: 'keyword', value: 'målning' },
      { type: 'keyword', value: 'tapetsering' },
      { type: 'keyword', value: 'spackling' },
    ],
    branches: ['painter'],
  },
  {
    system_key: 'res_vader',
    title: 'Väderlek vid utomhusarbete',
    content:
      'Utomhusarbete förutsätter väderlek som tillåter fackmässigt utförande. Vid ihållande nederbörd, kyla eller hög luftfuktighet kan arbetet behöva skjutas upp, vilket kan påverka tidplanen.',
    triggers: [
      { type: 'keyword', value: 'fasad' },
      { type: 'keyword', value: 'tak' },
      { type: 'keyword', value: 'altan' },
      { type: 'keyword', value: 'utvändig' },
    ],
    branches: ['painter', 'roofing', 'carpenter', 'construction'],
  },
  {
    system_key: 'res_kulor',
    title: 'Kulör och nyans',
    content:
      'Mindre nyansskillnader kan förekomma mot färgprov, mellan olika tillverkningspartier och vid bättringsmålning av befintliga ytor. Sådana skillnader utgör inte grund för reklamation.',
    triggers: [{ type: 'keyword', value: 'målning' }, { type: 'keyword', value: 'lackering' }],
    branches: ['painter'],
  },

  // ── Tak ───────────────────────────────────────────────────────────
  {
    system_key: 'res_underlagstak',
    title: 'Underlagstak, läkt och takstolar',
    content:
      'Priset förutsätter att underlagstak, läkt och takstolar är i fullgott skick. Byte av rötskadat virke eller komplettering av undertak upptäcks först när taktäckningen demonterats och tillkommer.',
    triggers: [
      { type: 'keyword', value: 'tak' },
      { type: 'keyword', value: 'takbyte' },
      { type: 'keyword', value: 'takpanna' },
      { type: 'keyword', value: 'plåttak' },
    ],
    branches: ['roofing', 'construction', 'carpenter'],
  },
  {
    system_key: 'res_stallning',
    title: 'Ställning och fallskydd',
    content:
      'Om arbetet kräver ställning, lift eller särskilt fallskydd tillkommer kostnad för detta om det inte uttryckligen ingår i offerten.',
    triggers: [
      { type: 'keyword', value: 'tak' },
      { type: 'keyword', value: 'fasad' },
      { type: 'keyword', value: 'hängränna' },
    ],
    branches: ['roofing', 'painter', 'construction'],
  },

  // ── Golv ──────────────────────────────────────────────────────────
  {
    system_key: 'res_undergolv',
    title: 'Undergolvets skick och planhet',
    content:
      'Priset förutsätter att undergolvet är plant, torrt och fast. Flytspackling, uppfyllnad eller avjämning utöver vad som angivits tillkommer efter avstämning.',
    triggers: [
      { type: 'keyword', value: 'golv' },
      { type: 'keyword', value: 'parkett' },
      { type: 'keyword', value: 'laminat' },
      { type: 'keyword', value: 'matt' },
    ],
    branches: ['flooring', 'construction', 'carpenter'],
  },
  {
    system_key: 'res_fuktmatning',
    title: 'Fuktmätning i betongunderlag',
    content:
      'Läggning på betongunderlag förutsätter godkänt fuktvärde. Om mätning visar för hög fukthalt måste arbetet skjutas upp till dess att underlaget torkat, vilket påverkar tidplanen.',
    triggers: [
      { type: 'keyword', value: 'golv' },
      { type: 'keyword', value: 'flytspackling' },
      { type: 'keyword', value: 'betong' },
    ],
    branches: ['flooring', 'construction'],
  },

  // ── Mark och trädgård ─────────────────────────────────────────────
  {
    system_key: 'res_markforhallanden',
    title: 'Markförhållanden',
    content:
      'Priset förutsätter normala markförhållanden. Berg, block, lera, fyllnadsmassor eller dolda ledningar i mark kan kräva extra arbete och maskintid, vilket debiteras enligt löpande räkning.',
    triggers: [
      { type: 'keyword', value: 'stenläggning' },
      { type: 'keyword', value: 'dränering' },
      { type: 'keyword', value: 'markarbete' },
      { type: 'keyword', value: 'platta' },
    ],
    branches: ['gardening', 'construction'],
  },
  {
    system_key: 'res_ledningskoll',
    title: 'Ledningar i mark',
    content:
      'Beställaren ansvarar för att upplysa om kända ledningar, kablar och avlopp inom arbetsområdet. Vi utför ledningsanvisning på begäran mot separat kostnad.',
    triggers: [
      { type: 'keyword', value: 'grävning' },
      { type: 'keyword', value: 'markarbete' },
      { type: 'keyword', value: 'dränering' },
      { type: 'keyword', value: 'stubbfräsning' },
    ],
    branches: ['gardening', 'construction'],
  },

  // ── Städ och flytt ────────────────────────────────────────────────
  {
    system_key: 'res_befintliga_skador',
    title: 'Befintliga skador och slitage',
    content:
      'Vi ansvarar inte för befintliga skador, slitage eller fläckar som inte går att åtgärda med normala metoder. Sådant noteras och meddelas beställaren vid arbetets utförande.',
    triggers: [
      { type: 'keyword', value: 'städ' },
      { type: 'keyword', value: 'flytt' },
      { type: 'keyword', value: 'putsning' },
    ],
    branches: ['cleaning', 'moving'],
  },
  {
    system_key: 'res_atkomst_flytt',
    title: 'Bärvägar, hiss och parkering',
    content:
      'Priset förutsätter fungerande hiss där sådan finns, samt parkeringsmöjlighet i anslutning till adressen. Långa bärvägar, trappbärning utöver överenskommet och parkeringsavgifter kan tillkomma.',
    triggers: [{ type: 'keyword', value: 'flytt' }, { type: 'keyword', value: 'bortforsling' }, { type: 'keyword', value: 'magasinering' }],
    branches: ['moving'],
  },

  // ── Lås ───────────────────────────────────────────────────────────
  {
    system_key: 'res_karm',
    title: 'Befintlig dörr och karm',
    content:
      'Priset förutsätter att befintlig dörr och karm är hela och i lod. Justering av skev karm, förstärkning eller byte av dörrblad tillkommer.',
    triggers: [
      { type: 'keyword', value: 'lås' },
      { type: 'keyword', value: 'cylinder' },
      { type: 'keyword', value: 'dörr' },
    ],
    branches: ['locksmith', 'carpenter'],
  },
]

/**
 * Startbiblioteket för en bransch. Okänd bransch får den gemensamma
 * grunduppsättningen (tillträde + tilläggsarbeten) — aldrig en tom lista, för
 * då syns motorn aldrig och hantverkaren får aldrig veta att den finns.
 */
export function getDefaultReservations(branch: string | string[]): ReservationDefault[] {
  // UX5 (Prisslingan V2 pass 4): FLERA branscher → unionen av deras urval.
  // Ett el+bygg-företag fick tidigare bara el-förbehållen (halva skyddet).
  // Samma post i flera branscher förekommer naturligt EN gång (filter på
  // originallistan); seed-idempotensen vilar på system_key precis som förut.
  const branches = (Array.isArray(branch) ? branch : [branch]).filter(Boolean)
  const matching = RESERVATIONS.filter(r => r.branches.some(b => branches.includes(b)))
  if (matching.length > 0) return matching
  return RESERVATIONS.filter(r => r.branches.includes('other'))
}

/** Alla branschnycklar som har ett eget urval — används av facit-testet. */
export function getReservationBranches(): string[] {
  return Array.from(new Set(RESERVATIONS.flatMap(r => r.branches)))
}

/** Hela biblioteket — för backfill och tester. */
export function getAllReservationDefaults(): ReservationDefault[] {
  return RESERVATIONS
}
