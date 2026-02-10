/**
 * Branschspecifika standardchecklistor
 * Mönster från lib/knowledge-defaults.ts
 */

export interface ChecklistItem {
  id: string
  text: string
  required: boolean
  checked: boolean
}

export interface ChecklistTemplate {
  name: string
  category: string
  items: ChecklistItem[]
  branch?: string
}

function item(text: string, required = false): ChecklistItem {
  return {
    id: `ci_${Math.random().toString(36).substring(2, 9)}`,
    text,
    required,
    checked: false,
  }
}

export const BRANCH_CHECKLISTS: Record<string, ChecklistTemplate[]> = {
  electrician: [
    {
      name: 'Elsäkerhetskontroll',
      category: 'safety',
      items: [
        item('Kontrollera jordfelsbrytare', true),
        item('Mäta isolationsresistans', true),
        item('Kontrollera skyddsjordning', true),
        item('Testa kortslutningsström'),
        item('Verifiera märkdata på säkringar'),
        item('Kontrollera kabelarea mot last'),
        item('Dokumentera mätresultat', true),
        item('Märk alla kretsar i central'),
        item('Kontrollera IP-klassning i våtrum'),
        item('Verifiera CE-märkning på komponenter'),
      ],
    },
    {
      name: 'Laddstolpe / Elbilsladdare',
      category: 'installation',
      items: [
        item('Kontrollera elnätets kapacitet', true),
        item('Verifiera jordfelsskydd typ B', true),
        item('Installera dedikerad krets'),
        item('Konfigurera lastbalansering'),
        item('Testa laddning med fordon'),
        item('Dokumentera installation', true),
      ],
    },
  ],

  plumber: [
    {
      name: 'Täthetsprovning',
      category: 'inspection',
      items: [
        item('Stäng av vattenförsörjning', true),
        item('Koppla in manometer'),
        item('Trycksätt systemet till 10 bar'),
        item('Vänta 30 minuter'),
        item('Kontrollera tryckfall', true),
        item('Dokumentera resultat', true),
        item('Öppna vattenförsörjning'),
        item('Kontrollera alla kopplingar visuellt'),
      ],
    },
    {
      name: 'Badrumsrenovering',
      category: 'installation',
      items: [
        item('Kontrollera golvbrunn position'),
        item('Tätskikt applicerat enligt BBV', true),
        item('Provtrycka tätskikt', true),
        item('Verifiera fall mot brunn', true),
        item('Kontrollera ventilation'),
        item('Dokumentera tätskikt med foto', true),
        item('Installera blandare och kopplingar'),
        item('Slutprovning med vatten'),
      ],
    },
  ],

  carpenter: [
    {
      name: 'Slutbesiktning',
      category: 'inspection',
      items: [
        item('Kontrollera ytbehandling'),
        item('Kontrollera fogar och skarvar'),
        item('Verifiera mått enligt ritning', true),
        item('Kontrollera infästningar'),
        item('Testa dörrar och fönster'),
        item('Kontrollera tätning runt karmar'),
        item('Kontrollera golv - nivå och bukt'),
        item('Dokumentera med foto', true),
        item('Städning av arbetsplats', true),
      ],
    },
    {
      name: 'Isoleringsprotokoll',
      category: 'installation',
      items: [
        item('Verifiera isolertjocklek', true),
        item('Kontrollera ångspärr'),
        item('Dokumentera U-värde'),
        item('Kontrollera köldbryggor'),
        item('Verifiera ventilationsspalt'),
        item('Fotografera före inklädnad', true),
      ],
    },
  ],

  painter: [
    {
      name: 'Ytbehandlingsprotokoll',
      category: 'quality',
      items: [
        item('Kontrollera underlag'),
        item('Dokumentera fuktmätning', true),
        item('Grunda ytor'),
        item('Första strykning'),
        item('Slipa mellan strykningar'),
        item('Andra strykning'),
        item('Kontrollera täckning', true),
        item('Dokumentera färgkod och batch'),
        item('Kontrollera jämnhet'),
        item('Slutkontroll vid god belysning', true),
      ],
    },
  ],

  hvac: [
    {
      name: 'Värmepump - Driftsättning',
      category: 'installation',
      items: [
        item('Kontrollera köldmedium', true),
        item('Verifiera elsäkerhet', true),
        item('Testa uppvärmning'),
        item('Testa kylning'),
        item('Kontrollera dränering'),
        item('Ställ in termostat'),
        item('Dokumentera driftparametrar', true),
        item('Instruera kund'),
      ],
    },
  ],

  locksmith: [
    {
      name: 'Låsbyte / Inbrottsskydd',
      category: 'installation',
      items: [
        item('Kontrollera dörrkarm'),
        item('Verifiera låsklass', true),
        item('Installera cylinder'),
        item('Testa från insida och utsida', true),
        item('Kontrollera slutbleck'),
        item('Lämna alla nycklar till kund', true),
        item('Dokumentera serienummer'),
      ],
    },
  ],
}

export const GENERIC_CHECKLISTS: ChecklistTemplate[] = [
  {
    name: 'Arbetsmiljö',
    category: 'safety',
    items: [
      item('Arbetsmiljöriskbedömning utförd', true),
      item('Personlig skyddsutrustning kontrollerad'),
      item('Brandsläckare tillgänglig'),
      item('Första förband tillgängligt'),
      item('Arbetsplats avskyltad vid behov'),
      item('Damm- och buller-åtgärder vidtagna'),
    ],
  },
  {
    name: 'Slutbesiktning',
    category: 'inspection',
    items: [
      item('Arbete utfört enligt offert/avtal', true),
      item('Alla poster i offerten genomförda', true),
      item('Kvalitetskontroll utförd'),
      item('Inga synliga defekter'),
      item('Städning av arbetsplats', true),
      item('Material och verktyg bortforslade'),
      item('Kund informerad om garantivillkor'),
      item('Skriftlig överlämning vid behov'),
    ],
  },
  {
    name: 'Städning efter arbete',
    category: 'completion',
    items: [
      item('Grovstädning utförd'),
      item('Byggavfall bortforslat'),
      item('Dammsugning'),
      item('Avtorkning av ytor'),
      item('Skyddsmaterial borttaget'),
      item('Slutfoto taget'),
    ],
  },
]

/**
 * Hämta checklistmallar för en given bransch
 */
export function getChecklistsForBranch(branch: string): ChecklistTemplate[] {
  const branchTemplates = BRANCH_CHECKLISTS[branch] || []
  return [...branchTemplates, ...GENERIC_CHECKLISTS]
}
