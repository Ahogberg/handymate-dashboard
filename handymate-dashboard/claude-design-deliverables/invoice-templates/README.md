# Claude Design — Invoice Templates Deliverables

Tre faktura-mallar som visuellt matchar offert-mallarna i [lib/quote-templates/](lib/quote-templates/). Levererad 2026-04-27.

Filerna är **referens-material** — den faktiska implementationen ligger i [lib/invoice-templates/](lib/invoice-templates/).

## Mappning

| Källa (HTML) | Implementation |
|---|---|
| `template-1-modern.html`   | `lib/invoice-templates/modern.ts` |
| `template-2-premium.html`  | `lib/invoice-templates/premium.ts` |
| `template-3-friendly.html` | `lib/invoice-templates/friendly.ts` |

## Faktura-specifika element (utöver offert-mallarnas struktur)

- **Status-badge** i headern: `Försenad` / `Betald` / `Obetald` (per status)
- **Förfallodatum** i header-meta (röd text om försenad)
- **OCR-nummer** i refs-strip + payment-row
- **Bankgiro** + **Swish QR** i payment-row
- **Late-notice card** (visas bara om `status === 'overdue'`):
  - Friendly: röd gradient-card med utropstecken-ikon + dagar-räknare
  - Modern: kompakt notis-rad med röd accent
  - Premium: dark stripe + Syne-headline
- **Dröjsmålsränta** som extra rad i totals (om försenad)

## Design-konsekvens med offert-mallarna

Samma färgpalett, samma fonter, samma kort-stil per stil — kunden känner igen visuell identitet från offert till faktura till påminnelse. Det enda som skiljer är fakturaspecifika element (status, förfallodatum, OCR/Swish-block).
