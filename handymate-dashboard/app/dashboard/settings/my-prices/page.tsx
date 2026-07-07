import { redirect } from 'next/navigation'

/**
 * "Mina priser" är ersatt av produktbanken (tasks/produktbank-spec.md
 * §Konsolidering) — en produktbank, en sanning.
 */
export default function Page() {
  redirect('/dashboard/settings/products')
}
