// Publik bas-URL för hela appen (mikrosajter, sitemap, robots.txt).
// Faller tillbaka till produktionsdomänen om env-variabeln saknas
// (t.ex. i lokala/preview-miljöer utan NEXT_PUBLIC_APP_URL satt).
export function getAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se').replace(/\/+$/, '')
}
