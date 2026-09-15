import React from 'react'

/**
 * Minimal körtid för en Design Component som körts genom
 * scripts/dc_till_react.py.
 *
 * Kanvasens egen runtime renderar mallen ur `renderVals()`. Här gör den
 * genererade komponentens `render()` samma sak med JSX, så logikklassen
 * kan följa med ORÖRD från designkällan. Det är hela poängen: ändrar
 * Andreas i kanvasen körs skriptet om, och ingen har handredigerat
 * logiken emellan.
 *
 * Basklassen finns bara för att ge klassen ett `this.state`,
 * `this.setState` och React-livscykeln. Den lägger inte till något
 * beteende — en basklass som tolkar props eller state hade blivit en
 * andra sanning om hur designen fungerar.
 */
export class DCLogic<P = Record<string, unknown>, S = Record<string, unknown>>
  extends React.Component<P, S> {}
