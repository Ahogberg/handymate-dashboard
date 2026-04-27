# Handymate Design System

> Sanningskälla för all visuell design i Handymate.
> Mönstren är extraherade från Claude Designs leveranser i
> `app/onboarding/`, `app/portal/[token]/`,
> `components/pipeline/unified/` och `lib/quote-templates/modern.ts`.
>
> Vid konflikt mellan en gammal dashboard-fil och denna fil
> är **denna fil rätt**.

## Filosofi

**Lugnt, professionellt, premium.**

- Färg används sparsamt och bara där det tillför mening (status, kategori, navigation).
- Vita ytor, tydlig hierarki, inget överdrivet.
- Hierarki skapas via storlek + spacing — inte via färg eller drop-shadows.
- Hantverkaren ska känna att verktyget respekterar deras tid; ingen onödig dekoration.

> **Regel:** Om en färg inte kommunicerar betydelse ska den inte användas.

---

## 1. Färgpalett

Alla värden kommer från [onboarding.css](../app/onboarding/onboarding.css) + [portal.css](../app/portal/[token]/portal.css). De finns som CSS-variabler i båda namespacen — använd dem, hårdkoda aldrig hex.

### Primary — teal

| Token | Hex | Användning |
|---|---|---|
| `--ob-primary-700` / teal-700 | `#0F766E` | **Default primary.** CTAs, fokuserade element, "aktiv"-state, brand mark, accent-strecket på offert/faktura, eyebrow-text på portal-kort |
| `--ob-primary-600` | `#0D9488` | Hover på CTA |
| `--ob-primary-500` | `#14B8A6` | Hover-border på tiles/chips, "done"-progress-dots |
| `--ob-primary-100` | `#CCFBF1` | Selected-tile bakgrunder, accent-bar |
| `--ob-primary-50` | `#F0FDFA` | "Selected"-tile/chip surface, mjuk tinting på avatarer |

> **Per-business override:** Portalen sätter `--bee-*`-variabler från `business_config.accent_color` via `PortalThemeProvider` (default = honungs-amber). Dashboarden använder ALLTID teal — accent-färg är bara för kund-vänd vy. Quote/invoice-templates använder `business.accentColor` med teal som fallback.

### Neutrals — slate

| Token | Hex | Användning |
|---|---|---|
| `--ob-bg` / `--bg` | `#F8FAFC` | Sidebakgrund, "softer surface" inom kort |
| `--ob-surface` / `--surface` | `#FFFFFF` | Kort, modaler, inputs |
| `--ob-border` / `--border` | `#E2E8F0` | Default border på allt |
| `--ob-border-strong` / `--border-strong` | `#CBD5E1` | Hover-border, tile-border |
| `--ob-ink` / `--ink` | `#0F172A` | Primär text |
| `--ob-ink-2` / `--ink-2` | `#1E293B` | Sekundär text (labels, body) |
| `--ob-muted` / `--muted` | `#64748B` | Hjälptext, beskrivande text |
| `--ob-subtle` / `--subtle` | `#94A3B8` | Placeholders, "tom"-state-text, tertiär |

`#F1F5F9` används som darker bakgrund där portalen ligger inbäddad (mobile shell-utsidan).

### Semantiska färger

Bara för status — inte dekoration.

| Syfte | Token | Hex | Hex bakgrund |
|---|---|---|---|
| Lyckat / aktiv / pågår | `--green-600` / `--ob-green-600` | `#16A34A` | `#F0FDF4` (`--green-50`) |
| Fel / förfallen | `--red-600` | `#DC2626` | `#FEF2F2` (`--red-50`) |
| Information / länk | `--blue-600` / `--ob-blue-600` | `#2563EB` | `#EFF6FF` (`--blue-50`) |
| Varning / amber | `--ob-amber-600` | `#D97706` | `#FEF3C7` (portal `--bee-100`) |

### Single-purpose accents (sparsamt)

Bara för kategori-indikatorer eller avatar-tinting där en specifik betydelse behöver färg:

| Token | Hex | Endast för |
|---|---|---|
| `--ob-sky-500` | `#0EA5E9` | Branschtyp / agent (Karin) |
| `--ob-purple-600` | `#9333EA` | Branschtyp (måleri) eller specifik agent |
| `--ob-emerald-600` | `#059669` | Eko/grön branschtyp |

> **Regel:** Max **2 accent-färger** per vy. Behöver du fler — du ritar fel vy.

### Förbjudet

`bg-fuchsia-*`, `bg-pink-*`, `bg-violet-*`, `bg-indigo-*`, `from-fuchsia-*`, `to-pink-*` — nej. Ej heller mörkt tema (`bg-gray-900`, `dark:bg-*`).

---

## 2. Typografi

### Font-stackar

**App (dashboard, onboarding, portal):**
```
-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif
```
Native rendering på alla plattformar — laddar inget extra, snabbt på mobil.

**Quote/invoice-templates (kund-vänd PDF/HTML):**
```
Headings: 'Space Grotesk', sans-serif    (500/600/700)
Body:     'DM Sans', sans-serif          (400/500/600/700)
```
Dessa laddas via `<link>` från Google Fonts i template-headern. Används bara i [lib/quote-templates/modern.ts](../lib/quote-templates/modern.ts) och [lib/invoice-templates/modern.ts](../lib/invoice-templates/modern.ts).

**Pipeline (Flödet):**
```
--font-heading: 'Space Grotesk', system-ui, sans-serif    (för deal-amount, project-name)
default body:   system-ui                                  (för rest)
```
Definierat som CSS-variabel i [flow.module.css](../components/pipeline/unified/flow.module.css).

### Storlekshierarki

Från onboarding/portal/templates:

| Roll | Storlek | Weight | Letter-spacing | Var |
|---|---|---|---|---|
| Hero-headline | 26px | 700 | -0.02em | `.ob-headline` (Step 2 osv) |
| Page title | 24px | 700 | -0.02em | `.bp-page-title h1` (PortalHome) |
| Section heading | 18-22px | 600-700 | -0.01em / -0.02em | Doc-number, project-name aktiv |
| Card title | 14-16px | 600-700 | -0.01em | Brand-name, deal-customer |
| Body | 13-15px | 400-500 | normal | `.bp-card`, list-rader |
| Label | 13px | 600 | normal | `.ob-label`, `.party-label` |
| Help / sub | 11-12px | 400-500 | normal | `.ob-help`, `.bp-brand-sub` |
| Eyebrow | 10-11px | 600-700 | 0.10-0.16em **uppercase** | `.ob-eyebrow`, "AKTIVT PROJEKT" |
| Tabular nums | 10-12px | 500-700 | normal | Deal-ref-num, ärende #, monospace fallback |

### Weight-regler

- **700** = headlines, doc-numbers, "active project" eyebrow, deal-totals.
- **600** = labels, card titles, button-text, brand-name, badges.
- **500** = body som behöver lite betoning, button-text på sekundära CTAs.
- **400** = default body, hjälptext.

> **Anti-mönster:** Skriv aldrig hela rader med 700-bold "för att de är viktiga". Hierarki kommer från storlek och färg först, weight sist.

### Line-height & letter-spacing

- Headings: `line-height: 1.15-1.3`, `letter-spacing: -0.01em` till `-0.02em` (tighter för premium-känsla).
- Body: `line-height: 1.5-1.65`.
- Eyebrows: `line-height: 1`, `letter-spacing: 0.10-0.16em` UPPERCASE.

---

## 3. Spacing

**4px-baserat system.** Alla mått är multiplar av 4 (tillåt 6 och 14 som mellanvärden där det passar).

### Skala

| Token | px | Användning |
|---|---|---|
| 1 | 4 | Inline icon-text, mini-gaps |
| 2 | 8 | Chip-padding, gap mellan tight-relaterade element |
| 3 | 12 | Standard-gap mellan listrader, mellan label och input |
| 4 | 16 | Card-padding (default), gap mellan sektioner inom ett kort |
| 5 | 20 | `.ob-body` horisontell padding, `.bp-page-title` |
| 6 | 24 | Gap mellan vyer/sektioner |
| 7 | 28 | Hero-spacing |
| 8 | 32 | Page-margin på desktop |

### Card-padding

| Storlek | Padding | Var |
|---|---|---|
| Comfortable (default) | `16px` | `.bp-card`, `.ob-card` |
| Compact | `12-14px` | List-rader (`.flow projectRow`), aktivitets-rader |
| Header-section | `14-18px` (vert.) `18-20px` (horiz.) | `.bp-header`, `.ob-header` |

### Sektion-spacing

- Mellan field-grupper i form: `18px` (`.ob-field { margin-bottom: 18px }`).
- Mellan card och rubrik: `10-12px`.
- Mellan major sections: `20-24px` (`24px 18px 0` är portal-vana).

### Inline-spacing

- Icon + text i knapp: `gap: 6px` (8px om större icon).
- Items i header: `gap: 12px`.
- Items i form: `gap: 8-10px`.

### Border-radius

Definierade som CSS-variabler — använd dem direkt, hårdkoda aldrig.

| Token | px | Användning |
|---|---|---|
| `--ob-r-md` / `--r-md` | 12 | Inputs, små knappar, små kort |
| `--ob-r-lg` / `--r-lg` | 16 | Default cards, CTAs, modaler-inom |
| `--ob-r-xl` / `--r-xl` | 20 | Större kort med innehåll |
| `--ob-r-2xl` / `--r-2xl` | 24 | Modal-toppar (bottom-sheet), onboarding-shell desktop |
| `--ob-r-pill` / `--r-pill` | 999 | Badges, chips, pillar, status-dots |

**Aldrig:** `border-radius: 4px` eller `8px` på cards — det ser dated ut. Knappar mindre än 32px hög får använda 8px.

### Shadows

Subtila, från onboarding.css/portal.css:

| Token | Värde | Användning |
|---|---|---|
| `--ob-sh-sm` / `--sh-sm` | `0 1px 2px rgba(15,23,42,0.04), 0 1px 1px rgba(15,23,42,0.03)` | Project-rows, fält som behöver lyftning |
| `--ob-sh-md` / `--sh-md` | `0 4px 12px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.04)` | Card-hover, modal-elements |
| `--ob-sh-lg` / `--sh-lg` | `0 12px 32px rgba(15,23,42,0.10), 0 4px 8px rgba(15,23,42,0.04)` | Modaler, onboarding-shell, "magic"-element |
| `--ob-sh-glow` | `0 0 0 4px rgba(13,148,136,0.12)` | Input-focus, selected-tile |

> **Regel:** Aldrig drop-shadow på ett kort som ligger på vit bakgrund och är statisk — borderar räcker. Shadow signalerar "lift" eller "fokuserat".

### Transitions

| Token | Värde | Användning |
|---|---|---|
| `--ob-t-fast` / `--t-fast` | `180ms cubic-bezier(0.4, 0, 0.2, 1)` | Hover-transitions, focus-rings |
| `--ob-t-base` / `--t-base` | `240-280ms cubic-bezier(0.4, 0, 0.2, 1)` | Modal-öppning, fade-in |
| `--ob-t-slow` | `420ms cubic-bezier(0.4, 0, 0.2, 1)` | Stage-byten, progress-bars |
| `--ob-t-bounce` / `--t-bounce` | `520ms cubic-bezier(0.34, 1.56, 0.64, 1)` | Pop-in på selected/won-elements |

---

## 4. Komponentmönster

### 4.1 Cards

**Default** ([portal.css:192](../app/portal/[token]/portal.css#L192) `.bp-card` = onboarding `.ob-card`):

```css
background: #FFFFFF;             /* var(--surface) */
border: 1px solid #E2E8F0;       /* var(--border) */
border-radius: 16px;             /* var(--r-lg) */
padding: 16px;                   /* default comfortable */
```

**Tappable card** lägger till:
```css
cursor: pointer;
transition: all 180ms ease;
```
- Hover: `border-color: var(--border-strong)`, `box-shadow: var(--sh-md)`.
- Active (touch): `transform: scale(0.99)`.

**Highlighted card** (aktivt projekt, valt val):
- Lägg till en mjuk gradient: `linear-gradient(135deg, var(--bee-50) 0%, var(--surface) 60%)`.
- Border byts mot accent-100 (`var(--bee-100)` / `var(--ob-primary-100)`).
- Inuti kan det finnas sekundära strips med `border-top: 1px solid var(--bee-100)` och `background: rgba(255,255,255,0.6)` — t.ex. "Nästa besök" på PortalHome.

**Compact list-row** ([flow.module.css:329](../components/pipeline/unified/flow.module.css#L329) `.projectRow`):
- Padding `12px 14px` (compact: `9px 12px`).
- `border-left-width: 4px` när raden behöver kategori-kodning (kommer från category color).

> **Aldrig:** Icke-uniformerade border-radius (`12px 4px 16px 8px`) eller `border: 2px` (1.5px på selected är max).

### 4.2 Knappar

**Primary CTA** ([onboarding.css:183](../app/onboarding/onboarding.css#L183) `.ob-cta`):

```css
height: 52px;
border-radius: 16px;             /* --ob-r-lg */
background: #0F766E;             /* primary-700 */
color: #fff;
font-size: 16px;
font-weight: 600;
box-shadow: 0 4px 14px rgba(15,118,110,0.25);
```
Hover: `background: #0D9488`, `transform: translateY(-1px)`, glow box-shadow.
Disabled: `background: var(--border)`, `color: var(--subtle)`, no shadow, `cursor: not-allowed`.

**Sekundär (ghost)** (`.ob-cta.ghost`):
```css
background: transparent;
color: var(--ink);
border: 1px solid var(--border);
box-shadow: none;
```

**Tertiär (text-only)**:
- Bara text + ikon, t.ex. `.ob-skip`, `text-primary-700 underline`.
- Padding `8px 4px`. Hover ändrar bara färg.

**Storlekar**

| Variant | Höjd | Padding | Font-size |
|---|---|---|---|
| `lg` (page-CTA) | 52px | full-width | 16px |
| `md` (modal-action) | 40-44px | 14-16px | 14-15px |
| `sm` (toolbar) | 32-36px | 10-14px | 12-13px |
| `xs` (chip-knapp) | 28-30px | 6-12px | 11-12px |

**Loading-state**: Byt label mot `<Loader2 className="animate-spin" />` + "Skapar konto…". Aldrig disable utan visuell feedback.

**Icon-button** ([portal.css:123](../app/portal/[token]/portal.css#L123) `.bp-icon-btn`):
```css
width: 38px; height: 38px;
border-radius: 50%;
background: var(--bg);
border: 1px solid var(--border);
```

### 4.3 Inputs

**Text/email/tel/password** ([onboarding.css:232](../app/onboarding/onboarding.css#L232) `.ob-input`):

```css
height: 50px;                    /* 44 mobile-min, 50 default */
border: 1px solid #E2E8F0;
border-radius: 12px;             /* --r-md */
padding: 0 16px;
font-size: 16px;                 /* mobile-min för att inte zooma in */
background: #FFFFFF;
color: var(--ink);
```

**Focus**: `border-color: var(--ob-primary-700)`, `box-shadow: var(--ob-sh-glow)` (`0 0 0 4px rgba(13,148,136,0.12)`).
**Placeholder**: `color: var(--ob-subtle)` (#94A3B8).
**Med ikon** (vänsterställd): position icon `left: 14px`, top centered, `color: var(--ob-subtle)`. Add `padding-left: 42px` på inputten.

**Textarea**: Samma look, `min-height: 72px`, `resize: vertical`, `line-height: 1.6`.

**Label** (`.ob-label`):
```css
display: block;
font-size: 13px;
font-weight: 600;
color: var(--ob-ink-2);
margin-bottom: 8px;
```
Placeras ALLTID ovanför fältet — aldrig som placeholder-only.

**Help-text** (`.ob-help`):
```css
font-size: 12px;
color: var(--ob-muted);
margin-top: 6px;
```

**Error**: Lägg en röd info-box ovanför fältet (`background: #FFF1F2`, `border: 1px solid #FECACA`, `color: #B91C1C`). Inte röd border på inputten — det skriker.

### 4.4 Modaler

**Bottom-sheet** (mobile-first, [PortalQuoteSigningModal.tsx:69](../app/portal/[token]/components/PortalQuoteSigningModal.tsx#L69)):

```css
position: fixed;
inset: 0;
background: rgba(15,23,42,0.5);    /* backdrop */
animation: bp-fade-in 200ms;

/* sheet */
background: #fff;
width: 100%;
max-width: 460px;
margin: 0 auto;
border-top-left-radius: 24px;
border-top-right-radius: 24px;
max-height: 92%;
animation: bp-slide-up 360ms cubic-bezier(0.4, 0, 0.2, 1);
```

**Struktur**:
1. **Header** (`padding: 14px 18px 10px`, `border-bottom: 1px solid var(--border)`): titel + undertitel + close-knapp (icon-button).
2. **Body** (`flex: 1; overflow-y: auto`): scrollbart innehåll.
3. **Footer** (`padding: 14px 18px 24px`, sticky bottom): primary + ghost CTA stackade på mobile, sida-vid-sida på desktop.

**Centered desktop modal**: Samma sheet men med `border-radius: 24px` runtom och `align-items: center` på containern. Vid >=768px byter bottom-sheet till centered.

**Backdrop click stänger** modalen, **innehåll-klick stannar** (`e.stopPropagation()`).

### 4.5 Badges

**Pill-form** ([portal.css:206](../app/portal/[token]/portal.css#L206) `.bp-badge`):

```css
display: inline-flex;
align-items: center;
gap: 4px;
padding: 3px 8px;
border-radius: 999px;             /* --r-pill */
font-size: 11px;
font-weight: 600;
letter-spacing: 0.01em;
```

**Färgvarianter** (background = light tint, color = saturated):

| Variant | Background | Color | Användning |
|---|---|---|---|
| `green` | `#F0FDF4` | `#16A34A` | Pågår, betald, vunnen |
| `red` | `#FEF2F2` | `#DC2626` | Förfallen, fel |
| `blue` | `#EFF6FF` | `#2563EB` | Information, ny |
| `amber` | `#FEF3C7` (`--bee-50`) | `#B45309` (`--bee-700`) | Pending, awaiting |
| `gray` | `#F8FAFC` | `#64748B` | Neutral, "kontakta", default |

**Categori-badge** med kategori-färg (Flödet, deals): bg = light tint (`bg-{color}-50`), text = `{color}-700`.

**Storlekar**:
- `sm` (default): `padding: 3px 8px`, `font-size: 11px`.
- `md`: `padding: 4px 10px`, `font-size: 12px`.

> **Regel:** Använd färgad badge för status (pågår/fel/avslutat). Använd grå/neutral för räknare ("12 leads"). Aldrig färg bara för att.

### 4.6 Listor

**Comfortable list** (`.bp-card` med `divide-y divide-gray-100` mellan rader):
- Radhöjd: 56-72px (innehåller titel + sub).
- Padding: `12px 14px`.
- Hover: `background: var(--bg)` på hela raden.
- Klickbar: cursor-pointer + chevron-right på höger sida (`color: var(--subtle)`).

**Compact list** (`.flow projectsList` rader):
- Radhöjd: 40-48px.
- Padding: `9px 12px`.
- Inga dividers — `gap: 10px` mellan kort med `var(--border)` runtom.

**Dividers**:
- Mellan rader inom samma kort: `divide-gray-100` (`#F1F5F9`) eller `border-bottom: 1px solid var(--border)`.
- Mellan major sections: `1px dashed var(--border)` med padding-top för luft.
- **Aldrig** `border-bottom` på sista raden i ett kort.

**Empty state**:
```css
padding: 18-24px;
border: 1px dashed var(--border);
border-radius: var(--r-md);
text-align: center;
color: var(--muted);
font-size: 13px;
```
Plus en stor ikon ovanför (40px, `color: var(--border-strong)`). Texten är hjälpsam, inte tom: "Inga händelser än — kommer in när jobbet startar."

### 4.7 Chips & Tiles

**Chip** ([onboarding.css:296](../app/onboarding/onboarding.css#L296) `.ob-chip`):
- Pill-form, `border: 1.5px solid var(--border)`, padding `8px 14px`.
- Selected: `background: var(--ob-primary-50)`, `border-color: var(--ob-primary-700)`, `color: var(--ob-primary-700)`.

**Tile** (selectable cards i grid):
- Vit yta, `border: 1.5px solid var(--border)`, `border-radius: 16px`, padding `14px 12px`, `min-height: 92px`.
- Innehåll centrerat: ikon (32px) + label.
- Selected: border 700, bg primary-50, glow box-shadow.

### 4.8 Toggle / Switch

[onboarding.css:325](../app/onboarding/onboarding.css#L325) `.ob-toggle` är hela raden (klickbar), `.ob-switch` är knappen:
```css
width: 42px; height: 24px;
background: var(--border-strong);
border-radius: 12px;
/* 20×20 vit cirkel som translate'ar 18px */
```
On = `background: var(--ob-primary-700)`, knappen flyttad höger.

### 4.9 Progress

**Linear** ([PortalHome.tsx:169](../app/portal/[token]/components/PortalHome.tsx#L169)):
```css
height: 8px;
background: var(--bee-100);          /* tinted accent-bg */
border-radius: 4px;
overflow: hidden;
```
Fill: `linear-gradient(90deg, var(--bee-500), var(--bee-600))`, animation `bp-grow-x 1.2s`.

**Dots** ([onboarding.css:122](../app/onboarding/onboarding.css#L122) `.ob-progress`): horizontal flex med `gap: 4px`, varje dot `flex: 1; height: 4px; border-radius: 2px`. Default `background: var(--border)`, active `--ob-primary-700`, done `--ob-primary-500`.

---

## 5. Anti-mönster — vad vi INTE gör

✗ **Färg på element bara för att det är "kul"** — varje färgad pixel ska kommunicera något.
✗ **Emojis som ersätter text i navigation** — ikoner från `lucide-react`, aldrig 🏠 i en sidebar.
✗ **Drop-shadows på allt** — bara på lift/hover/modal. Statiska kort på vit bakgrund får border, inte shadow.
✗ **Gradients utan syfte** — gradient-fill är OK för progress-bar och hero-card. Ej för knappar (förutom CTA i kund-vy med accent-färg) och ej på text.
✗ **Border på alla element** — sektioner inom ett kort skiljs med spacing eller mjuk divider, inte med border.
✗ **Fler än 2 accent-färger på samma vy** — välj primärt och en sekundär; resten ska vara neutrals.
✗ **Animationer som distraherar** — fade-in OK, slide-up OK, pulse på CTA = nej.
✗ **Bold på vad som inte är viktigt** — om allt är 700 är inget viktigt.
✗ **Lila/fuchsia/pink/indigo** — Handymate har en palett: teal + slate + status. Ej heller mörkt tema.
✗ **Inline `style={{...}}` ovanpå Tailwind-klasser** för identisk styling — välj antingen klass eller inline, inte båda för samma property.
✗ **Cards med 4px eller 8px border-radius** — minimum är 12px (`--r-md`). Knappar OK med 8px.
✗ **Border-width större än 1.5px** — selected-tile är max. Aldrig 2-3px borders.
✗ **Page-titlar inuti kort** — sätt rubriken ovanför kortet, inte inuti det.

---

## 6. Tone of Voice — UI-text

### Principer
- **Svensk text alltid.** Aldrig engelska termer i UI.
- **Aktiva verb** på CTAs: "Skapa offert", "Skicka påminnelse" — inte "OK", "Submit", "Bekräfta".
- **Du-form**, vänligt men professionellt: "Vi hör av oss inom kort", inte "Ni kommer att kontaktas".
- **Inga tekniska termer** läcker till slutanvändaren: "agent run", "webhook", "token", "payload" → fanns inte. Säg "automatisering körd", "länk", "uppgifter".

### Exempel

| Plats | Bra | Dåligt |
|---|---|---|
| Knapp | "Skicka offert" | "OK" / "Submit" |
| Tom-state | "Inga händelser än — kommer in när jobbet startar." | "Tomt." / "No data." |
| Felmeddelande | "Kunde inte spara: organisationsnumret saknar bindestreck. Prova XXXXXX-XXXX." | "Error 500" / "Något gick fel" |
| Hjälptext | "Lisa berättar för kunder var du jobbar" | "Service area for AI agent context" |
| Tooltip | "Hover för fler detaljer" — nej, skippa tooltips på obvious things. Använd bara där icke-uppenbara förkortningar/symboler finns. |

### Tomma states ska sälja nästa steg
- "Inga kanaler ännu. Lägg till snabbt:" + chip-knappar.
- "Inga offerter just nu. När du skickar en offert hamnar den här."

### Knapp-ord
- **Skapa**, **Skicka**, **Spara**, **Lägg till**, **Ta bort** (inte "Radera" — för dramatiskt), **Avbryt** (inte "Stäng" på modal-actions), **Fortsätt**, **Tillbaka**, **Godkänn**, **Avvisa**.

---

## 7. Layout-principer

- **Vita ytor som default.** Sidor börjar med `--bg` (#F8FAFC), inte färg.
- **Innehåll fokuserat, inte spritt.** En vy = ett huvudsyfte; sidopaneler för sekundär kontext.
- **Hierarki via storlek + spacing**, inte färg. En 26px-rubrik räcker — den behöver inte vara teal.
- **Mobile-first där användning är mobil.** Hantverkare på bygget = mobil. Onboarding och portal är 460px max-width default. Dashboard får använda mer plats men ska vara användbar på 360px.
- **Sticky-headers** (`bp-header`) med `backdrop-filter: blur(12px)` när scrollbart innehåll lever under.
- **Bottom-nav på mobil** för portal — sidebar för dashboard.

---

## 8. Konsekvensregler — innan du bygger något nytt

1. **Använd CSS-variabler från designtokens** — aldrig hårdkodat hex för primärfärger eller spacing-skalan.
2. **Återanvänd befintliga komponentmönster** — om en card-styling finns i `.bp-card` eller `.ob-card`, använd den. Skapa inte parallella implementationer.
3. **Inga nya färger utan diskussion** — palette är låst. Om en känsla saknas, prata först.
4. **Följ spacing-systemet exakt** — 4px-multiplar, ingen `padding: 5px 13px`.
5. **Testa mobile-vyn** — alla nya vyer ska kunna användas på 360px utan horisontell scroll.
6. **Använd `lucide-react` för ikoner** — aldrig emojis i navigation/CTAs (emojis OK i body-text och labels: "💡 Snart kommer", "🎉 Affär vunnen!").
7. **Texten är på svenska** — alla användarvända strängar.

---

## 9. Referensfiler

Mest representativa filerna att kopiera mönster från:

| Mönster | Fil |
|---|---|
| Färgpalett + tokens (CSS-variabler) | [app/onboarding/onboarding.css](../app/onboarding/onboarding.css) + [app/portal/[token]/portal.css](../app/portal/[token]/portal.css) |
| Cards + tappable | [app/portal/[token]/components/PortalHome.tsx](../app/portal/[token]/components/PortalHome.tsx) |
| Highlighted card med strip | [PortalHome.tsx:117](../app/portal/[token]/components/PortalHome.tsx#L117) (aktivt projekt) |
| Inputs + labels + ikon-prefix | [app/onboarding/components/Step2Business.tsx](../app/onboarding/components/Step2Business.tsx) |
| Tiles (selectable grid) | [Step2Business.tsx:241](../app/onboarding/components/Step2Business.tsx#L241) (TRADES-grid) |
| Chips + chip-grid | [onboarding.css:295](../app/onboarding/onboarding.css#L295) `.ob-chip*` |
| Toggle / switch | [onboarding.css:324](../app/onboarding/onboarding.css#L324) `.ob-toggle` + `.ob-switch` |
| Bottom-sheet modal | [app/portal/[token]/components/PortalQuoteSigningModal.tsx](../app/portal/[token]/components/PortalQuoteSigningModal.tsx) |
| Badges (status pills) | [portal.css:206](../app/portal/[token]/portal.css#L206) `.bp-badge*` + [PortalQuotesList.tsx](../app/portal/[token]/components/PortalQuotesList.tsx) |
| Listor (compact rader) | [components/pipeline/unified/FlowPipeline.tsx](../components/pipeline/unified/FlowPipeline.tsx) (`projectRow`) |
| Listor (comfortable kort-i-stack) | [PortalQuotesList.tsx:55](../app/portal/[token]/components/PortalQuotesList.tsx#L55) |
| Empty state | [PortalQuotesList.tsx:50](../app/portal/[token]/components/PortalQuotesList.tsx#L50) (FileText + text) |
| Progress (linear + animated) | [PortalHome.tsx:160](../app/portal/[token]/components/PortalHome.tsx#L160) |
| CTA + ghost button | [onboarding.css:183](../app/onboarding/onboarding.css#L183) `.ob-cta` |
| Document/PDF-typografi (Space Grotesk + DM Sans) | [lib/quote-templates/modern.ts](../lib/quote-templates/modern.ts) |
| Sticky header med blur | [portal.css:91](../app/portal/[token]/portal.css#L91) `.bp-header` |
| Bottom-nav (mobil) | [portal.css:144](../app/portal/[token]/portal.css#L144) `.bp-tabs` + [PortalBottomNav.tsx](../app/portal/[token]/components/PortalBottomNav.tsx) |

---

## 10. Behöver redesign — prioriteringsordning

Filer/vyer som avviker från designsystemet idag. Listan är sorterad efter störst pilotkund-impact först.

### P0 — visuella felkonstruktioner som syns dagligen

1. **[app/dashboard/page.tsx](../app/dashboard/page.tsx)** (1227 rader)
   Huvuddashboarden. Blandar Tailwind-klasser med inline-styles, har egen färglogik per widget istället för design-tokens, och flera widgets använder gradient-fyllningar som inte kommunicerar status. Ska splittas i komponenter och justeras mot `.bp-card` / `.ob-card`.

2. **[app/dashboard/customers/page.tsx](../app/dashboard/customers/page.tsx)** (1331 rader)
   Använder `bg-purple-100 text-purple-700` ([rad 1206](../app/dashboard/customers/page.tsx#L1206)) som "match_type"-indikator — färgen finns inte i paletten. Ska bytas mot blue/gray. Filen är dessutom så stor att den behöver splittas.

3. **[app/dashboard/time/page.tsx](../app/dashboard/time/page.tsx)** (1042 rader)
   Tidregistreringen är central för pilotkunderna. Listraderna är tighta, knappar har inkonsekvent padding, och attest-färgkodningen mappar inte mot semantisk palett. [TimeEntryModal.tsx](../components/time/TimeEntryModal.tsx) är OK efter senaste fixet men huvudvyn behöver redesign mot `.bp-card`-mönstren.

4. **[app/dashboard/projects/page.tsx](../app/dashboard/projects/page.tsx)** + **[projects/[id]/page.tsx](../app/dashboard/projects/[id]/page.tsx)**
   Projektsidan har lila/pink-färger (`from-purple`, `to-pink`) i hero-cards. Workflow-stage-baren är inkonsekvent med [FlowPipeline.tsx](../components/pipeline/unified/FlowPipeline.tsx) som är den nya referensen. Ska samordnas.

### P1 — funktionellt OK men visuellt avvikande

5. **[app/dashboard/quotes/[id]/page.tsx](../app/dashboard/quotes/[id]/page.tsx)** — preview-vyn för en offert i admin har egen styling istället för att rendera samma `lib/quote-templates/modern.ts`-mall som kunden ser.

6. **[app/dashboard/approvals/page.tsx](../app/dashboard/approvals/page.tsx)** — godkännande-listan har inkonsekventa badge-färger (purple för vissa typer) och saknar empty state per filter.

7. **[app/dashboard/analytics/page.tsx](../app/dashboard/analytics/page.tsx)** — KPI-kort använder gradient-fill för "kul" snarare än för status.

8. **[app/dashboard/settings/page.tsx](../app/dashboard/settings/page.tsx)** — settings-rotsidan är en lång scroll med 40+ fält i samma kort. Ska delas i sub-routes med `.ob-card`-stil.

9. **[app/dashboard/agent/page.tsx](../app/dashboard/agent/page.tsx)** + **[automations/page.tsx](../app/dashboard/automations/page.tsx)** — agent-vyerna har egen visuell logik som inte matchar portalen där agentaktivitet exponeras.

### P2 — perifera vyer

10. **[app/dashboard/email/page.tsx](../app/dashboard/email/page.tsx)** + **[communication/page.tsx](../app/dashboard/communication/page.tsx)** — kommunikationscentret. Liten användning idag men avviker.

11. **[app/dashboard/help/page.tsx](../app/dashboard/help/page.tsx)** — har lila accents, byts vid nästa pass.

12. **[app/dashboard/settings/products/page.tsx](../app/dashboard/settings/products/page.tsx)** + **[phone/page.tsx](../app/dashboard/settings/phone/page.tsx)** + **[email-templates/page.tsx](../app/dashboard/settings/email-templates/page.tsx)** — sub-settings-vyer med inkonsekvent layout.

13. **[app/dashboard/time/allowances/page.tsx](../app/dashboard/time/allowances/page.tsx)** + **[subcontractors/page.tsx](../app/dashboard/subcontractors/page.tsx)** + **[website/page.tsx](../app/dashboard/website/page.tsx)** + **[warranties/page.tsx](../app/dashboard/warranties/page.tsx)** — låg-trafiksidor med visuell drift.

### Inte i listan

- [components/pipeline/unified/FlowPipeline.tsx](../components/pipeline/unified/FlowPipeline.tsx) + flow.module.css — redan i designsystemet.
- [app/onboarding/](../app/onboarding/) — referensimplementation.
- [app/portal/[token]/](../app/portal/[token]/) — referensimplementation.
- [lib/quote-templates/modern.ts](../lib/quote-templates/modern.ts) + [lib/invoice-templates/modern.ts](../lib/invoice-templates/modern.ts) — referensimplementation för kund-vänd PDF/HTML.

---

*Sist uppdaterad: 2026-04-27*
*Inga ändringar i designsystemet utan att ARCHITECTURE.md uppdateras parallellt.*
