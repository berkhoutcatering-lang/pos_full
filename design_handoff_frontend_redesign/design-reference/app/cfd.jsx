// Hop & Bites — Klantscherm (CFD). Big queue board read from the shared queue.
function Cfd() {
  const { go, orders } = useApp();
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const clock = new Date(now).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });

  const preparing = orders.filter((o) => o.status === "placed" || o.status === "preparing");
  const ready = orders.filter((o) => o.status === "ready");
  const tag = (o) => o.label;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "var(--charcoal-900)", color: "var(--offwhite)" }}>
      <header style={{ height: 110, flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 56px", borderBottom: "1px solid var(--charcoal-700)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <button onClick={() => go("launcher")} title="Naar start" style={{ width: 52, height: 52, borderRadius: 13, background: "var(--charcoal-800)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="layout-grid" size={24} color="var(--offwhite)" /></button>
          <div style={{ font: "800 34px/1.1 var(--font-sans)", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>Hop <span style={{ color: "var(--hop-500)" }}>&amp;</span> Bites</div>
        </div>
        <div style={{ font: "700 16px/1 var(--font-sans)", letterSpacing: "0.22em", color: "var(--charcoal-400)" }}>JOUW BESTELLING · LIVE</div>
        <div className="hb-tabular" style={{ font: "800 36px/1 var(--font-sans)" }}>{clock}</div>
      </header>
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {/* In bereiding */}
        <section style={{ borderRight: "1px solid var(--charcoal-700)", padding: 48, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 16, font: "800 44px/1.1 var(--font-sans)", letterSpacing: "-0.01em", marginBottom: 36, whiteSpace: "nowrap" }}>
            <Icon name="flame" size={40} color="var(--amber-600)" /> In bereiding
          </h2>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, alignContent: "start" }}>
              {preparing.length === 0 ? (
                <p style={{ gridColumn: "1 / -1", font: "600 26px/1 var(--font-sans)", color: "var(--charcoal-400)" }}>—</p>
              ) : preparing.map((o) => (
                <div key={o.id} style={{ minHeight: 132, borderRadius: "var(--radius-lg)", border: "1px solid var(--charcoal-700)", background: "var(--charcoal-800)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 18 }}>
                  <span style={{ font: "800 38px/1 var(--font-sans)", textAlign: "center" }}>{tag(o)}</span>
                  <span style={{ font: "600 15px/1 var(--font-sans)", color: o.status === "preparing" ? "var(--amber-600)" : "var(--charcoal-400)" }}>{o.status === "preparing" ? "Op de grill" : "In de wacht"}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        {/* Klaar */}
        <section style={{ padding: 48, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 16, font: "800 44px/1.1 var(--font-sans)", letterSpacing: "-0.01em", marginBottom: 36, color: "var(--hop-500)", whiteSpace: "nowrap" }}>
            <Icon name="bell-ring" size={40} color="var(--hop-500)" /> Klaar — kom afhalen!
          </h2>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 18, alignContent: "start" }}>
              {ready.length === 0 ? (
                <p style={{ gridColumn: "1 / -1", font: "600 26px/1 var(--font-sans)", color: "var(--charcoal-400)" }}>—</p>
              ) : ready.map((o) => (
                <div key={o.id} className="hb-pulse" style={{ minHeight: 156, borderRadius: "var(--radius-xl)", background: "var(--hop-600)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 22 }}>
                  <span style={{ font: "900 52px/1 var(--font-sans)", textAlign: "center", letterSpacing: "-0.01em" }}>{tag(o)}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, font: "700 18px/1 var(--font-sans)", color: "rgba(255,255,255,0.9)" }}><Icon name="check" size={20} color="#fff" strokeWidth={3} /> Klaar</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      <footer style={{ height: 64, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, borderTop: "1px solid var(--charcoal-700)", font: "600 17px/1 var(--font-sans)", color: "var(--charcoal-300)", whiteSpace: "nowrap" }}>
        <Icon name="shopping-bag" size={18} color="var(--charcoal-400)" /> Bedankt &amp; eet smakelijk — Hop &amp; Bites BBQ
      </footer>
    </div>
  );
}
Object.assign(window, { Cfd });
