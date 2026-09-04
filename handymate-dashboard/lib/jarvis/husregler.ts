/**
 * Husregler — standardprinciper för Next Best Action (2026-09-04).
 *
 * Inget betalande konto har någonsin skrivit en egen `priority_rule` i
 * `business_knowledge`, vilket gjorde att MIN_PRINCIPLES-spärren i
 * next-best-action.ts alltid slog till och `next_best_action` fick noll
 * rader. Dessa tre principer är konstanter i kod — INTE data i
 * business_knowledge — och används bara när kontot saknar egna.
 *
 * Se tasks/plan-autopilot-D-nba.md, Del 1.
 */
export const HUSREGLER: string[] = [
  'Pengar som redan är intjänade går före nya affärer — fakturera och påminn innan du offererar.',
  'Det som förfallit går före det som kommer.',
  'En kund som väntar på svar går före internt arbete.',
]
