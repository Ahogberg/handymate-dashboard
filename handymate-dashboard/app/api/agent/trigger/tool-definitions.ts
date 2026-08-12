// Re-export tool definitions for Next.js runtime
// (Same definitions as supabase/functions/agent/tool-definitions.ts)

export const toolDefinitions = [
  // CRM
  {
    name: "get_customer",
    description: "Hämta en specifik kund med all information.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string", description: "Kundens ID" },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "search_customers",
    description: "Sök kunder efter namn, telefonnummer eller e-post.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Sökterm" },
        limit: { type: "number", description: "Max antal resultat" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_customer",
    description: "Skapa en ny kund. Kontrollera med search_customers först.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Fullständigt namn" },
        phone_number: { type: "string", description: "Telefon (+46...)" },
        email: { type: "string", description: "E-post" },
        address_line: { type: "string", description: "Adress" },
      },
      required: ["name", "phone_number"],
    },
  },
  {
    name: "update_customer",
    description: "Uppdatera en kunds information.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string", description: "Kundens ID" },
        name: { type: "string" },
        phone_number: { type: "string" },
        email: { type: "string" },
        address_line: { type: "string" },
      },
      required: ["customer_id"],
    },
  },
  // Operations
  {
    name: "create_quote",
    description: "Skapa en ny offert med ROT/RUT-beräkning.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string", description: "Kort beskrivning av vad offerten avser — visas för kunden" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["labor", "material"] },
              name: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              unit_price: { type: "number" },
            },
            required: ["type", "name", "quantity", "unit", "unit_price"],
          },
        },
        rot_rut_type: { type: "string", enum: ["rot", "rut"] },
        valid_days: { type: "number" },
      },
      required: ["customer_id", "title", "description", "items"],
    },
  },
  // Våg 2b (tasks/value-chain-plan.md) — ÄTA-kedjan. Skapar ALDRIG en ÄTA
  // direkt — bara ett förslagskort i godkännande-kön (kö-först-principen,
  // samma som create_approval_request). Använd när kunden ber om
  // tilläggsarbete på ett PÅGÅENDE projekt via samtal/SMS/mail — inte för
  // en helt ny förfrågan utan projekt (använd create_quote istället för
  // det, eller låt create_approval_request/quote_addition-flödet hantera
  // det om det är för tidigt för en formell offert).
  {
    name: "create_ata_draft",
    description: "Föreslå ett ÄTA-utkast (ändrings-/tilläggsarbete) på ett pågående projekt. Skapar ETT kort i godkännandekön — skickar INGET till kunden och skapar INGEN ÄTA direkt. Hantverkaren granskar förslaget och skapar/skickar den riktiga ÄTA:n själv. Om projektet redan har ett väntande ÄTA-förslag skapas inget nytt (dedup).",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "ID för det pågående projektet tilläggsarbetet hör till" },
        description: { type: "string", description: "Konkret beskrivning av tilläggsarbetet, t.ex. 'Kunden vill även ha ett extra eluttag i garaget'" },
        amount_estimate: { type: "number", description: "Valfri grov kostnadsuppskattning i kr, om känd" },
        customer_context: { type: "string", description: "Valfritt citat/sammanhang från kundens förfrågan, t.ex. SMS-texten som föranledde förslaget — visas i kortet" },
      },
      required: ["project_id", "description"],
    },
  },
  {
    name: "get_quotes",
    description: "Hämta offerter, valfritt filtrerade på kund/status.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
        status: { type: "string" },
        limit: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "create_invoice",
    description: "Skapa faktura från offert eller egna rader.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
        quote_id: { type: "string" },
        items: { type: "array" },
        rot_rut_type: { type: "string", enum: ["rot", "rut"] },
        due_days: { type: "number" },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "check_calendar",
    description: "Kontrollera lediga tider. Visar Handymate-bokningar + Google Calendar-händelser (om anslutet).",
    input_schema: {
      type: "object" as const,
      properties: {
        from_date: { type: "string", description: "YYYY-MM-DD" },
        to_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["from_date", "to_date"],
    },
  },
  {
    name: "create_booking",
    description: "Skapa en ny bokning. Kontrollera kalendern först. Synkar automatiskt till Google Calendar om anslutet.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
        service_type: { type: "string", description: "Typ av jobb (sparas i notes)" },
        scheduled_start: { type: "string" },
        scheduled_end: { type: "string" },
        notes: { type: "string" },
      },
      required: ["customer_id", "scheduled_start", "scheduled_end"],
    },
  },
  {
    name: "update_project",
    description: "Uppdatera status/anteckningar för en bokning.",
    input_schema: {
      type: "object" as const,
      properties: {
        booking_id: { type: "string" },
        status: { type: "string", enum: ["pending", "confirmed", "completed", "cancelled"] },
        notes: { type: "string" },
      },
      required: ["booking_id"],
    },
  },
  {
    name: "log_time",
    description: "Logga arbetstid för tidrapportering.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
        booking_id: { type: "string" },
        work_date: { type: "string" },
        start_time: { type: "string" },
        end_time: { type: "string" },
        description: { type: "string" },
        is_billable: { type: "boolean" },
      },
      required: ["customer_id", "work_date", "start_time", "end_time"],
    },
  },
  // R5 (tasks/resurs-masterplan.md) — persondagen som agentverktyg. Läser
  // SAMMA sammanslagningskälla som resurstavlan (lib/schedule/person-day.ts,
  // "en dag, en sanning") — ingen egen datakälla.
  {
    name: "get_person_schedule",
    description: "Hämta schemat (persondagen) för en eller flera teammedlemmar: kundbokningar och interna pass/frånvaro sammanslagna per dag, med krockflaggor och veckobeläggning i procent. Ange person som namn (delsträngsmatchning, t.ex. \"Micke\" matchar \"Mikael Andersson\") eller \"alla\" för hela teamet. Matchar namnet flera medlemmar returneras en lista med alternativ istället för en gissning — fråga då hantverkaren vilken person som avses.",
    input_schema: {
      type: "object" as const,
      properties: {
        person: { type: "string", description: "Namn (helt eller del av) på teammedlemmen, eller \"alla\" för samtliga aktiva. Utelämnas = alla." },
        from_date: { type: "string", description: "YYYY-MM-DD. Utelämnas = måndag innevarande vecka." },
        to_date: { type: "string", description: "YYYY-MM-DD. Utelämnas = söndag samma vecka som from_date (eller innevarande vecka)." },
      },
      required: [],
    },
  },
  // Communications
  {
    name: "send_sms",
    description: "Skicka SMS via 46elks. Ej mellan 21:00-08:00.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Telefon i E.164 (+46...)" },
        message: { type: "string", description: "Max 1600 tecken" },
      },
      required: ["to", "message"],
    },
  },
  {
    name: "send_email",
    description: "Skicka e-post via Gmail (om anslutet) eller Resend. Gmail ger bättre leverans och visas i Skickat-mappen.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "read_customer_emails",
    description: "Läs e-posthistorik med en kund via Gmail. Returnerar trådar med ämne, datum och utdrag. Kräver att Gmail är anslutet.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_email: { type: "string", description: "Kundens e-postadress" },
        max_results: { type: "number", description: "Max antal trådar (default 10)" },
      },
      required: ["customer_email"],
    },
  },
  // Pipeline
  {
    name: "qualify_lead",
    description: "Kvalificera en lead från samtal/SMS. Returnerar score, urgency, jobbtyp.",
    input_schema: {
      type: "object" as const,
      properties: {
        conversation_id: { type: "string", description: "Konversations-ID" },
        phone: { type: "string", description: "Telefonnummer" },
        name: { type: "string", description: "Kontaktnamn" },
        source: { type: "string", enum: ["vapi_call", "inbound_sms", "website_form", "manual"] },
      },
      required: ["conversation_id"],
    },
  },
  {
    name: "update_lead_status",
    description: "Flytta lead genom pipeline: new → contacted → qualified → quote_sent → won/lost.",
    input_schema: {
      type: "object" as const,
      properties: {
        lead_id: { type: "string" },
        status: { type: "string", enum: ["new", "contacted", "qualified", "quote_sent", "won", "lost"] },
        lost_reason: { type: "string" },
        notes: { type: "string" },
        customer_id: { type: "string" },
      },
      required: ["lead_id", "status"],
    },
  },
  {
    name: "get_lead",
    description: "Hämta lead med aktivitetshistorik och kopplad kund.",
    input_schema: {
      type: "object" as const,
      properties: {
        lead_id: { type: "string" },
      },
      required: ["lead_id"],
    },
  },
  {
    name: "search_leads",
    description: "Sök leads med filter på status, urgency, score, jobbtyp, datum.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string" },
        urgency: { type: "string" },
        min_score: { type: "number" },
        max_score: { type: "number" },
        job_type: { type: "string" },
        from_date: { type: "string" },
        to_date: { type: "string" },
        limit: { type: "number" },
      },
      required: [],
    },
  },
  // Stats
  {
    name: "get_daily_stats",
    description: "Hämta daglig statistik: samtal, SMS, leads, offerter, bokningar, tid, intäkter. Använd för morgonrapport.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "YYYY-MM-DD (default: idag)" },
      },
      required: [],
    },
  },
  // Approval flow
  {
    name: "create_approval_request",
    description: "Skapa en godkännandebegäran. Välj rätt risk_level: 'low' = utförs direkt utan notis (skapa kund, anteckning, logga aktivitet), 'medium' = utförs direkt och loggas i dashboard (boka tid, skicka SMS-påminnelse), 'high' = väntar på hantverkarens godkännande + push-notis (skicka offert, faktura, avboka).",
    input_schema: {
      type: "object" as const,
      properties: {
        approval_type: {
          type: "string",
          // 'other' fanns här förut men saknas i ACTION_CONTRACT — ett sådant
          // kort gick inte att godkänna. Okänd typ avvisas numera vid skapandet.
          description: "Typ av åtgärd: send_sms, send_quote, send_invoice, create_booking. Endast dessa auto-utförs vid low/medium — övriga kontraktstyper blir alltid väntande kort.",
        },
        title: {
          type: "string",
          description: "Kort beskrivning, ex: 'Skicka offert till Kalle Anka'",
        },
        description: {
          type: "string",
          description: "Längre förklaring av vad som händer",
        },
        payload: {
          type: "object",
          description: "Data för åtgärden, ex: { to: '+46701234567', message: '...', quote_id: '...' }",
        },
        risk_level: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Risknivå: low = auto-utför tyst, medium = auto-utför + logga, high = kräver godkännande",
        },
      },
      required: ["approval_type", "title", "payload"],
    },
  },
  {
    name: "check_pending_approvals",
    description: "Lista väntande godkännandebegäranden för det här företaget.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  // Profitability
  {
    name: "get_project_profitability",
    description: "Hämta full projektekonomi för ett specifikt projekt: intakter (budget_amount, ata_signerat_kr, forvantad_intakt_kr, fakturerat_kr, betalt_kr), kostnader (arbete_kr — kan vara null, arbete_timmar, material_inkop_kr, extra_kr, total_kr — null om arbete_kr är null) och marginal (marginal_kr, marginal_pct, är_tomt, kostnad_sannolikt_komplett). VIKTIGT: om marginal.arbetskostnad_konfigurerad är false saknas intern timkostnad för minst en tidrad — marginal_kr/marginal_pct är då null. Uppfinn ALDRIG en marginal i det läget; säg i stället att intern timkostnad inte är konfigurerad.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "Projekt-ID att analysera",
        },
      },
      required: ["project_id"],
    },
  },
  // Business preferences
  {
    name: "update_business_preference",
    description: "Spara en preferens du lärt dig om hur hantverkaren jobbar. Sparas permanent och injiceras i framtida systemprompter.",
    input_schema: {
      type: "object" as const,
      properties: {
        key: {
          type: "string",
          description: "Preferensnyckel, ex: pricing_margin_default, min_job_value_sek, scheduling_preferred_hours, geography_max_km",
        },
        value: {
          type: "string",
          description: "Värdet som text, ex: '20%', '10000', '07-17', '30'",
        },
        reason: {
          type: "string",
          description: "Varför du sparar denna preferens",
        },
      },
      required: ["key", "value"],
    },
  },
  // V3 Automation Engine tools
  {
    name: "get_automation_settings",
    description: "Hämta automationsinställningar (arbetstider, nattspärr, godkännandekrav, responstider).",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "log_automation_action",
    description: "Logga en automationsåtgärd i aktivitetsloggen.",
    input_schema: {
      type: "object" as const,
      properties: {
        rule_name: {
          type: "string",
          description: "Namn på regeln eller åtgärden",
        },
        action_type: {
          type: "string",
          description: "Typ av åtgärd: send_sms, send_email, create_approval, update_status, run_agent, notify_owner",
        },
        status: {
          type: "string",
          description: "Resultat: success, failed, skipped",
        },
        details: {
          type: "string",
          description: "Beskrivning av vad som gjordes",
        },
      },
      required: ["rule_name", "action_type", "status"],
    },
  },
  // V7 Fortnox integration tools
  {
    name: "check_fortnox_status",
    description: "Kontrollera Fortnox-koppling och synkroniseringsstatus. Visar om Fortnox är anslutet och antal synkade/felaktiga entiteter.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "trigger_fortnox_sync",
    description: "Synka en specifik entitet (kund, faktura eller offert) till Fortnox. Kräver att Fortnox är anslutet.",
    input_schema: {
      type: "object" as const,
      properties: {
        entity_type: {
          type: "string",
          enum: ["customer", "invoice", "quote"],
          description: "Typ av entitet att synka",
        },
        entity_id: {
          type: "string",
          description: "ID för entiteten (customer_id, invoice_id eller quote_id)",
        },
      },
      required: ["entity_type", "entity_id"],
    },
  },
  // V7 T2 Pricing intelligence
  {
    name: "get_pricing_suggestion",
    description: "Hämta prisförslag baserat på historisk data för en jobbtyp. Returnerar rekommenderat prisintervall, genomsnittspris, vinstfrekvens och pristrend.",
    input_schema: {
      type: "object" as const,
      properties: {
        job_type: {
          type: "string",
          description: "Jobbtyp att hämta prisdata för, t.ex. 'badrumsrenovering', 'målning', 'elinstallation'",
        },
        details: {
          type: "string",
          description: "Valfri beskrivning av jobbet för mer specifikt prisförslag",
        },
      },
      required: ["job_type"],
    },
  },
  // V73 T1 Efterkalkyl-insikt (Motor 1 — ren läsning)
  {
    name: "get_efterkalkyl_insight",
    description: "Hämta efterkalkyl-insikt (Motor 1 — Lärande prissättning): snittavvikelse i tid och belopp mot offert för avslutade jobb av en viss jobbtyp eller offertmall, plus antal jobb i underlaget. Använd t.ex. när hantverkaren frågar 'hur gick badrummen?' eller vill veta om en jobbtyp brukar dra över tiden. Ange job_type och/eller template_id (minst en krävs). Om underlaget är för litet svarar verktyget att det inte räcker.",
    input_schema: {
      type: "object" as const,
      properties: {
        job_type: { type: "string", description: "Jobbtyp att analysera, t.ex. 'badrumsrenovering', 'målning'" },
        template_id: { type: "string", description: "Offertmall-ID — mer specifikt än job_type om båda finns" },
      },
      required: [],
    },
  },
  // Våg 2d (tasks/value-chain-plan.md) — enskild-projekt-efterkalkyl (job_completed-triggern)
  {
    name: "get_project_outcome",
    description: "Hämta den frusna efterkalkylen (utfall vs offert) för ETT specifikt avslutat projekt: offererade/faktiska timmar, arbets- och materialkostnad, ÄTA-signerat, fakturerat, marginal och avvikelse i procent mot offerten. Skiljer sig från get_efterkalkyl_insight som är ett AGGREGAT över flera jobb av samma jobbtyp/mall — detta är enskild-projekt-nivå. Använd direkt efter att ett jobb avslutats för att bedöma om DET jobbet gick enligt plan.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Projekt-ID att hämta utfall för" },
      },
      required: ["project_id"],
    },
  },
  // V2.5 Motor 2 — kundbassvep (kö-populering, inga direkta utskick)
  {
    name: "run_customer_base_sweep",
    description: "Kör kundbassvepet (Motor 2 — 'väck kundbasen'): letar igenom hela kundhistoriken efter kunder som kan erbjudas ett serviceavtal från avtalskatalogen, och lägger förslagen som väntande godkännanden i kön. Skickar ALDRIG något direkt till kund — bara kö-kort som hantverkaren själv godkänner eller avvisar. Kan skippas om AI-agenterna är pausade eller dagens AI-budget redan är förbrukad.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  // Platsbesök — säker bokning, inget SMS internt
  {
    name: "book_site_visit",
    description: "Boka ett platsbesök hos en kund. Skapar ENDAST bokningen i kalendern — skickar INGET SMS eller e-post till kunden. Om kunden ska meddelas om tiden, gör ett separat send_sms-anrop efteråt (det gatas separat och kräver hantverkarens bekräftelse). Ange antingen customer_id eller customer_name (namnet slås upp — om flera kunder matchar måste du förtydliga med customer_id).",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string", description: "Kundens ID, om känt" },
        customer_name: { type: "string", description: "Kundens namn — används för att slå upp customer_id om customer_id saknas" },
        date: { type: "string", description: "Datum, format YYYY-MM-DD" },
        time: { type: "string", description: "Tid, format HH:MM" },
        duration_minutes: { type: "number", description: "Längd i minuter, t.ex. 60 (default 60 om utelämnad)" },
        notes: { type: "string", description: "Valfri anteckning, t.ex. adress eller vad som ska inspekteras" },
      },
      required: ["date", "time"],
    },
  },

  // Command Center — read-only översiktsverktyg (Matte). Alla fyra svarar
  // med rådata som modellen formulerar svaret ur — ingen skriver något.
  {
    name: "get_projects_overview",
    description: "Hämta en lista över projekt (jobb) med flaggor för vad som väntar på hantverkarens uppmärksamhet: öppet lönsamhetsvarningskort (Margin Guardian), obesvarat ÄTA-förslag, eller öppet fyra-ögon-kort för projektstängning. Använd för frågor som 'vilka projekt behöver mig?' eller 'vad ligger och väntar?'. Räknar INTE om projektekonomi per projekt (för dyrt i chatt) — flaggorna räcker för att peka ut vad som bör ses över. Svaret är rådata, formulera själv svaret till hantverkaren.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["active", "completed", "all"], description: "Filtrera på projektstatus. Default 'active'." },
        limit: { type: "number", description: "Max antal projekt, default 20, max 50." },
      },
      required: [],
    },
  },
  {
    name: "get_stale_quotes",
    description: "Hämta skickade offerter som ännu inte fått svar och börjar bli gamla — samma tröskel som 'Pengar på bordet'-sidan. Använd för frågor som 'vilka offerter börjar bli gamla?' eller 'vad väntar på kundsvar?'. Svaret är rådata (kund, belopp, dagar sedan skickad), formulera själv svaret.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: { type: "number", description: "Hur många dagar sedan offerten skickades räknas som 'gammal'. Default 5." },
        limit: { type: "number", description: "Max antal offerter, default 20, max 50." },
      },
      required: [],
    },
  },
  {
    name: "get_invoiceable_work",
    description: "Hämta intjänade pengar som ännu inte fakturerats: signerade ÄTA:n utan fakturakoppling, ofakturerat material och avslutade projekt utan faktura. Samma svep som körs varje natt (missad intäkt-cronen). Använd för frågor som 'vilka jobb kan jag fakturera?' eller 'ligger det pengar kvar att ta hem?'. Skapar ALDRIG en faktura — bara fynd (typ, projekt, belopp, konfidens) som hantverkaren själv granskar. Svaret är rådata, formulera själv svaret.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_customer_commitments",
    description: "Hämta löften och åtaganden som getts till kunder under möten — godkända kundfakta av typen 'commitment'. Använd för frågor som 'vad har vi lovat kunder?' eller 'vilka löften ligger öppna?'. Bygger på Customer Facts (mötesfynd hantverkaren själv godkänt) — tom lista kan betyda att inga möten analyserats än, inte att inga löften finns. Svaret är rådata, formulera själv svaret.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  // Inter-agent communication
  {
    name: "send_agent_message",
    description: "Skicka ett meddelande till en annan agent i teamet. Använd för att delegera, informera eller begära hjälp. Vid 'handoff' — ange reason (varför du lämnar över) och context (ärendedata som t.ex. customer_id, invoice_id, quote_id). Mottagande agent triggas automatiskt.",
    input_schema: {
      type: "object" as const,
      properties: {
        to_agent: {
          type: "string",
          description: "Mottagande agent: matte, karin, hanna, daniel, lars eller lisa",
          enum: ["matte", "karin", "hanna", "daniel", "lars", "lisa"],
        },
        message_type: {
          type: "string",
          description: "Meddelandetyp: request (begäran), insight (insikt), alert (varning), handoff (överlämning)",
          enum: ["request", "insight", "alert", "handoff"],
        },
        content: {
          type: "string",
          description: "Kortfattat meddelande eller sammanfattning, på svenska",
        },
        reason: {
          type: "string",
          description: "Varför överlämning sker (endast för handoff). Ex: 'Kunden frågar om fakturan, utanför min expertis.'",
        },
        context: {
          type: "object",
          description: "Strukturerad ärendedata (endast för handoff). Ex: {customer_id, invoice_id, sms_conversation_id, amount}",
        },
      },
      required: ["to_agent", "message_type", "content"],
    },
  },
  {
    name: "get_agent_messages",
    description: "Hämta olästa meddelanden från andra agenter i teamet.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
] as const
