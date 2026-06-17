/* global React */
const { useState } = React;

/* ─── Tiny inline icons ─── */
const I = {
  back:    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>,
  more:    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>,
  phone:   <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z"/></svg>,
  map:     <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  arrow:   <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>,
  flag:    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M5 21V4h2v1.5l3-1 4 1.5 4-1v9.5l-4 1-4-1.5-3 1V21H5z"/></svg>,
  home:    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12l9-9 9 9M5 10v10h14V10"/></svg>,
  cal:     <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>,
  briefc:  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>,
  chat:    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"/></svg>,
  user:    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
};

/* ─── iPhone wrapper ─── */
const Phone = ({ status = '08:42', dark = false, children }) => (
  <div className="ip-iphone">
    <div className="notch"></div>
    <div className={`status ${dark ? 'dark' : ''}`}>
      <span>{status}</span>
      <span>· · ·</span>
    </div>
    <div className="screen">{children}</div>
    <div className="home-bar"></div>
  </div>
);

/* ─── Tab bar ─── */
const TabBar = ({ active = 'home' }) => (
  <div className="ip-tabbar">
    <div className={`tab ${active === 'home' ? 'active' : ''}`}>{I.home}<span>Hem</span></div>
    <div className={`tab ${active === 'verks' ? 'active' : ''}`}>{I.briefc}<span>Verksamhet</span></div>
    <div className={`tab ${active === 'tid' ? 'active' : ''}`}>{I.cal}<span>Tid</span></div>
    <div className={`tab ${active === 'matte' ? 'active' : ''}`}>{I.chat}<span>Matte</span></div>
    <div className={`tab ${active === 'jag' ? 'active' : ''}`}>{I.user}<span>Jag</span></div>
  </div>
);

/* ─── Section header ─── */
const SectionHead = ({ label, count }) => (
  <div className="ip-section-head">
    <span className="label">{label}</span>
    <span className="count">{count}</span>
    <span className="rule"></span>
  </div>
);

/* ─── Project card (Hem) ─── */
const ProjectCard = ({ band, time, dur, customer, addr, project, day, total, stages, task }) => (
  <div className="ip-card project" style={{ '--band': band }}>
    <div className="proj-tag">
      <span>● {project}</span>
      <span className="day">· dag {day}/{total}</span>
    </div>
    <div className="row">
      <div className="time">{time}<span className="dur">· {dur}</span></div>
    </div>
    <div className="customer">{customer}</div>
    <div className="addr">{addr}</div>
    <div className="progress">
      {Array.from({ length: 8 }).map((_, i) => {
        const cls = i < stages.done ? 'done' : i === stages.done ? 'current' : '';
        return <div key={i} className={`seg ${cls}`}></div>;
      })}
    </div>
    <div className="task">{task}</div>
  </div>
);

/* ─── Standalone (lös) booking card ─── */
const LooseCard = ({ time, dur, customer, addr, kind }) => (
  <div className="ip-card">
    <div className="row">
      <div className="time">{time}<span className="dur">· {dur}</span></div>
      {kind && <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{kind}</span>}
    </div>
    <div className="customer">{customer}</div>
    <div className="addr">{addr}</div>
  </div>
);

/* ────────────────────────────────────────────────────────────────
   SCREEN 1 · Hem · Idag (Modell B med smart-hide)
──────────────────────────────────────────────────────────────── */
const ScreenHemIdag = () => (
  <Phone>
    <div className="ip-app">
      <div className="ip-app-body" style={{ overflowY: 'auto' }}>
        <div className="ip-greet">
          <h1>Hej Magnus</h1>
          <div className="date">Måndag 27 april</div>
        </div>
        <div className="ip-kpi">
          <div><div className="v">5</div><div className="l">jobb idag</div></div>
          <div className="sep"></div>
          <div><div className="v">7,5h</div><div className="l">planerat</div></div>
          <div className="sep"></div>
          <div><div className="v">2</div><div className="l">projekt</div></div>
        </div>

        <SectionHead label="Projekt idag" count="2" />
        <ProjectCard
          band="#7C3AED"
          time="08:00 – 11:00"
          dur="3h"
          customer="Anna Lindqvist"
          addr="Stockholmsvägen 32, Bromma"
          project="Bromma-tak"
          day={4} total={12}
          stages={{ done: 3 }}
          task="Underlagspapp sektor norr · säkra takfot"
        />
        <ProjectCard
          band="#B45309"
          time="11:30 – 13:00"
          dur="1,5h"
          customer="Mette Rasmussen"
          addr="Hagalundsgatan 4, Solna"
          project="Hagalund-el"
          day={4} total={8}
          stages={{ done: 4 }}
          task="Eldragning vardagsrum · slutbesiktning förbereds"
        />

        <SectionHead label="Lösa pass" count="3" />
        <LooseCard time="13:30 – 14:30" dur="1h" customer="Olof Persson" addr="Solnavägen 12, Solna" kind="Offertbesök" />
        <LooseCard time="15:00 – 16:00" dur="1h" customer="Stefan Blomberg" addr="Sundbybergsvägen 9, Solna" kind="Service" />
        <LooseCard time="16:30 – 17:30" dur="1h" customer="Familjen Berg" addr="Bromsvägen 5, Solna" kind="Felanmälan" />
      </div>
      <TabBar active="home" />
    </div>
  </Phone>
);

/* ────────────────────────────────────────────────────────────────
   SCREEN 2 · Jobbdetalj · projekt-bokning
──────────────────────────────────────────────────────────────── */
const ScreenJobbdetalj = ({ isFinal = false }) => {
  const stages = isFinal
    ? { done: 7, current: -1 }   // all done, last one current
    : { done: 3, current: 3 };
  return (
    <Phone>
      <div className="ip-app">
        <div className="ip-detail-head">
          <button className="ip-icon-btn">{I.back}</button>
          <button className="ip-icon-btn" style={{ marginLeft: 'auto' }}>{I.more}</button>
        </div>

        {!isFinal ? (
          <div className="ip-banner" style={{ '--banner': '#7C3AED', '--banner-2': '#5B21B6' }}>
            <div className="name">Bromma-tak</div>
            <div className="day-line">
              <span className="pill">Dag 4 av 12</span>
              <span>Stage: Pågående</span>
            </div>
            <div className="stage-bar">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={`seg ${i < 3 ? 'done' : i === 3 ? 'current' : ''}`}></div>
              ))}
            </div>
            <div className="open-link">Öppna projekt {I.arrow}</div>
          </div>
        ) : (
          <div className="ip-banner final">
            <div className="celebrate">{I.flag} SISTA DAGEN</div>
            <div className="name">Bromma-tak</div>
            <div className="day-line">
              <span className="pill">Dag 12 av 12</span>
              <span>Stage: Besiktning</span>
            </div>
            <div className="stage-bar">
              {Array.from({ length: 8 }).map((_, i) => {
                let cls = '';
                if (i < 4) cls = 'done last-done';
                else if (i === 4) cls = 'current';
                return <div key={i} className={`seg ${cls}`}></div>;
              })}
            </div>
            <div className="open-link">Öppna projekt {I.arrow}</div>
          </div>
        )}

        <div className="ip-detail" style={{ overflowY: 'auto', maxHeight: 'calc(100% - 250px)' }}>
          <div className="ip-time-block">
            08:00 – 11:00<span className="dur">3h</span>
          </div>
          <div className="ip-customer-block">Anna Lindqvist</div>
          <div className="ip-addr-block">Stockholmsvägen 32, Bromma · 5 min bort</div>

          <div className="ip-quick">
            <button className="btn">{I.phone} Ring Anna</button>
            <button className="btn primary">{I.map} Navigera</button>
          </div>

          {!isFinal ? (
            <>
              <h3>Idag</h3>
              <ul className="ip-task-list">
                <li>Underlagspapp sektor norr</li>
                <li>Säkra takfot</li>
                <li>Foto till kund – efter avslut</li>
              </ul>

              <h3>Imorgon (dag 5)</h3>
              <ul className="ip-task-list next">
                <li>Läggning sektor öst <span className="label">Plan</span></li>
                <li>Material levereras 07:30 <span className="label">Logistik</span></li>
              </ul>

              <h3>Senaste från Anna</h3>
              <div className="ip-notes">
                <div className="author">Anna · igår 17:42</div>
                "Vi har ett barn som sover middag 12–13:30, kan ni göra paus där om möjligt?"
              </div>
            </>
          ) : (
            <>
              <h3>Sista dagens uppgifter</h3>
              <ul className="ip-task-list">
                <li>Slutbesiktning med Anna</li>
                <li>Foton – färdigt resultat</li>
                <li>Lämna 10-årsgaranti</li>
              </ul>

              <h3>Vad händer när du trycker</h3>
              <div className="ip-notes" style={{ background: '#F0FDF9', borderColor: '#99F6E0', color: '#0F2E2A' }}>
                <div className="author" style={{ color: '#0F766E' }}>Matte förbereder</div>
                Faktura skapas (152 400 kr inkl moms · ROT 35 600 kr) ·
                projekt arkiveras · Anna får tackmail med foto + recensionslänk · Lisa följer upp om 7 dagar.
              </div>
            </>
          )}
        </div>

        <div className="ip-cta-wrap">
          {!isFinal ? (
            <button className="ip-cta">
              <div>
                <div className="label">Avsluta dagen</div>
                <div className="ctx">Dag 4 → 5 · 8 dagar kvar</div>
              </div>
              <span className="arrow">→</span>
            </button>
          ) : (
            <button className="ip-cta final">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="flag">{I.flag}</span>
                <div>
                  <div className="label">Slutför projektet & fakturera</div>
                  <div className="ctx">Dag 12 av 12 · skapar faktura 152 400 kr</div>
                </div>
              </div>
              <span className="arrow">→</span>
            </button>
          )}
        </div>
        <TabBar active="home" />
      </div>
    </Phone>
  );
};

/* ────────────────────────────────────────────────────────────────
   SCREEN 4 · Dashboard · Schema-vy
──────────────────────────────────────────────────────────────── */
const ScreenSchema = () => {
  const days = ['Mån 27', 'Tis 28', 'Ons 29', 'Tor 30', 'Fre 1'];
  const todayIdx = 0;
  return (
    <div className="ip-desktop">
      <div className="ip-desktop-chrome">
        <div className="dots"><div className="dot r"></div><div className="dot y"></div><div className="dot g"></div></div>
        <div className="url">app.handymate.se / schema</div>
      </div>
      <div className="ip-desktop-body">
        <div className="ip-side">
          <div className="brand"><img src="../assets/logo.png" alt="" /><b>Handymate</b></div>
          <div className="nav-item">📊 <span>Dashboard</span></div>
          <div className="nav-item">🏗️ <span>Verksamhet</span></div>
          <div className="nav-item active">📅 <span>Schema</span></div>
          <div className="nav-item">📄 <span>Offerter</span></div>
          <div className="nav-item">🧾 <span>Fakturor</span></div>
          <div className="nav-item">⏱️ <span>Tid</span></div>
          <div className="nav-item">👥 <span>Kunder</span></div>
        </div>

        <div className="ip-main">
          <div className="ip-main-head">
            <h2>Schema · v.18</h2>
            <div className="week-nav">
              <button>‹</button>
              <span className="label">27 apr – 1 maj</span>
              <button>›</button>
            </div>
          </div>

          <div className="ip-schedule-section">
            <span>Projekt denna vecka · 2</span>
            <span className="rule"></span>
          </div>

          {/* Bromma-tak lane */}
          <div className="ip-schedule-lane" style={{ '--lane-bg': '#F5F3FF', '--lane-bg-soft': '#EDE9FE', '--lane-border': '#DDD6FE', '--lane-text': '#7C3AED', '--lane-text-soft': '#5B21B6' }}>
            <div className="ip-lane-head">
              <span className="name">Bromma-tak</span>
              <span className="meta">Anna Lindqvist · dag 4 av 12 · stage: pågående</span>
              <div className="progress">
                <span>33%</span>
                <div className="bar"><div className="fill" style={{ width: '33%', background: '#7C3AED' }}></div></div>
              </div>
            </div>
            <div className="ip-lane-grid">
              {days.map((d, i) => (
                <div key={i} className={`day ${i === todayIdx ? 'today' : ''}`}>
                  <div className="day-num">{d}</div>
                  <div className="booking">
                    <span className="t">08–11</span>
                    {i === 0 && 'Underlagspapp norr'}
                    {i === 1 && 'Läggning öst'}
                    {i === 2 && 'Läggning väst'}
                    {i === 3 && 'Plåtdetaljer'}
                    {i === 4 && 'Hängrännor'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hagalund-el lane */}
          <div className="ip-schedule-lane" style={{ '--lane-bg': '#FFFBEB', '--lane-bg-soft': '#FEF3C7', '--lane-border': '#FDE68A', '--lane-text': '#B45309', '--lane-text-soft': '#92400E' }}>
            <div className="ip-lane-head">
              <span className="name">Hagalund-el</span>
              <span className="meta">Mette Rasmussen · dag 4 av 8 · stage: delmål</span>
              <div className="progress">
                <span>50%</span>
                <div className="bar"><div className="fill" style={{ width: '50%', background: '#B45309' }}></div></div>
              </div>
            </div>
            <div className="ip-lane-grid">
              <div className={`day today`}>
                <div className="day-num">Mån 27</div>
                <div className="booking"><span className="t">11:30–13</span>Eldragning vardagsrum</div>
              </div>
              <div className="day"><div className="day-num">Tis 28</div><div className="booking"><span className="t">09–12</span>Eldragning kök</div></div>
              <div className="day empty"><div className="day-num">Ons 29</div></div>
              <div className="day"><div className="day-num">Tor 30</div><div className="booking"><span className="t">13–16</span>Slutbesiktning</div></div>
              <div className="day empty"><div className="day-num">Fre 1</div></div>
            </div>
          </div>

          <div className="ip-schedule-section" style={{ marginTop: 28 }}>
            <span>Lösa pass denna vecka · 8</span>
            <span className="rule"></span>
          </div>
          <div className="ip-loose-grid">
            <div className="ip-loose-day today">
              <div className="day-num">Mån 27</div>
              <div className="booking"><span className="t">13:30</span>Olof P · offertbesök</div>
              <div className="booking"><span className="t">15:00</span>Stefan B · service</div>
              <div className="booking"><span className="t">16:30</span>Berg · felanmälan</div>
            </div>
            <div className="ip-loose-day">
              <div className="day-num">Tis 28</div>
              <div className="booking"><span className="t">14:00</span>Maria L · offertbesök</div>
            </div>
            <div className="ip-loose-day">
              <div className="day-num">Ons 29</div>
              <div className="booking"><span className="t">10:00</span>Karlsson · garanti</div>
              <div className="booking"><span className="t">15:00</span>Söderberg · service</div>
            </div>
            <div className="ip-loose-day">
              <div className="day-num">Tor 30</div>
              <div className="booking" style={{ color: '#94A3B8' }}><span className="t">·</span>Inga lösa pass</div>
            </div>
            <div className="ip-loose-day">
              <div className="day-num">Fre 1</div>
              <div className="booking"><span className="t">09:00</span>Jönsson · besiktning</div>
              <div className="booking"><span className="t">13:00</span>Eriksson · offert</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────
   SCREEN 5 · Dashboard · Projekt-detalj (Bromma-tak)
──────────────────────────────────────────────────────────────── */
const ScreenProjectDetail = () => {
  const stages = [
    { l: 'Kontrakt',   d: '12 apr',         c: '#0F766E', state: 'done' },
    { l: 'Startmöte',  d: '15 apr',         c: '#0284C7', state: 'done' },
    { l: 'Pågående',   d: '21 apr – idag',  c: '#7C3AED', state: 'current' },
    { l: 'Delmål',     d: '6 maj',          c: '#B45309', state: '' },
    { l: 'Besiktning', d: '8 maj',          c: '#DC2626', state: '' },
    { l: 'Fakturerat', d: '8 maj',          c: '#0369A1', state: '' },
    { l: 'Betald',     d: '~22 maj',        c: '#16A34A', state: '' },
    { l: 'Recension',  d: '~23 maj',        c: '#059669', state: '' },
  ];
  return (
    <div className="ip-desktop">
      <div className="ip-desktop-chrome">
        <div className="dots"><div className="dot r"></div><div className="dot y"></div><div className="dot g"></div></div>
        <div className="url">app.handymate.se / projekt / bromma-tak</div>
      </div>
      <div className="ip-desktop-body">
        <div className="ip-side">
          <div className="brand"><img src="../assets/logo.png" alt="" /><b>Handymate</b></div>
          <div className="nav-item">📊 <span>Dashboard</span></div>
          <div className="nav-item active">🏗️ <span>Verksamhet</span></div>
          <div className="nav-item">📅 <span>Schema</span></div>
          <div className="nav-item">📄 <span>Offerter</span></div>
          <div className="nav-item">🧾 <span>Fakturor</span></div>
          <div className="nav-item">⏱️ <span>Tid</span></div>
          <div className="nav-item">👥 <span>Kunder</span></div>
        </div>
        <div className="ip-main">
          <div className="ip-proj-head">
            <div className="icon">🏠</div>
            <div>
              <div className="name">Bromma-tak</div>
              <div className="sub">Anna Lindqvist · Stockholmsvägen 32, Bromma · taklägg 240 m²</div>
            </div>
            <div className="num">152 400 kr<span className="small">offerterat · inkl moms</span></div>
          </div>

          <div className="ip-stats">
            <div className="ip-stat">
              <div className="l">Dag av plan</div>
              <div className="v">4 / 12</div>
              <div className="delta ok">↑ i tid</div>
            </div>
            <div className="ip-stat">
              <div className="l">Tid loggad</div>
              <div className="v">28h</div>
              <div className="delta">budget 96h</div>
            </div>
            <div className="ip-stat">
              <div className="l">Material</div>
              <div className="v">42 800 kr</div>
              <div className="delta warn">↑ +3,2% vs offert</div>
            </div>
            <div className="ip-stat">
              <div className="l">Marginal</div>
              <div className="v">38%</div>
              <div className="delta ok">offert: 36%</div>
            </div>
          </div>

          <div className="ip-stages">
            {stages.map((s, i) => (
              <div key={i} className={`ip-stage ${s.state}`} style={{ '--c': s.c }}>
                <div className="bar"></div>
                <div className="label">{i+1}. {s.l}</div>
                <div className="dates">{s.d}</div>
              </div>
            ))}
          </div>

          <div className="ip-book-table">
            <div className="ip-book-week">Vecka 17 – föregående</div>
            <div className="ip-book-row">
              <div className="when"><div className="day">Mån</div><div className="date">21 apr</div></div>
              <div className="what">Rivning sektor norr<div className="desc">Magnus + Erik · 8h vardera</div></div>
              <div className="hours">16h</div>
              <div className="status done"><div className="dot"></div>Klar</div>
            </div>
            <div className="ip-book-row">
              <div className="when"><div className="day">Tis</div><div className="date">22 apr</div></div>
              <div className="what">Rivning sektor öst<div className="desc">Magnus + Erik</div></div>
              <div className="hours">14h</div>
              <div className="status done"><div className="dot"></div>Klar</div>
            </div>
            <div className="ip-book-row">
              <div className="when"><div className="day">Ons</div><div className="date">23 apr</div></div>
              <div className="what">Förbered tak – duk + säkring<div className="desc">Magnus solo</div></div>
              <div className="hours">6h</div>
              <div className="status done"><div className="dot"></div>Klar</div>
            </div>
            <div className="ip-book-week">Vecka 18 – denna vecka</div>
            <div className="ip-book-row today">
              <div className="when"><div className="day">Mån</div><div className="date">27 apr · idag</div></div>
              <div className="what">Underlagspapp sektor norr<div className="desc">Magnus · 08:00–11:00</div></div>
              <div className="hours">3h</div>
              <div className="status current"><div className="dot"></div>Pågår</div>
            </div>
            <div className="ip-book-row">
              <div className="when"><div className="day">Tis</div><div className="date">28 apr</div></div>
              <div className="what">Läggning sektor öst<div className="desc">Magnus + Erik · 08:00–16:00</div></div>
              <div className="hours">16h</div>
              <div className="status planned"><div className="dot"></div>Planerad</div>
            </div>
            <div className="ip-book-row">
              <div className="when"><div className="day">Ons</div><div className="date">29 apr</div></div>
              <div className="what">Läggning sektor väst<div className="desc">Magnus + Erik</div></div>
              <div className="hours">16h</div>
              <div className="status planned"><div className="dot"></div>Planerad</div>
            </div>
            <div className="ip-book-row">
              <div className="when"><div className="day">Tor</div><div className="date">30 apr</div></div>
              <div className="what">Plåtdetaljer + skorsten<div className="desc">Magnus · 08–14</div></div>
              <div className="hours">6h</div>
              <div className="status planned"><div className="dot"></div>Planerad</div>
            </div>
            <div className="ip-add-booking">+ Lägg till bokning</div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Mount ─── */
window.IPScreens = {
  HemIdag: ScreenHemIdag,
  Jobbdetalj: () => <ScreenJobbdetalj isFinal={false} />,
  JobbdetaljFinal: () => <ScreenJobbdetalj isFinal={true} />,
  Schema: ScreenSchema,
  ProjectDetail: ScreenProjectDetail,
};
