export interface FollowupItem {id:string;quote_id:string;mission_id:string|null;due_at:string;state:string;reason:string|null;approval_id:string|null;send_claimed_at:string|null}
export const followupLabels:Record<string,string>={scheduled:'Planerad',prepared:'Behöver din granskning',completed:'Utskicket är bekräftat',cancelled:'Avbruten',blocked:'Behöver kontrolleras',failed:'Kunde inte förberedas'}
export const followupReasons:Record<string,string>={
 customer_contact:'Ny kontakt från kunden har kommit in. Läs den innan du följer upp.',source_changed:'Offerten eller mottagaren har ändrats. Planera om utifrån det nya underlaget.',
 quote_closed:'Offerten är inte längre öppen.',quote_expired:'Offerten har gått ut.',mission_ended:'Uppdraget har avslutats eller tidsramen har passerat.',
 recipient_unavailable:'Mottagaren kan inte kontaktas via SMS.',owner_unavailable:'Den ansvariges behörighet har ändrats.',team_paused:'Teamet är pausat.',team_inactive:'Teamet är inte aktiverat för företaget.',
 missed_window:'Den planerade tiden missades med mer än ett dygn. Välj ett nytt nästa steg.',existing_decision:'Det finns redan ett beslut för offerten. Granska det först.',
 already_contacted:'En kontakt med kunden har redan registrerats. Kontrollera den innan nästa steg.',owner_cancelled:'Du avbröt uppföljningen.',approval_closed:'Granskningskortet har avvisats eller gått ut.',
 execution_unconfirmed:'Utfallet är ännu inte bekräftat. Kontrollera kortets kvittens innan ett nytt försök.',preparation_failed:'Förberedelsen misslyckades. Teamet försöker högst fem gånger.',
 review_required:'Text och mottagare är förberedda. Du granskar innan SMS skickas.',action_confirmed:'Utskicket är bekräftat. Det betyder inte att kunden har svarat eller accepterat offerten.',
}
