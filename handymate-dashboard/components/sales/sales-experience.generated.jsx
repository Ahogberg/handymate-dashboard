/* GENERERAD FIL — ändra inte här.
 *
 * Källa:  design-sales-experience/SalesExperience.dc.html
 * Kör om: python3 scripts/dc_till_react.py design-sales-experience/SalesExperience.dc.html components/sales/sales-experience.generated.jsx SalesExperience
 *
 * Designen ägs av .dc.html-filen. Ändrar Andreas i kanvasen byts källan
 * och skriptet körs om — den här filen är utdata, inte en kopia att
 * redigera. Logikklassen nedan är källans egen, orörd.
 */
'use client'
/* eslint-disable */
import React from 'react'
import { DCLogic } from '@/lib/dc/runtime'
import './sales-tokens.css'

const CSS = ".hm-sx *{box-sizing:border-box}\n.hm-sx{margin:0;padding:0}\n.hm-sx{background:var(--bg-page);color:var(--fg-strong)}\n.hm-sx a{color:var(--brand);text-decoration:none}\n.hm-sx a:hover{color:var(--teal-600)}\n.hm-sx input, .hm-sx button{font-family:inherit}\n.hm-sx input[type=range]{-webkit-appearance:none;appearance:none;height:10px;border-radius:999px;outline:none;cursor:pointer;border:none}\n.hm-sx input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;border-radius:50%;background:#fff;border:3.5px solid var(--teal-700);box-shadow:0 3px 10px rgba(15,23,42,.2);cursor:grab;transition:transform 140ms cubic-bezier(.2,.8,.2,1)}\n.hm-sx input[type=range]:hover::-webkit-slider-thumb{transform:scale(1.1)}\n.hm-sx input[type=range]:active::-webkit-slider-thumb{transform:scale(.96);cursor:grabbing}\n.hm-sx input[type=range]::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:#fff;border:3.5px solid var(--teal-700);box-shadow:0 3px 10px rgba(15,23,42,.2)}\n.hm-sx button{cursor:pointer;border:none;background:none}\n.hm-sx p{text-wrap:pretty}\n.hm-sx h1, .hm-sx h2, .hm-sx h3{text-wrap:balance;margin:0}\n@keyframes hmFade{from{opacity:0}}\n@keyframes hmRise{from{opacity:0;transform:translateY(16px)}}\n@keyframes hmLeft{from{opacity:0;transform:translateX(-56px)}}\n@keyframes hmRight{from{opacity:0;transform:translateX(56px)}}\n@keyframes hmLine{from{transform:scaleX(0);opacity:0}}\n@keyframes hmNode{from{opacity:0;transform:scale(.2)}}\n@keyframes hmHalo{0%{transform:scale(.9);opacity:.45}100%{transform:scale(2.6);opacity:0}}\n@keyframes hmSpin{to{transform:rotate(360deg)}}\n@keyframes hmBar{from{transform:scaleX(0)}}\n@keyframes hmDraw{from{stroke-dashoffset:1}}\n@keyframes hmPop{from{opacity:0;transform:scale(.4)}}\n@keyframes hmGrow{from{transform:scaleY(0)}}\n@keyframes hmSettleA{from{opacity:0;transform:rotate(-5deg) translate(-14px,26px)}}\n@keyframes hmSettleB{from{opacity:0;transform:rotate(4deg) translate(10px,30px)}}\n@keyframes hmSettleC{from{opacity:0;transform:rotate(-3deg) translate(6px,22px)}}\n@keyframes hmWipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}\n@keyframes hmSlideUp{from{opacity:0;transform:translateY(24px) scale(.96)}}\n@media (prefers-reduced-motion:reduce){.hm-sx *{animation-duration:1ms!important;animation-iteration-count:1!important}}\n.hm-sx .hx0:hover{color:{{ chromeFg }}}\n.hm-sx .hx1:hover{color:{{ chromeFg }}}\n.hm-sx .hx2:hover{background:var(--slate-100);color:var(--slate-900)}\n.hm-sx .hx3:focus{border-color:var(--teal-700);box-shadow:0 0 0 4px rgba(13,148,136,.12)}\n.hm-sx .hx4:hover{background:var(--teal-600);transform:translateY(-1px)}\n.hm-sx .hx5:hover{border-color:var(--teal-700)}\n.hm-sx .hx6:hover{background:var(--teal-600);transform:translateY(-1px)}\n.hm-sx .hx7:hover{border-color:var(--teal-700)}\n.hm-sx .hx8:hover{border-color:var(--teal-700);transform:translateY(-2px)}\n.hm-sx .hx9:hover{border-color:var(--teal-700);transform:translateY(-2px)}\n.hm-sx .hx10:hover{border-color:var(--teal-700);transform:translateY(-2px)}\n.hm-sx .hx11:hover{border-color:var(--teal-700);transform:translateY(-2px)}\n.hm-sx .hx12:hover{border-color:var(--teal-700);transform:translateY(-2px)}\n.hm-sx .hx13:hover{transform:translateY(-1px)}\n.hm-sx .hx14:hover{border-color:var(--teal-700)}\n.hm-sx .hx15:hover{border-color:var(--teal-700)}\n.hm-sx .hx16:hover{transform:translateY(-1px)}\n.hm-sx .hx17:hover{transform:translateY(-1px)}\n.hm-sx .hx18:hover{background:var(--teal-600);transform:translateY(-1px)}\n.hm-sx .hx19:hover{background:var(--teal-600);transform:translateY(-1px)}\n.hm-sx .hx20:hover{background:var(--teal-600);transform:translateY(-1px)}\n.hm-sx .hx21:hover{background:var(--teal-600);transform:translateY(-1px)}\n.hm-sx .hx22:hover{background:var(--teal-600);transform:translateY(-1px)}\n.hm-sx .hx23:hover{background:var(--teal-600);transform:translateY(-1px)}\n.hm-sx .hx24:hover{background:var(--teal-600);transform:translateY(-1px)}\n.hm-sx .hx25:hover{transform:translateY(-2px)}\n.hm-sx .hx26:hover{border-color:var(--teal-700);color:var(--teal-700)}\n.hm-sx .hx27:hover{color:var(--slate-900)}\n.hm-sx .hx28:hover{background:var(--teal-600);transform:translateY(-1px)}\n.hm-sx .hx29:hover{background:var(--teal-600);transform:translateY(-1px)}\n.hm-sx .hx30:focus{border-color:var(--teal-700);box-shadow:0 0 0 4px rgba(13,148,136,.12)}\n.hm-sx .hx31:focus{border-color:var(--teal-700);box-shadow:0 0 0 4px rgba(13,148,136,.12)}\n.hm-sx .hx32:hover{background:var(--slate-100);color:var(--slate-900)}\n.hm-sx .hx33:hover{background:var(--teal-600)}\n.hm-sx .hx34:hover{border-color:var(--teal-700);color:var(--teal-700)}"

const DEFAULTS = {"showAgentPortraits": true, "foundersAvailable": true, "showSalesSession": false}

const AGENTS = {
  matte:  { name:'Matte',  role:'Chefsagent',    dot:'var(--teal-700)', avatar:'https://pktaqedooyzgvzwipslu.supabase.co/storage/v1/object/sign/team-avatars/Matte.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvTWF0dGUucG5nIiwiaWF0IjoxNzczODU1NTkyLCJleHAiOjI2Mzc4NTU1OTJ9.jNhKpwuz1VvDTszvZ7fbczsopGCNM5c0eQHR5qq-0Ak' },
  karin:  { name:'Karin',  role:'Ekonom',        dot:'#2563eb', avatar:'https://pktaqedooyzgvzwipslu.supabase.co/storage/v1/object/sign/team-avatars/Karin.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvS2FyaW4ucG5nIiwiaWF0IjoxNzczODU1NjE4LCJleHAiOjI2Mzc4NTU2MTh9.bmvCwfi8Rry-5dGsJ1Zyyco--CYT6ZG3gXBPqHRiVdA' },
  hanna:  { name:'Hanna',  role:'Marknadschef',  dot:'#9333ea', avatar:'https://pktaqedooyzgvzwipslu.supabase.co/storage/v1/object/public/team-avatars/Hanna.png' },
  daniel: { name:'Daniel', role:'Säljare',       dot:'#d97706', avatar:'https://pktaqedooyzgvzwipslu.supabase.co/storage/v1/object/sign/team-avatars/Daniel.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvRGFuaWVsLnBuZyIsImlhdCI6MTc3Mzg1NTY0MiwiZXhwIjoyNjM3ODU1NjQyfQ.3NE6iIAL4gje-j0warr4k6PUFqRuf7EocaDo86LZNWE' },
  lars:   { name:'Lars',   role:'Projektledare', dot:'#059669', avatar:'https://pktaqedooyzgvzwipslu.supabase.co/storage/v1/object/sign/team-avatars/Lars.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvTGFycy5wbmciLCJpYXQiOjE3NzM4NTU2NTUsImV4cCI6MjYzNzg1NTY1NX0.mICMOQvJxG49RDXZXsc_BfKFM-AnNOscyNTL8IxPdqY' },
  lisa:   { name:'Lisa',   role:'Kundservice',   dot:'#0ea5e9', avatar:'https://pktaqedooyzgvzwipslu.supabase.co/storage/v1/object/sign/team-avatars/Lisa.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvTGlzYS5wbmciLCJpYXQiOjE3NzQyNTk4MTYsImV4cCI6MTA0MTQyNTk4MTZ9.ZQag6FV2my_vy7rq1tFPBYK2MuwlmhFeDtU16SLA3Ak' },
};

const PAINS = {
  tid: {
    label: 'Ge mig tillbaka min tid',
    tag: 'Administrationen',
    goal: 'Få tillbaka tid',
    quote: (s) => 'Ungefär ' + s.q1 + ' timmar i veckan går till administration.',
    onb: { line: 'Ni berättade att administrationen tar ungefär {H} timmar i veckan.',
           sub: 'Därför börjar vi med arbetsflödet som ska minska efterarbetet.',
           cta: 'Sätt upp ert första jobbflöde',
           steps: ['Företaget','Jobbflöde','Team','Första jobbet','Bjud in personalen'] },
    ack: 'Bra. Då tittar vi på vad administrationen faktiskt kostar er idag.',
    q1: { title: 'Hur många timmar i veckan går till administration — i hela firman?',
          options: [['Under 5 h',4],['5–10 h',8],['10–20 h',15],['Över 20 h',26]] },
    q2: { title: 'Vem gör den administrationen idag?',
          options: [['Jag själv, oftast på kvällen',1],['Jag och en till',2],['En person på kontoret',3],['Vi delar på det i teamet',4]] },
    hoursLabel: 'timmar administration i veckan',
    summaryLabel: 'Administration är största smärtan',
    solutionTitle: 'Tänk om administrationen gjorde sig själv.',
    steps: [
      ['Jobbet dokumenteras där det händer','Tid, material och bilder registreras i mobilen på plats. Inget efterarbete på kvällen.','lars',false],
      ['Matte samlar ihop informationen','Samtal, bilder, anteckningar och tidrader knyts till rätt jobb automatiskt.','matte',false],
      ['Arbetsrapporten skrivs åt er','Handymate sammanställer vad som gjorts, av vem och med vilket material.','matte',false],
      ['Din dag visar bara det som kräver er','På morgonen ligger underlaget klart. Ni godkänner — resten har teamet redan tagit.','matte',false],
    ],
    agents: [
      ['matte','Går igenom firman varje morgon och lägger fram det som faktiskt behöver dig. Resten har han redan hanterat.'],
      ['lars','Håller ihop projekt, tid och byggdagbok utan att någon behöver skriva en rad extra på kvällen.'],
    ],
    rateDefault: 650,
  },
  pengar: {
    label: 'Hjälp mig få betalt snabbare',
    tag: 'Jobb → faktura',
    goal: 'Få betalt snabbare',
    quote: (s) => 'Vägen från färdigt jobb till skickad faktura tar omkring ' + s.q2 + ' dagar.',
    onb: { line: 'Ni berättade att vägen från färdigt jobb till faktura tar för lång tid.',
           sub: 'Därför börjar vi med att sätta upp hur tid, material och fakturaunderlag ska flöda genom Handymate.',
           cta: 'Sätt upp jobb → faktura',
           steps: ['Företaget','Jobb → faktura','Team','Första jobbet','Bjud in personalen'] },
    ack: 'Då räknar vi på vad tiden mellan färdigt jobb och faktura kostar.',
    q1: { title: 'Hur många timmar i veckan går till att jaga underlag och göra fakturaunderlag?',
          options: [['Under 3 h',3],['3–6 h',5],['6–12 h',9],['Över 12 h',16]] },
    q2: { title: 'Hur lång tid tar det från klart jobb till skickad faktura?',
          options: [['Samma vecka',3],['1–2 veckor',10],['2–4 veckor',21],['Längre än så',35]] },
    hoursLabel: 'timmar i veckan på fakturaunderlag',
    summaryLabel: 'Vägen från jobb till faktura är största smärtan',
    solutionTitle: 'Färdigt jobb ska bli faktura. Inte administration.',
    steps: [
      ['Jobbet stängs på plats','Tid, material och ÄTA ligger redan på projektet när hantverkaren lämnar adressen.','lars',false],
      ['Karin kontrollerar underlaget','Timmar mot plan, material mot inköp, ÄTA mot kundens godkännande.','karin',false],
      ['Det som saknas flaggas direkt','Ett saknat kvitto stoppar inte fakturan i tre veckor — det blir en fråga samma dag.','karin',false],
      ['Fakturaunderlaget ligger klart','Ni godkänner och skickar. Pengar-vyn visar vad som väntar på att bli betalt.','karin',false],
    ],
    agents: [
      ['karin','Fakturor, marginal och moms. Bevakar utestående betalningar dag 5, dag 12 — tills pengarna är på kontot.'],
      ['lars','Ser till att tid, material och ÄTA hamnar på rätt projekt direkt, så att underlaget aldrig behöver rekonstrueras.'],
    ],
    secondary: (s) => ({ label: 'dagar från klart jobb till skickad faktura idag', value: s.q2 + ' dagar' }),
    rateDefault: 650,
  },
  affarer: {
    label: 'Hjälp mig vinna mer av affärerna jag redan har',
    tag: 'Uppföljningen',
    goal: 'Vinna fler av affärerna ni redan har',
    quote: (s) => 'Ni skickar omkring ' + s.q2 + ' offerter i månaden utan systematisk uppföljning.',
    onb: { line: 'Ni berättade att offerter blir liggande utan uppföljning.',
           sub: 'Därför börjar vi med er offertmall och hur uppföljningen ska se ut.',
           cta: 'Sätt upp offert och uppföljning',
           steps: ['Företaget','Offert & uppföljning','Team','Första offerten','Bjud in personalen'] },
    ack: 'Då tittar vi på vad de offerter som aldrig följs upp är värda.',
    q1: { title: 'Hur många timmar i veckan går till offerter och uppföljning?',
          options: [['Under 3 h',3],['3–6 h',5],['6–12 h',9],['Över 12 h',15]] },
    q2: { title: 'Hur många offerter skickar ni per månad?',
          options: [['Under 5',4],['5–15',10],['15–30',22],['Över 30',40]] },
    hoursLabel: 'timmar i veckan på offerter och uppföljning',
    summaryLabel: 'Uppföljning av offerter är största smärtan',
    solutionTitle: 'Offerten är skickad. Nu börjar jobbet.',
    steps: [
      ['Offerten skapas på minuter','Jobbtyp, rader, material och ROT/RUT förifylls från er egen mall.','daniel',false],
      ['Daniel bevakar varje offert','Öppnad? Oläst i elva dagar? Han vet vilka som rör sig och vilka som står still.','daniel',false],
      ['Uppföljningen är beständig','Den dör inte för att veckan blev hektisk. Den ligger kvar tills affären är avgjord.','daniel',false],
      ['Hanna väcker gamla kunder','Kunder ni redan gjort jobb åt är den billigaste pipeline ni har.','hanna',false],
    ],
    agents: [
      ['daniel','Följer upp varje offert tills den får ett svar. Inget förslag går till kund utan ert OK.'],
      ['hanna','Håller kontakten med kunder ni gjort jobb åt tidigare och hittar dem som är mogna för nästa jobb.'],
    ],
    secondary: (s) => ({ label: 'offerter per månad som ingen följer upp systematiskt idag', value: String(Math.round(s.q2 * 0.6)) }),
    rateDefault: 650,
  },
  kontroll: {
    label: 'Ge mig kontroll innan projekten går fel',
    tag: 'Projektkontrollen',
    goal: 'Kontroll innan projekten går fel',
    quote: (s) => 'Omkring ' + s.q2 + ' projekt om året spårar ur på tid eller marginal.',
    onb: { line: 'Ni berättade att problem i projekten upptäcks för sent.',
           sub: 'Därför börjar vi med hur tid, material och budget ska följas upp per projekt.',
           cta: 'Sätt upp projektuppföljning',
           steps: ['Företaget','Projektuppföljning','Team','Första projektet','Bjud in personalen'] },
    ack: 'Då räknar vi på vad bristen på överblick kostar er.',
    q1: { title: 'Hur många timmar i veckan går till att hålla koll på projekt och släcka bränder?',
          options: [['Under 5 h',4],['5–10 h',8],['10–20 h',15],['Över 20 h',24]] },
    q2: { title: 'Hur många projekt om året spårar ur på tid eller marginal?',
          options: [['Nästan inga',1],['Något enstaka',3],['Flera per år',8],['Det händer ofta',15]] },
    hoursLabel: 'timmar i veckan på uppföljning och brandkår',
    summaryLabel: 'Kontroll över projekten är största smärtan',
    solutionTitle: 'Du ska se avvikelsen medan den fortfarande går att styra.',
    steps: [
      ['Projektet har en plan','Tid, material och budget ligger på projektet från start — inte i någons huvud.','lars',false],
      ['Verkligheten skrivs in löpande','Tidrader, inköp och byggdagbok kommer in från fältet samma dag som de sker.','lars',false],
      ['Handymate jämför plan mot utfall','18 % över budget syns dag tolv, inte när slutfakturan ska skrivas.','lars',false],
      ['Din dag visar avvikelserna','Bara de projekt som faktiskt behöver dig ligger överst. Resten löper på.','matte',false],
    ],
    agents: [
      ['lars','Koordinerar projekt, tid och byggdagbok och larmar när ett projekt börjar dra iväg från planen.'],
      ['matte','Sorterar dagen åt dig: avvikelser först, sedan det som väntar, sedan det som redan är hanterat.'],
    ],
    secondary: (s) => ({ label: 'projekt per år som spårar ur på tid eller marginal idag', value: String(s.q2) }),
    rateDefault: 650,
  },
  beroende: {
    label: 'Gör företaget mindre beroende av mig',
    tag: 'Beroendet av dig',
    goal: 'Ett företag som klarar sig utan dig',
    quote: (s) => 'Omkring ' + s.q2 + ' beslut i veckan passerar dig personligen.',
    onb: { line: 'Ni berättade att för mycket måste gå genom dig.',
           sub: 'Därför börjar vi med teamet och vem som gör vad. Det är grunden för att kunna delegera när Storfirman-funktionerna är på plats.',
           cta: 'Lägg upp teamet',
           steps: ['Företaget','Teamet','Roller','Första jobbet','Bjud in personalen'] },
    ack: 'Då tittar vi på vad flaskhalsen kostar — och hur den delegeras bort.',
    q1: { title: 'Hur många timmar i veckan lägger du personligen på godkännanden och frågor?',
          options: [['Under 5 h',4],['5–10 h',8],['10–20 h',15],['Över 20 h',24]] },
    q2: { title: 'Hur många beslut eller godkännanden hanterar du ungefär per vecka?',
          options: [['Under 10',8],['10–25',18],['25–50',36],['Över 50',65]] },
    hoursLabel: 'timmar i veckan av din egen tid på beslut',
    summaryLabel: 'Beroendet av ägaren är största smärtan',
    solutionTitle: 'Du ska inte behöva veta allt. Bara det som kräver dig.',
    steps: [
      ['Teamet får egna befogenheter','Arbetsledare beslutar inom tydliga gränser — belopp, team och projekt.','lars',true],
      ['Normala beslut delegeras','Ett inköp under 10 000 kr går till arbetsledaren. Inte till dig.','lars',true],
      ['Handymate bevakar avvikelser','Det som ser normalt ut godkänns i klump. Det som avviker lyfts till dig.','matte',true],
      ['Du ser bara undantagen','Din dag visar det som kräver ägaren. Resten har någon annan redan tagit.','matte',false],
    ],
    agents: [
      ['matte','Skiljer det normala från avvikelsen och lyfter bara det som behöver ett ägarbeslut.'],
      ['lars','Bär arbetsledarnas vardag: vem gör vad, inom vilka ramar och vad som hänt i varje projekt.'],
    ],
    secondary: (s) => ({ label: 'beslut i veckan som idag passerar dig personligen', value: String(s.q2) }),
    rateDefault: 850,
  },
};

const CASE = {
  tid: {
    title: 'Vad kostar administrationen idag?',
    asm: [
      { key:'rate', label:'Värde per frigjord timme', def:650, opts:[[450,'450 kr'],[650,'650 kr'],[850,'850 kr']] },
    ],
    calc: (s, a) => {
      const h = s.q1 || 0, total = h * a.rate * 52;
      return {
        rows: [[String(h), 'timmar administration i veckan', ''],
               ['× ' + nf(a.rate), 'kr — värdet av en frigjord timme', '(antagande)'],
               ['× 52', 'veckor om året', '']],
        total, totalCaption: 'uppskattad kostnad per år för administrationen',
        note: 'Tid × timvärde. Timvärdet är vad en frigjord timme är värd i firman, inte en lönekostnad.',
      };
    },
  },
  pengar: {
    title: 'Vad ligger och väntar på att bli faktura?',
    asm: [
      { key:'inv',  label:'Snittfaktura per jobb', def:45000, opts:[[25000,'25 000 kr'],[45000,'45 000 kr'],[80000,'80 000 kr']] },
      { key:'rate', label:'Värde per frigjord timme', def:650, opts:[[450,'450 kr'],[650,'650 kr'],[850,'850 kr']] },
    ],
    calc: (s, a) => {
      const jobs = s.jobs || 0, days = s.q2 || 0;
      const perDay = jobs * 12 * a.inv / 365;
      const total = perDay * days;
      const adminN = (s.q1 || 0) * a.rate * 52;
      return {
        rows: [[String(days), 'dagar från klart jobb till skickad faktura', ''],
               ['× ' + nf(perDay), 'kr fakturerad volym per dag', '(' + jobs + ' jobb/mån × ' + nf(a.inv) + ' kr, antagande)']],
        total, totalCaption: 'ligger i snitt ofakturerat i firman',
        aside: { value: nf(adminN) + ' kr / år', label: (s.q1 || 0) + ' h i veckan på att jaga underlag och bygga fakturor, värderat till ' + nf(a.rate) + ' kr/h.' },
        note: 'Två effekter, räknade separat: kapital som ligger bundet i ofakturerat arbete — en engångsfrigörelse — och tiden som går till att bygga underlag, per år. De läggs inte ihop.',
      };
    },
  },
  affarer: {
    title: 'Vad är offerterna värda?',
    asm: [
      { key:'deal', label:'Snittaffär per offert', def:45000, opts:[[25000,'25 000 kr'],[45000,'45 000 kr'],[80000,'80 000 kr']] },
    ],
    calc: (s, a) => {
      const q = s.q2 || 0;
      const total = q * a.deal * 12;
      return {
        rows: [[String(q), 'offerter per månad', ''],
               ['× ' + nf(a.deal), 'kr snittaffär', '(antagande)'],
               ['× 12', 'månader', '']],
        total, totalCaption: 'offererat värde per år',
        note: 'Här räknar vi på offertvolym, snittaffär och win-rate — inte på sparad tid. Systematisk uppföljning flyttar andelen vunna affärer, inte timmarna.',
      };
    },
  },
  kontroll: {
    title: 'Vad kostar projekten som spårar ur?',
    asm: [
      { key:'dev',   label:'Genomsnittlig avvikelse per projekt', def:40000, opts:[[15000,'15 000 kr'],[40000,'40 000 kr'],[90000,'90 000 kr']] },
      { key:'rate',  label:'Värde per frigjord timme', def:650, opts:[[450,'450 kr'],[650,'650 kr'],[850,'850 kr']] },
    ],
    calc: (s, a) => {
      const p = s.q2 || 0;
      const total = p * a.dev;
      const fireN = (s.q1 || 0) * a.rate * 52;
      return {
        rows: [[String(p), 'projekt om året som spårar ur på tid eller marginal', ''],
               ['× ' + nf(a.dev), 'kr genomsnittlig ekonomisk avvikelse', '(antagande)']],
        total, totalCaption: 'per år i projekt som inte landar där de skulle',
        aside: { value: nf(fireN) + ' kr / år', label: (s.q1 || 0) + ' h i veckan på uppföljning och brandkår, värderat till ' + nf(a.rate) + ' kr/h.' },
        note: 'Här räknar vi på antal projekt som spårar ur och vad avvikelsen kostar — inte på timmar. Överblick betalar sig i marginal.',
      };
    },
  },
  beroende: {
    title: 'Vad kostar det att allt går genom dig?',
    asm: [
      { key:'own', label:'Alternativvärde per ägartimme', def:1200, opts:[[850,'850 kr'],[1200,'1 200 kr'],[1800,'1 800 kr']] },
    ],
    calc: (s, a) => {
      const h = s.q1 || 0;
      const total = h * a.own * 52;
      return {
        rows: [[String(h), 'timmar i veckan av din egen tid på beslut', ''],
               ['× ' + nf(a.own), 'kr — alternativvärdet av en ägartimme', '(antagande)'],
               ['× 52', 'veckor om året', '']],
        total, totalCaption: 'per år av ägarens tid bunden i godkännanden',
        aside: { value: nf((s.q2 || 0) * 52) + ' beslut / år', label: 'passerar dig personligen idag. Det är flaskhalsen vi vill flytta.' },
        note: 'Ägartimmen värderas högre än en hantverkartimme: det är tid som annars går till att sälja, prissätta och styra firman.',
      };
    },
  },
};

const MATTE = {
  tid:      { diagnos: 'Det där hör jag nästan varje vecka. Två snabba frågor, så ser vi vad tiden egentligen kostar.',
              close:   'Jag har redan börjat förbereda ert konto. Första kvällen utan efterarbete är närmare än ni tror.' },
  pengar:   { diagnos: 'Pengar som redan är intjänade ska inte ligga och vänta. Två frågor, så ser vi hur mycket det handlar om.',
              close:   'Jag har redan börjat förbereda ert konto. Nästa färdiga jobb kan bli faktura samma dag.' },
  affarer:  { diagnos: 'Offerter som inte följs upp är den vanligaste läckan jag ser. Två frågor, så räknar vi på den.',
              close:   'Jag har redan börjat förbereda ert konto. Daniel tar nästa offert från dag ett.' },
  kontroll: { diagnos: 'Att se avvikelsen i tid är hela skillnaden. Två frågor, så ser vi vad det handlar om hos er.',
              close:   'Jag har redan börjat förbereda ert konto. Första projektet får en plan från start.' },
  beroende: { diagnos: 'Det är ett gott tecken att firman vill växa förbi dig. Två frågor, så ser vi var flaskhalsen sitter.',
              close:   'Jag har redan börjat förbereda ert konto. Vi börjar med teamet och vem som får besluta vad.' },
};

const VISION = {
  tid: ['Samma firma, samma jobb. Skillnaden är vad som händer efter klockan fyra.', [
    ['07:10', 'Dagens jobb ligger i mobilen med adress, material och vad kunden sa i telefon.'],
    ['13:40', 'Foto och tidrader går in på jobbet direkt från platsen. Ingen lapp i fickan.'],
    ['16:20', 'Lars har byggt underlaget. Du läser igenom och godkänner på två minuter.'],
    ['18:00', 'Kvällen är er egen. Det finns inget att renskriva.']]],
  pengar: ['Färdigt jobb blir faktura innan bilen är parkerad.', [
    ['09:00', 'Jobbet startar med tid, material och ÄTA redan kopplade till projektet.'],
    ['15:30', 'Jobbet markeras klart på plats. Karin kontrollerar underlaget mot planen.'],
    ['15:45', 'Du godkänner. Fakturan går iväg med rätt underlag första gången.'],
    ['Dag 30', 'Pengarna är inne. Inget ligger och väntar på att någon ska hinna.']]],
  affarer: ['Offerten går ut på minuter, och ingen glöms bort.', [
    ['08:30', 'Kundens förfrågan har blivit ett offertutkast från er egen mall.'],
    ['11:00', 'Offerten skickas. Daniel bevakar den från det ögonblicket.'],
    ['Dag 4', 'Kunden har öppnat men inte svarat. Daniel följer upp i er ton.'],
    ['Dag 6', 'Offerten är accepterad. Jobbet ligger i kalendern.']]],
  kontroll: ['Du ser avvikelsen samma dag, inte när fakturan ska skrivas.', [
    ['07:30', 'Varje projekt har en plan: timmar, material, budget.'],
    ['12:15', 'Ett inköp går över plan. Karin flaggar det till dig direkt.'],
    ['12:30', 'Du ringer kunden om ÄTA medan det fortfarande går att prata om.'],
    ['Fredag', 'Alla projekt ligger där de ska. Du vet det utan att fråga.']]],
  beroende: ['Firman rullar en hel dag utan att en fråga behöver gå genom dig.', [
    ['07:00', 'Arbetsledaren ser sina jobb, sitt team och sina ramar.'],
    ['10:20', 'Ett inköp under 10 000 kr godkänns av arbetsledaren. Du får inte ens ett meddelande.'],
    ['14:00', 'Ett större beslut kräver dig. Det är det enda som landar hos dig idag.'],
    ['17:00', 'Du har haft tid att träffa två nya kunder.']]],
};

const BACK = {
  tid:      { time: 'administration', calm: ['Kvällar utan efterarbete', 'Inget som ligger kvar i huvudet när bilen är parkerad. Underlaget är redan där det ska vara.'] },
  pengar:   { time: 'att jaga underlag och bygga fakturor', calm: ['Inget ofakturerat som ligger', 'Varje färdigt jobb har blivit en faktura. Ingen lista över saker att komma ihåg.'] },
  affarer:  { time: 'offerter och uppföljning', calm: ['Ingen offert glöms', 'Daniel håller koll på varje skickad offert. Du behöver inte ha dem i huvudet.'] },
  kontroll: { time: 'uppföljning och brandkårsutryckningar', calm: ['Färre överraskningar', 'Avvikelsen kommer till dig samma dag, inte i bokslutet.'] },
  beroende: { time: 'godkännanden och frågor', calm: ['Beslut som inte väntar på dig', 'Normala beslut tas av teamet inom sina ramar. Bara det som kräver dig landar hos dig.'] },
};

/* Platshållare — byts mot verkliga kundfall */
const PROOF = {
  tid:      [['Elfirma · 12 anställda · [ort]', '[11] h', '[3] h', 'administration per vecka, efter [60] dagar', '[Citat från ägaren om kvällarna]', '[Namn], [Firma]'],
             ['VVS-firma · 6 anställda · [ort]', '[8] h', '[2] h', 'efterarbete per vecka, efter [90] dagar', '[Citat]', '[Namn], [Firma]']],
  pengar:   [['Byggfirma · 15 anställda · [ort]', '[21] dgr', '[4] dgr', 'från klart jobb till faktura, efter [60] dagar', '[Citat om kassaflödet]', '[Namn], [Firma]'],
             ['Elfirma · 9 anställda · [ort]', '[X] kr', '[Y] kr', 'ofakturerat vid månadsskiftet', '[Citat]', '[Namn], [Firma]']],
  affarer:  [['Måleri · 8 anställda · [ort]', '[28] %', '[39] %', 'vunna offerter, efter [90] dagar', '[Citat om uppföljningen]', '[Namn], [Firma]'],
             ['Elfirma · 14 anställda · [ort]', '[X]', '[Y]', 'offerter som följdes upp per månad', '[Citat]', '[Namn], [Firma]']],
  kontroll: [['Byggfirma · 18 anställda · [ort]', '[6]', '[1]', 'projekt över budget per år', '[Citat om att se avvikelsen i tid]', '[Namn], [Firma]'],
             ['VVS-firma · 11 anställda · [ort]', '[X] kr', '[Y] kr', 'avvikelse per projekt i snitt', '[Citat]', '[Namn], [Firma]']],
  beroende: [['Elfirma · 22 anställda · [ort]', '[18]', '[5]', 'beslut som gick via ägaren per vecka', '[Citat om att kunna ta semester]', '[Namn], [Firma]'],
             ['Byggfirma · 16 anställda · [ort]', '[15] h', '[6] h', 'ägarens tid på godkännanden per vecka', '[Citat]', '[Namn], [Firma]']],
};

const ORDER = ['lookup','loading','reveal','profile','pain','diagnos','summary','solution','vision','agents','roi','package','breadth','offer','close','handoff','prefilled','firststep'];
const PROGRESS_FROM = 3;
const SALES_END = ORDER.indexOf('close');

const BREADTH = [
  ['matte',  'Din dag och dina beslut', 'Morgongenomgång, inkorg och bara det som faktiskt behöver ett ägarbeslut.', ['tid', 'beroende']],
  ['karin',  'Jobb till faktura',       'Fakturaunderlag, marginal, moms och bevakning tills pengarna är inne.', ['pengar']],
  ['daniel', 'Offerter och uppföljning', 'Varje offert följs upp tills den fått ett svar.', ['affarer']],
  ['lars',   'Projekt och tid',         'Planering, tidrapporter, byggdagbok och avvikelser som syns i tid.', ['kontroll']],
  ['lisa',   'Samtal och kundkontakt',  'Svarar när ni inte kan, bokar in och skickar vidare det som behöver er.', []],
  ['hanna',  'Kunder ni redan har',     'Håller kontakten med kunder ni gjort jobb åt tidigare.', []],
];

/* De sju objekten följer med: splittrade i diagnosen, ordnade i lösningen */
const OBJECTS = {
  tid: [
    ['Kvällens anteckning', 'ligger i mobilen',        'blir rader i underlaget'],
    ['Tidraderna',          'skrivs i efterhand',      'räknas när jobbet görs'],
    ['Kalendern',           'finns i tre versioner',   'en plan som gäller'],
  ],
  pengar: [
    ['Arbetsunderlaget', 'saknar material och ÄTA', 'komplett när jobbet stängs'],
    ['Tidraderna',       'rekonstrueras på fredag', 'ligger på rätt projekt direkt'],
    ['Fakturan',         'väntar på underlag',    'ligger klar att godkänna'],
  ],
  affarer: [
    ['Offerten',  'ligger still efter utskick', 'följs upp tills den svarar'],
    ['Kalendern', 'ingen uppföljning inbokad',  'nästa steg är inbokat'],
  ],
  kontroll: [
    ['Tidraderna',       'kommer in för sent',     'plan och utfall sida vid sida'],
    ['Arbetsunderlaget', 'sprids över projekten',  'samlat per projekt'],
    ['Kalendern',        'planen är redan omkörd', 'avvikelsen syns i tid'],
  ],
  beroende: [
    ['Frågorna',  'väntar på ägaren',     'går till rätt person'],
    ['Kalendern', 'fylld av godkännanden', 'bara undantagen når dig'],
  ],
};

/* Arbetsscen på AI-kollegorna — exempel, inte kunddata */
const SCENES = {
  tid:      ['Dagens anteckningar kommer in', 'Lars strukturerar dem', 'Du granskar', 'Underlaget är klart'],
  pengar:   ['Jobbet markeras klart', 'Karin kontrollerar underlaget', 'Du godkänner', 'Fakturan går ut'],
  affarer:  ['Offerten skickas', 'Daniel följer upp', 'Du godkänner formuleringen', 'Kunden svarar'],
  kontroll: ['Tid och material rapporteras', 'Lars jämför mot plan', 'Du ser avvikelsen', 'Projektet styrs om'],
  beroende: ['En fråga kommer in', 'Matte sorterar den', 'Du beslutar i undantagen', 'Resten är hanterat'],
};

const BEFORE_AFTER = {
  tid:      ['Kvällen går åt till anteckningar, kvitton och tidrader som ska renskrivas.',
             'Underlaget är redan samlat när dagen är slut. Kvällen är er egen.'],
  pengar:   ['Jobbet är klart, men fakturan väntar på underlag som ligger på fem ställen.',
             'Underlaget följer med jobbet. Fakturan går iväg medan jobbet är färskt.'],
  affarer:  ['Offerten är skickad. Sen blir det tyst, och någon annan hinner före.',
             'Varje offert följs upp i tid, utan att någon behöver komma ihåg det.'],
  kontroll: ['Avvikelsen syns först när projektet är slut och pengarna redan är borta.',
             'Avvikelsen syns medan den fortfarande går att styra.'],
  beroende: ['Varje beslut passerar dig — också de små, också på semestern.',
             'Teamet beslutar inom sina gränser. Du ser bara det som faktiskt kräver dig.'],
};

/* tråden: [streck, lucka, färg] — fragmenterad i dalen, hel mot slutet */
const THREAD = {
  profile:  [3, 11, 'var(--slate-300)'],
  pain:     [4, 10, 'var(--slate-400)'],
  diagnos:  [7, 9,  'var(--teal-400)'],
  summary:  [12, 8, 'var(--teal-500)'],
  solution: [24, 6, 'var(--teal-500)'],
  vision:   [36, 5, 'var(--teal-600)'],
  agents:   [48, 4, 'var(--teal-600)'],
  roi:      [90, 3, 'var(--teal-600)'],
  package:  [160, 2, 'var(--teal-700)'],
  breadth:  [260, 2, 'var(--teal-700)'],
  offer:    [600, 1, 'var(--teal-700)'],
  close:    [4000, 0, 'var(--teal-700)'],
};

const FIRMAN_NOW = ['Jobb','Kunder','Personal','Planering','Dokumentation','Ekonomi','AI-teamet'];
const STORFIRMAN_NEXT = ['Teams och arbetsledare','Roller och behörigheter','Delegerade godkännanden','Approval Center','Management by Exception','AI-ledningsrapport'];

const DEMO_COMPANY = {
  name: 'Svenssons El AB',
  short: 'Svenssons El',
  orgNumber: '556487-1234',
  form: 'Aktiebolag',
  status: 'Aktivt',
  registered: '2011-03-14',
  sni: '43210 — Elinstallationer',
  seat: 'Stockholm',
  address: 'Kabelvägen 12, 121 45 Johanneshov',
  employees: 14,
  employeeSpan: '10–19 anställda',
  years: [
    { y: '2023', rev: 9850000, res: 412000 },
    { y: '2024', rev: 11200000, res: 385000 },
    { y: '2025', rev: 12600000, res: 298000 },
  ],
};

/**
 * Bygger företagsobjektet ur svaret från POST /api/onboarding/bolagsverket-lookup
 * (BolagsverketCompany i lib/bolagsverket/client.ts: name, companyForm,
 * address{street,postalCode,city}, sniCode). Bokslut, anställda och
 * registreringsdatum finns inte i den datamängden och sätts därför inte —
 * profilskärmen visar dem bara när de finns. Aldrig en gissning under en
 * Bolagsverket-bock.
 */
const SNI_NAMN = [['43341', 'Måleriarbeten'], ['4321', 'Elinstallationer'], ['4322', 'VVS-arbeten'], ['4391', 'Takarbeten'], ['4311', 'Rivning'], ['4312', 'Mark- och grundarbeten'], ['4120', 'Byggande av hus'], ['4332', 'Byggnadssnickeriarbeten'], ['4333', 'Golv- och väggbeläggning'], ['4399', 'Specialiserade byggarbeten']];
const companyFromLookup = (b, orgShown) => {
  const name = (b.name || '').trim();
  const short = name.replace(/[\s,]+(AB|Aktiebolag|HB|KB|Handelsbolag|Kommanditbolag|Ekonomisk förening|ek\.? för\.?)\.?$/i, '').trim() || name;
  const sni = (b.sniCode || '').replace(/\D/g, '');
  const hit = SNI_NAMN.find(([k]) => sni.startsWith(k));
  const a = b.address || {};
  const rad2 = [a.postalCode, a.city].filter(Boolean).join(' ');
  return {
    source: 'bolagsverket',
    name, short,
    orgNumber: orgShown,
    form: b.companyForm || '',
    sni: sni ? sni + (hit ? ' — ' + hit[1] : '') : '',
    seat: a.city || '',
    address: [a.street, rad2].filter(Boolean).join(', '),
    street: a.street || '', postalCode: a.postalCode || '', city: a.city || '',
    employees: null, employeeSpan: '', registered: '', years: [],
  };
};

const nf = (n) => Math.round(n).toLocaleString('sv-SE').replace(/\u00a0/g, ' ');

class Component extends DCLogic {
  state = {
    step: 'lookup',
    org: '',
    orgError: '',
    company: null,
    employees: 14,
    jobs: null,
    painId: null,
    painExtra: [],
    q1: null,
    q2: null,
    asm: {},
    matteOpen: false, matteLine: '',
    caseSaving: false, caseUrl: '', caseOnboardingUrl: '', caseError: '', caseNekad: false,
    meetingDate: new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' }),
    meetingISO: new Date().toISOString().slice(0, 10),
    roiAnim: 1,
    modal: null,
    sendVariant: 'ready',
    caseName: '',
    caseEmail: '',
    copySeller: true,
  };

  componentDidMount() {
    this._key = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') this.next();
      if (e.key === 'ArrowLeft') this.back();
    };
    window.addEventListener('keydown', this._key);
    try {
      const franSokvag = (location.pathname.match(/\/case\/([^/?#]+)/) || [])[1];
      const token = new URLSearchParams(location.search).get('case') || (franSokvag ? decodeURIComponent(franSokvag) : null);
      if (token) {
        fetch('/api/sales-case/' + encodeURIComponent(token))
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d && d.payload && d.payload.raw) this.setState(Object.assign({}, d.payload.raw, { step: 'handoff', caseOnboardingUrl: d.onboardingUrl || '' })); })
          .catch(() => {});
      } else if (location.hash === '#onboarding') {
        const p = JSON.parse(localStorage.getItem('hm_sales_case') || 'null');
        if (p && p.raw) {
          this.setState(Object.assign({}, p.raw, { step: 'handoff' }));
          this._hand = setTimeout(() => this.go('prefilled'), 3400);
        }
      }
    } catch (e) {}
  }
  componentWillUnmount() {
    window.removeEventListener('keydown', this._key);
    clearTimeout(this._t); clearTimeout(this._hand); cancelAnimationFrame(this._raf);
  }

  pain() { return this.state.painId ? PAINS[this.state.painId] : null; }

  go(step) {
    this.setState({ step, matteOpen: false });
    const toTop = () => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; };
    toTop(); setTimeout(toTop, 0); setTimeout(toTop, 60);
    clearTimeout(this._hand);
    clearTimeout(this._matte);
    clearTimeout(this._matteHide);
    const pid = this.state.painId;
    if (pid && MATTE[pid] && (step === 'diagnos' || step === 'close')) {
      this._matte = setTimeout(() => {
        this.setState({ matteOpen: true, matteLine: MATTE[pid][step] });
        this._matteHide = setTimeout(() => this.setState({ matteOpen: false }), 11000);
      }, step === 'close' ? 1600 : 900);
    }
    if (step === 'roi') this.animateRoi();
    if (step === 'handoff') this._hand = setTimeout(() => this.go('prefilled'), 3400);
  }
  animateRoi() {
    cancelAnimationFrame(this._raf);
    const t0 = performance.now(), d = 1000;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / d);
      const e = 1 - Math.pow(1 - k, 3);
      this.setState({ roiAnim: e });
      if (k < 1) this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  idx() { return ORDER.indexOf(this.state.step); }

  next = () => {
    const s = this.state;
    if (s.step === 'lookup') return this.submitLookup();
    if (s.step === 'loading') return;
    if (s.step === 'profile' && !s.jobs) return;
    if (s.step === 'pain' && !s.painId) return;
    if (s.step === 'diagnos' && (s.q1 === null || s.q2 === null)) return;
    const i = this.idx();
    if (i < ORDER.length - 1) this.go(ORDER[i + 1]);
  };
  back = () => {
    const i = this.idx();
    if (i <= 0) return;
    let target = ORDER[i - 1];
    if (target === 'loading') target = 'lookup';
    this.go(target);
  };
  reset = () => {
    clearTimeout(this._t);
    clearTimeout(this._hand);
    this.setState({ step:'lookup', org:'', company:null, employees:14, jobs:null, painId:null, painExtra:[], q1:null, q2:null, rate:650, pct:25, modal:null, sendVariant:'ready', caseName:'', caseEmail:'', copySeller:true });
  };

  submitLookup = () => {
    const raw = (this.state.org || '').replace(/\s/g, '');
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 10) return;
    this.setState({ step: 'loading', orgError: '', company: null });
    clearTimeout(this._t);
    const started = Date.now();
    // Reveal tidigast efter 2,4 s så laddstegen hinner läsas, annars när svaret kommit.
    const done = (c) => {
      const wait = Math.max(0, 2400 - (Date.now() - started));
      this._t = setTimeout(() => this.setState({ company: c, employees: c.employees || 5, step: 'reveal' }), wait);
    };
    if (digits === DEMO_COMPANY.orgNumber.replace(/\D/g, '')) { done(Object.assign({}, DEMO_COMPANY, { orgNumber: this.state.org, source: 'demo' })); return; }
    fetch('/api/onboarding/bolagsverket-lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgNumber: digits }) })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.ok && d.data) { done(companyFromLookup(d.data, this.state.org)); return; }
        clearTimeout(this._t);
        this.setState({ step: 'lookup', orgError: (d && d.reason) || 'Kunde inte slå upp företaget.' });
      })
      .catch(() => {
        // Inget API att nå (t.ex. utanför appen). Aldrig demodata under ett riktigt orgnr —
        // säg vad som hände och peka på demoexemplet.
        clearTimeout(this._t);
        this.setState({ step: 'lookup', orgError: 'Kunde inte nå Bolagsverket-uppslaget härifrån. I appen hämtas företaget automatiskt; här kan du använda demoexemplet.' });
      });
  };

  fmtOrg(v) {
    const d = v.replace(/\D/g, '').slice(0, 10);
    return d.length > 6 ? d.slice(0, 6) + '-' + d.slice(6) : d;
  }

  pkg() {
    return this.props.packageOverride === 'Storfirman' ? 'Storfirman' : 'Firman';
  }

  signals() {
    const s = this.state, out = [];
    if (s.employees >= 10) out.push(s.employees + ' personer i verksamheten');
    else if (s.employees >= 6) out.push(s.employees + ' personer — och fler på väg in');
    if (s.employees >= 8) out.push('flera personer fattar beslut i vardagen');
    if (s.painId === 'beroende') out.push('ägaren är fortfarande flaskhals');
    if (s.painId === 'kontroll') out.push('flera projekt ska följas parallellt');
    if (s.jobs >= 75) out.push('hög jobbvolym varje månad');
    return out.slice(0, 3);
  }

  pickOpt(kind, value) {
    return () => {
      if (kind === 'q1') this.setState({ q1: value });
      else if (kind === 'q2') this.setState({ q2: value });
      else if (kind === 'jobs') this.setState({ jobs: value });
    };
  }

  optStyleDark(selected) {
    return selected
      ? { bc: 'var(--teal-700)', bg: 'var(--teal-50)', fg: 'var(--teal-900)' }
      : { bc: 'var(--border)', bg: 'rgba(255,255,255,.66)', fg: 'var(--slate-800)' };
  }

  optStyle(selected) {
    return selected
      ? { bc: 'var(--teal-700)', bg: 'var(--teal-50)', fg: 'var(--teal-700)' }
      : { bc: 'var(--border)', bg: '#FFFFFF', fg: 'var(--slate-800)' };
  }
  asmVals(model) {
    const set = this.state.asm || {}, out = {};
    (model ? model.asm : []).forEach((g) => { out[g.key] = set[g.key] != null ? set[g.key] : g.def; });
    return out;
  }
  togglePain = (id) => {
    const s = this.state, extra = (s.painExtra || []).slice();
    if (s.painId === id) {
      this.setState({ painId: extra.length ? extra[0] : null, painExtra: extra.slice(1),
                      q1: null, q2: null, asm: {} });
      return;
    }
    const i = extra.indexOf(id);
    if (i >= 0) { extra.splice(i, 1); this.setState({ painExtra: extra }); return; }
    if (!s.painId) { this.setState({ painId: id, q1: null, q2: null, asm: {} }); return; }
    if (extra.length >= 2) return;
    this.setState({ painExtra: extra.concat([id]) });
  };

  pickAsm(key, value) {
    return () => this.setState(
      { asm: Object.assign({}, this.state.asm, { [key]: value }) },
      () => this.animateRoi()
    );
  }

  renderVals() {
    const s = this.state;
    const step = s.step;
    const c = s.company || DEMO_COMPANY;
    const pain = this.pain();
    const pkgName = this.pkg();
    const pkgMonthlyN = pkgName === 'Storfirman' ? 11995 : 5995;
    const otherName = pkgName === 'Storfirman' ? 'Firman' : 'Storfirman';
    const otherMonthlyN = otherName === 'Storfirman' ? 11995 : 5995;

    const hours = s.q1 || 0;
    const model = s.painId ? CASE[s.painId] : null;
    const a = this.asmVals(model);
    const bc = model ? model.calc(s, a) : null;
    const totalN = bc ? bc.total : 0;
    const k = s.roiAnim;

    const asmGroups = (model ? model.asm : []).map((g) => ({
      label: g.label,
      opts: g.opts.map(([v, label]) =>
        Object.assign({ label, pick: this.pickAsm(g.key, v) }, this.optStyle(a[g.key] === v))),
    }));
    const asmChips = (model ? model.asm : []).map((g) => {
      const hit = g.opts.filter((o) => o[0] === a[g.key])[0];
      return { t: g.label + ': ' + (hit ? hit[1] : '') };
    });
    const asmSummary = asmChips.map((c2) => c2.t).join(' · ');

    const hY = hours * 52;
    const backDef = BACK[s.painId] || BACK.tid;
    const roiBack = bc ? [
      { label: 'Tid tillbaka', value: '≈ ' + nf(hY * k) + ' timmar om året',
        text: hours + ' timmar i veckan som idag går till ' + backDef.time + '. Det är ' + Math.max(1, Math.round(hY / 40)) + ' hela arbetsveckor.',
        bg: 'var(--teal-50)', bd: 'var(--teal-100)', fg: 'var(--teal-700)' },
      { label: 'Mindre att bära', value: backDef.calm[0], text: backDef.calm[1],
        bg: '#fff', bd: 'var(--border)', fg: 'var(--slate-500)' },
      { label: 'Pengar det handlar om', value: '≈ ' + nf(totalN * k) + ' kr',
        text: bc.totalCaption.charAt(0).toUpperCase() + bc.totalCaption.slice(1) + '. Er egen siffra, utan antagen procent.',
        bg: '#fff', bd: 'var(--border)', fg: 'var(--slate-500)' },
    ].map((b, i) => Object.assign(b, { anim: 'hmRise 520ms cubic-bezier(.2,.8,.2,1) ' + (150 + i * 130) + 'ms backwards' })) : [];

    const sec = pain && pain.secondary ? pain.secondary(s) : null;

    const avatarOf = (k) => (this.props.showAgentPortraits === false ? '' : AGENTS[k].avatar);
    const YRS = (c.years && c.years.length) ? c.years : DEMO_COMPANY.years;
    const mkr = (v) => (v / 1000000).toFixed(2).replace('.', ',') + ' Mkr';
    const tkr = (v) => Math.round(v / 1000) + ' tkr';
    const marg = (r) => (r.res / r.rev) * 100;
    const revMax = Math.max.apply(null, YRS.map((r) => r.rev));
    const mgMax = Math.max.apply(null, YRS.map(marg)) * 1.55;
    const bx = (i) => 48 + i * 200;
    const finBars = YRS.map((r, i) => ({
      x: bx(i), h: Math.round((r.rev / revMax) * 140), y: 170 - Math.round((r.rev / revMax) * 140),
    }));
    const finDots = YRS.map((r, i) => ({ cx: bx(i) + 52, cy: (170 - (marg(r) / mgMax) * 170).toFixed(1) }));
    const finLine = finDots.map((d, i) => (i ? 'L' : 'M') + d.cx + ' ' + d.cy).join(' ');
    const finYears = YRS.map((r) => ({
      y: r.y, rev: mkr(r.rev), res: tkr(r.res),
      margin: marg(r).toFixed(1).replace('.', ',') + ' %',
    }));
    const revGrow = Math.round((YRS[YRS.length - 1].rev / YRS[0].rev - 1) * 100);
    const resDrop = Math.round((1 - YRS[YRS.length - 1].res / YRS[0].res) * 100);
    const finRead = 'Omsättningen har växt ' + revGrow + ' % på tre år. Resultatet har gått ner ' + resDrop + ' %. Marginalen från ' +
      marg(YRS[0]).toFixed(1).replace('.', ',') + ' till ' + marg(YRS[YRS.length - 1]).toFixed(1).replace('.', ',') + ' procent.';

    const painCard = (id) => {
      const prim = s.painId === id;
      const xi = (s.painExtra || []).indexOf(id);
      const sel = prim || xi >= 0;
      const ags = PAINS[id].agents;
      return {
        bc: prim ? 'var(--teal-300)' : (sel ? 'rgba(94,234,212,.42)' : 'rgba(255,255,255,.13)'),
        bg: prim ? 'var(--teal-50)' : (sel ? '#FFFFFF' : 'rgba(255,255,255,.62)'),
        sh: prim ? '0 10px 28px rgba(15,118,110,.15)' : 'none',
        ib: sel ? 'var(--teal-100)' : 'rgba(15,23,42,.05)',
        ic: prim ? 'var(--teal-700)' : (sel ? 'var(--teal-700)' : 'var(--slate-400)'),
        mark: sel ? '✓' : '→',
        rank: prim ? 'Störst' : (xi >= 0 ? 'Även viktigt' : ''),
        rfg: prim ? '#FFFFFF' : 'var(--teal-800)',
        rbg: prim ? 'var(--teal-700)' : 'var(--teal-100)',
        aop: sel ? 1 : 0.45,
        av1: avatarOf(ags[0][0]), av2: avatarOf(ags[1][0]),
        pick: () => this.togglePain(id),
      };
    };

    const objSpread = (s.painId && OBJECTS[s.painId] ? OBJECTS[s.painId] : []).map(([name, before], i) => ({
      name, before,
      tf: 'rotate(' + [-3.2, 2.4, -1.6][i % 3] + 'deg) translateY(' + [0, 14, 5][i % 3] + 'px)',
    }));
    const objOrder = (s.painId && OBJECTS[s.painId] ? OBJECTS[s.painId] : []).map(([name, , after], i) => ({
      name, after,
      anim: ['hmSettleA','hmSettleB','hmSettleC'][i % 3] + ' 760ms cubic-bezier(.2,.8,.2,1) ' + (260 + i * 150) + 'ms backwards',
    }));
    const sceneSteps = (s.painId && SCENES[s.painId] ? SCENES[s.painId] : []).map((t, i) => ({
      t, n: i + 1,
      mine: i === 2,
      bg: i === 2 ? 'linear-gradient(135deg,rgba(13,148,136,.1),rgba(20,184,166,.03))' : '#FFFFFF',
      bd: i === 2 ? 'var(--teal-400)' : 'var(--border)',
    }));

    const chosen = {};
    if (s.painId) chosen[s.painId] = true;
    (s.painExtra || []).forEach((id) => { chosen[id] = true; });
    const breadthRows = BREADTH.map(([key, area, line, pids]) => {
      const mine = (pids || []).some((p) => chosen[p]);
      return {
        area, line, mine,
        name: AGENTS[key].name, role: AGENTS[key].role,
        avatar: this.props.showAgentPortraits === false ? '' : AGENTS[key].avatar,
        bg: mine ? 'linear-gradient(135deg,rgba(13,148,136,.09),rgba(20,184,166,.02))' : '#FFFFFF',
        ring: mine ? 'var(--teal-400)' : 'var(--border)',
      };
    });

    const dots = ORDER.slice(PROGRESS_FROM, SALES_END + 1).map((st) => ({
      bg: ORDER.indexOf(st) <= this.idx() ? 'var(--teal-700)' : 'var(--border)',
    }));

    const jobOptions = [['Under 20',15],['20–50',35],['50–100',75],['Över 100',120]].map(([label, v]) =>
      Object.assign({ label, pick: this.pickOpt('jobs', v) }, this.optStyle(s.jobs === v)));

    const q1options = pain ? pain.q1.options.map(([label, v]) =>
      Object.assign({ label, pick: this.pickOpt('q1', v) }, this.optStyleDark(s.q1 === v))) : [];
    const q2options = pain ? pain.q2.options.map(([label, v]) =>
      Object.assign({ label, pick: this.pickOpt('q2', v) }, this.optStyleDark(s.q2 === v))) : [];

    const rateOptions = [], pctOptions = [];

    const solutionSteps = pain ? pain.steps.map(([title, body, ag, soon], i) => ({
      n: i + 1, title, body, soon,
      agent: AGENTS[ag].name, avatar: this.props.showAgentPortraits === false ? '' : AGENTS[ag].avatar, dot: AGENTS[ag].dot,
    })) : [];

    const extraIds = (s.painExtra || []).filter((id) => PAINS[id]);
    const agentSeen = {}, agentRows = [];
    [s.painId].concat(extraIds).forEach((pid) => {
      if (!pid || !PAINS[pid]) return;
      PAINS[pid].agents.forEach(([key, line]) => {
        if (agentSeen[key]) return;
        agentSeen[key] = true;
        agentRows.push({ key, line, tag: PAINS[pid].tag });
      });
    });
    const painAgents = pain ? agentRows.map(({ key, line, tag }) => ({
      name: AGENTS[key].name, role: AGENTS[key].role, dot: AGENTS[key].dot, tag,
      avatar: this.props.showAgentPortraits === false ? '' : AGENTS[key].avatar, line,
    })) : [];

    const jobsLabel = (jobOptions.find((o) => o.bc === 'var(--teal-700)') || {}).label || '—';
    const BIG = 'clamp(28px,3.2vw,38px)', MID = 'clamp(21px,2.3vw,27px)';
    const summaryRows = pain ? [
      { value: s.employees + ' personer', label: 'jobbar aktivt i verksamheten', size: BIG },
      { value: hours + ' h/vecka', label: pain.hoursLabel, size: BIG },
      { value: sec ? sec.value : jobsLabel + ' jobb', label: sec ? sec.label : 'jobb hanteras per månad', size: BIG },
      { value: pain.tag, label: 'är det ni vill lösa först', size: MID },
    ] : [];

    const pkgReasons = [
      'Hela den operativa plattformen — jobb, kunder, personal, planering, dokumentation och ekonomi.',
      'Hela AI-teamet ingår från dag ett: Matte, Karin, Daniel, Lars, Hanna och Lisa.',
      pain ? 'Vi sätter upp det efter det ni valde: ' + pain.label.toLowerCase() + '.' : 'Ett tydligt fokus att börja från.',
      'Ni kan börja nu och växa vidare utan att byta system.',
    ];
    const signalList = this.signals();

    const offerItems = [
      { title: 'Hela Handymate-plattformen', body: 'Jobb, kunder, personal, planering, dokumentation och ekonomi i ett system.', soon: false },
      { title: 'Era AI-kollegor', body: 'Matte, Karin, Daniel, Lars, Hanna och Lisa jobbar i firman varje dag. Inget når en kund utan ert OK.', soon: false },
      { title: 'Standard onboarding', body: 'Vi går igenom firman och sätter upp ert första arbetsflöde tillsammans. Ingen separat onboardingavgift.', soon: false },
      { title: 'Automatiserad företagssetup', body: 'Företagsdata hämtas och Handymate är förberett för er innan ni loggar in första gången.', soon: false },
    ];

    const comingItems = [
      { title: 'Handymate Academy', body: 'Digital onboarding, utbildning och guider för hela teamet, direkt från Handymate.' },
      { title: 'Storfirman-funktionerna', body: 'Teams och arbetsledare, delegerade godkännanden, Approval Center, Management by Exception och AI-ledningsrapport.' },
    ];

    const d = new Date(); d.setDate(d.getDate() + 7);
    const startDate = d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });

    const onb = pain ? pain.onb : null;
    const onbSteps = (onb ? onb.steps : ['Företaget','Arbetsflöde','Team','Första jobbet','Bjud in personalen']).map((label, i) => ({
      label, n: i + 1,
      bg: i === 0 ? 'var(--teal-700)' : i === 1 ? '#fff' : '#fff',
      bc: i <= 1 ? 'var(--teal-700)' : 'var(--border)',
      fg: i === 0 ? '#fff' : i === 1 ? 'var(--teal-700)' : 'var(--slate-400)',
      tx: i <= 1 ? 'var(--slate-900)' : 'var(--slate-400)',
      mark: i === 0 ? '✓' : String(i + 1),
    }));

    const knownFacts = [
      c.name, c.orgNumber, (c.sni || '').split('—').pop().trim(), c.seat,
      s.employees + ' personer', jobsLabel + ' jobb/månad',
      'Primärt mål: ' + (pain ? pain.goal : '—'), 'Paket: ' + pkgName,
    ];

    const sessionRows = [
      ['company_name', c.name],
      ['org_number', c.orgNumber],
      ['industry', (c.sni || '').split('—').pop().trim()],
      ['city', c.seat],
      ['employees', String(s.employees)],
      ['jobs_per_month', jobsLabel],
      ['selected_pain', pain ? pain.label : '—'],
      ['diagnosis', hours + ' h/vecka' + (sec ? ' · ' + sec.value : '')],
      ['roi_assumptions', asmSummary || '—'],
      ['meeting_date', s.meetingDate],
      ['recommended_package', pkgName],
      ['salesperson', 'Handymate Sälj'],
      ['prospect', s.caseName ? s.caseName + (s.caseEmail ? ' · ' + s.caseEmail : '') : '—'],
    ].map(([k, v]) => ({ k, v }));

    const openSend = (variant) => () => this.setState({ modal: 'send', sendVariant: variant });

    // Sant bara när servern svarade nej på en sparning. Styr kvittorutan.
    const nekad = s.caseNekad === true;
    const casePayload = () => ({
      company: { name: c.name, short: c.short, org: c.orgNumber, sni: c.sni, seat: c.seat },
      told: [
        { v: s.employees + ' personer', l: 'jobbar aktivt i verksamheten' },
        { v: jobsLabel + ' jobb', l: 'per månad' },
        { v: hours + ' h/vecka', l: pain ? pain.hoursLabel : '' },
        { v: pain ? pain.tag : '', l: 'är det ni vill lösa först' },
      ],
      focusTitle: pain ? pain.solutionTitle : '',
      steps: solutionSteps,
      agents: painAgents,
      roi: bc ? {
        title: model.title,
        rows: bc.rows.map(([v, l, hint]) => ({ v, l, hint })),
        total: nf(bc.total), totalCaption: bc.totalCaption,
        back: roiBack.map((b) => ({ label: b.label, value: b.value, text: b.text })),
        aside: bc.aside || null, asm: asmChips, note: bc.note,
      } : null,
      meeting: { date: s.meetingDate, iso: s.meetingISO },
      pkg: { name: pkgName, monthly: nf(pkgMonthlyN) },
      goal: { name: pain ? pain.goal : '', quote: pain ? pain.quote(s) : '' },
      prospect: { name: s.caseName, email: s.caseEmail },
      raw: { company: c, employees: s.employees, jobs: s.jobs, painId: s.painId, addressStreet: c.street || '', addressPostalCode: c.postalCode || '', addressCity: c.city || '',
             q1: s.q1, q2: s.q2, asm: s.asm, meetingDate: s.meetingDate, meetingISO: s.meetingISO,
             caseName: s.caseName, caseEmail: s.caseEmail },
    });

    return {
      showChrome: step !== 'lookup' && step !== 'loading' && step !== 'handoff',
      showThread: this.idx() >= PROGRESS_FROM && this.idx() <= SALES_END,
      threadBg: THREAD[step]
        ? 'repeating-linear-gradient(90deg,' + THREAD[step][2] + ' 0 ' + THREAD[step][0] + 'px,transparent ' + THREAD[step][0] + 'px ' + (THREAD[step][0] + THREAD[step][1]) + 'px)'
        : 'transparent',
      chromeBg: 'rgba(255,255,255,.82)',
      chromeBd: 'var(--border)',
      chromeFg: 'var(--slate-900)',
      chromeMuted: 'var(--slate-500)',
      pillBg: 'var(--teal-50)',
      pillBd: 'var(--teal-100)',
      pillFg: 'var(--teal-700)',
      showProgress: this.idx() >= PROGRESS_FROM && this.idx() <= SALES_END,
      canBack: this.idx() > 0 && step !== 'loading' && step !== 'handoff',
      hasCompany: !!s.company,
      demoBadge: this.props.demoBadge !== false && (!s.company || s.company.source === 'demo'),
      dots,

      isLookup: step === 'lookup', isLoading: step === 'loading', isReveal: step === 'reveal',
      isProfile: step === 'profile', isPain: step === 'pain', isDiagnos: step === 'diagnos',
      isSummary: step === 'summary', isSolution: step === 'solution', isVision: step === 'vision', isAgents: step === 'agents',
      isRoi: step === 'roi', isPackage: step === 'package', isBreadth: step === 'breadth',
      isOffer: step === 'offer', isClose: step === 'close',
      isHandoff: step === 'handoff',
      isPrefilled: step === 'prefilled', isFirstStep: step === 'firststep',

      breadthRows, objSpread, objOrder, sceneSteps,
      hasObjects: objSpread.length > 0,
      firmanNow: FIRMAN_NOW.map((t) => ({ t })),
      storfirmanNext: STORFIRMAN_NEXT.map((t) => ({ t })),
      hasSignals: signalList.length > 0,
      signalCount: signalList.length,
      signals: signalList.map((t) => ({ t })),
      comingItems,

      startOnboarding: () => this.go('handoff'),
      skipHandoff: () => this.go('prefilled'),
      knownFacts: knownFacts.map((t) => ({ t })),
      sessionRows,
      showSession: this.props.showSalesSession === true,
      onbSteps,
      onbLine: onb ? onb.line.replace('{H}', String(hours)) : '',
      onbSub: onb ? onb.sub : '',
      onbCta: onb ? onb.cta : 'Fortsätt',
      goalName: pain ? pain.goal : '',
      goalQuote: pain ? pain.quote(s) : '',

      modalOpen: !!s.modal,
      isSend: s.modal === 'send', isSent: s.modal === 'sent',
      hasCaseUrl: Boolean(s.caseUrl),
      sendTitle: s.sendVariant === 'think' ? 'Ta med er genomgången hem' : 'Skicka ' + c.short + ' × Handymate',
      sendSub: s.sendVariant === 'think'
        ? 'Ingen stress. Vi skickar hela genomgången så att ni kan gå igenom den i lugn och ro.'
        : 'Vi skickar en personlig länk med allt ni berättat, business caset och vår rekommendation.',
      caseName: s.caseName, caseEmail: s.caseEmail,
      setCaseName: (e) => this.setState({ caseName: e.target.value }),
      setCaseEmail: (e) => this.setState({ caseEmail: e.target.value }),
      copySeller: s.copySeller,
      copyBox: s.copySeller ? 'var(--teal-700)' : '#fff',
      copyBorder: s.copySeller ? 'var(--teal-700)' : 'var(--slate-300)',
      copyMark: s.copySeller ? '✓' : '',
      toggleCopy: () => this.setState({ copySeller: !s.copySeller }),
      sendCase: () => {
        const payload = casePayload();
        this.setState({ caseSaving: true, caseError: '' });
        // Kanvasen serverar komponenten som en fil; appen serverar den som
        // en rutt. Det avgör om den lokala reservvägen får användas alls —
        // och den frågan ska ställas på VAR vi kör, inte på hur anropet
        // misslyckades. Ett nätfel i appen är inte en prototyp.
        const iKanvasen = /\.dc\.html$/i.test(location.pathname);
        fetch('/api/sales-case', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload }) })
          .then((r) => r.json().catch(() => null).then((d) => ({ ok: r.ok, d })))
          .then(({ ok, d }) => {
            if (ok && d && d.url) {
              this.setState({ caseSaving: false, caseUrl: d.url, caseOnboardingUrl: d.onboardingUrl || '', caseNekad: false, modal: 'sent' });
            } else {
              throw new Error((d && d.error) || 'Kunde inte spara genomgången.');
            }
          })
          .catch((err) => {
            const meddelande = err && err.message ? err.message : 'Kunde inte spara genomgången.';
            if (!iKanvasen) {
              // I APPEN. Ge då aldrig ut en länk: kundens prefill och
              // partnerns attribution sitter i raden vi inte fick spara,
              // inte i länken. En "Skickat."-ruta med en död länk är
              // värre än ett tydligt fel — säljaren skickar den vidare.
              this.setState({ caseSaving: false, caseUrl: '', caseOnboardingUrl: '', caseError: meddelande, caseNekad: true, modal: 'sent' });
              return;
            }
            // Utanför appen (design-kanvasen) finns ingen rutt att nå — spara lokalt så prototypen går att visa.
            try { localStorage.setItem('hm_sales_case', JSON.stringify(payload)); } catch (e) {}
            const local = location.pathname.replace(/[^/]*$/, '') + 'Personligt Case.dc.html';
            this.setState({ caseSaving: false, caseUrl: local, caseOnboardingUrl: '', caseError: meddelande, caseNekad: false, modal: 'sent' });
          });
      },
      caseSaving: s.caseSaving, caseUrl: s.caseUrl, caseError: s.caseError, sendLabel: s.caseSaving ? 'Sparar…' : 'Skicka mitt case',
      onboardingHref: s.caseOnboardingUrl || (location.pathname + '#onboarding'),
      sendCtaBg: s.caseEmail.includes('@') ? 'var(--teal-700)' : 'var(--slate-400)',
      closeModal: () => this.setState({ modal: null }),
      // Kvittorutan har två utfall. Den nekade får aldrig se ut som en
      // bekräftelse: ingen länk, ingen grön bock, ingen "Skickat."
      sentMark: nekad ? '!' : '✓',
      sentMarkBg: nekad ? 'var(--amber-50)' : 'var(--teal-50)',
      sentMarkBorder: nekad ? 'var(--amber-200)' : 'var(--teal-100)',
      sentMarkColor: nekad ? 'var(--amber-700)' : 'var(--teal-700)',
      sentTitle: nekad ? 'Genomgången sparades inte.' : 'Skickat.',
      sentBody: nekad
        ? 'Ingen länk har skapats, så ingenting har gått till ' + c.short + '. Åtgärda felet nedan och försök igen.'
        : c.short + ' får sin personliga genomgång med det ni berättat, business caset och vår rekommendation.',
      sentCta: nekad ? 'Tillbaka' : 'Fortsätt till Handymate',
      caseErrorText: nekad
        ? s.caseError
        : 'Servern kunde inte nås (' + s.caseError + '). Genomgången är sparad lokalt i den här webbläsaren; utanför appen fungerar länken bara här.',
      sentThen: () => { if (nekad) { this.setState({ modal: 'send' }); return; } this.setState({ modal: null }); this.go('handoff'); },
      openSendReady: openSend('ready'),
      openSendThink: openSend('think'),

      org: s.org,
      orgError: s.orgError || '',
      setOrg: (e) => this.setState({ org: this.fmtOrg(e.target.value) }),
      orgKey: (e) => { if (e.key === 'Enter') this.submitLookup(); },
      submitLookup: this.submitLookup,
      fillDemo: () => this.setState({ org: '556487-1234' }),
      ctaBg: s.org.replace(/\D/g, '').length >= 10 ? 'var(--teal-700)' : 'var(--slate-400)',

      companyName: c.name, companyShort: c.short, companyOrg: c.orgNumber,
      registeredEmployees: DEMO_COMPANY.employees,
      finBars, finDots, finLine, finYears, finRead,
      matteAvatar: AGENTS.matte.avatar,
      proofCards: (PROOF[s.painId] || PROOF.tid).map((p) => ({ who: p[0], before: p[1], after: p[2], metric: p[3], quote: p[4], name: p[5] })),
      matteOpen: s.matteOpen, matteLine: s.matteLine,
      matteDismiss: () => { clearTimeout(this._matteHide); this.setState({ matteOpen: false }); },
      visionLead: (VISION[s.painId] || VISION.tid)[0],
      visionScenes: (VISION[s.painId] || VISION.tid)[1].map(([time, text], i) => ({ time, text, anim: 'hmRise 520ms cubic-bezier(.2,.8,.2,1) ' + (500 + i * 140) + 'ms backwards' })),
      team1: AGENTS.karin.avatar, team2: AGENTS.daniel.avatar, team3: AGENTS.lars.avatar,
      team4: AGENTS.hanna.avatar, team5: AGENTS.lisa.avatar,
      facts: [
        { label: 'Bransch', value: c.sni },
        { label: 'Bolagsform', value: c.form },
        { label: 'Säte', value: c.seat },
        { label: 'Adress', value: c.address },
        { label: 'Registrerat', value: c.registered },
        { label: 'Storlek', value: c.employeeSpan },
      ].filter((f) => f.value),
      hasYears: !!(c.years && c.years.length),
      sourceLabel: c.source === 'demo' ? 'Demoexempel — inte hämtat från Bolagsverket' : 'Hämtat från Bolagsverket',
      employeesHint: c.employeeSpan ? 'Bolagsverket säger ' + c.employeeSpan : 'Antalet står inte i registret — ni vet bäst',
      employees: s.employees,
      empSet: (e) => this.setState({ employees: Number(e.target.value) }),
      empTrack: 'linear-gradient(90deg,var(--teal-700) ' + Math.round(((s.employees - 1) / 39) * 100) + '%,var(--slate-200) ' + Math.round(((s.employees - 1) / 39) * 100) + '%)',
      jobOptions,
      profileLocked: !s.jobs,
      profileCtaBg: s.jobs ? 'var(--teal-700)' : 'var(--border)',
      profileCtaFg: s.jobs ? '#fff' : 'var(--slate-400)',

      pc1: painCard('tid'), pc2: painCard('pengar'), pc3: painCard('affarer'),
      pc4: painCard('kontroll'), pc5: painCard('beroende'),
      hasPain: !!s.painId,
      painAck: pain ? pain.ack : '',
      painLabel: pain ? pain.label : '',

      q1title: pain ? pain.q1.title : '', q1options,
      q2title: pain ? pain.q2.title : '', q2options,
      hasQ1: s.q1 !== null, hasQ2: s.q2 !== null,

      summaryRows,

      solutionTitle: pain ? pain.solutionTitle : '',
      solutionSteps,
      solutionNote: s.painId === 'beroende'
        ? 'Delegering, Approval Center och Management by Exception ingår i Storfirman och är under utveckling. Vi visar dem för att ni ska veta vart produkten är på väg — inte som något ni får på dag ett.'
        : '',

      painAgents,
      painAlso: extraIds.length
        ? 'Vi tar också med ' + extraIds.map((id) => PAINS[id].tag.toLowerCase()).join(' och ') + ' i genomgången.'
        : '',
      hasPainAlso: extraIds.length > 0,
      painAlsoTags: extraIds.map((id) => ({ t: PAINS[id].tag })),

      beforeCaption: (BEFORE_AFTER[s.painId] || BEFORE_AFTER.tid)[0],
      afterCaption: (BEFORE_AFTER[s.painId] || BEFORE_AFTER.tid)[1],
      roiTitle: bc ? model.title : '',
      roiRows: bc ? bc.rows.map(([v, l, hint]) => ({ v, l, hint })) : [],
      roiWeek: Array.from({ length: 40 }, (_, i) => ({
        bg: i < Math.min(40, hours) ? 'var(--amber-500)' : 'var(--slate-200)',
        anim: 'hmPop 380ms cubic-bezier(.2,.8,.2,1) ' + (i * 22) + 'ms backwards',
      })),
      roiHours: hours,
      roiHoursWhat: 'går till ' + backDef.time,
      roiFormula: bc ? bc.rows.map(([v, l]) => (v + ' ' + l).replace(/ —.*$/, '')).join(' ') : '',
      roiTotal: nf(totalN * k),
      roiTotalCaption: bc ? bc.totalCaption : '',
      roiNote: bc ? bc.note : '',
      hasAside: !!(bc && bc.aside),
      asideValue: bc && bc.aside ? bc.aside.value : '',
      asideLabel: bc && bc.aside ? bc.aside.label : '',
      roiBack,
      asmGroups,

      foundersAvailable: this.props.foundersAvailable !== false,
      closeFoundersLine: this.props.foundersAvailable !== false ? 'Som grundarkund är priset låst för alltid och bokföringen kostar er halva priset, för alltid, när den släpps.' : '',
      pkgName, pkgMonthly: nf(pkgMonthlyN), pkgYearly: nf(pkgMonthlyN * 12), pkgYearlyDeal: nf(pkgMonthlyN * 10), pkgMonthlyDeal: nf(Math.round(pkgMonthlyN * 10 / 12)),
      pkgReasons,
      otherName, otherMonthly: nf(otherMonthlyN),
      otherWhy: otherName === 'Firman'
        ? 'Firman rymmer hela plattformen och hela AI-teamet. Den räcker så länge en ägare hinner hålla ihop besluten själv.'
        : 'Storfirman lägger till team, arbetsledare, delegerade godkännanden och ledningsöverblick. Blir aktuellt när fler än ni själva behöver kunna besluta.',

      offerItems,
      startDate,

      next: this.next, back: this.back, reset: this.reset,
    };
  }
}

export default class SalesExperience extends Component {
  // React fyller på defaults innan render — logikklassen läser this.props
  // precis som i kanvasen, och ingen behöver skriva om props på plats.
  static defaultProps = DEFAULTS

  render() {
    const v = this.renderVals()
    return (
      <div className="hm-sx">
        <style>{CSS}</style>
        <div style={{minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-page)"}}>
          {(v.showChrome) ? (
            <>
              <header style={{height: "64px", flex: "none", display: "flex", flexWrap: "nowrap", alignItems: "center", gap: "14px", padding: "0 20px", borderBottom: `1px solid ${v.chromeBd}`, background: `${v.chromeBg}`, backdropFilter: "blur(12px)", position: "sticky", top: "0", zIndex: "20", transition: "background 400ms cubic-bezier(.2,.8,.2,1),border-color 400ms"}}>
                <div style={{display: "flex", alignItems: "center", gap: "10px", flex: "none"}}>
                  <img src="handymate-dashboard/public/logo.png" alt="Handymate" style={{width: "26px", height: "26px", borderRadius: "6px", objectFit: "cover"}} />
                  <span style={{fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "15px", letterSpacing: "-.01em", whiteSpace: "nowrap", color: `${v.chromeFg}`, transition: "color 400ms"}}>
                    Handymate
                  </span>
                </div>
                {(v.hasCompany) ? (
                  <>
                    <div style={{display: "flex", alignItems: "center", gap: "9px", minWidth: "0", flex: "0 1 auto", padding: "5px 12px 5px 10px", border: `1px solid ${v.pillBd}`, background: `${v.pillBg}`, borderRadius: "999px", overflow: "hidden", transition: "all 400ms"}}>
                      <span style={{width: "6px", height: "6px", borderRadius: "50%", background: `${v.pillFg}`, flex: "none"}} />
                      <span style={{fontSize: "13px", fontWeight: "600", color: `${v.pillFg}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>
                        {v.companyName}
                      </span>
                      <span style={{fontFamily: "var(--font-mono)", fontSize: "11px", color: `${v.chromeMuted}`, whiteSpace: "nowrap", flex: "none"}}>
                        {v.companyOrg}
                      </span>
                    </div>
                  </>
                ) : null}
                <div style={{flex: "1 1 8px", minWidth: "8px"}} />
                {(v.showProgress) ? (
                  <>
                    <div style={{display: "flex", gap: "4px", alignItems: "center", flex: "none"}}>
                      {(v.dots || []).map((d, $i0) => (
                        <React.Fragment key={$i0}>
                            <span style={{width: "14px", height: "3px", borderRadius: "2px", background: `${d.bg}`, transition: "background 280ms cubic-bezier(.2,.8,.2,1)"}} />
                        </React.Fragment>
                      ))}
                    </div>
                  </>
                ) : null}
                {(v.demoBadge) ? (
                  <>
                    <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".12em", color: "var(--amber-700)", background: "var(--amber-100)", padding: "4px 9px", borderRadius: "999px", whiteSpace: "nowrap", flex: "none"}}>
                      DEMO
                    </span>
                  </>
                ) : null}
                {(v.canBack) ? (
                  <>
                    <button onClick={v.back} style={{fontSize: "13px", fontWeight: "600", color: `${v.chromeMuted}`, padding: "6px 10px", borderRadius: "8px", whiteSpace: "nowrap", flex: "none", transition: "color 400ms"}} className="hx0">
                      Tillbaka
                    </button>
                  </>
                ) : null}
                <button onClick={v.reset} style={{fontSize: "13px", fontWeight: "600", color: `${v.chromeMuted}`, padding: "6px 10px", borderRadius: "8px", whiteSpace: "nowrap", flex: "none", transition: "color 400ms"}} className="hx1">
                  Börja om
                </button>
              </header>
            </>
          ) : null}
          <main style={{flex: "1", display: "flex", flexDirection: "column", minHeight: "0"}}>
            {(v.showThread) ? (
              <>
                <div style={{flex: "none", height: "3px", position: "sticky", top: "64px", zIndex: "16", background: `${v.threadBg}`, transition: "background 700ms cubic-bezier(.2,.8,.2,1)"}} />
              </>
            ) : null}
            {(v.matteOpen) ? (
              <>
                <div style={{position: "fixed", right: "clamp(16px,3vw,40px)", bottom: "clamp(16px,3vw,36px)", zIndex: "30", display: "flex", alignItems: "flex-end", gap: "14px", maxWidth: "460px", animation: "hmSlideUp 420ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                  <div style={{position: "relative", flex: "none", animation: "hmPop 460ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                    <img src={v.matteAvatar} alt="Matte" style={{width: "64px", height: "64px", borderRadius: "50%", objectFit: "cover", border: "2.5px solid rgba(94,234,212,.55)", background: "var(--teal-50)", boxShadow: "0 8px 24px rgba(15,118,110,.18)"}} />
                    <span style={{position: "absolute", right: "2px", bottom: "2px", width: "13px", height: "13px", borderRadius: "50%", background: "#4ade80", border: "2.5px solid #fff"}} />
                  </div>
                  <div style={{position: "relative", padding: "16px 46px 16px 20px", borderRadius: "18px 18px 18px 6px", background: "#fff", border: "1px solid var(--teal-100)", boxShadow: "0 12px 34px rgba(15,118,110,.14)", animation: "hmSlideUp 420ms cubic-bezier(.2,.8,.2,1) 180ms backwards"}}>
                    <p style={{margin: "0", fontSize: "10px", fontWeight: "700", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--teal-700)"}}>
                      Matte · Chefsassistent
                    </p>
                    <p style={{margin: "6px 0 0", fontSize: "16px", lineHeight: "1.5", color: "var(--slate-900)"}}>
                      {v.matteLine}
                    </p>
                    <button onClick={v.matteDismiss} aria-label="Stäng" style={{position: "absolute", top: "10px", right: "10px", width: "26px", height: "26px", borderRadius: "50%", color: "var(--slate-400)", fontSize: "17px", lineHeight: "1", display: "flex", alignItems: "center", justifyContent: "center"}} className="hx2">
                      ×
                    </button>
                  </div>
                </div>
              </>
            ) : null}
            {(v.isLookup) ? (
              <>
                <section style={{flex: "1", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 48px", background: "linear-gradient(170deg,#FBF8F2,#F8F7F4 55%,var(--bg-page))"}}>
                  <div style={{width: "100%", maxWidth: "860px", margin: "0 auto", animation: "hmRise 600ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                    <div style={{display: "flex", alignItems: "center", gap: "11px", marginBottom: "56px"}}>
                      <img src="handymate-dashboard/public/logo.png" alt="Handymate" style={{width: "34px", height: "34px", borderRadius: "8px", objectFit: "cover"}} />
                      <span style={{fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "19px", letterSpacing: "-.01em"}}>
                        Handymate
                      </span>
                    </div>
                    <p style={{fontSize: "11px", fontWeight: "700", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--teal-700)", margin: "0 0 20px"}}>
                      Företagsgenomgång
                    </p>
                    <h1 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(36px,5.2vw,62px)", fontWeight: "700", lineHeight: "1.06", letterSpacing: "-.028em", color: "var(--slate-900)"}}>
                      Vilket företag pratar vi om idag?
                    </h1>
                    <p style={{fontSize: "19px", lineHeight: "1.6", color: "var(--slate-500)", margin: "22px 0 0", maxWidth: "560px"}}>
                      Skriv in organisationsnumret, så hämtar vi företaget och bygger genomgången utifrån det.
                    </p>
                    <div style={{display: "flex", gap: "14px", marginTop: "48px", maxWidth: "720px"}}>
                      <div style={{flex: "1", position: "relative"}}>
                        <label htmlFor="orgfield" style={{display: "block", fontSize: "12px", fontWeight: "700", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--fg-muted)", marginBottom: "10px"}}>
                          Organisationsnummer
                        </label>
                        <input id="orgfield" value={v.org} onChange={v.setOrg} onKeyDown={v.orgKey} placeholder="556XXX-XXXX" autoComplete="off" style={{width: "100%", height: "76px", border: "1px solid var(--border)", borderRadius: "16px", padding: "0 24px", fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: "500", letterSpacing: ".02em", color: "var(--slate-900)", background: "#fff", outline: "none", transition: "box-shadow 180ms,border-color 180ms"}} className="hx3" />
                      </div>
                      <div style={{display: "flex", flexDirection: "column", justifyContent: "flex-end"}}>
                        <button onClick={v.submitLookup} style={{height: "76px", padding: "0 34px", borderRadius: "16px", background: `${v.ctaBg}`, color: "#fff", fontSize: "17px", fontWeight: "600", boxShadow: "0 4px 14px rgba(15,118,110,.25)", transition: "background 180ms,transform 180ms"}} className="hx4">
                          Hitta företaget
                        </button>
                      </div>
                    </div>
                    {(v.orgError) ? (
                      <>
                        <p style={{margin: "16px 0 0", fontSize: "14px", lineHeight: "1.5", color: "var(--amber-800)", background: "var(--amber-50)", border: "1px solid var(--amber-200)", borderRadius: "10px", padding: "10px 14px"}}>
                          {v.orgError}
                        </p>
                      </>
                    ) : null}
                    <div style={{display: "flex", alignItems: "center", gap: "10px", marginTop: "20px"}}>
                      <span style={{fontSize: "14px", color: "var(--fg-muted)"}}>
                        Uppgifterna hämtas från Bolagsverket.
                      </span>
                      <button onClick={v.fillDemo} style={{fontSize: "13px", fontWeight: "600", color: "var(--teal-700)", padding: "4px 10px", border: "1px solid var(--teal-100)", background: "var(--teal-50)", borderRadius: "999px"}} className="hx5">
                        Fyll i demoexempel
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
            {(v.isLoading) ? (
              <>
                <section style={{flex: "1", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "80px 48px", gap: "38px", background: "linear-gradient(170deg,#FBF8F2,#F8F7F4 55%,var(--bg-page))"}}>
                  <div style={{position: "relative", width: "52px", height: "52px"}}>
                    <div style={{position: "absolute", inset: "0", borderRadius: "50%", border: "2px solid var(--border)"}} />
                    <div style={{position: "absolute", inset: "0", borderRadius: "50%", border: "2px solid transparent", borderTopColor: "var(--teal-700)", animation: "hmSpin 900ms linear infinite"}} />
                  </div>
                  <div style={{textAlign: "center"}}>
                    <p style={{fontFamily: "var(--font-heading)", fontSize: "26px", fontWeight: "600", letterSpacing: "-.02em", margin: "0"}}>
                      Vi hämtar företaget…
                    </p>
                    <p style={{fontFamily: "var(--font-mono)", fontSize: "15px", color: "var(--slate-500)", margin: "12px 0 0"}}>
                      {v.org}
                    </p>
                  </div>
                  <div style={{display: "flex", flexDirection: "column", gap: "13px", width: "300px"}}>
                    <p style={{margin: "0", fontSize: "14px", color: "var(--fg-muted)", animation: "hmFade 400ms 200ms backwards"}}>
                      Slår upp organisationsnumret
                    </p>
                    <p style={{margin: "0", fontSize: "14px", color: "var(--fg-muted)", animation: "hmFade 400ms 900ms backwards"}}>
                      Hämtar bransch, säte och storlek
                    </p>
                    <p style={{margin: "0", fontSize: "14px", color: "var(--fg-muted)", animation: "hmFade 400ms 1600ms backwards"}}>
                      Förbereder genomgången
                    </p>
                  </div>
                </section>
              </>
            ) : null}
            {(v.isReveal) ? (
              <>
                <section style={{flex: "1", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "80px 48px", textAlign: "center", background: "linear-gradient(170deg,#FBF8F2,#F8F7F4 55%,var(--bg-page))"}}>
                  <div style={{display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "nowrap", gap: "clamp(18px,3.2vw,40px)", width: "100%", maxWidth: "1180px"}}>
                    <h1 style={{flex: "0 1 auto", minWidth: "0", textAlign: "right", fontFamily: "var(--font-heading)", fontSize: "clamp(30px,4.6vw,64px)", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.05", color: "var(--slate-900)", animation: "hmLeft 800ms cubic-bezier(.2,.8,.2,1) 100ms backwards"}}>
                      {v.companyName}
                    </h1>
                    <div style={{position: "relative", width: "clamp(52px,9vw,132px)", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", flex: "none"}}>
                      <span style={{position: "absolute", left: "0", right: "0", height: "1px", background: "var(--slate-300)", animation: "hmLine 700ms cubic-bezier(.2,.8,.2,1) 700ms backwards"}} />
                      <span style={{position: "absolute", width: "26px", height: "26px", borderRadius: "50%", border: "1px solid var(--teal-700)", animation: "hmHalo 1800ms ease-out 1500ms infinite"}} />
                      <span style={{position: "relative", width: "11px", height: "11px", borderRadius: "50%", background: "var(--teal-700)", animation: "hmNode 500ms cubic-bezier(.34,1.56,.64,1) 1200ms backwards"}} />
                    </div>
                    <div style={{display: "flex", alignItems: "center", gap: "clamp(9px,1.4vw,16px)", flex: "none", animation: "hmRight 800ms cubic-bezier(.2,.8,.2,1) 500ms backwards"}}>
                      <img src="handymate-dashboard/public/logo.png" alt="" style={{width: "clamp(30px,4.2vw,56px)", height: "clamp(30px,4.2vw,56px)", borderRadius: "14px", objectFit: "cover", flex: "none"}} />
                      <span style={{fontFamily: "var(--font-heading)", fontSize: "clamp(30px,4.6vw,64px)", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.05", color: "var(--teal-700)", whiteSpace: "nowrap"}}>
                        Handymate
                      </span>
                    </div>
                  </div>
                  <p style={{fontSize: "clamp(18px,2vw,24px)", lineHeight: "1.5", color: "var(--slate-800)", margin: "clamp(40px,6vw,64px) 0 0", maxWidth: "620px", animation: "hmRise 700ms cubic-bezier(.2,.8,.2,1) 1700ms backwards"}}>
                    Låt oss se hur Handymate kan hjälpa {v.companyShort}.
                  </p>
                  <div style={{display: "flex", alignItems: "center", gap: "22px", flexWrap: "wrap", justifyContent: "center", margin: "clamp(32px,4.5vw,46px) 0 0", padding: "14px 28px 14px 14px", borderRadius: "999px", border: "1px solid var(--border)", background: "#fff", boxShadow: "0 8px 28px rgba(15,118,110,.1)", animation: "hmRise 700ms cubic-bezier(.2,.8,.2,1) 2100ms backwards"}}>
                    <div style={{display: "flex", alignItems: "center", gap: "16px"}}>
                      <div style={{position: "relative", flex: "none", animation: "hmPop 500ms cubic-bezier(.2,.8,.2,1) 2300ms backwards"}}>
                        <img src={v.matteAvatar} alt="" style={{width: "58px", height: "58px", borderRadius: "50%", objectFit: "cover", border: "2.5px solid rgba(94,234,212,.55)", background: "var(--teal-50)"}} />
                        <span style={{position: "absolute", right: "1px", bottom: "1px", width: "13px", height: "13px", borderRadius: "50%", background: "#4ade80", border: "2.5px solid #fff"}} />
                      </div>
                      <div style={{textAlign: "left"}}>
                        <p style={{margin: "0", fontSize: "10px", fontWeight: "700", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--teal-700)"}}>
                          Chefsassistent
                        </p>
                        <p style={{margin: "6px 0 0", fontSize: "17px", lineHeight: "1.4", color: "var(--slate-800)"}}>
                          <span style={{fontWeight: "600", color: "var(--slate-900)"}}>
                            Matte
                          </span>
                          har redan hämtat allt som finns om {v.companyShort}.
                        </p>
                      </div>
                    </div>
                    <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                      <div style={{display: "flex", alignItems: "center"}}>
                        <img src={v.team1} alt="" style={{width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)", animation: "hmPop 400ms cubic-bezier(.2,.8,.2,1) 2500ms backwards"}} />
                        <img src={v.team2} alt="" style={{width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)", marginLeft: "-12px", animation: "hmPop 400ms cubic-bezier(.2,.8,.2,1) 2600ms backwards"}} />
                        <img src={v.team3} alt="" style={{width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)", marginLeft: "-12px", animation: "hmPop 400ms cubic-bezier(.2,.8,.2,1) 2700ms backwards"}} />
                        <img src={v.team4} alt="" style={{width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)", marginLeft: "-12px", animation: "hmPop 400ms cubic-bezier(.2,.8,.2,1) 2800ms backwards"}} />
                        <img src={v.team5} alt="" style={{width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)", marginLeft: "-12px", animation: "hmPop 400ms cubic-bezier(.2,.8,.2,1) 2900ms backwards"}} />
                      </div>
                      <p style={{margin: "0", textAlign: "left", fontSize: "14px", lineHeight: "1.35", color: "var(--slate-500)", animation: "hmFade 500ms 3000ms backwards"}}>
                        och fem kollegor
                        <br />
                        redan på plats
                      </p>
                    </div>
                  </div>
                  <button onClick={v.next} style={{marginTop: "40px", height: "56px", padding: "0 34px", borderRadius: "16px", background: "var(--teal-700)", color: "#fff", fontSize: "17px", fontWeight: "600", boxShadow: "0 4px 14px rgba(15,118,110,.25)", animation: "hmFade 600ms 3200ms backwards", transition: "background 180ms,transform 180ms"}} className="hx6">
                    Börja genomgången
                  </button>
                </section>
              </>
            ) : null}
            {(v.isProfile) ? (
              <>
                <section style={{flex: "1", padding: "72px 48px 96px", background: "linear-gradient(170deg,#FBF8F2,#F8F7F4 55%,var(--bg-page))", animation: "hmRise 450ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                  <div style={{width: "100%", maxWidth: "1080px", margin: "0 auto"}}>
                    <p style={{fontSize: "11px", fontWeight: "700", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--teal-700)", margin: "0 0 16px"}}>
                      Det här vet vi redan
                    </p>
                    <h1 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(32px,4vw,48px)", fontWeight: "700", letterSpacing: "-.028em", lineHeight: "1.08"}}>
                      {v.companyName}
                    </h1>
                    <p style={{margin: "22px 0 0", display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "14px", color: "var(--teal-700)"}}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: "15px", height: "15px", flex: "none"}}>
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      {v.sourceLabel} · {v.companyOrg}
                    </p>
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: "34px 44px", marginTop: "34px", paddingTop: "30px", borderTop: "1px solid var(--border)"}}>
                      {(v.facts || []).map((f, $i0) => (
                        <React.Fragment key={$i0}>
                            <div style={{minWidth: "0", animation: "hmRise 450ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                              <p style={{margin: "0", fontSize: "10px", fontWeight: "700", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--slate-400)"}}>
                                {f.label}
                              </p>
                              <p style={{margin: "11px 0 0", fontFamily: "var(--font-heading)", fontSize: "21px", fontWeight: "600", letterSpacing: "-.015em", color: "var(--slate-900)", lineHeight: "1.3"}}>
                                {f.value}
                              </p>
                            </div>
                        </React.Fragment>
                      ))}
                    </div>
                    {(v.hasYears) ? (
                      <>
                        <div style={{marginTop: "56px", paddingTop: "34px", borderTop: "1px solid var(--border)"}}>
                          <div style={{display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "24px", flexWrap: "wrap"}}>
                            <p style={{margin: "0", fontSize: "10px", fontWeight: "700", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--slate-400)"}}>
                              Tre senaste boksluten
                            </p>
                            <div style={{display: "flex", alignItems: "center", gap: "20px"}}>
                              <span style={{display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--slate-500)"}}>
                                <span style={{width: "11px", height: "11px", borderRadius: "3px", background: "var(--teal-600)"}} />
                                Omsättning
                              </span>
                              <span style={{display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--slate-500)"}}>
                                <span style={{width: "11px", height: "11px", borderRadius: "50%", background: "var(--amber-500)"}} />
                                Vinstmarginal
                              </span>
                            </div>
                          </div>
                          <svg viewBox="0 0 600 170" style={{width: "100%", height: "auto", display: "block", marginTop: "18px", overflow: "visible"}}>
                            {(v.finBars || []).map((b, $i0) => (
                              <React.Fragment key={$i0}>
                                  <rect x={b.x} y={b.y} width="104" height={b.h} rx="6" fill="var(--teal-600)" style={{transformBox: "fill-box", transformOrigin: "bottom", animation: "hmGrow 800ms cubic-bezier(.2,.8,.2,1) backwards"}} />
                              </React.Fragment>
                            ))}
                            <path d={v.finLine} fill="none" stroke="var(--amber-500)" strokeWidth="2.5" strokeLinecap="round" pathLength="1" strokeDasharray="1" style={{animation: "hmDraw 900ms cubic-bezier(.2,.8,.2,1) 700ms backwards"}} />
                            {(v.finDots || []).map((d, $i0) => (
                              <React.Fragment key={$i0}>
                                  <circle cx={d.cx} cy={d.cy} r="5.5" fill="#fff" stroke="var(--amber-500)" strokeWidth="2.5" style={{animation: "hmPop 400ms cubic-bezier(.2,.8,.2,1) 1100ms backwards"}} />
                              </React.Fragment>
                            ))}
                          </svg>
                          <div style={{display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px", marginTop: "16px"}}>
                            {(v.finYears || []).map((y, $i0) => (
                              <React.Fragment key={$i0}>
                                  <div style={{textAlign: "center"}}>
                                    <p style={{margin: "0", fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--slate-400)", fontVariantNumeric: "tabular-nums"}}>
                                      {y.y}
                                    </p>
                                    <p style={{margin: "8px 0 0", fontFamily: "var(--font-heading)", fontSize: "21px", fontWeight: "600", letterSpacing: "-.015em", color: "var(--slate-900)", fontVariantNumeric: "tabular-nums"}}>
                                      {y.rev}
                                    </p>
                                    <p style={{margin: "6px 0 0", fontSize: "14px", color: "var(--slate-500)", fontVariantNumeric: "tabular-nums"}}>
                                      {y.res} i resultat ·
                                      <span style={{color: "var(--amber-700)", fontWeight: "600"}}>
                                        {y.margin}
                                      </span>
                                    </p>
                                  </div>
                              </React.Fragment>
                            ))}
                          </div>
                          <p style={{margin: "26px 0 0", fontSize: "18px", lineHeight: "1.55", color: "var(--slate-800)", maxWidth: "760px"}}>
                            {v.finRead}
                          </p>
                        </div>
                      </>
                    ) : null}
                    <p style={{fontSize: "17px", color: "var(--slate-500)", margin: "52px 0 0"}}>
                      Två saker till, som inte står i något register.
                    </p>
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "32px", marginTop: "24px"}}>
                      <div>
                        <h2 style={{fontFamily: "var(--font-heading)", fontSize: "24px", fontWeight: "600", letterSpacing: "-.02em", lineHeight: "1.3"}}>
                          Hur många är ni som jobbar aktivt i verksamheten?
                        </h2>
                        <div style={{marginTop: "20px", maxWidth: "440px"}}>
                          <div style={{display: "flex", alignItems: "baseline", gap: "10px"}}>
                            <span style={{fontFamily: "var(--font-mono)", fontSize: "44px", fontWeight: "500", fontVariantNumeric: "tabular-nums", lineHeight: "1", color: "var(--slate-900)"}}>
                              {v.employees}
                            </span>
                            <span style={{fontSize: "18px", color: "var(--slate-500)"}}>
                              personer
                            </span>
                          </div>
                          <input type="range" min="1" max="40" step="1" value={v.employees} onChange={v.empSet} style={{display: "block", width: "100%", margin: "20px 0 0", background: `${v.empTrack}`}} />
                          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginTop: "12px"}}>
                            <span style={{fontSize: "13px", color: "var(--slate-400)", fontVariantNumeric: "tabular-nums"}}>
                              1
                            </span>
                            <span style={{fontSize: "14px", color: "var(--fg-muted)"}}>
                              {v.employeesHint}
                            </span>
                            <span style={{fontSize: "13px", color: "var(--slate-400)", fontVariantNumeric: "tabular-nums"}}>
                              40+
                            </span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h2 style={{fontFamily: "var(--font-heading)", fontSize: "24px", fontWeight: "600", letterSpacing: "-.02em", lineHeight: "1.3"}}>
                          Ungefär hur många jobb hanterar ni per månad?
                        </h2>
                        <div style={{display: "flex", gap: "10px", marginTop: "22px", flexWrap: "wrap"}}>
                          {(v.jobOptions || []).map((o, $i0) => (
                            <React.Fragment key={$i0}>
                                <button onClick={o.pick} style={{height: "52px", padding: "0 22px", borderRadius: "14px", border: `1.5px solid ${o.bc}`, background: `${o.bg}`, color: `${o.fg}`, fontSize: "16px", fontWeight: "600", transition: "all 180ms"}} className="hx7">
                                  {o.label}
                                </button>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{marginTop: "64px"}}>
                      <button onClick={v.next} disabled={v.profileLocked} style={{height: "56px", padding: "0 34px", borderRadius: "16px", background: `${v.profileCtaBg}`, color: `${v.profileCtaFg}`, fontSize: "17px", fontWeight: "600", transition: "background 180ms"}}>
                        Fortsätt
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
            {(v.isPain) ? (
              <>
                <section style={{flex: "1", padding: "72px 48px 96px", background: "linear-gradient(168deg,#EEF2F5,#E7EDF1 60%,#E4EAEF)", animation: "hmFade 450ms backwards"}}>
                  <div style={{width: "100%", maxWidth: "1080px", margin: "0 auto"}}>
                    <p style={{fontSize: "11px", fontWeight: "700", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--teal-700)", margin: "0 0 18px"}}>
                      Där det tar emot
                    </p>
                    <h1 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(32px,4.4vw,52px)", fontWeight: "700", letterSpacing: "-.028em", lineHeight: "1.08", maxWidth: "760px", color: "var(--slate-900)"}}>
                      Vad skulle göra störst skillnad för er?
                    </h1>
                    <p style={{fontSize: "19px", color: "var(--slate-600)", margin: "20px 0 40px", maxWidth: "820px"}}>
                      Det viktigaste först — genomgången utgår från det. Känner ni igen er i fler kan ni lägga till två, så tar vi med dem också.
                    </p>
                    <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>
                      <button onClick={v.pc1.pick} style={{display: "flex", alignItems: "center", gap: "24px", textAlign: "left", width: "100%", padding: "22px 26px", borderRadius: "18px", border: `1.5px solid ${v.pc1.bc}`, background: `${v.pc1.bg}`, boxShadow: `${v.pc1.sh}`, transition: "all 260ms cubic-bezier(.2,.8,.2,1)", animation: "hmRise 480ms cubic-bezier(.2,.8,.2,1) 0ms backwards"}} className="hx8">
                        <span style={{flex: "none", width: "54px", height: "54px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", background: `${v.pc1.ib}`, transition: "background 260ms"}}>
                          <svg viewBox="0 0 24 24" fill="none" stroke={v.pc1.ic} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width: "29px", height: "29px"}}>
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3.2 1.9" />
                          </svg>
                        </span>
                        <div style={{flex: "1", minWidth: "0"}}>
                          <div style={{display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap"}}>
                            <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: "25px", fontWeight: "600", letterSpacing: "-.02em", color: "var(--slate-900)"}}>
                              Ge mig tillbaka min tid
                            </p>
                            {(v.pc1.rank) ? (
                              <>
                                <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: `${v.pc1.rfg}`, background: `${v.pc1.rbg}`, padding: "4px 11px", borderRadius: "999px", animation: "hmPop 320ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                                  {v.pc1.rank}
                                </span>
                              </>
                            ) : null}
                          </div>
                          <p style={{margin: "6px 0 0", fontSize: "17px", color: "var(--slate-600)", lineHeight: "1.5"}}>
                            Jag drunknar i administration. Dokumentation och efterarbete tar tid från själva jobbet.
                          </p>
                        </div>
                        <div style={{flex: "none", display: "flex", alignItems: "center", gap: "12px"}}>
                          <div style={{display: "flex", alignItems: "center", opacity: `${v.pc1.aop}`, transition: "opacity 260ms"}}>
                            <img src={v.pc1.av1} alt="" style={{width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)"}} />
                            <img src={v.pc1.av2} alt="" style={{width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)", marginLeft: "-11px"}} />
                          </div>
                          <span style={{fontSize: "19px", color: `${v.pc1.ic}`, width: "20px", textAlign: "center"}}>
                            {v.pc1.mark}
                          </span>
                        </div>
                      </button>
                      <button onClick={v.pc2.pick} style={{display: "flex", alignItems: "center", gap: "24px", textAlign: "left", width: "100%", padding: "22px 26px", borderRadius: "18px", border: `1.5px solid ${v.pc2.bc}`, background: `${v.pc2.bg}`, boxShadow: `${v.pc2.sh}`, transition: "all 260ms cubic-bezier(.2,.8,.2,1)", animation: "hmRise 480ms cubic-bezier(.2,.8,.2,1) 70ms backwards"}} className="hx9">
                        <span style={{flex: "none", width: "54px", height: "54px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", background: `${v.pc2.ib}`, transition: "background 260ms"}}>
                          <svg viewBox="0 0 24 24" fill="none" stroke={v.pc2.ic} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width: "29px", height: "29px"}}>
                            <rect x="2" y="6" width="20" height="12" rx="2" />
                            <circle cx="12" cy="12" r="2.5" />
                            <path d="M6 12h.01M18 12h.01" />
                          </svg>
                        </span>
                        <div style={{flex: "1", minWidth: "0"}}>
                          <div style={{display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap"}}>
                            <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: "25px", fontWeight: "600", letterSpacing: "-.02em", color: "var(--slate-900)"}}>
                              Hjälp mig få betalt snabbare
                            </p>
                            {(v.pc2.rank) ? (
                              <>
                                <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: `${v.pc2.rfg}`, background: `${v.pc2.rbg}`, padding: "4px 11px", borderRadius: "999px", animation: "hmPop 320ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                                  {v.pc2.rank}
                                </span>
                              </>
                            ) : null}
                          </div>
                          <p style={{margin: "6px 0 0", fontSize: "17px", color: "var(--slate-600)", lineHeight: "1.5"}}>
                            Vi tappar pengar mellan jobb och faktura. Timmar, material eller ÄTA saknas när jobbet är klart.
                          </p>
                        </div>
                        <div style={{flex: "none", display: "flex", alignItems: "center", gap: "12px"}}>
                          <div style={{display: "flex", alignItems: "center", opacity: `${v.pc2.aop}`, transition: "opacity 260ms"}}>
                            <img src={v.pc2.av1} alt="" style={{width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)"}} />
                            <img src={v.pc2.av2} alt="" style={{width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)", marginLeft: "-11px"}} />
                          </div>
                          <span style={{fontSize: "19px", color: `${v.pc2.ic}`, width: "20px", textAlign: "center"}}>
                            {v.pc2.mark}
                          </span>
                        </div>
                      </button>
                      <button onClick={v.pc3.pick} style={{display: "flex", alignItems: "center", gap: "24px", textAlign: "left", width: "100%", padding: "22px 26px", borderRadius: "18px", border: `1.5px solid ${v.pc3.bc}`, background: `${v.pc3.bg}`, boxShadow: `${v.pc3.sh}`, transition: "all 260ms cubic-bezier(.2,.8,.2,1)", animation: "hmRise 480ms cubic-bezier(.2,.8,.2,1) 140ms backwards"}} className="hx10">
                        <span style={{flex: "none", width: "54px", height: "54px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", background: `${v.pc3.ib}`, transition: "background 260ms"}}>
                          <svg viewBox="0 0 24 24" fill="none" stroke={v.pc3.ic} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width: "29px", height: "29px"}}>
                            <path d="M3 17l6-6 4 4 7-7" />
                            <path d="M14 8h6v6" />
                          </svg>
                        </span>
                        <div style={{flex: "1", minWidth: "0"}}>
                          <div style={{display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap"}}>
                            <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: "25px", fontWeight: "600", letterSpacing: "-.02em", color: "var(--slate-900)"}}>
                              Hjälp mig vinna mer av affärerna jag redan har
                            </p>
                            {(v.pc3.rank) ? (
                              <>
                                <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: `${v.pc3.rfg}`, background: `${v.pc3.rbg}`, padding: "4px 11px", borderRadius: "999px", animation: "hmPop 320ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                                  {v.pc3.rank}
                                </span>
                              </>
                            ) : null}
                          </div>
                          <p style={{margin: "6px 0 0", fontSize: "17px", color: "var(--slate-600)", lineHeight: "1.5"}}>
                            Vi följer inte upp offerter och kunder tillräckligt. Offerter blir liggande.
                          </p>
                        </div>
                        <div style={{flex: "none", display: "flex", alignItems: "center", gap: "12px"}}>
                          <div style={{display: "flex", alignItems: "center", opacity: `${v.pc3.aop}`, transition: "opacity 260ms"}}>
                            <img src={v.pc3.av1} alt="" style={{width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)"}} />
                            <img src={v.pc3.av2} alt="" style={{width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)", marginLeft: "-11px"}} />
                          </div>
                          <span style={{fontSize: "19px", color: `${v.pc3.ic}`, width: "20px", textAlign: "center"}}>
                            {v.pc3.mark}
                          </span>
                        </div>
                      </button>
                      <button onClick={v.pc4.pick} style={{display: "flex", alignItems: "center", gap: "24px", textAlign: "left", width: "100%", padding: "22px 26px", borderRadius: "18px", border: `1.5px solid ${v.pc4.bc}`, background: `${v.pc4.bg}`, boxShadow: `${v.pc4.sh}`, transition: "all 260ms cubic-bezier(.2,.8,.2,1)", animation: "hmRise 480ms cubic-bezier(.2,.8,.2,1) 210ms backwards"}} className="hx11">
                        <span style={{flex: "none", width: "54px", height: "54px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", background: `${v.pc4.ib}`, transition: "background 260ms"}}>
                          <svg viewBox="0 0 24 24" fill="none" stroke={v.pc4.ic} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width: "29px", height: "29px"}}>
                            <path d="M12 3l7.5 3v5.6c0 4.4-3.1 8.2-7.5 9.4-4.4-1.2-7.5-5-7.5-9.4V6z" />
                            <path d="M9 12l2 2 4-4" />
                          </svg>
                        </span>
                        <div style={{flex: "1", minWidth: "0"}}>
                          <div style={{display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap"}}>
                            <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: "25px", fontWeight: "600", letterSpacing: "-.02em", color: "var(--slate-900)"}}>
                              Ge mig kontroll innan projekten går fel
                            </p>
                            {(v.pc4.rank) ? (
                              <>
                                <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: `${v.pc4.rfg}`, background: `${v.pc4.rbg}`, padding: "4px 11px", borderRadius: "999px", animation: "hmPop 320ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                                  {v.pc4.rank}
                                </span>
                              </>
                            ) : null}
                          </div>
                          <p style={{margin: "6px 0 0", fontSize: "17px", color: "var(--slate-600)", lineHeight: "1.5"}}>
                            Jag saknar kontroll över jobben. Problem upptäcks när de redan kostat pengar.
                          </p>
                        </div>
                        <div style={{flex: "none", display: "flex", alignItems: "center", gap: "12px"}}>
                          <div style={{display: "flex", alignItems: "center", opacity: `${v.pc4.aop}`, transition: "opacity 260ms"}}>
                            <img src={v.pc4.av1} alt="" style={{width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)"}} />
                            <img src={v.pc4.av2} alt="" style={{width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)", marginLeft: "-11px"}} />
                          </div>
                          <span style={{fontSize: "19px", color: `${v.pc4.ic}`, width: "20px", textAlign: "center"}}>
                            {v.pc4.mark}
                          </span>
                        </div>
                      </button>
                      <button onClick={v.pc5.pick} style={{display: "flex", alignItems: "center", gap: "24px", textAlign: "left", width: "100%", padding: "22px 26px", borderRadius: "18px", border: `1.5px solid ${v.pc5.bc}`, background: `${v.pc5.bg}`, boxShadow: `${v.pc5.sh}`, transition: "all 260ms cubic-bezier(.2,.8,.2,1)", animation: "hmRise 480ms cubic-bezier(.2,.8,.2,1) 280ms backwards"}} className="hx12">
                        <span style={{flex: "none", width: "54px", height: "54px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", background: `${v.pc5.ib}`, transition: "background 260ms"}}>
                          <svg viewBox="0 0 24 24" fill="none" stroke={v.pc5.ic} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width: "29px", height: "29px"}}>
                            <circle cx="12" cy="5" r="2.5" />
                            <circle cx="5" cy="18" r="2.5" />
                            <circle cx="19" cy="18" r="2.5" />
                            <path d="M12 7.5v4M12 11.5L6.5 16M12 11.5L17.5 16" />
                          </svg>
                        </span>
                        <div style={{flex: "1", minWidth: "0"}}>
                          <div style={{display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap"}}>
                            <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: "25px", fontWeight: "600", letterSpacing: "-.02em", color: "var(--slate-900)"}}>
                              Gör företaget mindre beroende av mig
                            </p>
                            {(v.pc5.rank) ? (
                              <>
                                <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: `${v.pc5.rfg}`, background: `${v.pc5.rbg}`, padding: "4px 11px", borderRadius: "999px", animation: "hmPop 320ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                                  {v.pc5.rank}
                                </span>
                              </>
                            ) : null}
                          </div>
                          <p style={{margin: "6px 0 0", fontSize: "17px", color: "var(--slate-600)", lineHeight: "1.5"}}>
                            För mycket måste gå genom mig. Normala beslut väntar på ägaren och bromsar hela firman.
                          </p>
                        </div>
                        <div style={{flex: "none", display: "flex", alignItems: "center", gap: "12px"}}>
                          <div style={{display: "flex", alignItems: "center", opacity: `${v.pc5.aop}`, transition: "opacity 260ms"}}>
                            <img src={v.pc5.av1} alt="" style={{width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)"}} />
                            <img src={v.pc5.av2} alt="" style={{width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", background: "var(--slate-100)", marginLeft: "-11px"}} />
                          </div>
                          <span style={{fontSize: "19px", color: `${v.pc5.ic}`, width: "20px", textAlign: "center"}}>
                            {v.pc5.mark}
                          </span>
                        </div>
                      </button>
                    </div>
                    {(v.hasPain) ? (
                      <>
                        <div style={{display: "flex", alignItems: "center", gap: "24px", marginTop: "44px", paddingTop: "32px", borderTop: "1px solid var(--border)", animation: "hmRise 450ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                          <div style={{flex: "1", minWidth: "0"}}>
                            <p style={{margin: "0", fontSize: "19px", color: "var(--slate-900)", lineHeight: "1.5"}}>
                              {v.painAck}
                            </p>
                            {(v.painAlso) ? (
                              <>
                                <p style={{margin: "10px 0 0", fontSize: "16px", color: "var(--slate-600)", lineHeight: "1.5"}}>
                                  {v.painAlso}
                                </p>
                              </>
                            ) : null}
                          </div>
                          <button onClick={v.next} style={{flex: "none", height: "56px", padding: "0 34px", borderRadius: "16px", background: "var(--teal-700)", color: "#fff", fontSize: "17px", fontWeight: "600", boxShadow: "0 4px 14px rgba(15,118,110,.25)", transition: "transform 180ms"}} className="hx13">
                            Fortsätt
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}
            {(v.isDiagnos) ? (
              <>
                <section style={{flex: "1", padding: "72px 48px 96px", background: "linear-gradient(168deg,#EAF1EC,#E4EDE7)", animation: "hmFade 450ms backwards"}}>
                  <div style={{width: "100%", maxWidth: "1080px", margin: "0 auto"}}>
                    <p style={{fontSize: "11px", fontWeight: "700", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--teal-700)", margin: "0 0 18px"}}>
                      {v.painLabel}
                    </p>
                    <h1 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(28px,3.6vw,42px)", fontWeight: "700", letterSpacing: "-.026em", lineHeight: "1.14", maxWidth: "820px", color: "var(--slate-900)"}}>
                      {v.q1title}
                    </h1>
                    <div style={{display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginTop: "30px"}}>
                      {(v.q1options || []).map((o, $i0) => (
                        <React.Fragment key={$i0}>
                            <button onClick={o.pick} style={{height: "96px", borderRadius: "16px", border: `1.5px solid ${o.bc}`, background: `${o.bg}`, color: `${o.fg}`, fontFamily: "var(--font-heading)", fontSize: "22px", fontWeight: "600", letterSpacing: "-.01em", transition: "all 180ms"}} className="hx14">
                              {o.label}
                            </button>
                        </React.Fragment>
                      ))}
                    </div>
                    {(v.hasQ1) ? (
                      <>
                        <div style={{marginTop: "72px", animation: "hmRise 500ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                          <h2 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(28px,3.6vw,42px)", fontWeight: "700", letterSpacing: "-.026em", lineHeight: "1.14", maxWidth: "820px", color: "var(--slate-900)"}}>
                            {v.q2title}
                          </h2>
                          <div style={{display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginTop: "30px"}}>
                            {(v.q2options || []).map((o, $i0) => (
                              <React.Fragment key={$i0}>
                                  <button onClick={o.pick} style={{minHeight: "96px", padding: "16px", borderRadius: "16px", border: `1.5px solid ${o.bc}`, background: `${o.bg}`, color: `${o.fg}`, fontFamily: "var(--font-heading)", fontSize: "20px", fontWeight: "600", letterSpacing: "-.01em", lineHeight: "1.25", transition: "all 180ms"}} className="hx15">
                                    {o.label}
                                  </button>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}
                    {(v.hasQ2) ? (
                      <>
                        <div style={{marginTop: "64px", paddingTop: "40px", borderTop: "1px solid var(--border)", animation: "hmRise 600ms cubic-bezier(.2,.8,.2,1) 200ms backwards"}}>
                          <p style={{margin: "0", fontSize: "11px", fontWeight: "700", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--fg-muted)"}}>
                            Så här ligger det idag
                          </p>
                          <div style={{display: "flex", flexWrap: "wrap", gap: "18px", marginTop: "24px"}}>
                            {(v.objSpread || []).map((o, $i0) => (
                              <React.Fragment key={$i0}>
                                  <div style={{minWidth: "210px", padding: "20px 22px", borderRadius: "14px", border: "1px dashed var(--slate-300)", background: "rgba(255,255,255,.66)", transform: `${o.tf}`, animation: "hmRise 550ms cubic-bezier(.2,.8,.2,1) 400ms backwards"}}>
                                    <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: "600", letterSpacing: "-.015em", color: "var(--slate-900)"}}>
                                      {o.name}
                                    </p>
                                    <p style={{margin: "7px 0 0", fontSize: "15px", color: "var(--slate-600)"}}>
                                      {o.before}
                                    </p>
                                  </div>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                        <div style={{marginTop: "56px", animation: "hmFade 450ms backwards"}}>
                          <button onClick={v.next} style={{height: "56px", padding: "0 34px", borderRadius: "16px", background: "var(--teal-700)", color: "#fff", fontSize: "17px", fontWeight: "600", boxShadow: "0 4px 14px rgba(15,118,110,.25)", transition: "transform 180ms"}} className="hx16">
                            Visa vad vi hört
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}
            {(v.isSummary) ? (
              <>
                <section style={{flex: "1", display: "flex", flexDirection: "column", justifyContent: "center", padding: "88px 48px", background: "linear-gradient(150deg,#E6EFE9,#E4F2EB)", animation: "hmFade 500ms backwards"}}>
                  <div style={{width: "100%", maxWidth: "1080px", margin: "0 auto"}}>
                    <p style={{fontSize: "11px", fontWeight: "700", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--teal-700)", margin: "0 0 24px", animation: "hmRise 500ms backwards"}}>
                      Sammanfattning
                    </p>
                    <h1 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(32px,4.6vw,54px)", fontWeight: "700", letterSpacing: "-.028em", lineHeight: "1.1", color: "var(--slate-900)", maxWidth: "900px", animation: "hmRise 600ms 100ms backwards"}}>
                      Okej. Då är det här vi skulle fokusera på hos {v.companyShort}.
                    </h1>
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "1px", background: "var(--border)", marginTop: "64px", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)"}}>
                      {(v.summaryRows || []).map((s, $i0) => (
                        <React.Fragment key={$i0}>
                            <div style={{background: "#fff", borderTop: "1px solid var(--border)", padding: "30px 28px", animation: "hmRise 600ms 300ms backwards"}}>
                              <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: `${s.size}`, fontWeight: "700", letterSpacing: "-.02em", color: "var(--teal-700)", fontVariantNumeric: "tabular-nums", lineHeight: "1.1"}}>
                                {s.value}
                              </p>
                              <p style={{margin: "12px 0 0", fontSize: "15px", lineHeight: "1.5", color: "var(--slate-600)"}}>
                                {s.label}
                              </p>
                            </div>
                        </React.Fragment>
                      ))}
                    </div>
                    {(v.hasPainAlso) ? (
                      <>
                        <div style={{display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginTop: "34px", animation: "hmRise 600ms 500ms backwards"}}>
                          <span style={{fontSize: "15px", color: "var(--slate-600)"}}>
                            Vi tar också med:
                          </span>
                          {(v.painAlsoTags || []).map((t, $i0) => (
                            <React.Fragment key={$i0}>
                                <span style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 15px", borderRadius: "999px", background: "#fff", border: "1px solid var(--border)", fontSize: "15px", color: "var(--slate-800)"}}>
                                  {t.t}
                                </span>
                            </React.Fragment>
                          ))}
                        </div>
                      </>
                    ) : null}
                    <button onClick={v.next} style={{marginTop: "56px", height: "56px", padding: "0 34px", borderRadius: "16px", background: "var(--teal-700)", color: "#fff", fontSize: "17px", fontWeight: "600", boxShadow: "0 4px 14px rgba(15,118,110,.25)", animation: "hmFade 600ms 700ms backwards", transition: "transform 180ms"}} className="hx17">
                      Så här skulle vi lösa det
                    </button>
                  </div>
                </section>
              </>
            ) : null}
            {(v.isSolution) ? (
              <>
                <section style={{flex: "1", padding: "72px 48px 96px", background: "linear-gradient(160deg,#e6fffa,#f0fdf9 42%,var(--bg-page))", animation: "hmFade 550ms backwards"}}>
                  <div style={{width: "100%", maxWidth: "1180px", margin: "0 auto"}}>
                    <p style={{fontSize: "11px", fontWeight: "700", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--teal-700)", margin: "0 0 18px"}}>
                      Så fungerar det hos er
                    </p>
                    <h1 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(32px,4.4vw,52px)", fontWeight: "700", letterSpacing: "-.028em", lineHeight: "1.08", maxWidth: "860px"}}>
                      {v.solutionTitle}
                    </h1>
                    {(v.hasObjects) ? (
                      <>
                        <div style={{marginTop: "48px", padding: "28px 30px", borderRadius: "20px", border: "1px solid var(--teal-100)", background: "rgba(255,255,255,.72)"}}>
                          <p style={{margin: "0 0 20px", fontSize: "11px", fontWeight: "700", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--teal-700)"}}>
                            Samma saker, på plats
                          </p>
                          <div style={{display: "flex", alignItems: "stretch", gap: "0", flexWrap: "wrap"}}>
                            {(v.objOrder || []).map((o, $i0) => (
                              <React.Fragment key={$i0}>
                                  <div style={{flex: "1 1 200px", minWidth: "180px", display: "flex", alignItems: "flex-start", gap: "13px", padding: "0 24px 0 0", transformOrigin: "center bottom", animation: `${o.anim}`}}>
                                    <span style={{flex: "none", width: "26px", height: "26px", borderRadius: "50%", background: "var(--teal-700)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "700"}}>
                                      ✓
                                    </span>
                                    <div style={{minWidth: "0"}}>
                                      <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: "600", letterSpacing: "-.015em", color: "var(--slate-900)"}}>
                                        {o.name}
                                      </p>
                                      <p style={{margin: "6px 0 0", fontSize: "15px", lineHeight: "1.5", color: "var(--slate-500)"}}>
                                        {o.after}
                                      </p>
                                    </div>
                                  </div>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}
                    <div style={{display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "0", marginTop: "64px", position: "relative"}}>
                      <div style={{position: "absolute", top: "21px", left: "21px", right: "calc(25% - 21px)", height: "1px", background: "var(--slate-300)"}} />
                      {(v.solutionSteps || []).map((s, $i0) => (
                        <React.Fragment key={$i0}>
                            <div style={{position: "relative", paddingRight: "clamp(14px,2.4vw,32px)", animation: "hmRise 500ms backwards"}}>
                              <div style={{width: "42px", height: "42px", flex: "none", borderRadius: "50%", background: "var(--teal-700)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontSize: "17px", fontWeight: "700", position: "relative", zIndex: "1", boxShadow: "0 0 0 8px var(--bg-page)"}}>
                                {s.n}
                              </div>
                              <p style={{margin: "24px 0 0", fontFamily: "var(--font-heading)", fontSize: "clamp(16px,1.9vw,21px)", fontWeight: "600", letterSpacing: "-.015em", lineHeight: "1.3", color: "var(--slate-900)"}}>
                                {s.title}
                              </p>
                              <p style={{margin: "11px 0 0", fontSize: "clamp(13px,1.4vw,16px)", lineHeight: "1.6", color: "var(--slate-500)"}}>
                                {s.body}
                              </p>
                              <div style={{display: "flex", alignItems: "center", gap: "8px", marginTop: "18px", flexWrap: "wrap"}}>
                                <img src={s.avatar} alt="" style={{width: "26px", height: "26px", borderRadius: "50%", objectFit: "cover", background: "var(--slate-100)", boxShadow: `0 0 0 1.5px ${s.dot}`}} />
                                <span style={{fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--slate-500)"}}>
                                  {s.agent}
                                </span>
                                {(s.soon) ? (
                                  <>
                                    <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".1em", color: "var(--amber-700)", background: "var(--amber-100)", padding: "3px 8px", borderRadius: "999px"}}>
                                      KOMMER
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                        </React.Fragment>
                      ))}
                    </div>
                    <div style={{display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", gap: "clamp(14px,2.4vw,28px)", alignItems: "center", marginTop: "64px"}}>
                      <figure style={{margin: "0", minWidth: "0"}}>
                        <div style={{position: "relative", height: "300px", borderRadius: "18px", overflow: "hidden", background: "var(--slate-100)"}}>
                          <span style={{position: "absolute", top: "14px", left: "14px", zIndex: "1", padding: "6px 12px", borderRadius: "999px", background: "rgba(15,23,42,.72)", color: "#fff", fontSize: "11px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", backdropFilter: "blur(6px)"}}>
                            Idag
                          </span>
                          <img src="assets/sol-before-v2.png" alt="Hantverkaren vid köksbordet på kvällen med kvitton, laptop och anteckningsblock." style={{width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 40%", display: "block"}} />
                        </div>
                        <figcaption style={{margin: "16px 2px 0", fontSize: "15px", lineHeight: "1.55", color: "var(--slate-500)"}}>
                          <span style={{fontWeight: "600", color: "var(--slate-900)"}}>
                            Ikväll.
                          </span>
                          {v.beforeCaption}
                        </figcaption>
                      </figure>
                      <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", flex: "none", animation: "hmPop 500ms cubic-bezier(.2,.8,.2,1) 600ms backwards"}}>
                        <span style={{width: "52px", height: "52px", borderRadius: "50%", background: "var(--teal-700)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(15,118,110,.28)"}}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{width: "24px", height: "24px"}}>
                            <path d="M5 12h14" />
                            <path d="M13 6l6 6-6 6" />
                          </svg>
                        </span>
                        <span style={{fontSize: "11px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--teal-700)", whiteSpace: "nowrap"}}>
                          Handymate
                        </span>
                      </div>
                      <figure style={{margin: "0", minWidth: "0"}}>
                        <div style={{position: "relative", height: "300px", borderRadius: "18px", overflow: "hidden", background: "var(--teal-50)", animation: "hmWipe 950ms cubic-bezier(.2,.8,.2,1) 750ms backwards"}}>
                          <span style={{position: "absolute", top: "14px", left: "14px", zIndex: "1", padding: "6px 12px", borderRadius: "999px", background: "var(--teal-700)", color: "#fff", fontSize: "11px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase"}}>
                            Med Handymate
                          </span>
                          <img src="assets/sol-after.png" alt="Samma hantverkare med mobilen och samlade arbetsanteckningar i dagsljus." style={{width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 45%", display: "block"}} />
                        </div>
                        <figcaption style={{margin: "16px 2px 0", fontSize: "15px", lineHeight: "1.55", color: "var(--slate-500)"}}>
                          <span style={{fontWeight: "600", color: "var(--teal-800)"}}>
                            Med Handymate.
                          </span>
                          {v.afterCaption}
                        </figcaption>
                      </figure>
                    </div>
                    <p style={{margin: "14px 2px 0", fontSize: "13px", color: "var(--fg-muted)"}}>
                      Illustrativa scenarier — inte uppmätta resultat.
                    </p>
                    {(v.solutionNote) ? (
                      <>
                        <p style={{margin: "64px 0 0", padding: "20px 24px", border: "1px solid var(--amber-200)", background: "var(--amber-50)", borderRadius: "14px", fontSize: "15px", lineHeight: "1.6", color: "var(--amber-800)", maxWidth: "820px"}}>
                          {v.solutionNote}
                        </p>
                      </>
                    ) : null}
                    <div style={{marginTop: "56px"}}>
                      <button onClick={v.next} style={{height: "56px", padding: "0 34px", borderRadius: "16px", background: "var(--teal-700)", color: "#fff", fontSize: "17px", fontWeight: "600", boxShadow: "0 4px 14px rgba(15,118,110,.25)", transition: "background 180ms,transform 180ms"}} className="hx18">
                        Så ser dagen ut om 90 dagar
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
            {(v.isVision) ? (
              <>
                <section style={{flex: "1", padding: "72px 48px 96px", background: "linear-gradient(160deg,#F0FDF9,#E6FFFA 50%,#F0FDF9)", animation: "hmFade 550ms backwards"}}>
                  <div style={{width: "100%", maxWidth: "1180px", margin: "0 auto"}}>
                    <p style={{fontSize: "11px", fontWeight: "700", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--teal-700)", margin: "0 0 18px"}}>
                      Målbild · {v.companyShort}
                    </p>
                    <h1 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(34px,5vw,60px)", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.06", maxWidth: "820px", color: "var(--slate-900)", animation: "hmRise 600ms backwards"}}>
                      En vanlig torsdag, om 90 dagar.
                    </h1>
                    <p style={{fontSize: "clamp(18px,2vw,22px)", lineHeight: "1.55", color: "var(--slate-600)", margin: "22px 0 0", maxWidth: "680px", animation: "hmRise 600ms 100ms backwards"}}>
                      {v.visionLead}
                    </p>
                    <div style={{height: "clamp(240px,32vw,420px)", marginTop: "44px", borderRadius: "22px", overflow: "hidden", background: "var(--teal-50)", boxShadow: "0 18px 50px rgba(15,118,110,.14)", animation: "hmRise 800ms cubic-bezier(.2,.8,.2,1) 200ms backwards"}}>
                      <img src="assets/vision-hero.png" alt="Hantverkaren sitter på bryggan med fötterna i vattnet medan barnen badar; mobilen ligger med skärmen ner." style={{width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 55%", display: "block"}} />
                    </div>
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "14px", marginTop: "28px"}}>
                      {(v.visionScenes || []).map((v, $i0) => (
                        <React.Fragment key={$i0}>
                            <div style={{padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid var(--teal-100)", animation: `${v.anim}`}}>
                              <p style={{margin: "0", fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--teal-700)", fontVariantNumeric: "tabular-nums"}}>
                                {v.time}
                              </p>
                              <p style={{margin: "10px 0 0", fontSize: "16px", lineHeight: "1.5", color: "var(--slate-900)"}}>
                                {v.text}
                              </p>
                            </div>
                        </React.Fragment>
                      ))}
                    </div>
                    <p style={{margin: "16px 2px 0", fontSize: "13px", color: "var(--fg-muted)"}}>
                      Illustrativt scenario byggt på det ni berättade — inte ett uppmätt resultat.
                    </p>
                    <div style={{marginTop: "56px"}}>
                      <button onClick={v.next} style={{height: "56px", padding: "0 34px", borderRadius: "16px", background: "var(--teal-700)", color: "#fff", fontSize: "17px", fontWeight: "600", boxShadow: "0 4px 14px rgba(15,118,110,.25)", transition: "background 180ms,transform 180ms"}} className="hx19">
                        Vilka som gör jobbet
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
            {(v.isAgents) ? (
              <>
                <section style={{flex: "1", padding: "72px 48px 96px", animation: "hmRise 450ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                  <div style={{width: "100%", maxWidth: "1080px", margin: "0 auto"}}>
                    <p style={{fontSize: "11px", fontWeight: "700", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--teal-700)", margin: "0 0 18px"}}>
                      Era AI-kollegor
                    </p>
                    <h1 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(32px,4.4vw,52px)", fontWeight: "700", letterSpacing: "-.028em", lineHeight: "1.08", maxWidth: "840px"}}>
                      Ett verktyg väntar på dig. Ett team jobbar när du inte gör det.
                    </h1>
                    <div style={{display: "flex", flexDirection: "column", gap: "1px", background: "var(--border)", border: "1px solid var(--border)", borderRadius: "18px", overflow: "hidden", marginTop: "56px"}}>
                      {(v.painAgents || []).map((a, $i0) => (
                        <React.Fragment key={$i0}>
                            <div style={{background: "#fff", display: "flex", gap: "26px", alignItems: "flex-start", padding: "32px 34px"}}>
                              <img src={a.avatar} alt="" style={{width: "64px", height: "64px", borderRadius: "50%", objectFit: "cover", flex: "none", background: "var(--slate-100)", boxShadow: `0 0 0 2px ${a.dot}`}} />
                              <div style={{flex: "1", minWidth: "0"}}>
                                <div style={{display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap"}}>
                                  <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: "26px", fontWeight: "600", letterSpacing: "-.02em"}}>
                                    {a.name}
                                  </p>
                                  <p style={{margin: "0", fontFamily: "var(--font-mono)", fontSize: "12px", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--slate-500)"}}>
                                    {a.role}
                                  </p>
                                  <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--teal-800)", background: "var(--teal-50)", border: "1px solid var(--teal-100)", padding: "4px 10px", borderRadius: "999px"}}>
                                    {a.tag}
                                  </span>
                                </div>
                                <p style={{margin: "12px 0 0", fontSize: "18px", lineHeight: "1.6", color: "var(--slate-800)", maxWidth: "680px"}}>
                                  {a.line}
                                </p>
                              </div>
                            </div>
                        </React.Fragment>
                      ))}
                    </div>
                    <div style={{marginTop: "48px"}}>
                      <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                        <p style={{margin: "0", fontSize: "11px", fontWeight: "700", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--fg-muted)"}}>
                          Så går ett ärende
                        </p>
                        <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".1em", color: "var(--amber-700)", background: "var(--amber-100)", padding: "3px 9px", borderRadius: "999px"}}>
                          EXEMPEL
                        </span>
                      </div>
                      <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "12px", marginTop: "20px"}}>
                        {(v.sceneSteps || []).map((c, $i0) => (
                          <React.Fragment key={$i0}>
                              <div style={{padding: "20px 22px", borderRadius: "16px", border: `1px solid ${c.bd}`, background: `${c.bg}`, animation: "hmRise 500ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                                <p style={{margin: "0", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--slate-400)", fontVariantNumeric: "tabular-nums"}}>
                                  {c.n}
                                </p>
                                <p style={{margin: "10px 0 0", fontSize: "17px", lineHeight: "1.45", color: "var(--slate-900)"}}>
                                  {c.t}
                                </p>
                                {(c.mine) ? (
                                  <>
                                    <p style={{margin: "12px 0 0", fontSize: "10px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--teal-700)"}}>
                                      Ert beslut
                                    </p>
                                  </>
                                ) : null}
                              </div>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                    <p style={{margin: "32px 0 0", fontSize: "15px", color: "var(--fg-muted)", maxWidth: "720px"}}>
                      Inget når en kund utan ert OK. Varje förslag visar mötet, offerten eller citatet det bygger på.
                    </p>
                    <div style={{marginTop: "56px"}}>
                      <button onClick={v.next} style={{height: "56px", padding: "0 34px", borderRadius: "16px", background: "var(--teal-700)", color: "#fff", fontSize: "17px", fontWeight: "600", boxShadow: "0 4px 14px rgba(15,118,110,.25)", transition: "background 180ms,transform 180ms"}} className="hx20">
                        Vad kostar problemet idag?
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
            {(v.isRoi) ? (
              <>
                <section style={{flex: "1", padding: "72px 48px 96px", animation: "hmRise 450ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                  <div style={{width: "100%", maxWidth: "1180px", margin: "0 auto"}}>
                    <p style={{fontSize: "11px", fontWeight: "700", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--teal-700)", margin: "0 0 18px"}}>
                      Business case · {v.companyShort}
                    </p>
                    <h1 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(32px,4.4vw,52px)", fontWeight: "700", letterSpacing: "-.028em", lineHeight: "1.08"}}>
                      {v.roiTitle}
                    </h1>
                    <div style={{display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: "clamp(32px,4.4vw,64px)", marginTop: "60px", alignItems: "start"}}>
                      <div>
                        <p style={{margin: "0 0 14px", fontSize: "11px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--fg-muted)"}}>
                          En arbetsvecka hos {v.companyShort} · 40 timmar
                        </p>
                        <div style={{display: "grid", gridTemplateColumns: "repeat(8,minmax(0,1fr))", gap: "6px", maxWidth: "520px"}}>
                          {(v.roiWeek || []).map((c, $i0) => (
                            <React.Fragment key={$i0}>
                                <div style={{aspectRatio: "1", borderRadius: "7px", background: `${c.bg}`, animation: `${c.anim}`}} />
                            </React.Fragment>
                          ))}
                        </div>
                        <div style={{display: "flex", alignItems: "center", gap: "22px", flexWrap: "wrap", marginTop: "16px"}}>
                          <span style={{display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--slate-900)"}}>
                            <span style={{width: "12px", height: "12px", borderRadius: "3px", background: "var(--amber-500)"}} />
                            <strong>
                              {v.roiHours} timmar
                            </strong>
                            {v.roiHoursWhat}
                          </span>
                          <span style={{display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--slate-500)"}}>
                            <span style={{width: "12px", height: "12px", borderRadius: "3px", background: "var(--slate-200)"}} />
                            hantverk
                          </span>
                        </div>
                        <div style={{height: "1px", background: "var(--slate-300)", margin: "32px 0 28px"}} />
                        <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: "clamp(40px,5.4vw,64px)", fontWeight: "700", letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums", color: "var(--slate-900)", lineHeight: "1", whiteSpace: "nowrap"}}>
                          ≈ {v.roiTotal} kr
                        </p>
                        <p style={{margin: "10px 0 0", fontSize: "17px", color: "var(--slate-500)"}}>
                          {v.roiTotalCaption}
                        </p>
                        <p style={{margin: "14px 0 0", fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums"}}>
                          {v.roiFormula}
                        </p>
                      </div>
                      <div>
                        <p style={{margin: "0 0 4px", fontSize: "11px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--teal-700)"}}>
                          Vad ni får tillbaka
                        </p>
                        <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: "clamp(22px,2.5vw,28px)", fontWeight: "600", letterSpacing: "-.02em", color: "var(--slate-900)", lineHeight: "1.2"}}>
                          Det handlar inte bara om kronor.
                        </p>
                        <div style={{display: "flex", flexDirection: "column", gap: "14px", marginTop: "24px"}}>
                          {(v.roiBack || []).map((b, $i0) => (
                            <React.Fragment key={$i0}>
                                <div style={{padding: "24px 26px", borderRadius: "18px", background: `${b.bg}`, border: `1px solid ${b.bd}`, animation: `${b.anim}`}}>
                                  <p style={{margin: "0", fontSize: "11px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: `${b.fg}`}}>
                                    {b.label}
                                  </p>
                                  <p style={{margin: "10px 0 0", fontFamily: "var(--font-heading)", fontSize: "clamp(24px,2.8vw,34px)", fontWeight: "700", letterSpacing: "-.025em", lineHeight: "1.08", color: "var(--slate-900)", fontVariantNumeric: "tabular-nums"}}>
                                    {b.value}
                                  </p>
                                  <p style={{margin: "10px 0 0", fontSize: "15px", lineHeight: "1.55", color: "var(--slate-600)"}}>
                                    {b.text}
                                  </p>
                                </div>
                            </React.Fragment>
                          ))}
                        </div>
                        <div style={{marginTop: "44px", paddingTop: "32px", borderTop: "1px solid var(--border)"}}>
                          <p style={{margin: "0 0 20px", fontSize: "11px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--fg-muted)"}}>
                            Antaganden
                          </p>
                          <div style={{display: "flex", flexDirection: "column", gap: "22px"}}>
                            {(v.asmGroups || []).map((g, $i0) => (
                              <React.Fragment key={$i0}>
                                  <div>
                                    <p style={{margin: "0 0 10px", fontSize: "14px", color: "var(--slate-500)"}}>
                                      {g.label}
                                    </p>
                                    <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
                                      {(g.opts || []).map((o, $i1) => (
                                        <React.Fragment key={$i1}>
                                            <button onClick={o.pick} style={{height: "38px", padding: "0 16px", borderRadius: "999px", border: `1.5px solid ${o.bc}`, background: `${o.bg}`, color: `${o.fg}`, fontSize: "14px", fontWeight: "600", transition: "all 180ms"}}>
                                              {o.label}
                                            </button>
                                        </React.Fragment>
                                      ))}
                                    </div>
                                  </div>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                        {(v.hasAside) ? (
                          <>
                            <div style={{marginTop: "36px", paddingTop: "28px", borderTop: "1px solid var(--border)"}}>
                              <p style={{margin: "0 0 12px", fontSize: "11px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--fg-muted)"}}>
                                Räknas separat
                              </p>
                              <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: "26px", fontWeight: "700", letterSpacing: "-.02em", color: "var(--slate-900)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap"}}>
                                {v.asideValue}
                              </p>
                              <p style={{margin: "8px 0 0", fontSize: "14px", lineHeight: "1.5", color: "var(--slate-500)"}}>
                                {v.asideLabel}
                              </p>
                            </div>
                          </>
                        ) : null}
                        <p style={{margin: "36px 0 0", fontSize: "13px", lineHeight: "1.6", color: "var(--fg-muted)"}}>
                          {v.roiNote}
                        </p>
                        <p style={{margin: "14px 0 0", fontSize: "13px", lineHeight: "1.6", color: "var(--fg-muted)"}}>
                          Illustrativ kalkyl byggd på {v.companyShort}s egna uppgifter och antagandena ovan. Inte ett löfte om besparing — Handymate redovisar bara verifierade siffror när systemet är igång.
                        </p>
                      </div>
                    </div>
                    <div style={{marginTop: "64px", paddingTop: "44px", borderTop: "1px solid var(--border)"}}>
                      <p style={{margin: "0 0 18px", fontSize: "11px", fontWeight: "700", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--teal-700)"}}>
                        Firmor som er
                      </p>
                      <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "14px"}}>
                        {(v.proofCards || []).map((p, $i0) => (
                          <React.Fragment key={$i0}>
                              <div style={{padding: "24px 26px", borderRadius: "18px", border: "1.5px dashed var(--slate-300)", background: "rgba(255,255,255,.6)"}}>
                                <div style={{display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap"}}>
                                  <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--amber-700)", background: "var(--amber-50)", border: "1px solid var(--amber-200)", padding: "3px 9px", borderRadius: "999px"}}>
                                    Bevis · platshållare
                                  </span>
                                  <span style={{fontSize: "13px", color: "var(--fg-muted)"}}>
                                    {p.who}
                                  </span>
                                </div>
                                <div style={{display: "flex", alignItems: "baseline", gap: "14px", marginTop: "16px", flexWrap: "wrap"}}>
                                  <span style={{fontFamily: "var(--font-heading)", fontSize: "26px", fontWeight: "700", letterSpacing: "-.02em", color: "var(--slate-400)", fontVariantNumeric: "tabular-nums"}}>
                                    {p.before}
                                  </span>
                                  <span style={{color: "var(--slate-400)"}}>
                                    →
                                  </span>
                                  <span style={{fontFamily: "var(--font-heading)", fontSize: "26px", fontWeight: "700", letterSpacing: "-.02em", color: "var(--teal-700)", fontVariantNumeric: "tabular-nums"}}>
                                    {p.after}
                                  </span>
                                  <span style={{fontSize: "14px", color: "var(--slate-500)"}}>
                                    {p.metric}
                                  </span>
                                </div>
                                <p style={{margin: "14px 0 0", fontSize: "15px", lineHeight: "1.55", color: "var(--slate-600)", fontStyle: "italic"}}>
                                  ”{p.quote}”
                                </p>
                                <p style={{margin: "10px 0 0", fontSize: "13px", color: "var(--fg-muted)"}}>
                                  — {p.name}
                                </p>
                              </div>
                          </React.Fragment>
                        ))}
                      </div>
                      <p style={{margin: "12px 2px 0", fontSize: "13px", color: "var(--fg-muted)"}}>
                        Byts mot verkliga, anonymiserade kundfall per smärtpunkt. Behövs: firmatyp, storlek, ort, siffra före/efter, tidsrymd, ett citat.
                      </p>
                    </div>
                    <div style={{marginTop: "56px"}}>
                      <button onClick={v.next} style={{height: "56px", padding: "0 34px", borderRadius: "16px", background: "var(--teal-700)", color: "#fff", fontSize: "17px", fontWeight: "600", boxShadow: "0 4px 14px rgba(15,118,110,.25)", transition: "background 180ms,transform 180ms"}} className="hx21">
                        Vår rekommendation
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
            {(v.isPackage) ? (
              <>
                <section style={{flex: "1", padding: "72px 48px 96px", animation: "hmRise 450ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                  <div style={{width: "100%", maxWidth: "1080px", margin: "0 auto"}}>
                    <p style={{fontSize: "11px", fontWeight: "700", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--teal-700)", margin: "0 0 18px"}}>
                      Rekommendation
                    </p>
                    <h1 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(32px,4.4vw,52px)", fontWeight: "700", letterSpacing: "-.028em", lineHeight: "1.08"}}>
                      Vår rekommendation för {v.companyShort}
                    </h1>
                    <p style={{margin: "48px 0 6px", fontSize: "19px", color: "var(--slate-500)"}}>
                      Börja med
                    </p>
                    <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: "clamp(40px,6vw,72px)", fontWeight: "700", letterSpacing: "-.035em", lineHeight: ".95", color: "var(--teal-700)"}}>
                      Handymate {v.pkgName}
                    </p>
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: "16px", marginTop: "36px", paddingBottom: "36px", borderBottom: "1px solid var(--border)"}}>
                      <div style={{position: "relative", padding: "28px 30px", borderRadius: "20px", background: "linear-gradient(135deg,rgba(13,148,136,.15),rgba(20,184,166,.08))", border: "2px solid rgba(15,118,110,.3)", boxShadow: "0 8px 30px rgba(15,118,110,.1)"}}>
                        <span style={{position: "absolute", top: "-12px", left: "26px", fontSize: "10px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "#fff", background: "var(--teal-700)", padding: "5px 11px", borderRadius: "999px"}}>
                          Årsplan
                        </span>
                        <div style={{display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap", marginTop: "6px"}}>
                          <span style={{fontFamily: "var(--font-heading)", fontSize: "clamp(36px,4.4vw,52px)", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1", color: "var(--teal-800)", fontVariantNumeric: "tabular-nums"}}>
                            {v.pkgMonthlyDeal} kr
                          </span>
                          <span style={{fontSize: "17px", color: "var(--slate-600)"}}>
                            /mån
                          </span>
                        </div>
                        <p style={{margin: "8px 0 0", fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--slate-600)", fontVariantNumeric: "tabular-nums"}}>
                          {v.pkgYearlyDeal} kr/år · 12 månader, ni betalar för 10
                        </p>
                        <div style={{display: "flex", flexDirection: "column", gap: "10px", marginTop: "22px", paddingTop: "20px", borderTop: "1px solid rgba(15,118,110,.18)"}}>
                          <div style={{display: "flex", gap: "10px", alignItems: "flex-start"}}>
                            <span style={{flex: "none", width: "20px", height: "20px", borderRadius: "50%", background: "var(--teal-700)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", marginTop: "1px"}}>
                              ✓
                            </span>
                            <span style={{fontSize: "15px", lineHeight: "1.5", color: "var(--slate-900)"}}>
                              <strong>
                                Två månader gratis.
                              </strong>
                              Gäller alla årsplaner.
                            </span>
                          </div>
                          <div style={{display: "flex", gap: "10px", alignItems: "flex-start"}}>
                            <span style={{flex: "none", width: "20px", height: "20px", borderRadius: "50%", background: "var(--teal-700)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", marginTop: "1px"}}>
                              ✓
                            </span>
                            <span style={{fontSize: "15px", lineHeight: "1.5", color: "var(--slate-900)"}}>
                              <strong>
                                Använd det, annars kostar det inget.
                              </strong>
                              Aktivera och använd tjänsterna för att spara tid. Är det inte värt det, säg till före dag 90 så får ni hela året tillbaka.
                            </span>
                          </div>
                        </div>
                      </div>
                      <div style={{padding: "28px 30px", borderRadius: "20px", background: "#fff", border: "1px solid var(--border)"}}>
                        <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--slate-500)"}}>
                          Månad för månad
                        </span>
                        <div style={{display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap", marginTop: "14px"}}>
                          <span style={{fontFamily: "var(--font-heading)", fontSize: "clamp(30px,3.4vw,40px)", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1", color: "var(--slate-500)", fontVariantNumeric: "tabular-nums"}}>
                            {v.pkgMonthly} kr
                          </span>
                          <span style={{fontSize: "17px", color: "var(--slate-500)"}}>
                            /mån
                          </span>
                        </div>
                        <p style={{margin: "8px 0 0", fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--slate-500)", fontVariantNumeric: "tabular-nums"}}>
                          {v.pkgYearly} kr/år
                        </p>
                        <div style={{display: "flex", flexDirection: "column", gap: "10px", marginTop: "22px", paddingTop: "20px", borderTop: "1px solid var(--border)"}}>
                          <div style={{display: "flex", gap: "10px", alignItems: "flex-start"}}>
                            <span style={{flex: "none", width: "20px", height: "20px", borderRadius: "50%", border: "1px solid var(--slate-300)", marginTop: "1px"}} />
                            <span style={{fontSize: "15px", lineHeight: "1.5", color: "var(--slate-600)"}}>
                              Ordinarie pris.
                            </span>
                          </div>
                          <div style={{display: "flex", gap: "10px", alignItems: "flex-start"}}>
                            <span style={{flex: "none", width: "20px", height: "20px", borderRadius: "50%", border: "1px solid var(--slate-300)", marginTop: "1px"}} />
                            <span style={{fontSize: "15px", lineHeight: "1.5", color: "var(--slate-600)"}}>
                              Avsluta när ni vill.
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p style={{margin: "32px 0 0", fontSize: "clamp(19px,2vw,23px)", lineHeight: "1.55", color: "var(--slate-800)", maxWidth: "760px"}}>
                      Firman innehåller kärnan i Handymate och hela AI-teamet. Det är där vi rekommenderar att ni börjar.
                    </p>
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "14px", marginTop: "36px"}}>
                      {(v.foundersAvailable) ? (
                        <>
                          <div style={{padding: "24px 26px", borderRadius: "16px", background: "linear-gradient(135deg,rgba(13,148,136,.10),rgba(20,184,166,.04))", border: "1px solid var(--teal-200)"}}>
                            <div style={{display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap"}}>
                              <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "#fff", background: "var(--teal-700)", padding: "5px 11px", borderRadius: "999px"}}>
                                Grundarkund
                              </span>
                              <span style={{fontSize: "13px", color: "var(--slate-600)"}}>
                                Ett begränsat antal platser. Gäller så länge de finns kvar.
                              </span>
                            </div>
                            <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "12px 24px", marginTop: "18px"}}>
                              <div style={{display: "flex", gap: "10px", alignItems: "flex-start"}}>
                                <span style={{flex: "none", width: "20px", height: "20px", borderRadius: "50%", background: "var(--teal-700)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", marginTop: "1px"}}>
                                  ✓
                                </span>
                                <span style={{fontSize: "15px", lineHeight: "1.5", color: "var(--slate-900)"}}>
                                  <strong>
                                    Priset låst för alltid.
                                  </strong>
                                  Det ni börjar med följer er, oavsett vad nya kunder betalar.
                                </span>
                              </div>
                              <div style={{display: "flex", gap: "10px", alignItems: "flex-start"}}>
                                <span style={{flex: "none", width: "20px", height: "20px", borderRadius: "50%", background: "var(--teal-700)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", marginTop: "1px"}}>
                                  ✓
                                </span>
                                <span style={{fontSize: "15px", lineHeight: "1.5", color: "var(--slate-900)"}}>
                                  <strong>
                                    Direktlinje till grundaren
                                  </strong>
                                  under första året.
                                </span>
                              </div>
                              <div style={{display: "flex", gap: "10px", alignItems: "flex-start"}}>
                                <span style={{flex: "none", width: "20px", height: "20px", borderRadius: "50%", background: "var(--teal-700)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", marginTop: "1px"}}>
                                  ✓
                                </span>
                                <span style={{fontSize: "15px", lineHeight: "1.5", color: "var(--slate-900)"}}>
                                  <strong>
                                    Bokföringen till halva priset, för alltid,
                                  </strong>
                                  när den släpps.
                                </span>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>
                    <div style={{marginTop: "48px"}}>
                      <div>
                        <p style={{margin: "0 0 24px", fontSize: "11px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--fg-muted)"}}>
                          Varför vi rekommenderar den
                        </p>
                        <div style={{display: "flex", flexDirection: "column", gap: "16px"}}>
                          {(v.pkgReasons || []).map((r, $i0) => (
                            <React.Fragment key={$i0}>
                                <div style={{display: "flex", gap: "14px", alignItems: "flex-start"}}>
                                  <span style={{color: "var(--teal-700)", fontSize: "18px", fontWeight: "700", lineHeight: "1.5", flex: "none"}}>
                                    ✓
                                  </span>
                                  <p style={{margin: "0", fontSize: "19px", lineHeight: "1.5", color: "var(--slate-900)"}}>
                                    {r}
                                  </p>
                                </div>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                      <p style={{margin: "28px 0 0", fontSize: "14px", lineHeight: "1.6", color: "var(--fg-muted)"}}>
                        Priser exkl. moms. Årsplan: 12 månader, ni betalar för 10. Månad för månad: ingen bindningstid.
                      </p>
                    </div>
                    <div style={{marginTop: "64px"}}>
                      <p style={{margin: "0 0 6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--fg-muted)"}}>
                        Handymate över tid
                      </p>
                      <p style={{margin: "0 0 26px", fontFamily: "var(--font-heading)", fontSize: "clamp(22px,2.5vw,28px)", fontWeight: "600", letterSpacing: "-.02em", color: "var(--slate-900)"}}>
                        Ni växer? Bra. Det gör Handymate också.
                      </p>
                      <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "clamp(14px,2vw,22px)", alignItems: "start"}}>
                        <div style={{minWidth: "0", display: "flex", flexDirection: "column", padding: "clamp(22px,2.6vw,32px)", borderRadius: "20px", border: "1.5px solid var(--teal-100)", background: "linear-gradient(135deg,rgba(13,148,136,.1),rgba(20,184,166,.03))", boxShadow: "0 4px 20px rgba(15,118,110,.09)"}}>
                          <span style={{alignSelf: "flex-start", fontSize: "10px", fontWeight: "700", letterSpacing: ".14em", color: "var(--teal-700)", background: "#fff", border: "1px solid var(--teal-100)", padding: "5px 11px", borderRadius: "999px"}}>
                            IDAG
                          </span>
                          <p style={{margin: "20px 0 0", fontFamily: "var(--font-heading)", fontSize: "clamp(26px,3vw,34px)", fontWeight: "700", letterSpacing: "-.025em", lineHeight: "1", color: "var(--teal-700)"}}>
                            Firman
                          </p>
                          <p style={{margin: "10px 0 0", fontSize: "17px", color: "var(--slate-800)"}}>
                            Driva jobbet effektivt.
                          </p>
                          <div style={{display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "22px", paddingTop: "20px", borderTop: "1px solid var(--teal-100)"}}>
                            {(v.firmanNow || []).map((i, $i0) => (
                              <React.Fragment key={$i0}>
                                  <span style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "7px 13px", borderRadius: "999px", background: "#fff", border: "1px solid var(--teal-100)", fontSize: "15px", color: "var(--slate-900)"}}>
                                    <span style={{color: "var(--teal-700)", fontWeight: "700"}}>
                                      ✓
                                    </span>
                                    {i.t}
                                  </span>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                        <div style={{minWidth: "0", display: "flex", flexDirection: "column", padding: "clamp(22px,2.6vw,32px)", borderRadius: "20px", border: "1px dashed var(--slate-300)", background: "#fff"}}>
                          <span style={{alignSelf: "flex-start", fontSize: "10px", fontWeight: "700", letterSpacing: ".14em", color: "var(--amber-700)", background: "var(--amber-100)", padding: "5px 11px", borderRadius: "999px"}}>
                            PÅ VÄG
                          </span>
                          <p style={{margin: "20px 0 0", fontFamily: "var(--font-heading)", fontSize: "clamp(26px,3vw,34px)", fontWeight: "700", letterSpacing: "-.025em", lineHeight: "1", color: "var(--slate-600)"}}>
                            Storfirman
                          </p>
                          <p style={{margin: "10px 0 0", fontSize: "17px", color: "var(--slate-600)"}}>
                            Leda och skala företaget.
                          </p>
                          <div style={{display: "flex", flexDirection: "column", gap: "10px", marginTop: "22px", paddingTop: "20px", borderTop: "1px dashed var(--border)"}}>
                            {(v.storfirmanNext || []).map((i, $i0) => (
                              <React.Fragment key={$i0}>
                                  <p style={{margin: "0", display: "flex", gap: "11px", alignItems: "baseline", fontSize: "16px", color: "var(--slate-600)"}}>
                                    <span style={{color: "var(--slate-300)", fontWeight: "700"}}>
                                      →
                                    </span>
                                    {i.t}
                                  </p>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      </div>
                      {(v.hasSignals) ? (
                        <>
                          <div style={{display: "flex", alignItems: "baseline", gap: "14px", flexWrap: "wrap", marginTop: "22px", padding: "18px 22px", borderRadius: "16px", border: "1px solid var(--border)", background: "#fff"}}>
                            <p style={{margin: "0", fontSize: "15px", color: "var(--slate-500)", flex: "none"}}>
                              Vi ser redan {v.signalCount} signaler på att Storfirman blir relevant för er:
                            </p>
                            <div style={{display: "flex", flexWrap: "wrap", gap: "8px"}}>
                              {(v.signals || []).map((g, $i0) => (
                                <React.Fragment key={$i0}>
                                    <span style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 12px", borderRadius: "999px", background: "var(--bg-page)", border: "1px solid var(--border)", fontSize: "14px", color: "var(--slate-600)"}}>
                                      {g.t}
                                    </span>
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : null}
                      <p style={{margin: "22px 0 0", fontSize: "14px", lineHeight: "1.6", color: "var(--fg-muted)", maxWidth: "820px"}}>
                        Funktionerna märkta PÅ VÄG är under utveckling och ingår inte i det ni köper idag. Ni ska kunna börja nu utan att byta system senare.
                      </p>
                    </div>
                    <div style={{marginTop: "64px"}}>
                      <button onClick={v.next} style={{height: "56px", padding: "0 34px", borderRadius: "16px", background: "var(--teal-700)", color: "#fff", fontSize: "17px", fontWeight: "600", boxShadow: "0 4px 14px rgba(15,118,110,.25)", transition: "background 180ms,transform 180ms"}} className="hx22">
                        Och resten av verksamheten
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
            {(v.isBreadth) ? (
              <>
                <section style={{flex: "1", padding: "72px 48px 96px", animation: "hmRise 450ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                  <div style={{width: "100%", maxWidth: "1080px", margin: "0 auto"}}>
                    <p style={{fontSize: "11px", fontWeight: "700", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--teal-700)", margin: "0 0 18px"}}>
                      Hela verksamheten
                    </p>
                    <h1 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(32px,4.4vw,52px)", fontWeight: "700", letterSpacing: "-.028em", lineHeight: "1.08", maxWidth: "820px"}}>
                      Ni valde en väg in. Resten följer med ändå.
                    </h1>
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "14px", marginTop: "52px"}}>
                      {(v.breadthRows || []).map((r, $i0) => (
                        <React.Fragment key={$i0}>
                            <div style={{display: "flex", alignItems: "flex-start", gap: "18px", padding: "22px 24px", borderRadius: "18px", border: `1px solid ${r.ring}`, background: `${r.bg}`, animation: "hmRise 480ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                              <img src={r.avatar} alt="" style={{width: "48px", height: "48px", borderRadius: "50%", objectFit: "cover", flex: "none", background: "var(--slate-100)"}} />
                              <div style={{flex: "1", minWidth: "0"}}>
                                <div style={{display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap"}}>
                                  <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: "20px", fontWeight: "600", letterSpacing: "-.015em", color: "var(--slate-900)"}}>
                                    {r.area}
                                  </p>
                                  {(r.mine) ? (
                                    <>
                                      <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "#fff", background: "var(--teal-700)", padding: "4px 10px", borderRadius: "999px"}}>
                                        Ert val
                                      </span>
                                    </>
                                  ) : null}
                                </div>
                                <p style={{margin: "7px 0 0", fontSize: "16px", lineHeight: "1.55", color: "var(--slate-500)"}}>
                                  {r.line}
                                </p>
                                <p style={{margin: "10px 0 0", fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--slate-400)"}}>
                                  {r.name} · {r.role}
                                </p>
                              </div>
                            </div>
                        </React.Fragment>
                      ))}
                    </div>
                    <p style={{margin: "36px 0 0", fontSize: "17px", lineHeight: "1.6", color: "var(--slate-500)", maxWidth: "760px"}}>
                      Ni behöver inte börja med allt. Men ni behöver inte köpa till något senare heller — hela teamet ingår från dag ett.
                    </p>
                    <div style={{marginTop: "56px"}}>
                      <button onClick={v.next} style={{height: "56px", padding: "0 34px", borderRadius: "16px", background: "var(--teal-700)", color: "#fff", fontSize: "17px", fontWeight: "600", boxShadow: "0 4px 14px rgba(15,118,110,.25)", transition: "background 180ms,transform 180ms"}} className="hx23">
                        Vad som ingår
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
            {(v.isOffer) ? (
              <>
                <section style={{flex: "1", padding: "72px 48px 96px", animation: "hmRise 450ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                  <div style={{width: "100%", maxWidth: "1000px", margin: "0 auto"}}>
                    <p style={{fontSize: "11px", fontWeight: "700", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--teal-700)", margin: "0 0 18px"}}>
                      Handymate {v.pkgName}
                    </p>
                    <h1 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(32px,4.4vw,52px)", fontWeight: "700", letterSpacing: "-.028em", lineHeight: "1.08"}}>
                      Det här ingår
                    </h1>
                    <div style={{marginTop: "56px"}}>
                      {(v.offerItems || []).map((o, $i0) => (
                        <React.Fragment key={$i0}>
                            <div style={{display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)", gap: "40px", padding: "30px 0", borderTop: "1px solid var(--border)", alignItems: "baseline"}}>
                              <div style={{display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap"}}>
                                <p style={{margin: "0", fontFamily: "var(--font-heading)", fontSize: "26px", fontWeight: "600", letterSpacing: "-.02em", color: "var(--slate-900)"}}>
                                  {o.title}
                                </p>
                                {(o.soon) ? (
                                  <>
                                    <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".1em", color: "var(--amber-700)", background: "var(--amber-100)", padding: "3px 8px", borderRadius: "999px"}}>
                                      KOMMER
                                    </span>
                                  </>
                                ) : null}
                              </div>
                              <p style={{margin: "0", fontSize: "18px", lineHeight: "1.6", color: "var(--slate-500)"}}>
                                {o.body}
                              </p>
                            </div>
                        </React.Fragment>
                      ))}
                    </div>
                    <div style={{marginTop: "48px", padding: "clamp(24px,3vw,32px)", borderRadius: "20px", border: "1px dashed var(--slate-300)", background: "#fff"}}>
                      <p style={{margin: "0 0 22px", fontFamily: "var(--font-heading)", fontSize: "clamp(21px,2.3vw,26px)", fontWeight: "600", letterSpacing: "-.02em", color: "var(--slate-900)"}}>
                        Och mer är på väg
                      </p>
                      <div style={{display: "flex", flexDirection: "column", gap: "20px"}}>
                        {(v.comingItems || []).map((o, $i0) => (
                          <React.Fragment key={$i0}>
                              <div style={{display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)", gap: "clamp(16px,3vw,40px)", alignItems: "baseline"}}>
                                <div style={{display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap"}}>
                                  <p style={{margin: "0", fontSize: "19px", fontWeight: "600", color: "var(--slate-600)"}}>
                                    {o.title}
                                  </p>
                                  <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".1em", color: "var(--amber-700)", background: "var(--amber-100)", padding: "3px 8px", borderRadius: "999px", whiteSpace: "nowrap"}}>
                                    PÅ VÄG
                                  </span>
                                </div>
                                <p style={{margin: "0", fontSize: "16px", lineHeight: "1.6", color: "var(--fg-muted)"}}>
                                  {o.body}
                                </p>
                              </div>
                          </React.Fragment>
                        ))}
                      </div>
                      <p style={{margin: "24px 0 0", fontSize: "14px", lineHeight: "1.6", color: "var(--fg-muted)"}}>
                        Under utveckling. Ingår inte i det ni betalar för idag — men ni behöver inte byta system när de kommer.
                      </p>
                    </div>
                    <div style={{display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "32px", flexWrap: "wrap", marginTop: "48px", paddingTop: "36px", borderTop: "2px solid var(--slate-900)"}}>
                      <div>
                        <p style={{margin: "0", fontSize: "17px", color: "var(--slate-500)"}}>
                          Allt ovan, för
                        </p>
                        <p style={{margin: "10px 0 0", fontFamily: "var(--font-heading)", fontSize: "clamp(40px,5vw,60px)", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1", color: "var(--slate-900)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap"}}>
                          {v.pkgMonthly} kr
                          <span style={{fontSize: "26px", fontWeight: "500", color: "var(--slate-500)"}}>
                            /mån
                          </span>
                        </p>
                        <p style={{margin: "12px 0 0", fontSize: "14px", color: "var(--fg-muted)"}}>
                          Exkl. moms. Ingen onboardingavgift. Ingen bindningstid.
                        </p>
                      </div>
                      <button onClick={v.next} style={{height: "56px", padding: "0 34px", borderRadius: "16px", background: "var(--teal-700)", color: "#fff", fontSize: "17px", fontWeight: "600", boxShadow: "0 4px 14px rgba(15,118,110,.25)", transition: "background 180ms,transform 180ms"}} className="hx24">
                        Nästa steg
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
            {(v.isClose) ? (
              <>
                <section style={{flex: "1", display: "flex", flexDirection: "column", justifyContent: "center", padding: "88px 48px", background: "linear-gradient(160deg,#fffdf7,#f0fdf9 46%,var(--bg-page))", animation: "hmFade 500ms backwards"}}>
                  <div style={{width: "100%", maxWidth: "1000px", margin: "0 auto"}}>
                    <h1 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(34px,5vw,60px)", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.06", color: "var(--slate-900)", maxWidth: "820px", animation: "hmRise 600ms backwards"}}>
                      Redo att sätta upp {v.companyShort}?
                    </h1>
                    <div style={{display: "flex", flexWrap: "wrap", gap: "14px", marginTop: "52px"}}>
                      <div style={{padding: "24px 32px", borderRadius: "18px", border: "1px solid var(--teal-100)", background: "#fff", boxShadow: "0 4px 18px rgba(15,118,110,.08)", animation: "hmRise 500ms 150ms backwards"}}>
                        <p style={{margin: "0", fontSize: "10px", fontWeight: "700", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--slate-400)"}}>
                          Paket
                        </p>
                        <p style={{margin: "10px 0 0", fontFamily: "var(--font-heading)", fontSize: "26px", fontWeight: "600", color: "var(--teal-700)"}}>
                          {v.pkgName}
                        </p>
                      </div>
                      <div style={{padding: "24px 32px", borderRadius: "18px", border: "1px solid var(--teal-100)", background: "#fff", boxShadow: "0 4px 18px rgba(15,118,110,.08)", animation: "hmRise 500ms 250ms backwards"}}>
                        <p style={{margin: "0", fontSize: "10px", fontWeight: "700", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--slate-400)"}}>
                          Årsplan
                        </p>
                        <p style={{margin: "10px 0 0", fontFamily: "var(--font-heading)", fontSize: "26px", fontWeight: "600", color: "var(--slate-900)", fontVariantNumeric: "tabular-nums"}}>
                          {v.pkgMonthlyDeal} kr/mån
                        </p>
                        <p style={{margin: "6px 0 0", fontSize: "13px", color: "var(--teal-800)"}}>
                          {v.pkgYearlyDeal} kr/år · 2 månader gratis
                        </p>
                      </div>
                      <div style={{padding: "24px 32px", borderRadius: "18px", border: "1px solid var(--teal-100)", background: "#fff", boxShadow: "0 4px 18px rgba(15,118,110,.08)", animation: "hmRise 500ms 350ms backwards"}}>
                        <p style={{margin: "0", fontSize: "10px", fontWeight: "700", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--slate-400)"}}>
                          Startdatum
                        </p>
                        <p style={{margin: "10px 0 0", fontFamily: "var(--font-heading)", fontSize: "26px", fontWeight: "600", color: "var(--slate-900)"}}>
                          {v.startDate}
                        </p>
                      </div>
                    </div>
                    <div style={{display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center", marginTop: "56px"}}>
                      <button onClick={v.startOnboarding} style={{height: "68px", padding: "0 40px", borderRadius: "18px", background: "linear-gradient(135deg,var(--teal-700),var(--teal-500))", color: "#fff", fontFamily: "var(--font-heading)", fontSize: "21px", fontWeight: "600", letterSpacing: "-.01em", boxShadow: "0 10px 30px rgba(15,118,110,.28)", transition: "transform 180ms"}} className="hx25">
                        Starta {v.companyShort} i Handymate
                      </button>
                      <button onClick={v.openSendReady} style={{height: "68px", padding: "0 30px", borderRadius: "18px", background: "#fff", border: "1px solid var(--border)", color: "var(--slate-800)", fontSize: "17px", fontWeight: "600", transition: "all 180ms"}} className="hx26">
                        Skicka mitt personliga Handymate-case
                      </button>
                    </div>
                    <button onClick={v.openSendThink} style={{marginTop: "26px", fontSize: "15px", color: "var(--slate-500)", textDecoration: "underline", textUnderlineOffset: "4px", padding: "4px 0"}} className="hx27">
                      Jag vill fundera
                    </button>
                    <div style={{display: "flex", alignItems: "flex-start", gap: "14px", marginTop: "40px", padding: "20px 24px", borderRadius: "16px", background: "#fff", border: "1px solid var(--teal-100)", maxWidth: "640px", animation: "hmRise 500ms 450ms backwards"}}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--teal-700)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width: "22px", height: "22px", flex: "none", marginTop: "2px"}}>
                        <path d="M12 3l7.5 3v5.6c0 4.4-3.1 8.2-7.5 9.4-4.4-1.2-7.5-5-7.5-9.4V6z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                      <div>
                        <p style={{margin: "0", fontSize: "16px", fontWeight: "600", color: "var(--slate-900)"}}>
                          Använd det. Annars kostar det inget.
                        </p>
                        <p style={{margin: "6px 0 0", fontSize: "14px", lineHeight: "1.55", color: "var(--slate-600)"}}>
                          Aktivera och använd tjänsterna för att spara tid. Är det inte värt det, säg till före dag 90 så får ni hela året tillbaka. {v.closeFoundersLine}
                        </p>
                      </div>
                    </div>
                    <div style={{height: "200px", maxWidth: "420px", marginTop: "44px", borderRadius: "18px", overflow: "hidden", background: "var(--teal-50)"}}>
                      <img src="assets/close-hero.png" alt="Ägaren och kollegan vid servicebilen på arbetsplatsen." style={{width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 40%", display: "block"}} />
                    </div>
                    <p style={{margin: "30px 0 0", fontSize: "15px", lineHeight: "1.6", color: "var(--slate-500)", maxWidth: "640px"}}>
                      Startar ni nu tar vi med oss allt ni berättat in i Handymate — ni behöver inte fylla i det en gång till.
                    </p>
                  </div>
                </section>
              </>
            ) : null}
            {(v.isHandoff) ? (
              <>
                <section onClick={v.skipHandoff} style={{flex: "1", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "80px 48px", textAlign: "center", cursor: "pointer", background: "linear-gradient(150deg,#E4F2EB,#E6FFFA 55%,#F0FDF9)", animation: "hmFade 700ms backwards"}}>
                  <div style={{display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "nowrap", gap: "clamp(14px,2.4vw,30px)", width: "100%", maxWidth: "900px"}}>
                    <p style={{margin: "0", flex: "0 1 auto", minWidth: "0", textAlign: "right", fontFamily: "var(--font-heading)", fontSize: "clamp(20px,3vw,40px)", fontWeight: "700", letterSpacing: "-.028em", lineHeight: "1.05", color: "var(--slate-900)", animation: "hmLeft 700ms cubic-bezier(.2,.8,.2,1) 200ms backwards"}}>
                      {v.companyName}
                    </p>
                    <span style={{flex: "none", fontFamily: "var(--font-heading)", fontSize: "clamp(16px,2.2vw,28px)", fontWeight: "500", color: "var(--slate-400)", animation: "hmFade 500ms 700ms backwards"}}>
                      ×
                    </span>
                    <div style={{display: "flex", alignItems: "center", gap: "clamp(8px,1.2vw,14px)", flex: "none", animation: "hmRight 700ms cubic-bezier(.2,.8,.2,1) 200ms backwards"}}>
                      <img src="handymate-dashboard/public/logo.png" alt="" style={{width: "clamp(24px,2.8vw,38px)", height: "clamp(24px,2.8vw,38px)", borderRadius: "10px", objectFit: "cover", flex: "none"}} />
                      <span style={{fontFamily: "var(--font-heading)", fontSize: "clamp(20px,3vw,40px)", fontWeight: "700", letterSpacing: "-.028em", lineHeight: "1.05", color: "var(--teal-700)", whiteSpace: "nowrap"}}>
                        Handymate
                      </span>
                    </div>
                  </div>
                  <h1 style={{margin: "clamp(44px,7vw,80px) 0 0", fontFamily: "var(--font-heading)", fontSize: "clamp(48px,8vw,104px)", fontWeight: "700", letterSpacing: "-.04em", lineHeight: "1", color: "var(--slate-900)", animation: "hmRise 800ms cubic-bezier(.2,.8,.2,1) 1200ms backwards"}}>
                    Då kör vi.
                  </h1>
                  <div style={{display: "flex", alignItems: "center", gap: "14px", marginTop: "clamp(30px,4vw,44px)", padding: "14px 24px", borderRadius: "999px", border: "1px solid var(--teal-200)", background: "rgba(255,255,255,.72)", animation: "hmRise 700ms cubic-bezier(.2,.8,.2,1) 1900ms backwards"}}>
                    <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--teal-700)"}}>
                      Ert mål
                    </span>
                    <span style={{fontFamily: "var(--font-heading)", fontSize: "clamp(17px,2vw,22px)", fontWeight: "600", letterSpacing: "-.015em", color: "var(--slate-900)"}}>
                      {v.goalName}
                    </span>
                  </div>
                  <p style={{margin: "36px 0 0", fontSize: "15px", color: "var(--slate-500)", animation: "hmFade 600ms 2400ms backwards"}}>
                    Klicka för att fortsätta
                  </p>
                </section>
              </>
            ) : null}
            {(v.isPrefilled) ? (
              <>
                <section style={{flex: "1", padding: "72px 48px 96px", animation: "hmRise 450ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                  <div style={{width: "100%", maxWidth: "1000px", margin: "0 auto"}}>
                    <p style={{fontSize: "11px", fontWeight: "700", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--teal-700)", margin: "0 0 18px"}}>
                      Onboarding · {v.companyShort}
                    </p>
                    <h1 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(32px,4.4vw,52px)", fontWeight: "700", letterSpacing: "-.028em", lineHeight: "1.08", maxWidth: "780px"}}>
                      Vi har redan förberett ert Handymate.
                    </h1>
                    <p style={{fontSize: "clamp(18px,2vw,21px)", lineHeight: "1.6", color: "var(--slate-500)", margin: "22px 0 0", maxWidth: "620px"}}>
                      Du behöver inte fylla i samma saker en gång till. Vi tar med oss det vi redan gått igenom.
                    </p>
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: "14px", marginTop: "48px"}}>
                      {(v.knownFacts || []).map((k, $i0) => (
                        <React.Fragment key={$i0}>
                            <div style={{display: "flex", alignItems: "center", gap: "13px", padding: "18px 20px", borderRadius: "14px", border: "1px solid var(--teal-100)", background: "var(--teal-50)", animation: "hmRise 450ms backwards"}}>
                              <span style={{width: "22px", height: "22px", flex: "none", borderRadius: "50%", background: "var(--teal-700)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700"}}>
                                ✓
                              </span>
                              <span style={{fontSize: "16px", fontWeight: "600", color: "var(--slate-900)", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis"}}>
                                {k.t}
                              </span>
                            </div>
                        </React.Fragment>
                      ))}
                    </div>
                    {(v.showSession) ? (
                      <>
                        <div style={{marginTop: "44px", border: "1px solid var(--border)", borderRadius: "16px", background: "#fff", overflow: "hidden"}}>
                          <div style={{display: "flex", alignItems: "center", gap: "10px", padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-page)"}}>
                            <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--amber-700)", background: "var(--amber-50)", border: "1px solid var(--amber-200)", padding: "3px 9px", borderRadius: "999px"}}>
                              Säljarvy
                            </span>
                            <span style={{width: "7px", height: "7px", borderRadius: "50%", background: "var(--teal-700)"}} />
                            <span style={{fontFamily: "var(--font-mono)", fontSize: "12px", letterSpacing: ".04em", color: "var(--slate-600)"}}>
                              sales_session
                            </span>
                            <span style={{fontSize: "12px", color: "var(--fg-muted)"}}>
                              följer med från genomgången in i onboardingen
                            </span>
                          </div>
                          <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))"}}>
                            {(v.sessionRows || []).map((r, $i0) => (
                              <React.Fragment key={$i0}>
                                  <div style={{display: "flex", gap: "16px", padding: "11px 20px", borderBottom: "1px solid var(--slate-100)", minWidth: "0"}}>
                                    <span style={{flex: "0 0 150px", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--fg-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>
                                      {r.k}
                                    </span>
                                    <span style={{flex: "1", minWidth: "0", fontSize: "14px", color: "var(--slate-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                                      {r.v}
                                    </span>
                                  </div>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}
                    <div style={{marginTop: "48px"}}>
                      <button onClick={v.next} style={{height: "56px", padding: "0 34px", borderRadius: "16px", background: "var(--teal-700)", color: "#fff", fontSize: "17px", fontWeight: "600", boxShadow: "0 4px 14px rgba(15,118,110,.25)", transition: "background 180ms,transform 180ms"}} className="hx28">
                        Fortsätt konfigurera Handymate
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
            {(v.isFirstStep) ? (
              <>
                <section style={{flex: "1", padding: "56px 48px 96px", animation: "hmRise 450ms cubic-bezier(.2,.8,.2,1) backwards"}}>
                  <div style={{width: "100%", maxWidth: "1000px", margin: "0 auto"}}>
                    <div style={{display: "flex", flexWrap: "wrap", gap: "10px 22px", alignItems: "center", paddingBottom: "36px", borderBottom: "1px solid var(--border)"}}>
                      {(v.onbSteps || []).map((st, $i0) => (
                        <React.Fragment key={$i0}>
                            <div style={{display: "flex", alignItems: "center", gap: "10px", minWidth: "0"}}>
                              <span style={{width: "26px", height: "26px", flex: "none", borderRadius: "50%", border: `1.5px solid ${st.bc}`, background: `${st.bg}`, color: `${st.fg}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700"}}>
                                {st.mark}
                              </span>
                              <span style={{fontSize: "15px", fontWeight: "600", color: `${st.tx}`, whiteSpace: "nowrap"}}>
                                {st.label}
                              </span>
                            </div>
                        </React.Fragment>
                      ))}
                    </div>
                    <h1 style={{marginTop: "52px", fontFamily: "var(--font-heading)", fontSize: "clamp(30px,4vw,46px)", fontWeight: "700", letterSpacing: "-.028em", lineHeight: "1.12", maxWidth: "860px"}}>
                      {v.onbLine}
                    </h1>
                    <p style={{fontSize: "clamp(18px,2vw,22px)", lineHeight: "1.6", color: "var(--slate-500)", margin: "22px 0 0", maxWidth: "680px"}}>
                      {v.onbSub}
                    </p>
                    <div style={{marginTop: "44px"}}>
                      <button style={{height: "60px", padding: "0 36px", borderRadius: "16px", background: "var(--teal-700)", color: "#fff", fontSize: "18px", fontWeight: "600", boxShadow: "0 4px 14px rgba(15,118,110,.25)", transition: "background 180ms,transform 180ms"}} className="hx29">
                        {v.onbCta}
                      </button>
                    </div>
                    <div style={{marginTop: "64px", padding: "clamp(26px,3vw,34px)", borderRadius: "20px", border: "1px solid var(--teal-100)", background: "linear-gradient(135deg,rgba(13,148,136,.08),rgba(20,184,166,.03))"}}>
                      <p style={{margin: "0", fontSize: "11px", fontWeight: "700", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--teal-700)"}}>
                        Ert mål med Handymate
                      </p>
                      <p style={{margin: "16px 0 0", fontFamily: "var(--font-heading)", fontSize: "clamp(26px,3vw,34px)", fontWeight: "700", letterSpacing: "-.025em", color: "var(--slate-900)", lineHeight: "1.1"}}>
                        {v.goalName}
                      </p>
                      <p style={{margin: "24px 0 0", fontSize: "13px", fontWeight: "700", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--fg-muted)"}}>
                        När vi träffades
                      </p>
                      <p style={{margin: "10px 0 0", paddingLeft: "18px", borderLeft: "2px solid var(--teal-700)", fontSize: "19px", lineHeight: "1.6", color: "var(--teal-800)"}}>
                        {v.goalQuote}
                      </p>
                      <p style={{margin: "22px 0 0", fontSize: "16px", lineHeight: "1.6", color: "var(--slate-500)", maxWidth: "680px"}}>
                        Vi sparar det här som ert mål, så att vi tillsammans kan följa upp hur arbetssättet förändras efter 30, 60 och 90 dagar.
                      </p>
                    </div>
                    <div style={{marginTop: "32px", display: "flex", gap: "18px", alignItems: "flex-start", padding: "24px 28px", borderRadius: "16px", border: "1px dashed var(--slate-300)", background: "#fff"}}>
                      <span style={{fontSize: "10px", fontWeight: "700", letterSpacing: ".1em", color: "var(--amber-700)", background: "var(--amber-100)", padding: "4px 9px", borderRadius: "999px", flex: "none", marginTop: "3px"}}>
                        PÅ VÄG
                      </span>
                      <div style={{minWidth: "0"}}>
                        <p style={{margin: "0", fontSize: "18px", fontWeight: "600", color: "var(--slate-600)"}}>
                          Handymate Academy
                        </p>
                        <p style={{margin: "7px 0 0", fontSize: "16px", lineHeight: "1.6", color: "var(--fg-muted)"}}>
                          Snart får hela teamet tillgång till korta digitala utbildningar och guider direkt från Handymate.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
          </main>
          {(v.modalOpen) ? (
            <>
              <div style={{position: "fixed", inset: "0", zIndex: "60", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px", background: "rgba(15,23,42,.55)", backdropFilter: "blur(4px)", animation: "hmFade 220ms"}}>
                <div style={{width: "100%", maxWidth: "540px", background: "#fff", borderRadius: "24px", padding: "clamp(28px,4vw,44px)", boxShadow: "0 30px 90px rgba(0,0,0,.32)", animation: "hmRise 340ms cubic-bezier(.2,.8,.2,1)"}}>
                  {(v.isSend) ? (
                    <>
                      <div>
                        <h2 style={{fontFamily: "var(--font-heading)", fontSize: "clamp(26px,3vw,33px)", fontWeight: "700", letterSpacing: "-.025em", lineHeight: "1.15"}}>
                          {v.sendTitle}
                        </h2>
                        <p style={{margin: "16px 0 0", fontSize: "17px", lineHeight: "1.6", color: "var(--slate-500)"}}>
                          {v.sendSub}
                        </p>
                        <div style={{display: "flex", flexDirection: "column", gap: "20px", marginTop: "32px"}}>
                          <div>
                            <label htmlFor="casename" style={{display: "block", fontSize: "12px", fontWeight: "700", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--fg-muted)", marginBottom: "9px"}}>
                              Namn
                            </label>
                            <input id="casename" value={v.caseName} onChange={v.setCaseName} placeholder="Anna Svensson" autoComplete="off" style={{width: "100%", height: "54px", border: "1px solid var(--border)", borderRadius: "14px", padding: "0 18px", fontSize: "17px", color: "var(--slate-900)", background: "#fff", outline: "none", transition: "box-shadow 180ms,border-color 180ms"}} className="hx30" />
                          </div>
                          <div>
                            <label htmlFor="caseemail" style={{display: "block", fontSize: "12px", fontWeight: "700", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--fg-muted)", marginBottom: "9px"}}>
                              E-post
                            </label>
                            <input id="caseemail" value={v.caseEmail} onChange={v.setCaseEmail} placeholder="anna@svenssonsel.se" autoComplete="off" style={{width: "100%", height: "54px", border: "1px solid var(--border)", borderRadius: "14px", padding: "0 18px", fontSize: "17px", color: "var(--slate-900)", background: "#fff", outline: "none", transition: "box-shadow 180ms,border-color 180ms"}} className="hx31" />
                          </div>
                          <button onClick={v.toggleCopy} style={{display: "flex", alignItems: "center", gap: "13px", textAlign: "left", padding: "4px 0"}}>
                            <span style={{width: "22px", height: "22px", flex: "none", borderRadius: "6px", border: `1.5px solid ${v.copyBorder}`, background: `${v.copyBox}`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "700", transition: "all 160ms"}}>
                              {v.copyMark}
                            </span>
                            <span style={{fontSize: "16px", color: "var(--slate-800)"}}>
                              Skicka även en kopia till säljaren
                            </span>
                          </button>
                        </div>
                        <div style={{display: "flex", gap: "12px", alignItems: "center", marginTop: "36px"}}>
                          <button onClick={v.sendCase} disabled={v.caseSaving} style={{height: "54px", padding: "0 30px", borderRadius: "14px", background: `${v.sendCtaBg}`, color: "#fff", fontSize: "17px", fontWeight: "600", transition: "background 180ms"}}>
                            {v.sendLabel}
                          </button>
                          <button onClick={v.closeModal} style={{height: "54px", padding: "0 18px", borderRadius: "14px", color: "var(--slate-500)", fontSize: "16px", fontWeight: "600"}} className="hx32">
                            Avbryt
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                  {(v.isSent) ? (
                    <>
                      <div style={{textAlign: "center", padding: "8px 0"}}>
                        <div style={{width: "64px", height: "64px", margin: "0 auto", borderRadius: "50%", background: `${v.sentMarkBg}`, border: `1px solid ${v.sentMarkBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", color: `${v.sentMarkColor}`, animation: "hmNode 500ms cubic-bezier(.34,1.56,.64,1) backwards"}}>
                          {v.sentMark}
                        </div>
                        <h2 style={{marginTop: "28px", fontFamily: "var(--font-heading)", fontSize: "clamp(28px,3.2vw,36px)", fontWeight: "700", letterSpacing: "-.025em"}}>
                          {v.sentTitle}
                        </h2>
                        <p style={{margin: "16px auto 0", fontSize: "17px", lineHeight: "1.6", color: "var(--slate-500)", maxWidth: "400px"}}>
                          {v.sentBody}
                        </p>
                        {(v.hasCaseUrl) ? (
                          <>
                            <div style={{display: "flex", alignItems: "center", gap: "10px", margin: "22px 0 0", padding: "12px 14px", borderRadius: "12px", background: "var(--bg-page)", border: "1px solid var(--border)", textAlign: "left"}}>
                              <span style={{flex: "1", minWidth: "0", fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--slate-700)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                                {v.caseUrl}
                              </span>
                            </div>
                          </>
                        ) : null}
                        {(v.caseError) ? (
                          <>
                            <p style={{margin: "12px 0 0", fontSize: "13px", lineHeight: "1.5", textAlign: "left", color: "var(--amber-800)", background: "var(--amber-50)", border: "1px solid var(--amber-200)", borderRadius: "10px", padding: "10px 12px"}}>
                              {v.caseErrorText}
                            </p>
                          </>
                        ) : null}
                        <div style={{display: "flex", flexDirection: "column", gap: "12px", marginTop: "26px"}}>
                          <button onClick={v.sentThen} style={{height: "54px", borderRadius: "14px", background: "var(--teal-700)", color: "#fff", fontSize: "17px", fontWeight: "600", transition: "background 180ms"}} className="hx33">
                            {v.sentCta}
                          </button>
                          {(v.hasCaseUrl) ? (
                            <>
                              <a href={v.caseUrl} target="_blank" style={{height: "54px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "1.5px solid var(--border)", color: "var(--slate-900)", fontSize: "16px", fontWeight: "600", transition: "border-color 180ms"}} className="hx34">
                                Öppna kundens länk
                              </a>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    )
  }
}
