// Hop & Bites — Keuken (KDS). Reads the shared order queue, ages cards in the
// DS palette, and bumps orders placed → preparing → ready → served.

const AGE = [
  { max: 4, accent: "var(--hop-600)", tint: "var(--hop-50)", label: "vers" },
  { max: 8, accent: "var(--amber-600)", tint: "var(--amber-100)", label: "let op" },
  { max: Infinity, accent: "var(--brick-600)", tint: "var(--brick-100)", label: "te laat" },
];
function ageOf(placedAt, now) {
  const mins = (now - placedAt) / 60000;
  return AGE.find((a) => mins < a.max);
}
function fmtAge(placedAt, now) {
  const s = Math.max(0, Math.floor((now - placedAt) / 1000));
  const m = Math.floor(s / 60);
  return m < 1 ? `${s}s` : `${m}m`;
}

function OrderCard({ order, now, nextLabel, nextIcon, onBump, accent }) {
  const age = ageOf(order.placedAt, now);
  const stripe = accent || age.accent;
  return (
    <article style={{ background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderLeft: `6px solid ${stripe}`, borderRadius: "var(--radius-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="hb-tabular" style={{ font: "800 24px/1 var(--font-sans)", color: "var(--text-strong)" }}>{order.label}</span>
          {order.customer ? <span style={{ font: "600 15px/1 var(--font-sans)", color: "var(--text-muted)" }}>{order.customer}</span> : null}
        </div>
        <span className="hb-tabular" style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "800 16px/1 var(--font-sans)", color: age.accent }}>
          <Icon name="clock" size={15} color={age.accent} /> {fmtAge(order.placedAt, now)}
        </span>
      </header>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {order.items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span className="hb-tabular" style={{ flex: "none", font: "800 18px/1.25 var(--font-sans)", color: "var(--hop-700)", minWidth: 28 }}>{it.qty}×</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "700 18px/1.25 var(--font-sans)", color: "var(--text-strong)" }}>{it.name}</div>
              {it.mods && it.mods.length ? (
                <div style={{ marginTop: 4, font: "600 14px/1.3 var(--font-sans)", color: "var(--text-muted)" }}>+ {it.mods.join(", ")}</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <button onClick={onBump} style={{ margin: 12, marginTop: 4, height: 64, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: stripe, color: "#fff", border: "none", borderRadius: "var(--radius-md)", font: "800 18px/1 var(--font-sans)", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")} onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")} onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
        <Icon name={nextIcon} size={22} color="#fff" /> {nextLabel}
      </button>
    </article>
  );
}

function KdsColumn({ title, icon, orders, now, nextLabel, nextIcon, onBump, accent }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      <h2 style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--border)", font: "800 18px/1.1 var(--font-sans)", letterSpacing: "0.02em", color: "var(--text-strong)" }}>
        <span style={{ width: 12, height: 12, flex: "none", borderRadius: 3, background: accent }} />
        <Icon name={icon} size={20} color="var(--charcoal-700)" />
        <span style={{ whiteSpace: "nowrap" }}>{title}</span>
        <span className="hb-tabular" style={{ marginLeft: "auto", font: "800 16px/1 var(--font-sans)", color: "var(--text-muted)" }}>{orders.length}</span>
      </h2>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {orders.length === 0 ? (
          <div style={{ margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--charcoal-300)" }}>
            <Icon name="check-check" size={40} color="var(--charcoal-300)" />
            <span style={{ font: "600 15px/1 var(--font-sans)" }}>Niets hier</span>
          </div>
        ) : orders.map((o) => (
          <OrderCard key={o.id} order={o} now={now} nextLabel={nextLabel} nextIcon={nextIcon} accent={accent} onBump={() => onBump(o.id)} />
        ))}
      </div>
    </section>
  );
}

function Keuken() {
  const { go, tweaks, orders, bumpOrder } = useApp();
  const [now, setNow] = React.useState(Date.now());
  const [station, setStation] = React.useState("alle");
  const [soundOn, setSoundOn] = React.useState(true);
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const active = orders.filter((o) => ["placed", "preparing", "ready"].includes(o.status));
  const visible = station === "alle" ? active : active.map((o) => ({ ...o, items: o.items.filter((it) => it.station === station) })).filter((o) => o.items.length);
  const cols = {
    placed: visible.filter((o) => o.status === "placed"),
    preparing: visible.filter((o) => o.status === "preparing"),
    ready: visible.filter((o) => o.status === "ready"),
  };
  const STATIONS_UI = [{ id: "alle", label: "Alle" }, { id: "grill", label: "Grill" }];

  const header = (
    <div style={{ height: 84, flex: "none", background: "var(--charcoal-900)", display: "flex", alignItems: "center", gap: 20, padding: "0 24px", color: "var(--offwhite)" }}>
      <button onClick={() => go("launcher")} title="Naar start" style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.08)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="layout-grid" size={22} color="var(--offwhite)" /></button>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Icon name="chef-hat" size={28} color="var(--hop-500)" />
        <div style={{ font: "800 26px/1 var(--font-sans)" }}>Keuken</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginLeft: 12 }}>
        {STATIONS_UI.map((s) => {
          const a = station === s.id;
          return <button key={s.id} onClick={() => setStation(s.id)} style={{ height: 44, padding: "0 20px", border: "1px solid " + (a ? "var(--hop-500)" : "var(--charcoal-700)"), background: a ? "var(--hop-600)" : "transparent", color: a ? "#fff" : "var(--charcoal-300)", borderRadius: "var(--radius-md)", font: "700 15px/1 var(--font-sans)", cursor: "pointer" }}>{s.label}</button>;
        })}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
        <span className="hb-tabular" style={{ font: "700 15px/1 var(--font-sans)", color: "var(--charcoal-300)" }}>{active.length} open bonnen</span>
        <button onClick={() => setSoundOn((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 16px", border: "1px solid var(--charcoal-700)", background: "transparent", color: soundOn ? "var(--hop-500)" : "var(--charcoal-400)", borderRadius: "var(--radius-md)", font: "700 14px/1 var(--font-sans)", cursor: "pointer" }}>
          <Icon name={soundOn ? "bell" : "bell-off"} size={18} /> {soundOn ? "Geluid aan" : "Geluid uit"}
        </button>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, font: "600 13px/1 var(--font-sans)", color: "var(--charcoal-300)" }}><span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--hop-500)" }} /> Live</span>
      </div>
    </div>
  );

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-app)" }}>
      {header}
      {tweaks.kdsLayout === "wachtrij" ? (
        <KdsQueue visible={visible} now={now} bumpOrder={bumpOrder} />
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, padding: 16 }}>
          <KdsColumn title="Geplaatst" icon="inbox" accent="var(--charcoal-500)" orders={cols.placed} now={now} nextLabel="Start bereiding" nextIcon="play" onBump={(id) => bumpOrder(id, "preparing")} />
          <KdsColumn title="In bereiding" icon="flame" accent="var(--amber-600)" orders={cols.preparing} now={now} nextLabel="Klaar" nextIcon="check" onBump={(id) => bumpOrder(id, "ready")} />
          <KdsColumn title="Klaar" icon="package-check" accent="var(--hop-600)" orders={cols.ready} now={now} nextLabel="Uitgegeven" nextIcon="hand-platter" onBump={(id) => bumpOrder(id, "served")} />
        </div>
      )}
    </div>
  );
}

function KdsQueue({ visible, now, bumpOrder }) {
  const STATUS = {
    placed: { label: "Geplaatst", accent: "var(--charcoal-500)", next: "preparing", nextLabel: "Start bereiding", nextIcon: "play" },
    preparing: { label: "In bereiding", accent: "var(--amber-600)", next: "ready", nextLabel: "Klaar", nextIcon: "check" },
    ready: { label: "Klaar", accent: "var(--hop-600)", next: "served", nextLabel: "Uitgegeven", nextIcon: "hand-platter" },
  };
  const sorted = [...visible].sort((a, b) => a.placedAt - b.placedAt);
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {sorted.map((o) => {
          const st = STATUS[o.status];
          return (
            <div key={o.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: st.accent, color: "#fff", font: "800 11px/1 var(--font-sans)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{st.label}</span>
              <OrderCard order={o} now={now} nextLabel={st.nextLabel} nextIcon={st.nextIcon} onBump={() => bumpOrder(o.id, st.next)} accent={st.accent} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { Keuken });
