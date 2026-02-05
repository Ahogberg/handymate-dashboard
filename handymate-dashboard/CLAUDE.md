# Handymate - AI-plattform för svenska hantverkare

## Vad är Handymate?
SaaS-plattform som ger hantverkare en AI-assistent som hanterar samtal, bokningar, offerter, fakturor och materialbeställningar. Tänk "AI-driven sekreterare + CRM + affärssystem" för småföretag inom bygg/installation.

## Tech Stack
- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes
- **Databas:** Supabase (PostgreSQL)
- **AI:** Anthropic Claude (samtalsanalys, offertgenerering, röstkommando), OpenAI Whisper (transkribering)
- **Telefoni:** 46elks (SMS, samtalsinspelning, vidarekoppling)
- **Voice Agent:** Vapi (AI-röstassistent, väntar på SIP-koppling)
- **Hosting:** Vercel
- **Email:** Resend API

## Design System
- Dark theme: bg-[#09090b], zinc-900/50 cards
- Gradient: violet-500 → fuchsia-500 (knappar, accenter)
- Border: border-zinc-800
- Glassmorphism: backdrop-blur-xl
- Icons: lucide-react
- Mobile-first responsiv design

## Databasstruktur (Supabase)
Alla tabeller använder TEXT som ID-typ (inte UUID).

### Huvudtabeller:
- **business_config** - Företagsinställningar, auth (user_id → auth.users)
  - Kolumner: business_id, user_id, business_name, display_name, contact_name, contact_email, phone_number, branch, service_area, assigned_phone_number, forward_phone_number, call_recording_enabled, pricing_settings (JSONB), knowledge_base (JSONB)

- **customer** - Kunder
  - Kolumner: customer_id, business_id, name, phone_number, email, address_line, customer_rating, job_status

- **booking** - Bokningar
  - Kolumner: booking_id, business_id, customer_id, service_type, booking_date, booking_time, status

- **quotes** - Offerter
  - Kolumner: quote_id, business_id, customer_id, status (draft/sent/opened/accepted/declined/expired), items (JSONB), labor_total, material_total, total, rot_rut_type, rot_rut_deduction, customer_pays, valid_until

- **invoice** - Fakturor
  - Kolumner: invoice_id, business_id, customer_id, quote_id, invoice_number, status (draft/sent/paid/overdue/cancelled), items (JSONB), total, rot_rut_type, due_date

- **time_entry** - Tidrapportering
  - Kolumner: time_entry_id, business_id, booking_id, customer_id, work_date, start_time, end_time, duration_minutes, hourly_rate, is_billable

- **call_recording** - Samtalsinspelningar
  - Kolumner: recording_id, business_id, customer_id, phone_from, phone_to, direction, duration_seconds, recording_url, transcript, transcript_summary, sentiment, extracted_data (JSONB)

- **ai_suggestion** - AI-förslag från samtalsanalys
  - Kolumner: suggestion_id, business_id, recording_id, customer_id, suggestion_type (booking/follow_up/quote/reminder/sms/callback/reschedule/other), title, description, priority, status (pending/approved/rejected/completed), suggested_data (JSONB), source_text

- **supplier** - Grossister/leverantörer
  - Kolumner: supplier_id, business_id, name, customer_number

- **supplier_product** - Produkter från grossister
  - Kolumner: product_id, supplier_id, business_id, sku, name, category, unit, purchase_price, sell_price, markup_percent

- **material_order** - Materialbeställningar
  - Kolumner: order_id, business_id, supplier_id, quote_id, items (JSONB), total, status (draft/pending/ordered/delivered)

- **price_list** - Prislista per företag
  - Kolumner: id, business_id, category (labor/material/service), name, unit, unit_price

- **customer_activity** - Kundaktivitet/tidslinje
  - Kolumner: activity_id, customer_id, business_id, activity_type, title, description, created_by

- **sms_log** - SMS-logg

## Auth
- Supabase Auth (auth.users) kopplat till business_config via user_id
- Login/Register via /api/auth route
- Signup i flera steg: Företagsinfo → Konto

## Mappstruktur
```
handymate-dashboard/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx (Dashboard med statistik)
│   │   ├── inbox/ (AI Inbox + Inspelningar)
│   │   ├── calendar/ (Bokningar + Tidrapport)
│   │   ├── customers/ (CRM + Kampanjer)
│   │   ├── quotes/ (Offerter)
│   │   │   ├── new/ (Ny offert med AI)
│   │   │   └── [id]/ (Offertdetalj)
│   │   ├── invoices/ (Fakturor)
│   │   ├── orders/ (Materialbeställningar)
│   │   ├── assistant/ (Röstkommando)
│   │   └── settings/ (Inställningar)
│   │       ├── knowledge/ (Kunskapsbas)
│   │       └── pricelist/ (Leverantörer/prislista)
│   ├── api/
│   │   ├── auth/ (Login, Register, Logout)
│   │   ├── voice/ (Incoming, Consent, Recording webhooks)
│   │   ├── sms/ (Send, Incoming, AI-response)
│   │   ├── quotes/ (Generate, PDF, Send)
│   │   ├── invoices/ (CRUD, PDF, Send)
│   │   ├── orders/ (Materialbeställningar)
│   │   ├── suppliers/ (CRUD, Import)
│   │   ├── suggestions/ (Approve)
│   │   ├── assistant/ (Voice command)
│   │   ├── phone/ (Provision, Settings)
│   │   └── dashboard/ (Stats)
│   ├── login/
│   ├── signup/
│   └── layout.tsx
├── components/
│   ├── Sidebar.tsx
│   └── MobileNav.tsx
├── lib/
│   ├── supabase.ts
│   └── BusinessContext.tsx
└── sql/
    └── new_tables.sql
```

## Kärnflöden

### Samtalsflöde:
Kund ringer → 46elks → /api/voice/incoming → Vidarekoppla till hantverkare + Spela in → Samtal avslutas → /api/voice/recording → Whisper transkriberar → Claude analyserar → AI-förslag skapas → Visas i Inbox → Hantverkare godkänner → Action utförs

### Offertflöde:
AI eller manuell → Skapa offert med material + arbete → ROT/RUT-beräkning → Generera PDF → Skicka via SMS/Email → Kund accepterar → Skapa bokning + Beställ material

### Fakturaflöde:
Tidrapport eller offert → Konvertera till faktura → PDF med bankinfo → Skicka → Spåra betalning

## Miljövariabler
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- ANTHROPIC_API_KEY
- OPENAI_API_KEY
- ELKS_API_USER
- ELKS_API_PASSWORD
- RESEND_API_KEY
- NEXT_PUBLIC_APP_URL
- VAPI_ASSISTANT_ID (för framtida voice agent)

## Kodkonventioner
- Alla ID:n är TEXT (inte UUID)
- Tabellnamn: snake_case singular (customer, booking, invoice)
- API routes: /api/[resurs]/[action]
- Komponenter: PascalCase
- Supabase import: import { supabase } from '@/lib/supabase'
- Business context: import { useBusiness } from '@/lib/BusinessContext'
- Svenska i UI-texter, engelska i kod

## Prissättning
- Starter: 1 995 kr/mån (75 samtal, 200 SMS)
- Professional: 4 995 kr/mån (250 samtal, 600 SMS)
- Business: 12 995 kr/mån (800 samtal, 2000 SMS)

## Pågående/Planerat
- Voice agent via Vapi (väntar på 46elks SIP-whitelisting)
- Fortnox-integration (bokföring)
- Realtids API till grossister (Ahlsell, Elektroskandia)
- Kundportal
- Google Reviews automation
- Push-notiser
