/** Interim legacy <= 1 kr policy. C1b replaces this after accountant approval; no account selected. */
export const INTERIM_SE_ROUNDING_MAX_MINOR = BigInt(100)
export function seRoundingMaxMinor(): string { return INTERIM_SE_ROUNDING_MAX_MINOR.toString() }
