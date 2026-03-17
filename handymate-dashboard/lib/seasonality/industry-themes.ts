/**
 * Branschanpassade säsongsteman per månad.
 * Mappar business_config.branch → relevanta kampanjteman.
 */

export interface SeasonalTheme {
  theme: string
  angle: string
  projectTypes: string[]
  callToAction: string
}

const THEMES: Record<string, Record<number, SeasonalTheme>> = {
  el: {
    1:  { theme: 'Nyår — energieffektivisering', angle: 'Sänk elräkningen med smarta lösningar', projectTypes: ['smart hem', 'LED-belysning', 'energimätare'], callToAction: 'Boka energigenomgång' },
    3:  { theme: 'Vår — utomhussäsongen', angle: 'Dags för utomhusbelysning och laddboxar', projectTypes: ['utomhusbelysning', 'laddbox elbil', 'altan-el'], callToAction: 'Boka installation' },
    5:  { theme: 'Försommar — solceller', angle: 'Maximera solenergin — installera nu', projectTypes: ['solceller', 'batterilagring', 'smart energi'], callToAction: 'Boka solcellsbesiktning' },
    7:  { theme: 'Boka höstens projekt', angle: 'Boka nu — kalendern fylls snabbt', projectTypes: ['elcentral', 'renovering', 'tillbyggnad'], callToAction: 'Boka tid för hösten' },
    9:  { theme: 'Höst — smart hem', angle: 'Perfekt för smart hem-installation', projectTypes: ['smart belysning', 'rörelsesensorer', 'automation'], callToAction: 'Boka smart hem-konsultation' },
    11: { theme: 'November — julbelysning', angle: 'Installera säker julbelysning utomhus', projectTypes: ['julbelysning', 'utomhus-el', 'timer-styrning'], callToAction: 'Boka julbelysning' },
  },

  vvs: {
    2:  { theme: 'Vinter — frostskydd', angle: 'Har du kontrollerat frostskyddet?', projectTypes: ['frostskydd', 'varmvattenberedare', 'rör-isolering'], callToAction: 'Boka kontroll' },
    3:  { theme: 'Vår — badrumsrenovering', angle: 'Våren är perfekt för badrumsrenovering', projectTypes: ['badrum', 'tätskikt', 'golvvärme'], callToAction: 'Boka badrumsrådgivning' },
    5:  { theme: 'Försommar — pool och spa', angle: 'Förbered poolen inför sommaren', projectTypes: ['pool', 'spa', 'utomhus-VVS'], callToAction: 'Boka pool-installation' },
    7:  { theme: 'Boka höstens badrum', angle: 'Boka badrumsrenoveringen nu', projectTypes: ['badrum', 'dusch', 'badkar'], callToAction: 'Boka tid för hösten' },
    9:  { theme: 'Höst — värmepumpsservice', angle: 'Dags att serva värmepumpen', projectTypes: ['värmepump', 'bergvärme', 'golvvärme'], callToAction: 'Boka service' },
    11: { theme: 'November — golvvärme', angle: 'Installera golvvärme till vintern', projectTypes: ['golvvärme', 'värme', 'isolering'], callToAction: 'Boka golvvärme-offert' },
  },

  bygg: {
    1:  { theme: 'Nyår — planera årets projekt', angle: 'Boka tidigt — kalendern fylls snabbt', projectTypes: ['tillbyggnad', 'renovering', 'attefallshus'], callToAction: 'Boka planeringsmöte' },
    3:  { theme: 'Vår — byggsäsongen startar', angle: 'Nu startar byggsäsongen', projectTypes: ['altan', 'carport', 'tillbyggnad'], callToAction: 'Boka byggstart' },
    5:  { theme: 'Hinna klart till midsommar', angle: 'Vi hinner klart altanen till midsommar', projectTypes: ['altan', 'uteplats', 'trädäck'], callToAction: 'Boka nu' },
    8:  { theme: 'Sensommar — fasad och tak', angle: 'Bästa väder för fasad och takarbeten', projectTypes: ['fasad', 'målning', 'fönsterbyte'], callToAction: 'Boka fasadbesiktning' },
    10: { theme: 'Vinterförberedelse', angle: 'Täta huset inför vintern', projectTypes: ['isolering', 'fönster', 'dörrar'], callToAction: 'Boka energibesiktning' },
    12: { theme: 'Planera nästa år', angle: 'Planera och boka årets stora projekt tidigt', projectTypes: ['tillbyggnad', 'renovering', 'nybygge'], callToAction: 'Boka planeringsmöte' },
  },

  maleri: {
    3:  { theme: 'Vår — måla om', angle: 'Våren är perfekt för ommålning', projectTypes: ['interiör', 'fasad', 'tak'], callToAction: 'Boka målningsoffert' },
    4:  { theme: 'Vår — fasadmålning', angle: 'Nu är vädret perfekt för fasadmålning', projectTypes: ['fasad', 'fönsterfoder', 'staket'], callToAction: 'Boka fasadoffert' },
    8:  { theme: 'Sista chansen utomhus', angle: 'Sista chansen för utomhusmålning i år', projectTypes: ['fasad', 'fönster', 'garage'], callToAction: 'Boka omgående' },
    9:  { theme: 'Höst — interiörmålning', angle: 'Höst är perfekt för interiörmålning', projectTypes: ['rum', 'kök', 'hall'], callToAction: 'Boka interiörmålning' },
    11: { theme: 'Fräscha upp inför julen', angle: 'Fräscha upp hemmet inför julen', projectTypes: ['vardagsrum', 'hall', 'kök'], callToAction: 'Boka nu' },
  },

  mark: {
    3:  { theme: 'Trädgårdssäsongen startar', angle: 'Dags att förbereda trädgården', projectTypes: ['markarbete', 'plantering', 'dränering'], callToAction: 'Boka markberedning' },
    4:  { theme: 'Uteplatser och gångar', angle: 'Bygga ny uteplats eller gång?', projectTypes: ['plattsättning', 'gångväg', 'uteplats'], callToAction: 'Boka plattsättning' },
    9:  { theme: 'Höst — trädfällning', angle: 'Perfekt tid för trädfällning och beskärning', projectTypes: ['trädfällning', 'beskärning', 'röjning'], callToAction: 'Boka trädfällning' },
    10: { theme: 'Höststädning', angle: 'Förbered trädgården inför vintern', projectTypes: ['vinterförberedelse', 'täckning', 'dränering'], callToAction: 'Boka höststädning' },
  },

  tak: {
    3:  { theme: 'Takbesiktning efter vintern', angle: 'Kontrollera taket efter vintern', projectTypes: ['takbesiktning', 'reparation', 'rengöring'], callToAction: 'Boka takbesiktning' },
    4:  { theme: 'Vår — takrenovering', angle: 'Bästa säsongen för takrenovering', projectTypes: ['takläggning', 'plåttak', 'tegel'], callToAction: 'Boka takoffert' },
    9:  { theme: 'Tätning inför vintern', angle: 'Täta taket innan regnet och snön', projectTypes: ['tätning', 'reparation', 'hängrännor'], callToAction: 'Boka inspektion' },
  },

  ventilation: {
    1:  { theme: 'Nyår — OVK-kontroll', angle: 'Dags för obligatorisk ventilationskontroll', projectTypes: ['OVK', 'ventilationsservice', 'filterbyten'], callToAction: 'Boka OVK' },
    9:  { theme: 'Höst — ventilationsservice', angle: 'Serva ventilationen inför uppvärmningssäsongen', projectTypes: ['ventilationsservice', 'filterbyten', 'kanalrensning'], callToAction: 'Boka service' },
  },

  allman: {
    1:  { theme: 'Nyår — ny start', angle: 'Dags att fixa det du skjutit upp', projectTypes: ['renovering', 'reparation', 'uppgradering'], callToAction: 'Boka konsultation' },
    3:  { theme: 'Vår — säsongsstart', angle: 'Nu drar vi igång — boka tidigt', projectTypes: ['utomhus', 'renovering', 'underhåll'], callToAction: 'Boka nu' },
    5:  { theme: 'Inför semestern', angle: 'Fixa klart innan sommaren', projectTypes: ['reparationer', 'underhåll', 'renovering'], callToAction: 'Boka nu' },
    9:  { theme: 'Höst — inomhussäsong', angle: 'Perfekt för inomhusarbeten', projectTypes: ['renovering', 'inomhus', 'underhåll'], callToAction: 'Boka renovering' },
    11: { theme: 'Lugn period — snabb leverans', angle: 'Vi har lediga tider', projectTypes: ['reparationer', 'mindre jobb', 'underhåll'], callToAction: 'Boka nu' },
  },
}

/**
 * Normalisera business_config.branch till temagrupp-nyckel.
 */
export function normalizeBranch(branch: string): string {
  const lower = (branch || '').toLowerCase()
  if (lower.includes('el') || lower.includes('elektr')) return 'el'
  if (lower.includes('vvs') || lower.includes('rör') || lower.includes('rörmok')) return 'vvs'
  if (lower.includes('bygg') || lower.includes('snickar') || lower.includes('snickeri')) return 'bygg'
  if (lower.includes('mål')) return 'maleri'
  if (lower.includes('mark') || lower.includes('trädgård') || lower.includes('anlägg')) return 'mark'
  if (lower.includes('tak') || lower.includes('plåt')) return 'tak'
  if (lower.includes('vent') || lower.includes('kyl')) return 'ventilation'
  return 'allman'
}

/**
 * Hämta säsongstema för en bransch och månad.
 * Returnerar null om inget tema matchar (= inget kampanjförslag).
 */
export function getSeasonalTheme(branch: string, month: number): SeasonalTheme | null {
  const key = normalizeBranch(branch)
  return THEMES[key]?.[month] || THEMES.allman[month] || null
}
