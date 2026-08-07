/**
 * Materialiserar skyldigheter ur företagsprofilen (2026-08-07).
 *
 * ═══ VAD FUNKTIONEN LOVAR ═══
 *
 * `materializeObligations(profil, från, till)` ger de datum företaget
 * faktiskt har att hålla i fönstret — inga andra. Tre regler den aldrig
 * bryter:
 *
 * 1. **Ingen skyldighet utan `why`.** Kan Karin inte säga varför datumet är
 *    som det är, får hon inte påstå det. Facit vaktar invarianten.
 * 2. **Ingen gissning ur tomhet.** Saknas momsperioden i profilen skapas
 *    ingen momsdeklaration — inte en med lägre säkerhet. Att visa ett datum
 *    vi inte kan räkna fram är att be någon lita på ingenting.
 * 3. **Varje datum är en vardag.** Skatteverkets förskjutningsregel är
 *    tillämpad, alltid framåt.
 *
 * Rena funktioner — tests/karin-obligations.spec.ts.
 */

import {
  dateStr,
  ymd,
  lastDayOfMonth,
  nextBusinessDay,
} from '@/lib/karin/business-days'
import {
  OBLIGATION_RULES,
  ruleApplies,
  type CompanyProfile,
  type Confidence,
  type ObligationCategory,
} from '@/lib/karin/obligation-rules'

export interface Obligation {
  rule_code: string
  title: string
  authority: string
  category: ObligationCategory
  /** YYYY-MM-DD, alltid en vardag. */
  due_date: string
  /** Från när det är rimligt att börja förbereda. */
  prepare_from: string
  /** Vilken period skyldigheten avser: "juli 2026", "kvartal 2 2026". */
  period_label: string
  /** Varför datumet ser ut som det gör, i klartext. Aldrig tomt. */
  why: string
  legal_basis: string
  source_url: string
  rule_version: number
  confidence: Confidence
}

const MANADER = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
]

/** Skattekontots betaldag för en månad: den 12:e, utom januari och augusti (17:e). */
function taxAccountDay(month: number): number {
  return month === 1 || month === 8 ? 17 : 12
}

function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const total = (year * 12 + (month - 1)) + n
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

interface Draft {
  rule_code: string
  due: Date
  period_label: string
  why: string
  /** Antal dagar före förfall det är rimligt att börja. */
  prepareDays: number
  /** Höjer aldrig regelns säkerhet — bara sänker den. */
  confidenceOverride?: Confidence
}

function build(draft: Draft): Obligation {
  const rule = OBLIGATION_RULES[draft.rule_code]
  const due = nextBusinessDay(draft.due)
  const prepare = new Date(due)
  prepare.setDate(prepare.getDate() - draft.prepareDays)

  return {
    rule_code: rule.rule_code,
    title: rule.title,
    authority: rule.authority,
    category: rule.category,
    due_date: dateStr(due),
    prepare_from: dateStr(prepare),
    period_label: draft.period_label,
    why: draft.why,
    legal_basis: rule.legal_basis,
    source_url: rule.source_url,
    rule_version: rule.version,
    confidence: draft.confidenceOverride ?? rule.confidence,
  }
}

/**
 * Alla skyldigheter med förfallodatum i [from, to].
 *
 * Fönstret filtreras på det FÖRSKJUTNA datumet, inte på det nominella — en
 * deadline som flyttats från 12 september (lördag) till 14 september ska
 * dyka upp när man tittar på den 14:e.
 */
export function materializeObligations(
  profile: CompanyProfile,
  from: Date,
  to: Date,
): Obligation[] {
  const drafts: Draft[] = []

  // Räkna generöst utanför fönstret och filtrera sedan — en skyldighet vars
  // period ligger före fönstret kan mycket väl förfalla inuti det.
  const start = addMonths(from.getFullYear(), from.getMonth() + 1, -3)
  const slut = addMonths(to.getFullYear(), to.getMonth() + 1, 3)
  const antalManader = (slut.year * 12 + slut.month) - (start.year * 12 + start.month)

  for (let i = 0; i <= antalManader; i++) {
    const { year, month } = addMonths(start.year, start.month, i)

    // ── Arbetsgivardeklaration + avgifter ────────────────────────────────
    // Avser FÖREGÅENDE månads löner, betalas den här månaden.
    if (ruleApplies('agi', profile)) {
      const period = addMonths(year, month, -1)
      const dag = taxAccountDay(month)
      const varfor = dag === 17
        ? `Lönerna för ${MANADER[period.month - 1]} redovisas den 17:e — januari och augusti har senare datum än övriga månader.`
        : `Lönerna för ${MANADER[period.month - 1]} redovisas den 12:e månaden efter.`

      for (const kod of ['agi', 'arbetsgivaravgifter']) {
        drafts.push({
          rule_code: kod,
          due: ymd(year, month, dag),
          period_label: `${MANADER[period.month - 1]} ${period.year}`,
          why: kod === 'agi'
            ? varfor
            : `${varfor} Pengarna ska finnas på skattekontot samma dag.`,
          prepareDays: 7,
        })
      }
    }

    // ── Preliminärskatt ──────────────────────────────────────────────────
    if (ruleApplies('preliminarskatt', profile)) {
      const dag = taxAccountDay(month)
      drafts.push({
        rule_code: 'preliminarskatt',
        due: ymd(year, month, dag),
        period_label: `${MANADER[month - 1]} ${year}`,
        why: `Debiterad preliminärskatt betalas varje månad, den ${dag}:e. Beloppet står i ditt besked från Skatteverket — Karin känner inte till det.`,
        prepareDays: 5,
      })
    }

    // ── Moms ─────────────────────────────────────────────────────────────
    if (ruleApplies('moms', profile)) {
      if (profile.vat_period === 'month') {
        // Perioden är månaden två månader tidigare.
        const period = addMonths(year, month, -2)
        drafts.push({
          rule_code: 'moms',
          due: ymd(year, month, 12),
          period_label: `${MANADER[period.month - 1]} ${period.year}`,
          why: `Du redovisar moms varje månad. Momsen för ${MANADER[period.month - 1]} ska in senast den 12:e i andra månaden efter perioden.`,
          prepareDays: 10,
        })
      } else if (profile.vat_period === 'quarter') {
        // Kvartalsmoms förfaller den 12:e i andra månaden efter kvartalet:
        // Q1 → 12 maj, Q2 → 12 augusti, Q3 → 12 november, Q4 → 12 februari.
        if (month === 5 || month === 8 || month === 11 || month === 2) {
          const kvartalSlut = addMonths(year, month, -2)
          const kvartal = Math.ceil(kvartalSlut.month / 3)
          drafts.push({
            rule_code: 'moms',
            due: ymd(year, month, 12),
            period_label: `kvartal ${kvartal} ${kvartalSlut.year}`,
            why: `Du redovisar moms per kvartal. Kvartal ${kvartal} slutade i ${MANADER[kvartalSlut.month - 1]}, och momsen ska in senast den 12:e i andra månaden efter.`,
            prepareDays: 14,
          })
        }
      }
    }
  }

  // ── Helårsmoms, deklaration, årsredovisning och stämma ─────────────────
  // Årsbundna skyldigheter hänger på räkenskapsåret, inte på kalendermånaden.
  const bokslutManad = profile.fiscal_year_end_month
  if (bokslutManad) {
    // Täck in räkenskapsår vars skyldigheter kan hamna i fönstret.
    for (let ar = from.getFullYear() - 2; ar <= to.getFullYear() + 1; ar++) {
      const bokslut = lastDayOfMonth(ar, bokslutManad)
      const kalenderar = bokslutManad === 12

      // Helårsmoms: den 26:e i andra månaden efter beskattningsårets utgång.
      if (ruleApplies('moms', profile) && profile.vat_period === 'year') {
        const f = addMonths(ar, bokslutManad, 2)
        drafts.push({
          rule_code: 'moms',
          due: ymd(f.year, f.month, 26),
          period_label: `räkenskapsåret ${ar}`,
          why: `Du redovisar moms en gång om året. Momsen för räkenskapsåret som slutade ${bokslut.getDate()} ${MANADER[bokslutManad - 1]} ska in senast den 26:e i andra månaden efter.`,
          prepareDays: 30,
          // Handel inom EU flyttar datumet, och det vet vi inte om.
          confidenceOverride: 'medel',
        })
      }

      // Inkomstdeklaration.
      if (ruleApplies('inkomstdeklaration', profile)) {
        if (profile.company_form === 'ab') {
          // Datumet styrs av räkenskapsårets slutmånad. Datumen nedan är de
          // som gäller vid DIGITAL inlämning, vilket är vad alla använder —
          // pappersdeklaration har en månad tidigare.
          const tabell: Record<number, { manad: number; dag: number; ar: number }> = {
            1: { manad: 12, dag: 1, ar: 0 }, 2: { manad: 12, dag: 1, ar: 0 },
            3: { manad: 12, dag: 1, ar: 0 }, 4: { manad: 12, dag: 1, ar: 0 },
            5: { manad: 1, dag: 15, ar: 1 }, 6: { manad: 1, dag: 15, ar: 1 },
            7: { manad: 4, dag: 1, ar: 1 },  8: { manad: 4, dag: 1, ar: 1 },
            9: { manad: 8, dag: 1, ar: 1 }, 10: { manad: 8, dag: 1, ar: 1 },
            11: { manad: 8, dag: 1, ar: 1 }, 12: { manad: 8, dag: 1, ar: 1 },
          }
          const t = tabell[bokslutManad]
          drafts.push({
            rule_code: 'inkomstdeklaration',
            due: ymd(ar + t.ar, t.manad, t.dag),
            period_label: `räkenskapsåret ${ar}`,
            why: `Aktiebolagets deklarationsdatum styrs av räkenskapsårets slutmånad (${MANADER[bokslutManad - 1]}). Datumet gäller digital inlämning — på papper är det en månad tidigare.`,
            prepareDays: 30,
          })
        } else {
          // Enskild firma och handelsbolag redovisas i ägarens deklaration.
          drafts.push({
            rule_code: 'inkomstdeklaration',
            due: ymd(ar + 1, 5, 2),
            period_label: `inkomståret ${ar}`,
            why: 'Verksamheten redovisas i din egen inkomstdeklaration, som lämnas i början av maj.',
            prepareDays: 30,
            confidenceOverride: kalenderar ? undefined : 'lag',
          })
        }
      }

      // Årsredovisning: sju månader efter räkenskapsårets slut.
      if (ruleApplies('arsredovisning', profile)) {
        const f = addMonths(ar, bokslutManad, 7)
        drafts.push({
          rule_code: 'arsredovisning',
          due: lastDayOfMonth(f.year, f.month),
          period_label: `räkenskapsåret ${ar}`,
          why: `Årsredovisningen ska ha kommit in till Bolagsverket senast sju månader efter räkenskapsårets slut (${bokslut.getDate()} ${MANADER[bokslutManad - 1]} ${ar}).`,
          prepareDays: 60,
        })
      }

      // Årsstämma: inom sex månader.
      if (ruleApplies('bolagsstamma', profile)) {
        const f = addMonths(ar, bokslutManad, 6)
        drafts.push({
          rule_code: 'bolagsstamma',
          due: lastDayOfMonth(f.year, f.month),
          period_label: `räkenskapsåret ${ar}`,
          why: `Årsstämma ska hållas inom sex månader från räkenskapsårets utgång. Datumet är den yttersta gränsen — de flesta håller stämman tidigare.`,
          prepareDays: 30,
        })
      }
    }
  }

  const franStr = dateStr(from)
  const tillStr = dateStr(to)

  return drafts
    .map(build)
    .filter(o => o.due_date >= franStr && o.due_date <= tillStr)
    .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.rule_code.localeCompare(b.rule_code)))
}

/**
 * Är profilen komplett nog för att kalendern ska säga något vettigt?
 *
 * Returnerar de fält som saknas. Gränssnittet ska då be om dem i stället för
 * att visa en tom kalender som ser ut som att inget behöver göras — tystnad
 * som betyder "vi vet inte" får aldrig se ut som tystnad som betyder "allt
 * är lugnt".
 */
export function missingProfileFields(profile: CompanyProfile): string[] {
  const saknas: string[] = []
  if (!profile.company_form) saknas.push('bolagsform')
  if (!profile.fiscal_year_end_month) saknas.push('räkenskapsår')
  if (!profile.vat_period) saknas.push('momsperiod')
  if (profile.is_employer === null || profile.is_employer === undefined) saknas.push('om du betalar ut lön')
  return saknas
}
