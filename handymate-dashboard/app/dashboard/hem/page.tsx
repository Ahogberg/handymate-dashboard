import { redirect } from 'next/navigation'

/**
 * /dashboard/hem — alias till /dashboard (Matte Command Center, 2026-08-12).
 *
 * JarvisHome flyttade till startsidan (app/dashboard/page.tsx). Gamla
 * bokmärken till /dashboard/hem — och lib/moments/derive.ts, som fortfarande
 * länkar hit — ska fortsätta fungera utan ändring.
 */
export default function JarvisHemAliasPage() {
  redirect('/dashboard')
}
