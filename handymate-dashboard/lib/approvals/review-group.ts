/** A cancelled or unsuccessful review ends the group; remaining items stay pending. */
export async function reviewGroup<T>(items: readonly T[], review: (item: T) => Promise<boolean | void>) {
  for (const item of items) {
    if (await review(item) !== true) return
  }
}
