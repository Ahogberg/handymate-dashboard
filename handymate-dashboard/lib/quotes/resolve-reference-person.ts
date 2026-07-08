/**
 * "Vår referens" — auto men redigerbar (offert-identitet-spec.md, designbeslut 2).
 *
 * Vid skapande av en offert förifylls det befintliga reference_person-fritextfältet
 * med skaparens namn OM det är tomt. Hantverkarens egen ifyllnad vinner alltid.
 *
 * Regel:
 *   - payloadRef med innehåll (efter trim) → behåll den (hantverkarens override)
 *   - tom/whitespace/null/undefined payloadRef → fall tillbaka på skaparens namn
 *   - saknas båda → null (exakt som förr — inget renderas)
 *
 * OBS: empty string MÅSTE falla igenom till creatorName, därför trim + `!== ''`
 * i stället för `??` (som bara fångar null/undefined, inte tom sträng).
 */
export function resolveReferencePerson(
  payloadRef: string | null | undefined,
  creatorName: string | null | undefined,
): string | null {
  const trimmed = (payloadRef ?? '').trim()
  return trimmed !== '' ? trimmed : (creatorName ?? null)
}
