// Hop & Bites — auth + entry surfaces: Login, VenueSelect, Launcher.

/* ---------- Login: antraciet brand panel + offwhite form ---------- */
function Login() {
  const { go } = useApp();
  const { Button } = window.HopBitesDesignSystem_c232d8;
  const [email, setEmail] = React.useState("manon@hopenbites.nl");
  const [pw, setPw] = React.useState("••••••••");
  const submit = (e) => { e.preventDefault(); go("venue"); };
  const field = (label, value, onChange, type) => (
    <label style={{ display: "block", marginBottom: 18 }}>
      <span style={{ display: "block", font: "700 13px/1 var(--font-sans)", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>{label}</span>
      <input value={value} type={type} onChange={(e) => onChange(e.target.value)} style={{
        width: "100%", height: 60, padding: "0 18px", background: "var(--paper-bright)",
        border: "1px solid var(--line-strong)", borderRadius: "var(--radius-md)",
        font: "600 19px/1 var(--font-sans)", color: "var(--text-strong)", outline: "none",
      }} onFocus={(e) => (e.target.style.boxShadow = "var(--focus-ring)")} onBlur={(e) => (e.target.style.boxShadow = "none")} />
    </label>
  );
  return (
    <div style={{ width: "100%", height: "100%", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      {/* Brand panel */}
      <div style={{ background: "var(--charcoal-900)", padding: 88, display: "flex", flexDirection: "column", justifyContent: "space-between", color: "var(--offwhite)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--charcoal-800)", display: "flex", alignItems: "center", justifyContent: "center", font: "800 30px/1 var(--font-sans)" }}>H<span style={{ color: "var(--hop-500)" }}>&amp;</span>B</div>
          <div>
            <div style={{ font: "800 30px/1 var(--font-sans)", letterSpacing: "-0.01em" }}>Hop <span style={{ color: "var(--hop-500)", padding: "0 2px" }}>&amp;</span> Bites</div>
            <div style={{ font: "600 13px/1 var(--font-sans)", letterSpacing: "0.2em", color: "var(--charcoal-400)", marginTop: 7 }}>BBQ · CATERING</div>
          </div>
        </div>
        <div>
          <div style={{ font: "800 56px/1.05 var(--font-sans)", letterSpacing: "-0.02em", maxWidth: 540 }}>Strak afrekenen,<br />de hele service door.</div>
          <div style={{ font: "500 19px/1.5 var(--font-sans)", color: "var(--charcoal-300)", marginTop: 24, maxWidth: 460 }}>Het kassasysteem voor de foodtruck en de cateringlijn. Snel, functioneel, hoog contrast.</div>
        </div>
        <div style={{ display: "flex", gap: 10, font: "600 14px/1 var(--font-sans)", color: "var(--charcoal-400)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--hop-500)" }} /> Pi-bridge verbonden</span>
        </div>
      </div>
      {/* Form panel */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 88 }}>
        <form onSubmit={submit} style={{ width: 460 }}>
          <div style={{ font: "800 34px/1.1 var(--font-sans)", color: "var(--text-strong)", marginBottom: 6 }}>Inloggen</div>
          <div style={{ font: "500 17px/1.4 var(--font-sans)", color: "var(--text-muted)", marginBottom: 36 }}>Meld je aan om de kassa te starten.</div>
          {field("E-mail", email, setEmail, "email")}
          {field("Wachtwoord", pw, setPw, "password")}
          <Button variant="primary" size="lg" fullWidth type="submit" style={{ marginTop: 10, height: 64, fontSize: 20 }}>Inloggen</Button>
          <div style={{ textAlign: "center", marginTop: 22, font: "600 15px/1 var(--font-sans)", color: "var(--text-muted)" }}>Wachtwoord vergeten? Vraag je manager.</div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Venue select ---------- */
const VENUES = [
  { id: "centrum", name: "Foodtruck — Centrum", sub: "Marktplein 1 · vandaag open", accent: "var(--brick-600)", icon: "truck" },
  { id: "festival", name: "Cateringlijn — Festival", sub: "Evenemententerrein Oost", accent: "var(--amber-600)", icon: "tent" },
  { id: "loods", name: "Keuken & loods", sub: "Productie · alleen beheer", accent: "var(--hop-600)", icon: "warehouse" },
];
function VenueSelect() {
  const { go, setVenue } = useApp();
  const pick = (v) => { setVenue(v); go("launcher"); };
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg-app)", padding: 80 }}>
      <div style={{ width: 720 }}>
        <div style={{ font: "700 13px/1 var(--font-sans)", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--hop-700)", marginBottom: 14 }}>Hop &amp; Bites</div>
        <div style={{ font: "800 44px/1.05 var(--font-sans)", color: "var(--text-strong)", letterSpacing: "-0.02em", marginBottom: 8 }}>Kies je locatie</div>
        <div style={{ font: "500 18px/1.4 var(--font-sans)", color: "var(--text-muted)", marginBottom: 40 }}>Ingelogd als <strong style={{ color: "var(--text-body)" }}>Manon</strong> · manager</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {VENUES.map((v) => (
            <button key={v.id} onClick={() => pick(v)} style={{
              display: "flex", alignItems: "center", gap: 22, padding: "24px 26px", textAlign: "left",
              background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", cursor: "pointer", WebkitTapHighlightColor: "transparent",
            }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = v.accent; e.currentTarget.style.background = "var(--paper)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line-strong)"; e.currentTarget.style.background = "var(--paper-bright)"; }}>
              <div style={{ width: 64, height: 64, flex: "none", borderRadius: "var(--radius-md)", background: v.accent, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={v.icon} size={32} color="#fff" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ font: "800 23px/1.1 var(--font-sans)", color: "var(--text-strong)" }}>{v.name}</div>
                <div style={{ font: "500 15px/1 var(--font-sans)", color: "var(--text-muted)", marginTop: 6 }}>{v.sub}</div>
              </div>
              <Icon name="chevron-right" size={28} color="var(--charcoal-400)" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Launcher: home hub after venue select ---------- */
const LAUNCH_TILES = [
  { id: "kassa", label: "Kassa", sub: "Bestellingen aanslaan & afrekenen", icon: "shopping-cart", accent: "var(--hop-600)", role: "Kassier" },
  { id: "keuken", label: "Keuken", sub: "Bonnen in bereiding volgen", icon: "chef-hat", accent: "var(--brick-600)", role: "Keuken" },
  { id: "cfd", label: "Klantscherm", sub: "Wachtrij & 'klaar'-bord", icon: "monitor", accent: "var(--charcoal-700)", role: "Display" },
  { id: "admin", label: "Beheer", sub: "Omzet, menu, personeel", icon: "settings", accent: "var(--amber-600)", role: "Manager" },
];
function Launcher() {
  const { go, venue } = useApp();
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-app)" }}>
      <header style={{ height: 96, flex: "none", background: "var(--charcoal-900)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", color: "var(--offwhite)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 13, background: "var(--charcoal-800)", display: "flex", alignItems: "center", justifyContent: "center", font: "800 25px/1 var(--font-sans)" }}>H<span style={{ color: "var(--hop-500)" }}>&amp;</span>B</div>
          <div>
            <div style={{ font: "800 24px/1 var(--font-sans)" }}>Hop <span style={{ color: "var(--hop-500)" }}>&amp;</span> Bites</div>
            <div style={{ font: "600 12px/1 var(--font-sans)", letterSpacing: "0.16em", color: "var(--charcoal-400)", marginTop: 5 }}>{(venue?.name || "FOODTRUCK — CENTRUM").toUpperCase()}</div>
          </div>
        </div>
        <button onClick={() => go("login")} style={{ display: "inline-flex", alignItems: "center", gap: 9, height: 48, padding: "0 18px", background: "transparent", border: "1px solid var(--charcoal-700)", borderRadius: "var(--radius-md)", color: "var(--charcoal-300)", font: "700 15px/1 var(--font-sans)", cursor: "pointer" }}><Icon name="log-out" size={18} /> Uitloggen</button>
      </header>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px" }}>
        <div style={{ font: "800 40px/1.05 var(--font-sans)", color: "var(--text-strong)", letterSpacing: "-0.02em", marginBottom: 6 }}>Goedemiddag, Manon</div>
        <div style={{ font: "500 19px/1.4 var(--font-sans)", color: "var(--text-muted)", marginBottom: 44 }}>Kies een scherm om te starten.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
          {LAUNCH_TILES.map((t) => (
            <button key={t.id} onClick={() => go(t.id)} style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0, padding: 32, minHeight: 280, textAlign: "left",
              background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", cursor: "pointer", position: "relative", WebkitTapHighlightColor: "transparent",
            }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = t.accent; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line-strong)"; }}>
              <div style={{ width: 76, height: 76, borderRadius: "var(--radius-md)", background: t.accent, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28 }}><Icon name={t.icon} size={40} color="#fff" /></div>
              <div style={{ font: "700 12px/1 var(--font-sans)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>{t.role}</div>
              <div style={{ font: "800 28px/1 var(--font-sans)", color: "var(--text-strong)", marginBottom: 10 }}>{t.label}</div>
              <div style={{ font: "500 15px/1.35 var(--font-sans)", color: "var(--text-muted)", flex: 1 }}>{t.sub}</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, font: "700 15px/1 var(--font-sans)", color: t.accent }}>Openen <Icon name="arrow-right" size={18} color={t.accent} /></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Login, VenueSelect, Launcher });
