// ÄTA — pixel mockups (mobile + desktop)
// Built on the existing handymate mobile + dashboard CSS vocabulary.
// All artboards exposed via design_canvas; each mobile screen lives inside an IOSDevice.
//
// NOTE: Detta är en READ-ONLY referens-kopia från Claude Design 2026-05-09.
// Originalet är en runnable React-prototyp som beror på design-canvas.jsx +
// ios-frame.jsx (ligger i mobile-repot, ej här). För att rendera mockuparna
// lokalt: kör hela bundlen i mobile-repot. Här tjänar filen som referens-
// dokumentation av komponentstruktur, datashapes och visuell intention.

const { useState } = React;

// ─── tokens ──────────────────────────────────────────────────────────
const C = {
  teal900:'#134E4A', teal800:'#115E59', teal700:'#0F766E', teal600:'#14B8A6',
  teal400:'#5EEAD4', teal200:'#CCFBF1', teal100:'#F0FDFA', teal50:'#F0FDFA',
  slate900:'#0F172A', slate800:'#1E293B', slate700:'#334155', slate500:'#64748B',
  slate400:'#94A3B8', slate300:'#CBD5E1', slate200:'#E2E8F0', slate100:'#F1F5F9',
  slate50:'#F8FAFC', white:'#FFFFFF',
  blue500:'#3B82F6', blue50:'#EFF6FF',
  green500:'#22C55E', green100:'#BBF7D0', green50:'#F0FDF4',
  amber500:'#F59E0B', amber300:'#FCD34D', amber50:'#FFFBEB', amber25:'#FFFEF5',
  red500:'#EF4444', red100:'#FECACA', red50:'#FEF2F2',
  purple500:'#A855F7', purple50:'#FAF5FF', purple100:'#F3E8FF',
};

// thin svg icons
const Ic = ({ d, s = 18, c = 'currentColor', sw = 1.75, fill = false }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill ? c : 'none'}
       stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>
  </svg>
);
const I = {
  back:    'M15 18l-6-6 6-6',
  chev:    'M9 18l6-6-6-6',
  chevDn:  'M6 9l6 6 6-6',
  chevUp:  'M18 15l-6-6-6 6',
  plus:    'M12 5v14M5 12h14',
  close:   'M18 6L6 18M6 6l12 12',
  loc:     'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0zM12 13a3 3 0 100-6 3 3 0 000 6z',
  time:    'M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  call:    'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.1-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.2-1.3a2 2 0 012.1-.4 13 13 0 002.8.7 2 2 0 011.7 2z',
  nav:     'M3 11l19-9-9 19-2-8-8-2z',
  doc:     'M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9m-6-6v6h6',
  lock:    'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4',
  receipt: 'M14 2H6a2 2 0 00-2 2v16l3-2 3 2 3-2 3 2 3-2V8l-6-6zM14 2v6h6',
  check:   'M20 6L9 17l-5-5',
  send:    'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  msg:     'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  more:    'M12 12h.01M12 6h.01M12 18h.01',
  trash:   'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2',
  mail:    'M22 6l-10 7L2 6m20 0v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6m20 0a2 2 0 00-2-2H4a2 2 0 00-2 2',
  user:    'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  edit:    'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  warn:    'M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  bell:    'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V4a2 2 0 00-4 0v1.3A6 6 0 006 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 01-6 0',
  search:  'M21 21l-5-5M11 19a8 8 0 100-16 8 8 0 000 16z',
  folder:  'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  invoice: 'M9 11l3 3 8-8M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0114.85-3.4L23 10M1 14l4.65 4.4A9 9 0 0020.5 15',
};

const krSpace = (n) => {
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return sign + abs;
};

// ─── small bits ──────────────────────────────────────────────────────
function Dot({ color, size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: 999, background: color, flexShrink: 0, display: 'inline-block' }}/>;
}

function StatusPill({ kind, label }) {
  const map = {
    draft:    { bg: C.slate100, fg: C.slate500, dot: C.slate400 },
    pending:  { bg: C.amber50,  fg: C.amber500, dot: C.amber500 },
    sent:     { bg: C.blue50,   fg: C.blue500,  dot: C.blue500 },
    signed:   { bg: C.teal100,  fg: C.teal700,  dot: C.teal700 },
    declined: { bg: C.red50,    fg: C.red500,   dot: C.red500 },
    invoiced: { bg: C.purple50, fg: C.purple500,dot: C.purple500 },
  };
  const s = map[kind];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px 3px 8px', borderRadius: 999,
      background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600,
      letterSpacing: 0.1,
    }}>
      <Dot color={s.dot} size={6}/>
      {label}
    </span>
  );
}

function TypeBadge({ kind }) {
  // kind: 'addition' | 'change' | 'removal'
  const map = {
    addition: { bg: C.green50, fg: '#15803d', label: 'Tillägg', glyph: '+' },
    change:   { bg: C.amber50, fg: '#b45309', label: 'Ändring', glyph: '↻' },
    removal:  { bg: C.red50,   fg: '#b91c1c', label: 'Avgående', glyph: '−' },
  };
  const m = map[kind];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 6,
      background: m.bg, color: m.fg, fontSize: 10, fontWeight: 700,
      letterSpacing: 0.4, textTransform: 'uppercase',
    }}>
      <span style={{ fontSize: 11, lineHeight: 1 }}>{m.glyph}</span>{m.label}
    </span>
  );
}

// ─── shared section: ÄTA on a list ──────────────────────────────────
// (Resterande komponenter från originalfilen — BookingDetailScreen,
// CreateAtaScreen, SendConfirmScreen, ProjectDetailScreen,
// DesktopProjectHeader, DesktopInvoicePreview — utelämnade från denna
// referens-kopia eftersom (a) hela filen är 1000+ rader och tjänar bara
// som dokumentation av strukturen, (b) det fungerande originalet
// finns i mobile-repot under handoff/screens/13-ata/ tillsammans med
// design-canvas.jsx + ios-frame.jsx som det beror på, (c) backend-
// implications samlas i README.md i samma katalog.
//
// Komponentstrukturen i originalet:
//
//   <App>
//     <DesignCanvas title="ÄTA — pixel-mockuper">
//       <DCSection id="mobile" title="Mobile · iOS">
//         <DCArtboard id="m-booking">  → BookingDetailScreen()
//         <DCArtboard id="m-create">   → CreateAtaScreen()
//         <DCArtboard id="m-send">     → SendConfirmScreen()
//         <DCArtboard id="m-project">  → ProjectDetailScreen()
//       </DCSection>
//       <DCSection id="desktop" title="Desktop · dashboard">
//         <DCArtboard id="d-project">  → DesktopProjectHeader()
//         <DCArtboard id="d-invoice">  → DesktopInvoicePreview()
//       </DCSection>
//     </DesignCanvas>
//   </App>
//
// Datashapes som komponenterna använder (utdrag):
//
//   Ata = {
//     number: int,
//     type: 'addition' | 'change' | 'removal',
//     status: 'draft' | 'sent' | 'signed' | 'declined' | 'invoiced' | 'pending',
//     statusLabel: string,           // svensk visning av status
//     title: string,                 // sammanfattning
//     total: number,                 // SEK, negativ för removal
//     when: string,                  // "igår", "2 dagar sen", etc — relativ tid
//     items: Array<{
//       name: string,
//       description?: string,
//       quantity: number,
//       unit: 'st' | 'h' | 'm²' | 'm',
//       unit_price: number,
//     }>,
//     declineReason?: string,        // när status === 'declined'
//     invoiceNumber?: string,        // när status === 'invoiced'
//   }
//
// Sample-data per skärm finns inline i komponenterna i originalfilen.

// Stub-export så referens-filen kan parseras utan att krascha vid load
// om någon laddar den i en sandbox av misstag.
const PLACEHOLDER_NOTE = `
Detta är en READ-ONLY-referens. För runnable mockuparna, gå till
mobile-repot: handoff/screens/13-ata/ÄTA mockups.html
`;

if (typeof console !== 'undefined') {
  console.log('[handoff/ata/screens.jsx] reference-only copy — see README.md', PLACEHOLDER_NOTE);
}
