// Tool definitions for Anthropic Claude tool-use
// Descriptions in Swedish since the agent reasons in Swedish

export const toolDefinitions = [
  // ── CRM Tools ──────────────────────────────────────────
  {
    name: "get_customer",
    description: "Hämta en specifik kund med all information. Använd när du behöver se detaljer om en kund.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: {
          type: "string",
          description: "Kundens ID (t.ex. cust_abc123)",
        },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "search_customers",
    description:
      "Sök kunder efter namn, telefonnummer eller e-post. Returnerar en lista med matchande kunder. Använd för att hitta en kund innan du skapar en ny.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Sökterm — namn, telefonnummer eller e-postadress (minst 2 tecken)",
        },
        limit: {
          type: "number",
          description: "Max antal resultat (default 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "create_customer",
    description:
      "Skapa en ny kund i CRM. Kontrollera alltid med search_customers först så att kunden inte redan finns.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Kundens fullständiga namn",
        },
        phone_number: {
          type: "string",
          description: "Telefonnummer i E.164-format (t.ex. +46701234567)",
        },
        email: {
          type: "string",
          description: "E-postadress (valfritt)",
        },
        address_line: {
          type: "string",
          description: "Adress (valfritt)",
        },
      },
      required: ["name", "phone_number"],
    },
  },
  {
    name: "update_customer",
    description:
      "Uppdatera en befintlig kunds information. Skicka bara de fält som ska ändras.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: {
          type: "string",
          description: "Kundens ID",
        },
        name: { type: "string", description: "Nytt namn" },
        phone_number: { type: "string", description: "Nytt telefonnummer" },
        email: { type: "string", description: "Ny e-post" },
        address_line: { type: "string", description: "Ny adress" },
        job_status: {
          type: "string",
          description: "Ny status (lead/active/completed/inactive)",
        },
      },
      required: ["customer_id"],
    },
  },

  // ── Operations Tools ───────────────────────────────────
  {
    name: "create_quote",
    description:
      "Skapa en ny offert åt en kund. Räknar automatiskt ut ROT/RUT-avdrag. Varje item ska ha type (labor/material), name, quantity, unit och unit_price.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: {
          type: "string",
          description: "Kundens ID",
        },
        title: {
          type: "string",
          description: "Titel på offerten (t.ex. 'Elinstallation kök')",
        },
        items: {
          type: "array",
          description: "Lista med rader i offerten",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["labor", "material"],
                description: "Typ: labor (arbete) eller material",
              },
              name: {
                type: "string",
                description: "Beskrivning av raden",
              },
              quantity: { type: "number", description: "Antal" },
              unit: {
                type: "string",
                description: "Enhet (tim, st, m, m2, etc.)",
              },
              unit_price: {
                type: "number",
                description: "Pris per enhet exkl. moms (SEK)",
              },
            },
            required: ["type", "name", "quantity", "unit", "unit_price"],
          },
        },
        rot_rut_type: {
          type: "string",
          enum: ["rot", "rut"],
          description:
            "ROT (30% av arbetskostnad, max 50 000 kr) eller RUT (50%, max 75 000 kr). Utelämna om ej aktuellt.",
        },
        valid_days: {
          type: "number",
          description: "Antal dagar offerten är giltig (default 30)",
        },
      },
      required: ["customer_id", "title", "items"],
    },
  },
  {
    name: "get_quotes",
    description:
      "Hämta offerter för en kund eller alla offerter. Kan filtrera på status.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: {
          type: "string",
          description: "Filtrera på kund (valfritt)",
        },
        status: {
          type: "string",
          enum: ["draft", "sent", "opened", "accepted", "declined", "expired"],
          description: "Filtrera på status (valfritt)",
        },
        limit: { type: "number", description: "Max antal (default 20)" },
      },
      required: [],
    },
  },
  {
    name: "create_invoice",
    description:
      "Skapa en faktura. Kan skapas från en offert (quote_id) eller med egna rader. Fakturanummer genereras automatiskt.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: {
          type: "string",
          description: "Kundens ID",
        },
        quote_id: {
          type: "string",
          description:
            "Offert-ID att konvertera till faktura (hämtar items automatiskt)",
        },
        items: {
          type: "array",
          description:
            "Fakturarader (behövs inte om quote_id anges)",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["labor", "material"],
              },
              name: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              unit_price: { type: "number" },
            },
            required: ["type", "name", "quantity", "unit", "unit_price"],
          },
        },
        rot_rut_type: {
          type: "string",
          enum: ["rot", "rut"],
          description: "ROT/RUT-typ (valfritt)",
        },
        due_days: {
          type: "number",
          description: "Betalningsvillkor i dagar (default 30)",
        },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "check_calendar",
    description:
      "Kontrollera lediga tider i kalendern för ett datumintervall. Returnerar befintliga bokningar och lediga luckor.",
    input_schema: {
      type: "object" as const,
      properties: {
        from_date: {
          type: "string",
          description: "Startdatum (YYYY-MM-DD)",
        },
        to_date: {
          type: "string",
          description: "Slutdatum (YYYY-MM-DD)",
        },
      },
      required: ["from_date", "to_date"],
    },
  },
  {
    name: "create_booking",
    description:
      "Skapa en ny bokning i kalendern. Kontrollera alltid kalendern med check_calendar först.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: {
          type: "string",
          description: "Kundens ID",
        },
        service_type: {
          type: "string",
          description: "Typ av tjänst (t.ex. 'Elinstallation', 'Felsökning')",
        },
        scheduled_start: {
          type: "string",
          description: "Starttid (ISO 8601, t.ex. '2026-03-01T09:00:00')",
        },
        scheduled_end: {
          type: "string",
          description: "Sluttid (ISO 8601)",
        },
        notes: {
          type: "string",
          description: "Anteckningar (valfritt)",
        },
      },
      required: ["customer_id", "service_type", "scheduled_start", "scheduled_end"],
    },
  },
  {
    name: "update_project",
    description:
      "Uppdatera status eller anteckningar för en bokning/projekt.",
    input_schema: {
      type: "object" as const,
      properties: {
        booking_id: {
          type: "string",
          description: "Bokningens ID",
        },
        status: {
          type: "string",
          enum: ["pending", "confirmed", "completed", "cancelled"],
          description: "Ny status",
        },
        notes: {
          type: "string",
          description: "Nya anteckningar (läggs till, ersätter inte)",
        },
      },
      required: ["booking_id"],
    },
  },
  {
    name: "log_time",
    description:
      "Logga arbetstid för en bokning eller kund. Används för tidrapportering och fakturering.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: {
          type: "string",
          description: "Kundens ID",
        },
        booking_id: {
          type: "string",
          description: "Bokningens ID (valfritt)",
        },
        work_date: {
          type: "string",
          description: "Datum (YYYY-MM-DD)",
        },
        start_time: {
          type: "string",
          description: "Starttid (HH:MM)",
        },
        end_time: {
          type: "string",
          description: "Sluttid (HH:MM)",
        },
        description: {
          type: "string",
          description: "Beskrivning av utfört arbete",
        },
        is_billable: {
          type: "boolean",
          description: "Fakturerbar tid (default true)",
        },
      },
      required: ["customer_id", "work_date", "start_time", "end_time"],
    },
  },

  // ── Communications Tools ───────────────────────────────
  {
    name: "send_sms",
    description:
      "Skicka ett SMS till ett telefonnummer via 46elks. Meddelandet skickas från företagets namn. Max 1600 tecken. Skicka INTE SMS mellan 21:00 och 08:00.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: {
          type: "string",
          description: "Mottagarens telefonnummer i E.164-format (+46...)",
        },
        message: {
          type: "string",
          description: "Meddelandetext (max 1600 tecken)",
        },
      },
      required: ["to", "message"],
    },
  },
  {
    name: "send_email",
    description:
      "Skicka ett e-postmeddelande via Resend API. Använd för offertutskick, bekräftelser, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: {
          type: "string",
          description: "Mottagarens e-postadress",
        },
        subject: {
          type: "string",
          description: "Ämnesrad",
        },
        body: {
          type: "string",
          description: "E-postinnehåll (ren text)",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  // ── Pipeline Tools ────────────────────────────────────────
  {
    name: "qualify_lead",
    description:
      "Kvalificera en lead från ett samtal eller SMS. Analyserar konversationen och returnerar score, urgency, jobbtyp och uppskattat värde. Skapar en ny lead eller uppdaterar befintlig.",
    input_schema: {
      type: "object" as const,
      properties: {
        conversation_id: {
          type: "string",
          description: "ID för samtalet/konversationen att analysera",
        },
        phone: {
          type: "string",
          description: "Telefonnummer till leadet (valfritt om tillgängligt i konversationen)",
        },
        name: {
          type: "string",
          description: "Kontaktpersonens namn (valfritt)",
        },
        source: {
          type: "string",
          enum: ["vapi_call", "inbound_sms", "website_form", "manual"],
          description: "Var leadet kommer ifrån",
        },
      },
      required: ["conversation_id"],
    },
  },
  {
    name: "update_lead_status",
    description:
      "Flytta en lead genom pipeline. Statusar: new → contacted → qualified → quote_sent → won/lost.",
    input_schema: {
      type: "object" as const,
      properties: {
        lead_id: {
          type: "string",
          description: "Leadets ID",
        },
        status: {
          type: "string",
          enum: ["new", "contacted", "qualified", "quote_sent", "won", "lost"],
          description: "Ny status",
        },
        lost_reason: {
          type: "string",
          description: "Anledning om status=lost (t.ex. 'Valde annan leverantör', 'Ingen budget')",
        },
        notes: {
          type: "string",
          description: "Anteckning om statusbytet",
        },
        customer_id: {
          type: "string",
          description: "Kund-ID att koppla till leadet (om lead konverteras)",
        },
      },
      required: ["lead_id", "status"],
    },
  },
  {
    name: "get_lead",
    description:
      "Hämta en lead med all information, aktivitetshistorik och kopplad kund.",
    input_schema: {
      type: "object" as const,
      properties: {
        lead_id: {
          type: "string",
          description: "Leadets ID",
        },
      },
      required: ["lead_id"],
    },
  },
  {
    name: "search_leads",
    description:
      "Sök och filtrera leads i pipeline. Kan filtrera på status, urgency, score, jobbtyp och datum.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["new", "contacted", "qualified", "quote_sent", "won", "lost"],
          description: "Filtrera på status",
        },
        urgency: {
          type: "string",
          enum: ["low", "medium", "high", "emergency"],
          description: "Filtrera på urgency",
        },
        min_score: {
          type: "number",
          description: "Minsta score (0-100)",
        },
        max_score: {
          type: "number",
          description: "Högsta score (0-100)",
        },
        job_type: {
          type: "string",
          description: "Filtrera på jobbtyp (t.ex. 'Elinstallation')",
        },
        from_date: {
          type: "string",
          description: "Från datum (YYYY-MM-DD)",
        },
        to_date: {
          type: "string",
          description: "Till datum (YYYY-MM-DD)",
        },
        limit: {
          type: "number",
          description: "Max antal resultat (default 20)",
        },
      },
      required: [],
    },
  },
] as const

export type ToolName = (typeof toolDefinitions)[number]["name"]
