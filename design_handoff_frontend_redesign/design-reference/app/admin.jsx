// Hop & Bites — Beheer (Admin). Antraciet rail + offwhite content.
// Real pages for Dashboard, Menu, Dagafsluiting (Z-bon), Personeel, Audit;
// the rest route to a clean styled placeholder so nothing dead-ends.

const ADMIN_NAV = [
  { type: "link", id: "dash", label: "Dashboard", icon: "layout-dashboard" },
  { type: "head", label: "Operationeel" },
  { type: "link", id: "voorraad", label: "Voorraad", icon: "boxes", offline: true },
  { type: "link", id: "availability", label: "Beschikbaarheid", icon: "toggle-right", offline: true },
  { type: "link", id: "prijs", label: "Prijs (tijdelijk)", icon: "tag", offline: true },
  { type: "link", id: "devices", label: "Apparaten", icon: "cpu", offline: true },
  { type: "link", id: "dag", label: "Dagafsluiting", icon: "receipt-text", offline: true },
  { type: "head", label: "Beheer" },
  { type: "link", id: "menu", label: "Menu", icon: "book-open" },
  { type: "link", id: "staff", label: "Personeel", icon: "users" },
  { type: "link", id: "theme", label: "Thema", icon: "palette" },
  { type: "link", id: "usage", label: "AI-gebruik", icon: "sparkles" },
  { type: "link", id: "audit", label: "Audit log", icon: "scroll-text" },
  { type: "link", id: "chat", label: "AI-chat", icon: "message-circle" },
];

function Admin() {
  const { go, venue } = useApp();
  const [page, setPage] = React.useState("dash");
  return (
    <div style={{ width: "100%", height: "100%", display: "grid", gridTemplateColumns: "260px 1fr", background: "var(--bg-app)" }}>
      {/* Rail */}
      <aside style={{ background: "var(--charcoal-900)", color: "var(--offwhite)", display: "flex", flexDirection: "column", padding: "20px 14px", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 8px 18px" }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: "var(--charcoal-800)", display: "flex", alignItems: "center", justifyContent: "center", font: "800 21px/1 var(--font-sans)" }}>H<span style={{ color: "var(--hop-500)" }}>&amp;</span>B</div>
          <div>
            <div style={{ font: "800 19px/1 var(--font-sans)" }}>Hop <span style={{ color: "var(--hop-500)" }}>&amp;</span> Bites</div>
            <div style={{ font: "600 11px/1 var(--font-sans)", letterSpacing: "0.14em", color: "var(--charcoal-400)", marginTop: 4 }}>BEHEER</div>
          </div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {ADMIN_NAV.map((n, i) => n.type === "head" ? (
            <div key={i} style={{ padding: "16px 12px 6px", font: "700 11px/1 var(--font-sans)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--charcoal-500)" }}>{n.label}</div>
          ) : (
            <button key={n.id} onClick={() => setPage(n.id)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", border: "none", borderRadius: "var(--radius-md)", background: page === n.id ? "var(--hop-600)" : "transparent", color: page === n.id ? "#fff" : "var(--charcoal-300)", font: "700 15px/1 var(--font-sans)", cursor: "pointer", textAlign: "left", WebkitTapHighlightColor: "transparent" }}>
              <Icon name={n.icon} size={18} color={page === n.id ? "#fff" : "var(--charcoal-400)"} />
              <span style={{ flex: 1 }}>{n.label}</span>
              {n.offline ? <span title="Werkt offline via Pi-bridge" style={{ width: 8, height: 8, borderRadius: 999, background: "var(--hop-500)" }} /> : null}
            </button>
          ))}
        </nav>
        <button onClick={() => go("launcher")} style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: "12px", border: "1px solid var(--charcoal-700)", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--charcoal-300)", font: "700 14px/1 var(--font-sans)", cursor: "pointer", whiteSpace: "nowrap" }}><Icon name="layout-grid" size={17} /> Naar start</button>
      </aside>
      {/* Content */}
      <main style={{ minHeight: 0, overflowY: "auto", padding: "32px 40px" }}>
        <AdminTopline venue={venue} />
        <AdminPage page={page} />
      </main>
    </div>
  );
}

function AdminTopline({ venue }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
      <div style={{ font: "600 14px/1 var(--font-sans)", color: "var(--text-muted)" }}>{venue?.name || "Foodtruck — Centrum"}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, font: "600 13px/1 var(--font-sans)", color: "var(--text-muted)" }}><span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--hop-500)" }} /> Pi-bridge · online</span>
        <div style={{ width: 38, height: 38, borderRadius: 999, background: "var(--hop-600)", display: "flex", alignItems: "center", justifyContent: "center", font: "700 15px/1 var(--font-sans)", color: "#fff" }}>M</div>
      </div>
    </div>
  );
}

function PageHead({ eyebrow, title, sub, action }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
      <div>
        {eyebrow ? <div style={{ font: "700 12px/1 var(--font-sans)", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--hop-700)", marginBottom: 8 }}>{eyebrow}</div> : null}
        <h2 style={{ font: "800 34px/1.05 var(--font-sans)", letterSpacing: "-0.02em", color: "var(--text-strong)", margin: 0 }}>{title}</h2>
        {sub ? <div style={{ font: "500 16px/1.4 var(--font-sans)", color: "var(--text-muted)", marginTop: 8 }}>{sub}</div> : null}
      </div>
      {action || null}
    </div>
  );
}

function AdminPage({ page }) {
  switch (page) {
    case "dash": return <DashPage />;
    case "menu": return <MenuPage />;
    case "dag": return <DagPage />;
    case "staff": return <StaffPage />;
    case "audit": return <AuditPage />;
    case "availability": return <MenuPage availabilityOnly />;
    case "voorraad": return <VoorraadPage />;
    case "prijs": return <PrijsPage />;
    case "devices": return <DevicesPage />;
    case "theme": return <ThemePage />;
    case "usage": return <UsagePage />;
    case "chat": return <ChatPage />;
    default: return <DashPage />;
  }
}

/* ---------- Dashboard ---------- */
const DASH = {
  date: "9 jun 2026",
  omzet: 1284.5, btw: 106.05, orders: 137, gem: 9.38,
  cash: 412.0, pin: 802.5, ideal: 70.0,
  top: [
    { name: "Langós Pulled Pork", n: 41, sum: 389.5 },
    { name: "Langós Pulled Chicken", n: 33, sum: 313.5 },
    { name: "Frietjes", n: 52, sum: 208.0 },
    { name: "Speciaalbier", n: 38, sum: 171.0 },
    { name: "Langós Beef Brisket", n: 12, sum: 132.0 },
  ],
  hours: [3, 6, 12, 28, 41, 33, 24, 18, 30, 44, 38, 20],
};
function StatCard({ label, value, icon, accent }) {
  return (
    <div style={{ background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
        <span style={{ width: 34, height: 34, borderRadius: "var(--radius-md)", background: accent, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={18} color="#fff" /></span>
        <span style={{ font: "700 12px/1 var(--font-sans)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{label}</span>
      </div>
      <div className="hb-tabular" style={{ font: "800 32px/1 var(--font-sans)", color: "var(--text-strong)" }}>{value}</div>
    </div>
  );
}
function DashPage() {
  const { Button } = window.HopBitesDesignSystem_c232d8;
  const totalPay = DASH.cash + DASH.pin + DASH.ideal;
  const PAY = [
    { label: "PIN", amount: DASH.pin, color: "var(--hop-600)" },
    { label: "Contant", amount: DASH.cash, color: "var(--charcoal-700)" },
    { label: "iDEAL", amount: DASH.ideal, color: "var(--amber-600)" },
  ];
  const maxH = Math.max(...DASH.hours);
  return (
    <>
      <PageHead eyebrow={"Vandaag · " + DASH.date} title="Dashboard" sub="Live omzet en activiteit van deze locatie." action={<Button variant="secondary" icon={<Icon name="download" size={18} />}>Exporteer dag</Button>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
        <StatCard label="Omzet incl." value={euro(DASH.omzet)} icon="euro" accent="var(--hop-600)" />
        <StatCard label="Orders" value={DASH.orders} icon="receipt" accent="var(--charcoal-700)" />
        <StatCard label="Gem. bon" value={euro(DASH.gem)} icon="trending-up" accent="var(--amber-600)" />
        <StatCard label="BTW (9%)" value={euro(DASH.btw)} icon="percent" accent="var(--brick-600)" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        {/* Omzet per uur */}
        <div style={{ background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", padding: 24 }}>
          <div style={{ font: "800 18px/1 var(--font-sans)", color: "var(--text-strong)", marginBottom: 4 }}>Orders per uur</div>
          <div style={{ font: "500 14px/1 var(--font-sans)", color: "var(--text-muted)", marginBottom: 24 }}>11:00 – 23:00</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180 }}>
            {DASH.hours.map((h, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ width: "100%", height: (h / maxH) * 150, background: i === 9 ? "var(--hop-600)" : "var(--hop-300)", borderRadius: 3 }} />
                <span className="hb-tabular" style={{ font: "600 11px/1 var(--font-sans)", color: "var(--text-muted)" }}>{11 + i}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Payment split */}
        <div style={{ background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", padding: 24 }}>
          <div style={{ font: "800 18px/1 var(--font-sans)", color: "var(--text-strong)", marginBottom: 4 }}>Betaalmethoden</div>
          <div style={{ font: "500 14px/1 var(--font-sans)", color: "var(--text-muted)", marginBottom: 24 }}>Totaal {euro(totalPay)}</div>
          <div style={{ display: "flex", height: 16, borderRadius: 3, overflow: "hidden", gap: 2 }}>
            {PAY.map((p) => <div key={p.label} style={{ flex: p.amount, background: p.color }} />)}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            {PAY.map((p) => (
              <div key={p.label} style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, font: "700 13px/1 var(--font-sans)", color: "var(--text-body)", marginBottom: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flex: "none" }} /> {p.label}</div>
                <div className="hb-tabular" style={{ font: "700 15px/1 var(--font-sans)", color: "var(--text-strong)", whiteSpace: "nowrap" }}>{euro(p.amount)}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
            <div style={{ font: "800 14px/1 var(--font-sans)", color: "var(--text-strong)", marginBottom: 14 }}>Best verkocht</div>
            {DASH.top.slice(0, 4).map((t) => (
              <div key={t.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "7px 0" }}>
                <span style={{ flex: 1, minWidth: 0, font: "600 14px/1.2 var(--font-sans)", color: "var(--text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span className="hb-tabular" style={{ color: "var(--text-muted)", marginRight: 8 }}>{t.n}×</span>{t.name}</span>
                <span className="hb-tabular" style={{ flex: "none", font: "700 14px/1 var(--font-sans)", color: "var(--text-strong)", whiteSpace: "nowrap" }}>{euro(t.sum)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- Menu / availability ---------- */
function MenuPage({ availabilityOnly }) {
  const MENU = window.HB_MENU;
  const [state, setState] = React.useState(() => {
    const s = {};
    Object.keys(MENU.products).forEach((cat) => MENU.products[cat].forEach((p) => { s[p.id] = { on: true, stock: null }; }));
    s["l-brisket"] = { on: true, stock: 4 };
    s["s-zoet"] = { on: false, stock: 0 };
    s["b-ipa"] = { on: true, stock: 7 };
    return s;
  });
  const toggle = (id) => setState((cur) => ({ ...cur, [id]: { ...cur[id], on: !cur[id].on } }));
  const { Badge } = window.HopBitesDesignSystem_c232d8;
  const cats = Object.keys(MENU.products);
  return (
    <>
      <PageHead eyebrow="Beheer" title={availabilityOnly ? "Beschikbaarheid" : "Menu"} sub="Zet items aan/uit en houd voorraad bij. Wijzigingen verschijnen direct op de kassa." />
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {cats.map((cat) => (
          <div key={cat}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: MENU.categories[cat].accent }} />
              <span style={{ font: "800 17px/1 var(--font-sans)", color: "var(--text-strong)" }}>{MENU.categories[cat].label}</span>
            </div>
            <div style={{ background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
              {MENU.products[cat].map((p, i) => {
                const st = state[p.id];
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", borderTop: i ? "1px solid var(--border)" : "none", opacity: st.on ? 1 : 0.55 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ font: "700 16px/1 var(--font-sans)", color: "var(--text-strong)" }}>{p.name}</div>
                      {p.sublabel ? <div style={{ font: "500 13px/1 var(--font-sans)", color: "var(--text-muted)", marginTop: 4 }}>{p.sublabel}</div> : null}
                    </div>
                    {st.stock !== null ? <Badge variant={st.stock <= 0 ? "danger" : st.stock <= 5 ? "amber" : "neutral"}>{st.stock <= 0 ? "Uitverkocht" : st.stock + " op voorraad"}</Badge> : null}
                    <span className="hb-tabular" style={{ font: "700 16px/1 var(--font-sans)", color: "var(--text-strong)", minWidth: 78, textAlign: "right" }}>{euro(p.price)}</span>
                    <button onClick={() => toggle(p.id)} aria-pressed={st.on} style={{ width: 56, height: 32, flex: "none", borderRadius: 999, border: "none", background: st.on ? "var(--hop-600)" : "var(--charcoal-300)", position: "relative", cursor: "pointer", transition: "background var(--dur-base) var(--ease-out)" }}>
                      <span style={{ position: "absolute", top: 3, left: st.on ? 27 : 3, width: 26, height: 26, borderRadius: 999, background: "#fff", transition: "left var(--dur-base) var(--ease-out)" }} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- Dagafsluiting (Z-bon) ---------- */
function DagPage() {
  const { Button } = window.HopBitesDesignSystem_c232d8;
  const row = (label, val, opts = {}) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: opts.big ? "14px 0" : "7px 0", borderTop: opts.rule ? "1px solid var(--border)" : "none" }}>
      <span style={{ font: (opts.big ? "800 20px" : "500 15px") + "/1 var(--font-sans)", color: opts.muted ? "var(--text-muted)" : "var(--text-body)" }}>{label}</span>
      <span className="hb-tabular" style={{ font: (opts.big ? "800 24px" : "700 15px") + "/1 var(--font-sans)", color: "var(--text-strong)" }}>{val}</span>
    </div>
  );
  return (
    <>
      <PageHead eyebrow="Operationeel · werkt offline" title="Dagafsluiting" sub={"Z-bon voor " + DASH.date + " · Foodtruck Centrum"} action={<Button variant="primary" icon={<Icon name="printer" size={18} />}>Print Z-bon</Button>} />
      <div style={{ maxWidth: 560, background: "var(--bg-receipt)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", padding: "28px 32px" }}>
        <div style={{ textAlign: "center", paddingBottom: 18, borderBottom: "1px dashed var(--line-strong)" }}>
          <div style={{ font: "800 22px/1 var(--font-sans)", color: "var(--text-strong)" }}>Hop &amp; Bites — Z-bon</div>
          <div style={{ font: "600 13px/1 var(--font-sans)", color: "var(--text-muted)", marginTop: 6 }}>{DASH.date} · Kassa 1 · Manon</div>
        </div>
        <div style={{ padding: "16px 0", borderBottom: "1px dashed var(--line-strong)" }}>
          {row("Aantal orders", DASH.orders)}
          {row("Bruto omzet", euro(DASH.omzet))}
          {row("Waarvan BTW 9%", euro(DASH.btw), { muted: true })}
          {row("Gemiddelde bon", euro(DASH.gem), { muted: true })}
        </div>
        <div style={{ padding: "16px 0", borderBottom: "1px dashed var(--line-strong)" }}>
          {row("PIN / contactloos", euro(DASH.pin))}
          {row("Contant", euro(DASH.cash))}
          {row("iDEAL (QR)", euro(DASH.ideal))}
        </div>
        {row("Totaal afgerekend", euro(DASH.cash + DASH.pin + DASH.ideal), { big: true, rule: true })}
        <div style={{ marginTop: 18, padding: "12px 14px", background: "var(--hop-50)", border: "1px solid var(--hop-100)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", gap: 10, font: "600 13px/1.4 var(--font-sans)", color: "var(--hop-800)" }}>
          <Icon name="shield-check" size={18} color="var(--hop-700)" /> Kasverschil € 0,00 · lade geteld en bevestigd
        </div>
      </div>
    </>
  );
}

/* ---------- Personeel ---------- */
const STAFF = [
  { name: "Manon de Vries", role: "Manager", pin: "1042", active: true },
  { name: "Joost Bakker", role: "Kassier", pin: "2207", active: true },
  { name: "Fatima El Amrani", role: "Keuken", pin: "3318", active: true },
  { name: "Tom Jansen", role: "Kassier", pin: "2290", active: false },
];
function StaffPage() {
  const { Button, Badge } = window.HopBitesDesignSystem_c232d8;
  const roleVar = { Manager: "accent", Kassier: "neutral", Keuken: "amber" };
  return (
    <>
      <PageHead eyebrow="Beheer" title="Personeel" sub="Wie mag inloggen op kassa, keuken en beheer." action={<Button variant="primary" icon={<Icon name="user-plus" size={18} />}>Nieuw personeel</Button>} />
      <div style={{ background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "12px 20px", borderBottom: "1px solid var(--border)", font: "700 12px/1 var(--font-sans)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          <span>Naam</span><span>Rol</span><span>PIN</span><span>Status</span>
        </div>
        {STAFF.map((s, i) => (
          <div key={s.name} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", alignItems: "center", padding: "16px 20px", borderTop: i ? "1px solid var(--border)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 38, height: 38, borderRadius: 999, background: "var(--charcoal-800)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", font: "700 14px/1 var(--font-sans)" }}>{s.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
              <span style={{ font: "700 16px/1 var(--font-sans)", color: "var(--text-strong)" }}>{s.name}</span>
            </div>
            <span><Badge variant={roleVar[s.role]}>{s.role}</Badge></span>
            <span className="hb-tabular" style={{ font: "600 15px/1 var(--font-sans)", color: "var(--text-muted)", letterSpacing: "0.2em" }}>••••</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, font: "600 14px/1 var(--font-sans)", color: s.active ? "var(--hop-700)" : "var(--text-muted)" }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: s.active ? "var(--hop-500)" : "var(--charcoal-300)" }} /> {s.active ? "Actief" : "Inactief"}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- Audit ---------- */
const AUDIT = [
  { t: "14:32", who: "Manon", act: "Prijs gewijzigd", det: "Speciaalbier € 4,50 → € 4,00 (tijdelijk)", icon: "tag", c: "var(--amber-600)" },
  { t: "14:18", who: "Joost", act: "Retour geboekt", det: "Bon #198 · € 9,50 · pulled pork", icon: "undo-2", c: "var(--brick-600)" },
  { t: "13:55", who: "Manon", act: "Item uitgezet", det: "Zoete friet — uitverkocht", icon: "toggle-left", c: "var(--charcoal-600)" },
  { t: "12:40", who: "Systeem", act: "Pi-bridge herverbonden", det: "LAN hersteld na 22s", icon: "wifi", c: "var(--hop-600)" },
  { t: "11:02", who: "Manon", act: "Dienst gestart", det: "Kassa 1 geopend · lade € 150,00", icon: "play", c: "var(--hop-600)" },
];
function AuditPage() {
  return (
    <>
      <PageHead eyebrow="Beheer" title="Audit log" sub="Onveranderlijk logboek van prijs-, retour- en beschikbaarheidsacties." />
      <div style={{ background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        {AUDIT.map((a, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderTop: i ? "1px solid var(--border)" : "none" }}>
            <span className="hb-tabular" style={{ font: "700 14px/1 var(--font-sans)", color: "var(--text-muted)", minWidth: 48 }}>{a.t}</span>
            <span style={{ width: 36, height: 36, flex: "none", borderRadius: "var(--radius-md)", background: "var(--paper)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={a.icon} size={18} color={a.c} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ font: "700 15px/1 var(--font-sans)", color: "var(--text-strong)" }}>{a.act}</div>
              <div style={{ font: "500 13px/1.3 var(--font-sans)", color: "var(--text-muted)", marginTop: 4 }}>{a.det}</div>
            </div>
            <span style={{ font: "600 14px/1 var(--font-sans)", color: "var(--text-muted)" }}>{a.who}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- Placeholder for the remaining nav items ---------- */
const PLACEHOLDER = {
  voorraad: { title: "Voorraad", icon: "boxes", sub: "Tel en corrigeer voorraad per item — werkt offline via Pi-bridge." },
  prijs: { title: "Prijs (tijdelijk)", icon: "tag", sub: "Stel tijdelijke prijzen in voor happy hour of acties." },
  devices: { title: "Apparaten", icon: "cpu", sub: "Kassa's, bonprinters, PIN-terminals en de Pi-bridge." },
  theme: { title: "Thema", icon: "palette", sub: "Pas merkkleuren en logo aan voor klant-schermen." },
  usage: { title: "AI-gebruik", icon: "sparkles", sub: "Verbruik en limieten van de AI-assistent." },
  chat: { title: "AI-chat", icon: "message-circle", sub: "Stel vragen over je omzet en bestellingen." },
};
function PlaceholderPage({ page }) {
  const p = PLACEHOLDER[page] || { title: "Pagina", icon: "file", sub: "" };
  return (
    <>
      <PageHead eyebrow="Beheer" title={p.title} sub={p.sub} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "80px 0", background: "var(--paper-bright)", border: "1px dashed var(--line-strong)", borderRadius: "var(--radius-lg)", color: "var(--text-muted)" }}>
        <span style={{ width: 72, height: 72, borderRadius: "var(--radius-lg)", background: "var(--paper)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={p.icon} size={34} color="var(--charcoal-500)" /></span>
        <div style={{ font: "700 17px/1 var(--font-sans)", color: "var(--text-body)" }}>{p.title} — ontwerp volgt</div>
        <div style={{ font: "500 14px/1.4 var(--font-sans)", maxWidth: 380, textAlign: "center" }}>Dit scherm is onderdeel van de overhaul. Laat me weten of ik deze als volgende uitwerk.</div>
      </div>
    </>
  );
}

Object.assign(window, { Admin, DASH, PageHead, StatCard });
