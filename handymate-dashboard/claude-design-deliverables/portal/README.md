# Claude Design — Customer Portal Deliverables

Visuell design + interaktion för kundportal-redesignen. Levererad 2026-04-26.

Filerna är **referens-material** — den faktiska implementationen ligger i:
- `app/portal/[token]/portal.css` (portad CSS)
- `app/portal/[token]/components/Portal*.tsx` (portade komponenter)
- `app/portal/[token]/page.tsx` (refaktorerad orchestrator med bottom-nav)
- `app/portal/[token]/lib/tint.ts` (per-business färgtinting)

## Avvikelser från Claude Designs leverans

1. **Per-business färgtinting** — Claude Designs hårdkodade `--bee-*` CSS-variabler genereras dynamiskt från `business_config.accent_color` via `tintFromAccent()`. Bee-amber är default när accent_color är null.

2. **Custom BPIcon → lucide-react** — Claude Designs custom SVG-ikonkomponent ersatt med `lucide-react` (samma visuella resultat).

3. **Riktig Swish QR** — Mockupens `QRPattern` (fake-mönster) ersatt med `/api/swish-qr` (riktig QR med Swish-data).

4. **Mock-data ersatt med riktig data** — Mikael Berg, Bee Service AB, 4.9 stjärnor etc. mappas till business_config / customer-data per tenant.

5. **Documents-vyn begränsad** — Bara quotes + invoices visas (de andra kategorierna i mockupen kräver ny `customer_documents`-tabell).

6. **Trust-badges begränsade** — Bara F-skatt visas. GVK + ansvarsförsäkring kräver `business_config.certifications` (framtida).

7. **Stars + recensioner i kontakt-kort** — Hidden för MVP (kräver Google Reviews-aggregation).

8. **Akut-nummer i öppettider** — Hidden för MVP (saknar `emergency_phone`-fält).

## Filer

- `Bee Service Customer Portal.html` — interaktiv demo med iOS-frame design canvas
- `portal.css` — full CSS-spec (designsystem)
- `bp-shared.jsx` — Icon, BPTabs (bottom-nav), BPHeader, BPHandymate
- `bp-home.jsx` — Skärm 1: Hem med aktivt projekt + quick actions + aktivitet
- `bp-project.jsx` — Skärm 2: Projekt-detalj med tracker, foton, lightbox, ÄTA
- `bp-quotes.jsx` — Skärm 3: Offert-lista + signing modal (bottom-sheet)
- `bp-invoice.jsx` — Skärm 4: Faktura med Swish-block + ROT-breakdown
- `bp-messages.jsx` — Skärm 5: Meddelandetråd (iMessage-stil)
- `bp-documents.jsx` — Skärm 6: Dokument-browser med filter-chips
- `bp-review.jsx` — Skärm 7: Recensions-CTA med stars + tags + comment
- `bp-contact.jsx` — Skärm 8: Kontakt-kort med copy + trust + hours
- `design-canvas.jsx` + `ios-frame.jsx` — design-preview, ej för app
