// Hop & Bites — Beheer sub-pages: Voorraad, Prijs, Apparaten, Thema,
// AI-gebruik, AI-chat. Built on the same DS vocabulary as the dashboard.

/* ---------- Voorraad ---------- */
const VOORRAAD_CATS = ["langos", "sides", "bier"];
function VoorraadPage() {
  const MENU = window.HB_MENU;
  const { Button, Badge } = window.HopBitesDesignSystem_c232d8;
  const [stock, setStock] = React.useState(() => {
    const s = {};
    const seed = { "l-pork": 28, "l-chick": 22, "l-brisket": 4, "l-klas": 40, "l-veg": 12, "l-mini": 9, "s-friet": 60, "s-zoet": 0, "s-slaw": 14, "s-mais": 18, "s-bonen": 11, "b-spec": 48, "b-pils": 90, "b-radler": 5, "b-ipa": 33 };
    VOORRAAD_CATS.forEach((c) => MENU.products[c].forEach((p) => { s[p.id] = seed[p.id] ?? 20; }));
    return s;
  });
  const bump = (id, d) => setStock((cur) => ({ ...cur, [id]: Math.max(0, (cur[id] || 0) + d) }));
  const lowCount = Object.values(stock).filter((n) => n > 0 && n <= 5).length;
  const outCount = Object.values(stock).filter((n) => n <= 0).length;
  return (
    <>
      <PageHead eyebrow="Operationeel · werkt offline" title="Voorraad" sub="Tel en corrigeer voorraad per item. Bij 0 verdwijnt het item automatisch van de kassa." action={<Button variant="secondary" icon={<Icon name="rotate-ccw" size={18} />}>Begin-telling</Button>} />
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <StatCard label="Items laag" value={lowCount} icon="alert-triangle" accent="var(--amber-600)" />
        <StatCard label="Uitverkocht" value={outCount} icon="x-circle" accent="var(--brick-600)" />
        <StatCard label="Categorieën" value={VOORRAAD_CATS.length} icon="layers" accent="var(--charcoal-700)" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {VOORRAAD_CATS.map((cat) => (
          <div key={cat}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: MENU.categories[cat].accent }} />
              <span style={{ font: "800 17px/1 var(--font-sans)", color: "var(--text-strong)" }}>{MENU.categories[cat].label}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              {MENU.products[cat].map((p) => {
                const n = stock[p.id];
                const status = n <= 0 ? { v: "danger", t: "Uitverkocht" } : n <= 5 ? { v: "amber", t: "Bijna op" } : null;
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "700 16px/1.2 var(--font-sans)", color: "var(--text-strong)" }}>{p.name}</div>
                      {status ? <div style={{ marginTop: 6 }}><Badge variant={status.v}>{status.t}</Badge></div> : null}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button onClick={() => bump(p.id, -1)} style={stepBtn}>−</button>
                      <span className="hb-tabular" style={{ minWidth: 44, textAlign: "center", font: "800 24px/1 var(--font-sans)", color: n <= 0 ? "var(--brick-600)" : "var(--text-strong)" }}>{n}</span>
                      <button onClick={() => bump(p.id, 1)} style={stepBtn}>+</button>
                    </div>
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
const stepBtn = { width: 44, height: 44, flex: "none", borderRadius: "var(--radius-md)", border: "1px solid var(--line-strong)", background: "var(--paper)", font: "700 22px/1 var(--font-sans)", color: "var(--text-body)", cursor: "pointer" };

/* ---------- Prijs (tijdelijk) ---------- */
function PrijsPage() {
  const MENU = window.HB_MENU;
  const { Button, Badge } = window.HopBitesDesignSystem_c232d8;
  const [happy, setHappy] = React.useState(false);
  const bier = MENU.products.bier;
  const langos = MENU.products.langos.slice(0, 3);
  const priceRow = (p, override) => (
    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
      <span style={{ flex: 1, font: "700 16px/1 var(--font-sans)", color: "var(--text-strong)" }}>{p.name}</span>
      <span className="hb-tabular" style={{ font: "600 15px/1 var(--font-sans)", color: override ? "var(--text-muted)" : "var(--text-strong)", textDecoration: override ? "line-through" : "none" }}>{euro(p.price)}</span>
      {override ? <span className="hb-tabular" style={{ font: "800 16px/1 var(--font-sans)", color: "var(--amber-600)" }}>{euro(override)}</span> : <span style={{ font: "600 13px/1 var(--font-sans)", color: "var(--text-muted)" }}>—</span>}
    </div>
  );
  return (
    <>
      <PageHead eyebrow="Operationeel · werkt offline" title="Prijs (tijdelijk)" sub="Stel tijdelijke prijzen in voor happy hour of acties. Verloopt automatisch — de basisprijs blijft staan." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ background: happy ? "var(--amber-100)" : "var(--paper-bright)", border: "1px solid " + (happy ? "var(--amber-600)" : "var(--line-strong)"), borderRadius: "var(--radius-lg)", padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Icon name="beer" size={22} color="var(--amber-600)" /><span style={{ font: "800 18px/1 var(--font-sans)", color: "var(--text-strong)" }}>Happy hour — bier</span></div>
            <button onClick={() => setHappy((v) => !v)} aria-pressed={happy} style={{ width: 56, height: 32, flex: "none", borderRadius: 999, border: "none", background: happy ? "var(--amber-600)" : "var(--charcoal-300)", position: "relative", cursor: "pointer" }}>
              <span style={{ position: "absolute", top: 3, left: happy ? 27 : 3, width: 26, height: 26, borderRadius: 999, background: "#fff", transition: "left var(--dur-base) var(--ease-out)" }} />
            </button>
          </div>
          <div style={{ font: "500 14px/1.4 var(--font-sans)", color: "var(--text-muted)" }}>−20% op alle bier · 16:00–18:00. {happy ? "Actief — verschijnt nu op de kassa." : "Uit."}</div>
        </div>
        <div style={{ background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", padding: 24, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
          <div style={{ font: "700 13px/1 var(--font-sans)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>Actieve overrides</div>
          <div className="hb-tabular" style={{ font: "800 32px/1 var(--font-sans)", color: "var(--text-strong)" }}>{happy ? bier.length : 1}</div>
          <div style={{ font: "500 13px/1 var(--font-sans)", color: "var(--text-muted)" }}>Speciaalbier loopt af over 0:42</div>
        </div>
      </div>
      <div style={{ background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 20px", font: "700 12px/1 var(--font-sans)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          <span style={{ flex: 1 }}>Item</span><span>Basis</span><span style={{ minWidth: 70, textAlign: "right" }}>Tijdelijk</span>
        </div>
        {bier.map((p) => priceRow(p, happy ? +(p.price * 0.8).toFixed(2) : (p.id === "b-spec" ? 4.0 : null)))}
        {langos.map((p) => priceRow(p, null))}
      </div>
    </>
  );
}

/* ---------- Apparaten ---------- */
const DEVICES = [
  { name: "Pi-bridge", type: "Edge-hub · LAN", icon: "cpu", status: "online", detail: "Spil van de service · 99,9% uptime", hub: true },
  { name: "Kassa 1", type: "Touchscreen", icon: "monitor", status: "online", detail: "Manon · sinds 11:02" },
  { name: "Kassa 2", type: "Touchscreen", icon: "monitor", status: "online", detail: "Joost · sinds 12:10" },
  { name: "PIN-terminal", type: "CCV · contactloos", icon: "credit-card", status: "online", detail: "Gekoppeld aan Kassa 1" },
  { name: "Bonprinter keuken", type: "Epson TM-m30", icon: "printer", status: "online", detail: "Laatste bon 17:33" },
  { name: "Keukenscherm", type: "KDS · iPad", icon: "chef-hat", status: "online", detail: "5 open bonnen" },
  { name: "Klantscherm", type: "CFD · wandscherm", icon: "tv", status: "online", detail: "Wachtrij live" },
  { name: "Bonprinter bar", type: "Epson TM-m30", icon: "printer", status: "warn", detail: "Papier bijna op" },
];
function DevicesPage() {
  const dot = (s) => s === "online" ? "var(--hop-500)" : s === "warn" ? "var(--amber-600)" : "var(--brick-600)";
  const lab = (s) => s === "online" ? "Online" : s === "warn" ? "Let op" : "Offline";
  return (
    <>
      <PageHead eyebrow="Operationeel · werkt offline" title="Apparaten" sub="Alle hardware op deze locatie. De Pi-bridge houdt de kassa draaiend, ook als het internet wegvalt." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {DEVICES.map((d) => (
          <div key={d.name} style={{ background: d.hub ? "var(--hop-50)" : "var(--paper-bright)", border: "1px solid " + (d.hub ? "var(--hop-300)" : "var(--line-strong)"), borderRadius: "var(--radius-lg)", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ width: 44, height: 44, borderRadius: "var(--radius-md)", background: d.hub ? "var(--hop-600)" : "var(--charcoal-800)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={d.icon} size={22} color="#fff" /></span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "700 13px/1 var(--font-sans)", color: dot(d.status) }}><span style={{ width: 9, height: 9, borderRadius: 999, background: dot(d.status) }} /> {lab(d.status)}</span>
            </div>
            <div style={{ font: "800 18px/1 var(--font-sans)", color: "var(--text-strong)" }}>{d.name}</div>
            <div style={{ font: "600 13px/1 var(--font-sans)", color: "var(--text-muted)", margin: "6px 0 10px" }}>{d.type}</div>
            <div style={{ font: "500 13px/1.3 var(--font-sans)", color: "var(--text-muted)" }}>{d.detail}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- Thema ---------- */
const ACCENTS = [
  { id: "hop", label: "Hop-groen", v: "var(--hop-600)" },
  { id: "brick", label: "BBQ-brick", v: "var(--brick-600)" },
  { id: "amber", label: "Ember-amber", v: "var(--amber-600)" },
  { id: "charcoal", label: "Antraciet", v: "var(--charcoal-800)" },
];
function ThemePage() {
  const { Button } = window.HopBitesDesignSystem_c232d8;
  const [accent, setAccent] = React.useState("hop");
  const cur = ACCENTS.find((a) => a.id === accent).v;
  return (
    <>
      <PageHead eyebrow="Beheer" title="Thema" sub="Pas het accent en logo aan voor klant-schermen. Wijzigingen zijn meteen zichtbaar in de preview." action={<Button variant="primary" icon={<Icon name="check" size={18} />}>Opslaan</Button>} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", padding: 24 }}>
          <div style={{ font: "800 18px/1 var(--font-sans)", color: "var(--text-strong)", marginBottom: 18 }}>Accentkleur</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ACCENTS.map((a) => (
              <button key={a.id} onClick={() => setAccent(a.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid " + (accent === a.id ? cur : "var(--line-strong)"), background: accent === a.id ? "var(--paper)" : "var(--paper-bright)", cursor: "pointer", textAlign: "left" }}>
                <span style={{ width: 36, height: 36, borderRadius: "var(--radius-md)", background: a.v, flex: "none" }} />
                <span style={{ flex: 1, font: "700 16px/1 var(--font-sans)", color: "var(--text-strong)" }}>{a.label}</span>
                {accent === a.id ? <Icon name="check" size={20} color={a.v} /> : null}
              </button>
            ))}
          </div>
          <div style={{ font: "800 18px/1 var(--font-sans)", color: "var(--text-strong)", margin: "28px 0 14px" }}>Logo</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: 18, border: "1px dashed var(--line-strong)", borderRadius: "var(--radius-md)" }}>
            <div style={{ width: 56, height: 56, borderRadius: 13, background: "var(--charcoal-900)", display: "flex", alignItems: "center", justifyContent: "center", font: "800 24px/1 var(--font-sans)", color: "#fff" }}>H<span style={{ color: cur }}>&amp;</span>B</div>
            <div style={{ font: "500 14px/1.4 var(--font-sans)", color: "var(--text-muted)" }}>Huidige monogram. Sleep een PNG/SVG hierheen om te vervangen.</div>
          </div>
        </div>
        {/* Live preview */}
        <div style={{ background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", padding: 24 }}>
          <div style={{ font: "700 12px/1 var(--font-sans)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 16 }}>Preview · klantscherm</div>
          <div style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--border)" }}>
            <div style={{ background: "var(--charcoal-900)", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ font: "800 20px/1 var(--font-sans)", color: "#fff" }}>Hop <span style={{ color: cur }}>&amp;</span> Bites</span>
              <span style={{ font: "600 11px/1 var(--font-sans)", letterSpacing: "0.16em", color: "var(--charcoal-400)" }}>LIVE</span>
            </div>
            <div style={{ background: "var(--charcoal-800)", padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ font: "800 22px/1 var(--font-sans)", color: cur }}>Klaar — kom afhalen!</div>
              <div style={{ background: cur, color: "#fff", borderRadius: "var(--radius-lg)", padding: "20px", textAlign: "center", font: "900 34px/1 var(--font-sans)" }}>#214</div>
            </div>
          </div>
          <button style={{ marginTop: 18, width: "100%", height: 56, border: "none", borderRadius: "var(--radius-md)", background: cur, color: "#fff", font: "800 18px/1 var(--font-sans)", cursor: "pointer" }}>Afrekenen — voorbeeldknop</button>
        </div>
      </div>
    </>
  );
}

/* ---------- AI-gebruik ---------- */
const USAGE = { used: 6420, limit: 10000, features: [{ label: "Dagrapport-samenvatting", n: 31, c: "var(--hop-600)" }, { label: "Menu-vertalingen", n: 12, c: "var(--amber-600)" }, { label: "Chat-vragen", n: 88, c: "var(--charcoal-700)" }, { label: "Voorraad-voorspelling", n: 9, c: "var(--brick-600)" }] };
function UsagePage() {
  const pct = Math.round((USAGE.used / USAGE.limit) * 100);
  const maxN = Math.max(...USAGE.features.map((f) => f.n));
  return (
    <>
      <PageHead eyebrow="Beheer" title="AI-gebruik" sub="Verbruik van de AI-assistent deze maand. Reset op de 1e." />
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <StatCard label="Verbruikt" value={USAGE.used.toLocaleString("nl-NL")} icon="sparkles" accent="var(--hop-600)" />
        <StatCard label="Limiet" value={USAGE.limit.toLocaleString("nl-NL")} icon="gauge" accent="var(--charcoal-700)" />
        <StatCard label="Resterend" value={(USAGE.limit - USAGE.used).toLocaleString("nl-NL")} icon="battery-charging" accent="var(--amber-600)" />
      </div>
      <div style={{ background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <span style={{ font: "800 18px/1 var(--font-sans)", color: "var(--text-strong)" }}>Maandverbruik</span>
          <span className="hb-tabular" style={{ font: "700 16px/1 var(--font-sans)", color: "var(--text-muted)" }}>{pct}%</span>
        </div>
        <div style={{ height: 16, borderRadius: 999, background: "var(--paper)", border: "1px solid var(--border)", overflow: "hidden" }}>
          <div style={{ width: pct + "%", height: "100%", background: pct > 85 ? "var(--brick-600)" : "var(--hop-600)" }} />
        </div>
      </div>
      <div style={{ background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", padding: 24 }}>
        <div style={{ font: "800 18px/1 var(--font-sans)", color: "var(--text-strong)", marginBottom: 20 }}>Per functie</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {USAGE.features.map((f) => (
            <div key={f.label}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                <span style={{ font: "600 15px/1 var(--font-sans)", color: "var(--text-body)" }}>{f.label}</span>
                <span className="hb-tabular" style={{ font: "700 15px/1 var(--font-sans)", color: "var(--text-strong)" }}>{f.n}×</span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: "var(--paper)", overflow: "hidden" }}><div style={{ width: (f.n / maxN) * 100 + "%", height: "100%", background: f.c }} /></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------- AI-chat ---------- */
const CHAT_QA = {
  "Wat was de omzet vandaag?": "Tot nu toe " + euro(DASH.omzet) + " incl. btw over " + DASH.orders + " orders. Gemiddelde bon " + euro(DASH.gem) + ". PIN is goed voor 62% van de betalingen.",
  "Welk item liep het best?": "Langós Pulled Pork — 41 verkocht, samen " + euro(389.5) + ". Daarna Pulled Chicken (33×) en Frietjes (52×).",
  "Moet ik iets bijbestellen?": "Zoete friet staat op 0 en is van de kassa gehaald. Radler 0.0 en Langós Beef Brisket zijn bijna op (≤5). De rest is ruim voldoende voor vanavond.",
};
const CHAT_SUGGESTIONS = Object.keys(CHAT_QA);
function ChatPage() {
  const [msgs, setMsgs] = React.useState([{ who: "ai", text: "Hoi Manon 👋 Vraag me iets over je omzet, bestellingen of voorraad." }]);
  const ask = (q) => setMsgs((m) => [...m, { who: "me", text: q }, { who: "ai", text: CHAT_QA[q] || "Daar heb ik nu geen data voor — vraag me iets over omzet, items of voorraad." }]);
  const asked = msgs.filter((m) => m.who === "me").map((m) => m.text);
  const remaining = CHAT_SUGGESTIONS.filter((s) => !asked.includes(s));
  return (
    <>
      <PageHead eyebrow="Beheer" title="AI-chat" sub="Stel vragen in gewone taal over deze locatie." />
      <div style={{ maxWidth: 760, background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", overflow: "hidden", display: "flex", flexDirection: "column", height: 540 }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.who === "me" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "78%", padding: "13px 17px", borderRadius: 14, font: "500 15px/1.45 var(--font-sans)", background: m.who === "me" ? "var(--hop-600)" : "var(--paper)", color: m.who === "me" ? "#fff" : "var(--text-body)", border: m.who === "me" ? "none" : "1px solid var(--border)", borderBottomRightRadius: m.who === "me" ? 4 : 14, borderBottomLeftRadius: m.who === "me" ? 14 : 4 }}>{m.text}</div>
            </div>
          ))}
        </div>
        {remaining.length ? (
          <div style={{ padding: "0 24px 14px", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {remaining.map((s) => (
              <button key={s} onClick={() => ask(s)} style={{ padding: "9px 14px", borderRadius: 999, border: "1px solid var(--hop-300)", background: "var(--hop-50)", color: "var(--hop-800)", font: "600 13px/1 var(--font-sans)", cursor: "pointer", whiteSpace: "nowrap" }}>{s}</button>
            ))}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderTop: "1px solid var(--border)" }}>
          <div style={{ flex: 1, height: 48, display: "flex", alignItems: "center", padding: "0 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--line-strong)", background: "var(--paper)", font: "500 15px/1 var(--font-sans)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Typ een vraag…</div>
          <button style={{ width: 48, height: 48, flex: "none", borderRadius: "var(--radius-md)", border: "none", background: "var(--hop-600)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="send" size={20} color="#fff" /></button>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { VoorraadPage, PrijsPage, DevicesPage, ThemePage, UsagePage, ChatPage });
