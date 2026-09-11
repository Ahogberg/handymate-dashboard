import { TRADE_START_PACKAGES } from './onboarding/trade-start-packages'
/** Förslag för nya val. Befintliga jobbtyper och deras slugs döps aldrig om. */
export const ADDITIONAL_JOB_TYPES_BY_TRADE: Record<string, string[]> = {
  electrician: ['Installera laddbox', 'Byta elcentral', 'Felsökning el', 'Installera belysning', 'Byta uttag och strömbrytare', 'Dra el vid renovering', 'Elinstallation i nybygge', 'Installera smart hem', 'Installera solceller', 'Servicebesök el', 'Installera laddstolpar', 'Elservice industri'],
  plumber: ['Byta blandare', 'Byta toalett', 'Installera diskmaskin', 'Installera varmvattenberedare', 'Installera värmepump', 'Åtgärda vattenläcka', 'Rensa avlopp', 'Dra rör vid badrumsrenovering', 'Dra rör vid köksrenovering', 'Byta radiator', 'Servicebesök VVS', 'VVS i nybygge'],
  construction: ['Renovera badrum', 'Renovera kök', 'Bygga altan', 'Bygga till huset', 'Bygga garage', 'Byta fönster', 'Byta ytterdörr', 'Bygga innervägg', 'Lägga golv', 'Byta fasadpanel', 'Bygga stomme', 'Renovera rum'],
  painter: ['Måla väggar och tak', 'Måla fasad', 'Måla fönster', 'Tapetsera', 'Spackla väggar', 'Måla snickerier', 'Måla trapphus', 'Måla kontor', 'Måla dörrar', 'Måla staket'],
  roofing: ['Lägga om tak', 'Reparera takläcka', 'Byta hängrännor och stuprör', 'Montera takfönster', 'Byta takfönster', 'Montera taksäkerhet', 'Besiktiga tak', 'Rengöra tak', 'Skotta tak', 'Plåtarbete vid skorsten'],
  groundworks: ['Dränera husgrund', 'Lägga marksten', 'Förbereda husgrund', 'Anlägga uppfart', 'Gräva för vatten och avlopp', 'Bygga stödmur', 'Anlägga gräsmatta', 'Schakta tomt', 'Anlägga dagvattenhantering', 'Asfaltera uppfart'],
  general_contractor: ['Totalrenovera bostad', 'Bygga till huset', 'Bygga nytt hus', 'Renovera badrum', 'Renovera kök', 'Bygga garage', 'Bygga komplementbyggnad', 'Anpassa lokal', 'Renovera fasad', 'Energirenovera hus'],
  other: ['Montera möbler', 'Montera hyllor och inredning', 'Reparera snickerier', 'Bygga altan', 'Måla rum', 'Lägga golv', 'Byta innerdörr', 'Reparera staket', 'Sköta trädgård', 'Servicebesök'],
}

/** Broad launch defaults first. Narrow examples remain opt-in; saved customer slugs are untouched. */
export const JOB_TYPES_BY_TRADE: Record<string, string[]> = Object.fromEntries(
  Object.entries(ADDITIONAL_JOB_TYPES_BY_TRADE).map(([trade, extras]) => [trade,
    Array.from(new Set([...(TRADE_START_PACKAGES[trade] || []).map(p => p.name), ...extras]))]),
)
