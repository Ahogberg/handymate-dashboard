/**
 * Branch-specific knowledge base defaults
 * Auto-populated during signup based on selected branch
 */

export interface ServiceItem {
  name: string
  description: string
  estimatedHours: number
}

export interface FAQItem {
  question: string
  answer: string
}

export interface BranchKnowledge {
  services: ServiceItem[]
  faqs: FAQItem[]
  emergencyInfo: string
  commonPriceFactors: string[]
}

const BRANCH_KNOWLEDGE: Record<string, BranchKnowledge> = {
  electrician: {
    services: [
      { name: 'Elinstallation', description: 'Installation av uttag, belysning, strömbrytare och säkringsskåp', estimatedHours: 2 },
      { name: 'Felsökning el', description: 'Hitta och åtgärda elfel, kortslutning, trasiga säkringar', estimatedHours: 1.5 },
      { name: 'Elbilsladdare', description: 'Installation av laddbox för elbil inklusive kabeldragning', estimatedHours: 4 },
      { name: 'Jordfelsbrytare', description: 'Installation eller byte av jordfelsbrytare för ökad säkerhet', estimatedHours: 1 },
      { name: 'Elcentral', description: 'Uppgradering eller byte av elcentral/säkringsskåp', estimatedHours: 6 },
    ],
    faqs: [
      { question: 'Vad kostar det att installera ett eluttag?', answer: 'Priset varierar beroende på placering och kabeldragning. En enkel installation kostar vanligtvis 800-1500 kr. Vi ger alltid en kostnadsfri offert först.' },
      { question: 'Hur snabbt kan ni komma?', answer: 'Vid akuta ärenden som strömavbrott försöker vi komma samma dag. För planerade jobb bokar vi in tid som passar dig, oftast inom en vecka.' },
      { question: 'Behöver jag vara hemma under arbetet?', answer: 'Ja, någon behöver vara hemma för att släppa in oss och visa var arbetet ska utföras. Du behöver inte övervaka arbetet.' },
    ],
    emergencyInfo: 'Vid elolycka: Bryt strömmen omedelbart om det är säkert. Rör aldrig personen om de fortfarande är i kontakt med strömkällan. Ring 112 vid personskada. Vid strömavbrott i hela huset, kontrollera säkringar innan du ringer.',
    commonPriceFactors: ['Kabeldragning', 'Tillgänglighet', 'Material', 'Tid på dygnet'],
  },

  plumber: {
    services: [
      { name: 'Stopp i avlopp', description: 'Rensning av stopp i handfat, toalett, golvbrunn eller avloppsrör', estimatedHours: 1 },
      { name: 'Vattenläcka', description: 'Akut lagning av läckande rör, kranar eller anslutningar', estimatedHours: 1.5 },
      { name: 'Byta blandare', description: 'Byte av kran/blandare i kök eller badrum', estimatedHours: 1 },
      { name: 'Vitvaruinstallation', description: 'Inkoppling av diskmaskin, tvättmaskin eller torktumlare', estimatedHours: 1 },
      { name: 'WC-renovering', description: 'Byte av toalettstol, installation av vägghängd WC', estimatedHours: 3 },
    ],
    faqs: [
      { question: 'Jag har stopp i avloppet, vad kostar det?', answer: 'Enklare stopp i handfat eller toalett kostar ofta 800-1200 kr. Större stopp i stamledning kan kosta mer. Vi ger prisuppgift när vi sett problemet.' },
      { question: 'Kan ni komma akut vid vattenläcka?', answer: 'Ja, vid akut vattenläcka prioriterar vi att komma så snart som möjligt, ofta inom någon timme. Stäng av vattnet vid huvudkranen medan du väntar.' },
      { question: 'Installerar ni värmepumpar?', answer: 'Vi installerar varmvattenberedare och gör VVS-arbeten. För värmepumpar samarbetar vi med certifierade installatörer.' },
    ],
    emergencyInfo: 'Vid vattenläcka: Stäng av vattnet vid huvudkranen (oftast i källare eller vid vattenmätaren). Vid stor läcka, dokumentera med foton för försäkringen. Ring oss för akut hjälp.',
    commonPriceFactors: ['Typ av stopp', 'Tillgänglighet till rör', 'Materialkostnad', 'Akut/planerat'],
  },

  carpenter: {
    services: [
      { name: 'Altanbygge', description: 'Bygga ny altan eller trädäck i trä eller komposit', estimatedHours: 24 },
      { name: 'Köksrenovering', description: 'Montering av köksskåp, bänkskivor och inredning', estimatedHours: 16 },
      { name: 'Staket & plank', description: 'Bygga staket, plank eller spaljé', estimatedHours: 8 },
      { name: 'Dörrar & fönster', description: 'Byte eller installation av inner- och ytterdörrar, fönster', estimatedHours: 3 },
      { name: 'Inbyggnad & förvaring', description: 'Bygga garderober, bokhyllor eller förvaringslösningar', estimatedHours: 8 },
    ],
    faqs: [
      { question: 'Hur lång tid tar det att bygga en altan?', answer: 'En standardaltan på ca 15-20 kvm tar normalt 3-5 arbetsdagar beroende på konstruktion och underlag. Vi ger tidsuppskattning i offerten.' },
      { question: 'Behöver jag bygglov för altan?', answer: 'Altaner under 1,8 meter över mark kräver oftast inte bygglov, men det finns undantag. Kontrollera med din kommun eller fråga oss så hjälper vi dig.' },
      { question: 'Köper ni in material eller ska jag göra det?', answer: 'Vi kan hantera allt material åt dig till inköpspris, eller så köper du själv. Båda alternativen fungerar bra.' },
    ],
    emergencyInfo: 'Snickeriarbeten är sällan akuta, men vid storm- eller vattenskador som kräver snabb täckning/reparation - kontakta oss så prioriterar vi ditt ärende.',
    commonPriceFactors: ['Materialval', 'Storlek', 'Komplexitet', 'Markförhållanden'],
  },

  painter: {
    services: [
      { name: 'Invändig målning', description: 'Målning av väggar, tak och snickerier inomhus', estimatedHours: 8 },
      { name: 'Fasadmålning', description: 'Målning av husfasad, träpanel eller puts', estimatedHours: 24 },
      { name: 'Tapetsering', description: 'Uppsättning av tapet, borttagning av gammal tapet', estimatedHours: 6 },
      { name: 'Spackling', description: 'Spackling av hål, sprickor och ojämnheter innan målning', estimatedHours: 2 },
      { name: 'Lackering', description: 'Lackering av dörrar, fönster, lister och möbler', estimatedHours: 4 },
    ],
    faqs: [
      { question: 'Vad kostar det att måla om ett rum?', answer: 'Pris beror på rummets storlek och skick. Ett normalstort sovrum (12-15 kvm) kostar ofta 5000-10000 kr inkl. material. Vi lämnar alltid fast pris i offerten.' },
      { question: 'Behöver jag flytta ut möbler?', answer: 'Vi hjälper till att flytta möbler till mitten av rummet och täcker med skyddsplast. Värdesaker och ömtåliga föremål bör du flytta själv.' },
      { question: 'Hur lång tid tar färgen att torka?', answer: 'Modern väggfärg är berörningstorr på 1-2 timmar och helt torr efter 2-4 veckor. Du kan använda rummet samma dag.' },
    ],
    emergencyInfo: 'Måleriarbeten är sällan akuta. Vid vattenskador där väggar behöver åtgärdas snabbt - kontakta oss för prioriterad bokning.',
    commonPriceFactors: ['Yta att måla', 'Väggskick', 'Antal strykningar', 'Färgval'],
  },

  hvac: {
    services: [
      { name: 'Värmepump installation', description: 'Installation av luft-luft eller luft-vatten värmepump', estimatedHours: 8 },
      { name: 'AC-service', description: 'Service, påfyllning och reparation av luftkonditionering', estimatedHours: 2 },
      { name: 'Ventilation', description: 'Installation och service av ventilationssystem, FTX', estimatedHours: 6 },
      { name: 'Golvvärme', description: 'Installation av vattenburen eller elektrisk golvvärme', estimatedHours: 8 },
      { name: 'Radiatorservice', description: 'Luftning, byte eller installation av radiatorer', estimatedHours: 2 },
    ],
    faqs: [
      { question: 'Vilken värmepump passar mig?', answer: 'Det beror på ditt hus, nuvarande uppvärmning och budget. Luft-luft är billigast men ger störst besparing i elvärmda hus. Vi gör en kostnadsfri bedömning.' },
      { question: 'Hur ofta ska AC:n servas?', answer: 'AC bör servas vartannat år för optimal prestanda. Vid daglig användning rekommenderas årlig service.' },
      { question: 'Kan ni hjälpa med ROT-avdrag?', answer: 'Ja, arbetskostnaden för installation berättigar till ROT-avdrag. Vi hjälper till med underlagen.' },
    ],
    emergencyInfo: 'Vid total värmebortfall vintertid - kontakta oss för akut service. Som tillfällig lösning, använd elelement och stäng av rum som inte används.',
    commonPriceFactors: ['Typ av system', 'Husets storlek', 'Befintlig installation', 'Tillgänglighet'],
  },

  locksmith: {
    services: [
      { name: 'Låsöppning', description: 'Öppning vid utelåsning, borttappad nyckel eller trasigt lås', estimatedHours: 0.5 },
      { name: 'Låsbyte', description: 'Byte av cylinder, helt lås eller uppgradering till säkerhetslås', estimatedHours: 1 },
      { name: 'Inbrottsskydd', description: 'Installation av säkerhetslås, låskolv, dörrkikare', estimatedHours: 2 },
      { name: 'Kodlås', description: 'Installation av kodlås eller elektroniskt lås', estimatedHours: 1.5 },
      { name: 'Nyckelkopiering', description: 'Kopiering av nycklar, även säkerhetsnycklar', estimatedHours: 0.25 },
    ],
    faqs: [
      { question: 'Jag har låst mig ute, vad kostar det?', answer: 'Låsöppning kostar vanligtvis 800-1500 kr på dagtid. Kvällar och helger tillkommer jourtillägg. Vi ger alltid prisuppgift innan vi börjar.' },
      { question: 'Hur snabbt kan ni komma?', answer: 'Vid utelåsning prioriterar vi att komma inom 30-60 minuter i närområdet. Exakt tid beror på var vi befinner oss.' },
      { question: 'Behöver jag styrka att det är min bostad?', answer: 'Ja, vi behöver se legitimation och någon form av bevis på att du bor på adressen (hyreskontrakt, räkning, etc.).' },
    ],
    emergencyInfo: 'Vid utelåsning: Kontrollera om något fönster är öppet (säkert!). Ring oss dygnet runt för akut låsöppning. Ha legitimation redo.',
    commonPriceFactors: ['Typ av lås', 'Tid på dygnet', 'Säkerhetsklass', 'Akut/planerat'],
  },

  cleaning: {
    services: [
      { name: 'Hemstäd', description: 'Regelbunden städning av hem, dammsugning, våttorkning, badrum', estimatedHours: 2.5 },
      { name: 'Storstäd', description: 'Grundlig genomgång av hela bostaden, inklusive fönsterputsning', estimatedHours: 6 },
      { name: 'Flyttstäd', description: 'Noggrann städning vid flytt, godkänd av hyresvärd/köpare', estimatedHours: 6 },
      { name: 'Fönsterputs', description: 'Putsning av fönster in- och utvändigt', estimatedHours: 2 },
      { name: 'Kontorsstäd', description: 'Regelbunden städning av kontor och lokaler', estimatedHours: 3 },
    ],
    faqs: [
      { question: 'Vad ingår i hemstäd?', answer: 'Dammsugning, våttorkning av golv, rengöring av badrum och kök, damning och bäddning. Vi anpassar efter dina önskemål.' },
      { question: 'Behöver jag ha egna städprodukter?', answer: 'Nej, vi tar med miljövänliga rengöringsmedel. Om du föredrar specifika produkter kan vi använda dina.' },
      { question: 'Kan jag få RUT-avdrag?', answer: 'Ja, städning i hemmet ger RUT-avdrag på 50% av arbetskostnaden upp till 75 000 kr per år. Vi hanterar avdraget direkt på fakturan.' },
    ],
    emergencyInfo: 'Städning är sällan akut, men vid vattenskador eller liknande som kräver snabb sanering - kontakta oss så prioriterar vi ditt ärende.',
    commonPriceFactors: ['Bostadens storlek', 'Städfrekvens', 'Skick', 'Speciella önskemål'],
  },

  construction: {
    services: [
      { name: 'Nybyggnation', description: 'Nybygge av hus, garage, förråd eller tillbyggnad', estimatedHours: 160 },
      { name: 'Renovering', description: 'Totalrenovering av badrum, kök eller hela bostaden', estimatedHours: 80 },
      { name: 'Tillbyggnad', description: 'Utbyggnad av befintlig bostad med extra rum eller yta', estimatedHours: 120 },
      { name: 'Fasadrenovering', description: 'Byte eller renovering av fasadmaterial', estimatedHours: 40 },
      { name: 'Grundarbete', description: 'Grundläggning, dränering och markarbeten', estimatedHours: 40 },
    ],
    faqs: [
      { question: 'Behöver jag bygglov?', answer: 'De flesta större byggen kräver bygglov. Vi hjälper er med ansökan och kontakt med kommunen.' },
      { question: 'Hur lång tid tar en renovering?', answer: 'Det beror på projektets storlek. Ett badrum tar 3-5 veckor, ett kök 2-4 veckor. Vi ger tidsuppskattning i offerten.' },
      { question: 'Hanterar ni ROT-avdraget?', answer: 'Ja, vi sköter allt med Skatteverket. ROT-avdrag ger 30% rabatt på arbetskostnaden upp till 50 000 kr per person och år.' },
    ],
    emergencyInfo: 'Vid akuta skador (storm, vatten, brand) — kontakta oss omedelbart så prioriterar vi ditt ärende. Dokumentera skadan med foton för försäkringen.',
    commonPriceFactors: ['Projektets storlek', 'Materialval', 'Tillgänglighet', 'Markförhållanden'],
  },

  roofing: {
    services: [
      { name: 'Takbyte', description: 'Komplett byte av tak inklusive underlag och pannor', estimatedHours: 40 },
      { name: 'Takläggning', description: 'Läggning av nytt tak på nybygge eller tillbyggnad', estimatedHours: 24 },
      { name: 'Takinspektion', description: 'Kontroll av takets skick, läckor och skador', estimatedHours: 2 },
      { name: 'Plåtarbete', description: 'Installation av plåttak, hängrännor och stuprör', estimatedHours: 16 },
      { name: 'Takfönster', description: 'Installation eller byte av takfönster', estimatedHours: 4 },
    ],
    faqs: [
      { question: 'Hur vet jag om taket behöver bytas?', answer: 'Tecken: läckande tak, mossa, trasiga pannor, hängande hängrännor. Vi gör kostnadsfri inspektion.' },
      { question: 'Vad kostar det att lägga om taket?', answer: 'Pris beror på storlek och material. Räkna med 800-1500 kr/kvm. Vi ger alltid fast pris i offerten.' },
      { question: 'Hur länge håller ett nytt tak?', answer: 'Betongpannor håller 40-60 år, plåttak 50+ år, papp 15-25 år.' },
    ],
    emergencyInfo: 'Vid stormskada eller akut läcka — kontakta oss direkt. Vi kan göra akut täckning. Dokumentera med foton för försäkringen.',
    commonPriceFactors: ['Takyta (kvm)', 'Materialval', 'Taklutning', 'Tillgänglighet'],
  },

  flooring: {
    services: [
      { name: 'Parkettläggning', description: 'Läggning av parkett, massivt trägolv eller laminat', estimatedHours: 8 },
      { name: 'Kakel & klinker', description: 'Plattsättning i badrum, kök och hall', estimatedHours: 16 },
      { name: 'Golvslipning', description: 'Slipning och lackning av trägolv', estimatedHours: 8 },
      { name: 'Vinyl/Plastgolv', description: 'Läggning av vinyl, linoleum eller plastgolv', estimatedHours: 6 },
      { name: 'Golvavjämning', description: 'Avjämning av ojämna golv inför golvläggning', estimatedHours: 4 },
    ],
    faqs: [
      { question: 'Vilket golv passar bäst?', answer: 'Det beror på rum och användning. Parkett passar vardagsrum, klinker badrum, vinyl kök. Vi hjälper er välja.' },
      { question: 'Kan ni slipa mitt gamla trägolv?', answer: 'Ja, de flesta trägolv kan slipas 3-5 gånger. Vi bedömer skicket och ger rekommendation.' },
      { question: 'Hur lång tid tar golvläggning?', answer: 'Ett rum (15 kvm) tar en dag för parkett, 2-3 dagar för kakel.' },
    ],
    emergencyInfo: 'Golvarbeten är sällan akuta. Vid vattenskador som påverkat golvet — kontakta oss och er försäkring parallellt.',
    commonPriceFactors: ['Golvyta (kvm)', 'Materialval', 'Avjämningsbehov', 'Mönsterläggning'],
  },

  gardening: {
    services: [
      { name: 'Trädgårdsskötsel', description: 'Regelbunden skötsel: klippning, ogräsrensning, beskärning', estimatedHours: 4 },
      { name: 'Häckklippning', description: 'Klippning och formning av häckar', estimatedHours: 3 },
      { name: 'Trädfällning', description: 'Fällning av träd med stubbrytning', estimatedHours: 4 },
      { name: 'Stenläggning', description: 'Läggning av plattor, marksten eller natursten', estimatedHours: 16 },
      { name: 'Plantering', description: 'Plantering av buskar, träd, häckar och blommor', estimatedHours: 4 },
    ],
    faqs: [
      { question: 'Kan jag få RUT-avdrag?', answer: 'Ja, trädgårdsarbete i hemmet ger RUT-avdrag på 50% av arbetskostnaden upp till 75 000 kr per år.' },
      { question: 'Tar ni hand om avfall?', answer: 'Ja, vi forslar bort allt trädgårdsavfall. Kostnaden ingår i offerten.' },
      { question: 'Jobbar ni året runt?', answer: 'Vi anpassar arbetet efter säsong. Vintertid erbjuder vi snöröjning och planering inför våren.' },
    ],
    emergencyInfo: 'Vid stormskador med fallna träd — kontakta oss för akut bortforsling och säkring av området.',
    commonPriceFactors: ['Trädgårdens storlek', 'Typ av arbete', 'Avfallshantering', 'Materialval'],
  },

  moving: {
    services: [
      { name: 'Lägenhetsflytt', description: 'Flytt av lägenhet inklusive packning vid behov', estimatedHours: 6 },
      { name: 'Villaflytt', description: 'Flytt av villa med möbler, lådor och tunga föremål', estimatedHours: 10 },
      { name: 'Kontorsflytt', description: 'Flytt av kontor med IT-utrustning och möbler', estimatedHours: 12 },
      { name: 'Magasinering', description: 'Förvaring av möbler och tillhörigheter', estimatedHours: 2 },
      { name: 'Packhjälp', description: 'Professionell packning och emballering', estimatedHours: 4 },
    ],
    faqs: [
      { question: 'Vad kostar en flytt?', answer: 'Pris beror på avstånd, mängd och våningsplan. En 2:a kostar ofta 4000-8000 kr. Vi ger fast pris efter besiktning.' },
      { question: 'Är mina saker försäkrade?', answer: 'Ja, vi har ansvarsförsäkring. Vi rekommenderar att kontrollera er hemförsäkring för extra trygghet.' },
      { question: 'Kan jag få RUT-avdrag?', answer: 'Ja, flytt av bohag ger RUT-avdrag på 50% av arbetskostnaden. Vi hanterar avdraget direkt.' },
    ],
    emergencyInfo: 'Behöver du akut flytt? Kontakta oss så försöker vi ordna personal inom 24 timmar.',
    commonPriceFactors: ['Avstånd', 'Mängd bohag', 'Våningsplan (hiss?)', 'Packningstjänst'],
  },

  other: {
    services: [
      { name: 'Konsultation', description: 'Rådgivning och bedömning av arbete som behöver utföras', estimatedHours: 1 },
      { name: 'Småjobb', description: 'Diverse mindre fixar och reparationer', estimatedHours: 2 },
      { name: 'Montering', description: 'Montering av möbler, hyllor, TV-fästen etc.', estimatedHours: 1.5 },
    ],
    faqs: [
      { question: 'Vad kostar det?', answer: 'Priset beror på arbetets omfattning. Vi ger alltid en tydlig offert innan arbetet påbörjas så du vet vad det kostar.' },
      { question: 'Hur bokar jag tid?', answer: 'Ring oss eller skicka ett meddelande så återkommer vi med förslag på tider som passar.' },
      { question: 'Vilka områden jobbar ni i?', answer: 'Vi täcker främst närområdet men kan ta uppdrag längre bort vid behov. Fråga oss!' },
    ],
    emergencyInfo: 'Vid akuta ärenden - ring oss så gör vi vårt bästa för att hjälpa dig så snart som möjligt.',
    commonPriceFactors: ['Arbetets omfattning', 'Material', 'Tid', 'Resväg'],
  },
}

// Mapping from Swedish form values to branch keys
const BRANCH_MAPPING: Record<string, string> = {
  'electrician': 'electrician',
  'plumber': 'plumber',
  'carpenter': 'carpenter',
  'painter': 'painter',
  'hvac': 'hvac',
  'locksmith': 'locksmith',
  'cleaning': 'cleaning',
  'construction': 'construction',
  'roofing': 'roofing',
  'flooring': 'flooring',
  'gardening': 'gardening',
  'moving': 'moving',
  'other': 'other',
  // Swedish names (if used)
  'elektriker': 'electrician',
  'rörmokare': 'plumber',
  'snickare': 'carpenter',
  'målare': 'painter',
  'vvs': 'hvac',
  'låssmed': 'locksmith',
  'städ': 'cleaning',
  'bygg': 'construction',
  'tak': 'roofing',
  'golv': 'flooring',
  'trädgård': 'gardening',
  'flytt': 'moving',
  'annat': 'other',
}

/**
 * Get knowledge base defaults for a specific branch
 * @param branch - Branch identifier (e.g., 'electrician' or 'Elektriker')
 * @returns Branch-specific knowledge base or generic defaults
 */
export function getKnowledgeForBranch(branch: string): BranchKnowledge {
  const normalizedBranch = branch.toLowerCase().trim()
  const branchKey = BRANCH_MAPPING[normalizedBranch] || 'other'
  return BRANCH_KNOWLEDGE[branchKey] || BRANCH_KNOWLEDGE.other
}

/**
 * Get all available branch keys
 */
export function getAvailableBranches(): string[] {
  return Object.keys(BRANCH_KNOWLEDGE)
}

/**
 * Get branch display name in Swedish
 */
export function getBranchDisplayName(branch: string): string {
  const displayNames: Record<string, string> = {
    electrician: 'Elektriker',
    plumber: 'Rörmokare',
    carpenter: 'Snickare',
    painter: 'Målare',
    hvac: 'VVS',
    locksmith: 'Låssmed',
    cleaning: 'Städ',
    construction: 'Bygg',
    roofing: 'Tak',
    flooring: 'Golvläggning',
    gardening: 'Trädgård',
    moving: 'Flytt',
    other: 'Annat',
  }
  return displayNames[branch] || branch
}
