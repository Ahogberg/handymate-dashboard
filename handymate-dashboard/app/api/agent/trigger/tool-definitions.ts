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
      required: ["customer_id", "title", "items"],
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
          description: "Typ av åtgärd: send_sms, send_quote, send_invoice, create_booking, other",
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

  // Inter-agent communication
  {
    name: "send_agent_message",
    description: "Skicka ett meddelande till en annan agent i teamet. Använd för att delegera, informera eller begära hjälp.",
    input_schema: {
      type: "object" as const,
      properties: {
        to_agent: {
          type: "string",
          description: "Mottagande agent: matte, karin, hanna, daniel, eller lars",
          enum: ["matte", "karin", "hanna", "daniel", "lars"],
        },
        message_type: {
          type: "string",
          description: "Meddelandetyp: request (begäran), insight (insikt), alert (varning), handoff (överlämning)",
          enum: ["request", "insight", "alert", "handoff"],
        },
        content: {
          type: "string",
          description: "Meddelandet till agenten, på svenska",
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
