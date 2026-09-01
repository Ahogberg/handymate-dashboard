// @types/react-dom 18.2.18 saknar deklaration för underingången
// 'react-dom/server.browser' (den finns i paketet, bara inte i typerna).
// Fyra offertdokument-facit importerar den för renderToStaticMarkup i
// Playwright-processen; utan den här filen ger `npx tsc --noEmit` TS7016
// på en färsk checkout (hittat när kontraktsgrinden sattes upp 2026-09-01).
// Ytan är identisk med 'react-dom/server' för det som används.
declare module 'react-dom/server.browser' {
  export * from 'react-dom/server'
}
