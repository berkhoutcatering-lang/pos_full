// Hop & Bites — prototype shared layer.
// Helpers (Icon, euro), the scaling Stage, tweak state, the demo navigator,
// and the live shared-order store that links Kassa → Keuken → Klantscherm.

/* ---------- Icon + money helpers (ported from the DS Icon.jsx) ---------- */
function toPascal(name) {
  return name.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
}
function Icon({ name, size = 22, strokeWidth = 2, color = "currentColor", style = {} }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !window.lucide) return;
    el.innerHTML = "";
    const node = window.lucide[toPascal(name)] || window.lucide.icons?.[toPascal(name)];
    if (!node) return;
    const svg = window.lucide.createElement(node);
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("stroke-width", strokeWidth);
    svg.style.color = color;
    el.appendChild(svg);
  }, [name, size, strokeWidth, color]);
  return <span ref={ref} style={{ display: "inline-flex", width: size, height: size, ...style }} />;
}
function euro(n) {
  return "€ " + Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ---------- Tweaks (lightweight, persisted) ---------- */
const TWEAK_DEFAULTS = {
  topBar: "antraciet", // antraciet | hop
  receiptSide: "links", // links | rechts (Kassa bon)
  density: "ruim", // ruim | compact (Kassa tiles)
  kdsLayout: "kolommen", // kolommen | wachtrij
};
function useTweaks() {
  const [tweaks, setTweaks] = React.useState(() => {
    try {
      return { ...TWEAK_DEFAULTS, ...JSON.parse(localStorage.getItem("hb_tweaks") || "{}") };
    } catch {
      return { ...TWEAK_DEFAULTS };
    }
  });
  const set = React.useCallback((k, v) => {
    setTweaks((cur) => {
      const next = { ...cur, [k]: v };
      try { localStorage.setItem("hb_tweaks", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  return [tweaks, set];
}

/* ---------- App context ---------- */
const AppCtx = React.createContext(null);
const useApp = () => React.useContext(AppCtx);

/* ---------- Scaling stage: fixed 1920×1080, letterboxed to viewport ---------- */
function Stage({ children, reserveBottom = 64 }) {
  const [scale, setScale] = React.useState(0);
  React.useEffect(() => {
    const fit = () => {
      const w = window.innerWidth, h = window.innerHeight;
      if (w < 2 || h < 2) return;
      const s = Math.min(w / 1920, (h - reserveBottom) / 1080);
      if (s > 0) setScale(s);
    };
    fit();
    // Retry across the first frames in case layout hasn't settled yet.
    const rafs = [requestAnimationFrame(fit)];
    const timers = [setTimeout(fit, 60), setTimeout(fit, 200), setTimeout(fit, 600)];
    window.addEventListener("resize", fit);
    let ro;
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(document.documentElement); }
    return () => {
      window.removeEventListener("resize", fit);
      rafs.forEach(cancelAnimationFrame);
      timers.forEach(clearTimeout);
      if (ro) ro.disconnect();
    };
  }, [reserveBottom]);
  return (
    <div style={{ position: "fixed", inset: 0, paddingBottom: reserveBottom, background: "#141714", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div style={{ width: 1920, height: 1080, flex: "none", transformOrigin: "center center", transform: `scale(${scale})`, boxShadow: "0 24px 80px rgba(0,0,0,.5)", background: "var(--bg-app)", position: "relative", overflow: "hidden", fontFamily: "var(--font-sans)" }}>
        {children}
      </div>
    </div>
  );
}

/* ---------- Shared order store (live link across surfaces) ---------- */
const STATIONS = { langos: "grill", sides: "grill", sauzen: "alle", fris: "alle", bier: "alle", warm: "alle", extra: "alle" };
function seedOrders() {
  const now = Date.now();
  return [
    { id: 211, label: "#211", customer: "Sanne", placedAt: now - 9 * 60000, status: "ready",
      items: [{ qty: 1, name: "Langós Pulled Pork", station: "grill", mods: ["BBQ Smokehouse"] }, { qty: 1, name: "Frietjes", station: "grill", mods: [] }] },
    { id: 212, label: "#212", customer: "Joost", placedAt: now - 6 * 60000, status: "preparing",
      items: [{ qty: 2, name: "Langós Pulled Chicken", station: "grill", mods: ["Chipotle mayo"] }, { qty: 2, name: "Speciaalbier", station: "alle", mods: [] }] },
    { id: 213, label: "#213", customer: "Fatima", placedAt: now - 3 * 60000, status: "preparing",
      items: [{ qty: 1, name: "Langós Beef Brisket", station: "grill", mods: [] }, { qty: 1, name: "Coleslaw", station: "grill", mods: [] }] },
    { id: 214, label: "#214", customer: "Tom", placedAt: now - 70000, status: "placed",
      items: [{ qty: 3, name: "Langós Klassiek", station: "grill", mods: ["Extra kaas"] }, { qty: 1, name: "Frisdrank", station: "alle", mods: [] }] },
    { id: 215, label: "#215", customer: null, placedAt: now - 20000, status: "placed",
      items: [{ qty: 1, name: "Langós Veggie", station: "grill", mods: ["Gegr. groenten"] }] },
  ];
}

/* ---------- Demo navigator + Tweaks drawer (prototype chrome) ---------- */
const SCREENS = [
  { id: "login", label: "Login", icon: "lock-keyhole" },
  { id: "venue", label: "Locatie", icon: "map-pin" },
  { id: "launcher", label: "Start", icon: "layout-grid" },
  { id: "kassa", label: "Kassa", icon: "shopping-cart" },
  { id: "keuken", label: "Keuken", icon: "chef-hat" },
  { id: "cfd", label: "Klantscherm", icon: "monitor" },
  { id: "admin", label: "Beheer", icon: "settings" },
];
function DemoNav() {
  const { screen, go, tweaks, setTweak } = useApp();
  const [openTweaks, setOpenTweaks] = React.useState(false);
  const pill = (s) => {
    const active = screen === s.id;
    return (
      <button key={s.id} onClick={() => go(s.id)} title={s.label} style={{
        display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 13px",
        border: "1px solid " + (active ? "var(--hop-500)" : "rgba(255,255,255,0.14)"),
        background: active ? "var(--hop-600)" : "rgba(255,255,255,0.05)",
        color: active ? "#fff" : "rgba(255,255,255,0.72)",
        borderRadius: 999, font: "700 13px/1 var(--font-sans)", cursor: "pointer", whiteSpace: "nowrap",
      }}>
        <Icon name={s.icon} size={15} /> {s.label}
      </button>
    );
  };
  return (
    <>
      <div style={{ position: "fixed", left: "50%", bottom: 12, transform: "translateX(-50%)", zIndex: 200, display: "flex", alignItems: "center", gap: 6, padding: 6, background: "rgba(18,21,18,0.92)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 999, backdropFilter: "blur(8px)", boxShadow: "0 8px 30px rgba(0,0,0,.4)" }}>
        {SCREENS.map(pill)}
        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.14)", margin: "0 2px" }} />
        <button onClick={() => setOpenTweaks((v) => !v)} title="Tweaks" style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 13px", border: "1px solid " + (openTweaks ? "var(--amber-600)" : "rgba(255,255,255,0.14)"), background: openTweaks ? "var(--amber-600)" : "rgba(255,255,255,0.05)", color: openTweaks ? "#1B201D" : "rgba(255,255,255,0.72)", borderRadius: 999, font: "700 13px/1 var(--font-sans)", cursor: "pointer" }}>
          <Icon name="sliders-horizontal" size={15} /> Tweaks
        </button>
      </div>
      {openTweaks ? <TweaksDrawer onClose={() => setOpenTweaks(false)} tweaks={tweaks} setTweak={setTweak} /> : null}
    </>
  );
}

function TweakRow({ label, hint, options, value, onChange }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ font: "700 13px/1.2 var(--font-sans)", color: "#fff", marginBottom: 3 }}>{label}</div>
      {hint ? <div style={{ font: "500 11px/1.3 var(--font-sans)", color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>{hint}</div> : null}
      <div style={{ display: "flex", gap: 6 }}>
        {options.map((o) => {
          const active = value === o.v;
          return (
            <button key={o.v} onClick={() => onChange(o.v)} style={{ flex: 1, height: 38, border: "1px solid " + (active ? "var(--hop-500)" : "rgba(255,255,255,0.14)"), background: active ? "var(--hop-600)" : "rgba(255,255,255,0.04)", color: active ? "#fff" : "rgba(255,255,255,0.7)", borderRadius: 8, font: "700 12px/1 var(--font-sans)", cursor: "pointer" }}>{o.l}</button>
          );
        })}
      </div>
    </div>
  );
}
function TweaksDrawer({ onClose, tweaks, setTweak }) {
  return (
    <div style={{ position: "fixed", right: 16, bottom: 64, zIndex: 200, width: 280, background: "rgba(18,21,18,0.97)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 18, backdropFilter: "blur(8px)", boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ font: "800 15px/1 var(--font-sans)", color: "#fff" }}>Tweaks</span>
        <button onClick={onClose} style={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)" }}><Icon name="x" size={18} /></button>
      </div>
      <TweakRow label="Bovenbalk" hint="Kleur van de chrome-balk" value={tweaks.topBar} onChange={(v) => setTweak("topBar", v)} options={[{ v: "antraciet", l: "Antraciet" }, { v: "hop", l: "Hop-groen" }]} />
      <TweakRow label="Bon-positie" hint="Kassa: kant van het bonpaneel" value={tweaks.receiptSide} onChange={(v) => setTweak("receiptSide", v)} options={[{ v: "links", l: "Links" }, { v: "rechts", l: "Rechts" }]} />
      <TweakRow label="Tegeldichtheid" hint="Kassa: grootte productknoppen" value={tweaks.density} onChange={(v) => setTweak("density", v)} options={[{ v: "ruim", l: "Ruim" }, { v: "compact", l: "Compact" }]} />
      <TweakRow label="Keuken-indeling" hint="KDS: status-kolommen of één wachtrij" value={tweaks.kdsLayout} onChange={(v) => setTweak("kdsLayout", v)} options={[{ v: "kolommen", l: "Kolommen" }, { v: "wachtrij", l: "Wachtrij" }]} />
    </div>
  );
}

Object.assign(window, { Icon, euro, Stage, useTweaks, useApp, AppCtx, DemoNav, seedOrders, STATIONS });
