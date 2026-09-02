# Kundminnet över kanaler — revision 2026-09-02

Fråga (Andreas): "Säg det en gång" = allt en kund (eller ägaren om en kund)
säger i valfri kanal sparas per kund och ANVÄNDS av teamet nästa gång.
Var bryts kedjan? Läsande revision av koden + produktionsdata. Inget ändrat.

## Huvudfynd
- **Lisa svarar inte live på inkommande samtal.** app/api/voice/incoming
  gör tre saker: röstbrevlåda (statisk TTS), koppla till hantverkaren, eller
  samtyckes-IVR. All "Lisa" är efterarbete på inspelningen. Ingen kundhistorik
  kan alltså injiceras i ett pågående samtal. Känt sedan
  docs/audits/CUSTOMER_CONTEXT_MEMORY_AUDIT.md.
- **Produktionsdata (90 dagar):** 0 inkommande SMS i sms_log (inkommande
  skrivs till sms_conversation utan customer_id), 1 samtal utan kundkoppling,
  communication_log 10 rader utan kund, customer_fact-tabellen tom
  (4 kort, 1 godkänt), agent_memories 28 rader men bara per företag.

## Per kanal (Q1 matchas till kund · Q2 hamnar i tidslinjen · Q3 når teamet)
| Kanal | Q1 | Q2 | Q3 Matte-kontext | Q3 agentkort |
|---|---|---|---|---|
| Samtal (46elks) | Ja (find-customer-by-phone, E.164 + dubblettfallback) | Ja (call_recording.customer_id) | Delvis (get_customer ger 5 senaste samtal; resolvern läser aldrig samtal) | Delvis (customer_fact-kort skapas; ingen agent läser samtalshistorik) |
| SMS in | Delvis (resolver: rå .eq på phone_number, ingen normalisering) | Delvis (sms_conversation utan customer_id) | Delvis (sms+mejl+portal+fakta, inga samtal) | Nej |
| Mejl in | Ja (Gmail-stegen) / Delvis (Postmark: en .eq på email) | Ja (email_conversations.customer_id) | Ja | Delvis (faktautdrag bara Gmail) |
| Portalmeddelanden | Ja | Ja (customer_message) | Ja | Delvis (Daniel-kort, ingen läser tråden) |
| Ägarens egna ord (chatt, möten) | Delvis | Delvis (customer_fact bara vid godkännande; add_work_note skriver per projekt) | Delvis (fakta bara om modellen anropar get_customer; agent_memories per företag) | Delvis (offertgeneratorn läser fakta) |
| Webb/widget/lead | Ja | Delvis (kundens ord i leads.notes, widget utan customer_id) | Delvis | Delvis (suggest-quote-draft läser lead.notes) |

## Gap-lista (rangordnad, minsta fix)
1. SMS-historik nycklas på telefonsträng, inte customer_id — kund med icke-
   E.164-nummer får osynlig SMS-historik i tidslinje och trail.
   Fix: phoneCandidates + .in() i timeline/route.ts och communication-trail.ts.
2. Mattes resolver missar kund vars nummer inte är E.164 (lib/matte/resolver.ts:69).
   Fix: findCustomerByPhone i stället för .eq.
3. Resolvern läser aldrig samtalstranskript. Fix: call_recording i resolverns
   Promise.all, channel 'call', max 5.
4. Ägare vs kund skiljs inte på inkommande SMS (app/api/sms/incoming). Fix:
   matcha from mot aktiva business_users.phone före resolveEntity; träff ⇒
   aldrig Mattes kundflöde.
5. Kundens egna ord från webb/widget/lead når ingen kommunikationsyta.
   Fix: leads.notes i tidslinjens lead-sektion + leads som källa i trailen.
6. agent_memories är per företag, aldrig per kund. Fix: customer_id-kolumn
   (fail-soft) + filter i fetchRelevantMemories.
7. Daniels offertutkast och Hannas utskick ignorerar fakta/historik utom
   lead.notes. Fix: customer_fact i byggForslag; customerId vidare i
   suggest-quote-draft.
8. customer_fact saknas i compliance-trailen. Fix: nionde källa, channel 'note'.
9. app/api/voice/process är död kod (inga anropare). Ta bort.

## Förslag
Pass 1 (Sonnet, en natt): gap 1, 2, 3, 4, 5, 8, 9 — rena läs-/matchningsfixar
utan ny modell, med facit. Pass 2: gap 6 och 7 (kräver kolumn + agentändring).
Lisa live på samtal är ett eget beslut, inte ett gap i minnet.
