// Hop & Bites — Kassa (POS till). Ports the DS UI-kit composition with
// tweak-driven layout, and pushes a real order into the shared queue on pay.

// name → kitchen station (for the order we send to the keuken)
const NAME_STATION = (() => {
  const m = {};
  const MENU = window.HB_MENU;
  if (MENU) {
    Object.keys(MENU.products).forEach((cat) => {
      const st = window.STATIONS[cat] || "alle";
      MENU.products[cat].forEach((p) => { m[p.name] = st; });
    });
  }
  return m;
})();

/* ---------- Top bar ---------- */
function KassaTopBar({ orderNo, onHome, topBar }) {
  const hop = topBar === "hop";
  const bg = hop ? "var(--hop-700)" : "var(--charcoal-900)";
  const chipBorder = hop ? "rgba(255,255,255,0.28)" : "var(--charcoal-700)";
  const sub = hop ? "rgba(255,255,255,0.7)" : "var(--charcoal-400)";
  return (
    <header style={{ height: "var(--topbar-h)", flex: "none", background: bg, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={onHome} title="Naar start" style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.08)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="layout-grid" size={22} color="var(--offwhite)" /></button>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: hop ? "rgba(0,0,0,0.18)" : "var(--charcoal-800)", display: "flex", alignItems: "center", justifyContent: "center", font: "800 24px/1 var(--font-sans)", color: "var(--offwhite)" }}>H<span style={{ color: hop ? "#fff" : "var(--hop-500)" }}>&amp;</span>B</div>
        <div>
          <div style={{ font: "800 24px/1 var(--font-sans)", letterSpacing: "-0.01em", color: "var(--offwhite)" }}>Hop <span style={{ color: hop ? "#fff" : "var(--hop-500)", padding: "0 2px" }}>&amp;</span> Bites</div>
          <div style={{ font: "600 12px/1 var(--font-sans)", letterSpacing: "0.18em", color: sub, marginTop: 5 }}>BBQ · CATERING</div>
        </div>
      </div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 16px", border: "1px solid " + chipBorder, borderRadius: "var(--radius-md)", color: hop ? "#fff" : "var(--charcoal-300)", font: "700 15px/1 var(--font-sans)" }}>
        <Icon name="shopping-bag" size={18} /> Afhalen &amp; catering
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ textAlign: "right" }}>
          <div className="hb-tabular" style={{ font: "700 16px/1 var(--font-sans)", color: "var(--offwhite)" }}>Bon #{orderNo}</div>
          <div style={{ font: "500 13px/1 var(--font-sans)", color: sub, marginTop: 4 }}>Kassa 1 · Manon</div>
        </div>
        <div style={{ width: 44, height: 44, borderRadius: 999, background: hop ? "rgba(0,0,0,0.22)" : "var(--hop-600)", display: "flex", alignItems: "center", justifyContent: "center", font: "700 16px/1 var(--font-sans)", color: "var(--offwhite)" }}>M</div>
      </div>
    </header>
  );
}

/* ---------- Receipt panel ---------- */
function ReceiptPanel({ lines, selectedId, onSelect, onQty, onDelete, discountPct, holdCount }) {
  const { OrderLine, QtyStepper, Badge } = window.HopBitesDesignSystem_c232d8;
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const discount = subtotal * (discountPct / 100);
  const total = subtotal - discount;
  const selected = lines.find((l) => l.id === selectedId);
  const totalRow = (label, val, opts = {}) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ font: (opts.strong ? "800 " : "500 ") + (opts.big ? "30px" : "16px") + "/1 var(--font-sans)", color: opts.color || "var(--text-muted)" }}>{label}</span>
      <span className="hb-tabular" style={{ font: (opts.strong ? "800 " : "700 ") + (opts.big ? "36px" : "17px") + "/1 var(--font-sans)", color: opts.color || "var(--text-strong)" }}>{val}</span>
    </div>
  );
  return (
    <aside style={{ height: "100%", minHeight: 0, background: "var(--bg-receipt)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flex: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="receipt" size={22} color="var(--charcoal-700)" />
          <span style={{ font: "800 20px/1 var(--font-sans)", color: "var(--text-strong)" }}>Bestelling</span>
        </div>
        <Badge variant={count ? "accent" : "neutral"}>{count} {count === 1 ? "item" : "items"}</Badge>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 8px" }}>
        {lines.length === 0 ? (
          <div style={{ height: "100%", minHeight: 160, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--text-muted)" }}>
            <Icon name="utensils-crossed" size={36} color="var(--charcoal-300)" />
            <span style={{ font: "600 15px/1.4 var(--font-sans)", textAlign: "center" }}>Nog niets aangeslagen.<br />Tik rechts op een product.</span>
          </div>
        ) : lines.map((l) => (
          <OrderLine key={l.id} qty={l.qty} name={l.name} unitPrice={l.price} lineTotal={l.qty * l.price} note={l.sublabel} selected={l.id === selectedId} onClick={() => onSelect(l.id)} />
        ))}
      </div>
      {selected ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--hop-50)", borderTop: "1px solid var(--hop-100)", flex: "none" }}>
          <span style={{ flex: 1, minWidth: 0, font: "700 14px/1.2 var(--font-sans)", color: "var(--hop-800)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.name}</span>
          <QtyStepper value={selected.qty} min={1} size="sm" onChange={(q) => onQty(selected.id, q)} />
          <button onClick={() => onDelete(selected.id)} style={{ width: 40, height: 40, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--paper-bright)", border: "1px solid var(--brick-600)", borderRadius: "var(--radius-md)", cursor: "pointer" }}><Icon name="trash-2" size={20} color="var(--brick-600)" /></button>
        </div>
      ) : null}
      <div style={{ padding: "14px 18px", borderTop: "1px solid var(--line-strong)", display: "flex", flexDirection: "column", gap: 8, flex: "none" }}>
        {totalRow("Subtotaal", euro(subtotal))}
        {discountPct > 0 ? totalRow(`Korting (${discountPct}%)`, "− " + euro(discount), { color: "var(--amber-600)" }) : null}
        <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />
        {totalRow("Totaal", euro(total), { strong: true, big: true })}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: -2 }}>
          <span style={{ font: "500 12px/1 var(--font-sans)", color: "var(--text-muted)" }}>incl. 9% btw</span>
          {holdCount > 0 ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "600 12px/1 var(--font-sans)", color: "var(--text-muted)" }}><Icon name="clock" size={14} /> {holdCount} in de wacht</span>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

/* ---------- Numpad cell ---------- */
function NumpadCell({ value, onChange }) {
  const { NumPad } = window.HopBitesDesignSystem_c232d8;
  const active = !!value && parseInt(value, 10) > 1;
  return (
    <div style={{ height: "100%", minHeight: 0, background: "var(--bg-receipt)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", display: "flex", flexDirection: "column", gap: 8, padding: 12, overflow: "hidden" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, font: "700 13px/1.3 var(--font-sans)", color: active ? "var(--hop-700)" : "var(--text-muted)" }}>
        <Icon name="hash" size={16} color={active ? "var(--hop-700)" : "var(--charcoal-500)"} />
        {active ? `${parseInt(value, 10)}× — tik nu een product` : "Aantal vooraf, dan een product"}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}><NumPad value={value} onChange={onChange} keyHeight={54} /></div>
    </div>
  );
}

/* ---------- Product area ---------- */
function ProductArea({ onAdd, density }) {
  const { CategoryTab, ProductButton } = window.HopBitesDesignSystem_c232d8;
  const MENU = window.HB_MENU;
  const [group, setGroup] = React.useState("eten");
  const cats = MENU.groups.find((g) => g.id === group).cats;
  const [cat, setCat] = React.useState(cats[0]);
  React.useEffect(() => { if (!cats.includes(cat)) setCat(cats[0]); }, [group]);
  const activeCat = cats.includes(cat) ? cat : cats[0];
  const accent = MENU.categories[activeCat].accent;
  const products = MENU.products[activeCat] || [];
  const cols = density === "compact" ? 5 : 4;
  const minH = density === "compact" ? 100 : 124;
  return (
    <section style={{ height: "100%", minHeight: 0, display: "flex", gap: 10 }}>
      <nav style={{ width: "var(--rail-w)", flex: "none", display: "flex", flexDirection: "column", gap: 10 }}>
        {MENU.groups.map((g) => (
          <CategoryTab key={g.id} orientation="vertical" label={g.label} icon={<Icon name={g.icon} size={26} />} accent={MENU.categories[g.cats[0]].accent} active={group === g.id} onClick={() => setGroup(g.id)} style={{ flex: 1 }} />
        ))}
      </nav>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", flex: "none" }}>
          {cats.map((cid) => (
            <CategoryTab key={cid} label={MENU.categories[cid].label} count={MENU.products[cid].length} accent={MENU.categories[cid].accent} active={activeCat === cid} onClick={() => setCat(cid)} />
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: `minmax(${minH}px, 1fr)`, gap: 10 }}>
            {products.map((p) => (
              <ProductButton key={p.id} name={p.name} price={p.price} sublabel={p.sublabel} accent={accent} onClick={() => onAdd(p)} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Bottom region pieces ---------- */
function FunctionGrid({ discountPct, onKorting, onHold, onSplit, onRetour, disabled }) {
  const { FunctionButton } = window.HopBitesDesignSystem_c232d8;
  const cell = { height: "100%", width: "100%" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gridTemplateRows: "repeat(2, 1fr)", gap: 10, height: "100%" }}>
      <FunctionButton label="Korting" icon={<Icon name="percent" size={24} />} variant={discountPct > 0 ? "amber" : "neutral"} onClick={onKorting} disabled={disabled} style={cell} />
      <FunctionButton label="In de wacht" icon={<Icon name="pause" size={24} />} onClick={onHold} disabled={disabled} style={cell} />
      <FunctionButton label="Splitsen" icon={<Icon name="split" size={24} />} onClick={onSplit} disabled={disabled} style={cell} />
      <FunctionButton label="Retour" icon={<Icon name="undo-2" size={24} />} variant="danger" onClick={onRetour} disabled={disabled} style={cell} />
    </div>
  );
}
function MiddleUtility({ onAction }) {
  const items = [{ id: "lade", label: "Lade", icon: "archive" }, { id: "klant", label: "Klant", icon: "user" }, { id: "notitie", label: "Notitie", icon: "pencil" }];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
      {items.map((it) => (
        <button key={it.id} onClick={() => onAction(it.label)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-md)", color: "var(--text-body)", cursor: "pointer", font: "700 13px/1 var(--font-sans)", WebkitTapHighlightColor: "transparent" }}>
          <Icon name={it.icon} size={22} color="var(--charcoal-600)" /> {it.label}
        </button>
      ))}
    </div>
  );
}
function PaymentGrid({ total, onPay, onSecondary, disabled }) {
  const payKey = (method, label, icon, bg, fg, border) => (
    <button disabled={disabled} onClick={() => onPay(method)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: bg, color: fg, border: "1px solid " + (border || bg), borderRadius: "var(--radius-md)", font: "800 19px/1 var(--font-sans)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, WebkitTapHighlightColor: "transparent" }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.98)"; }} onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }} onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}>
      <Icon name={icon} size={26} /> {label}
    </button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", height: 76, background: "var(--charcoal-900)", borderRadius: "var(--radius-md)" }}>
        <span style={{ font: "700 18px/1 var(--font-sans)", color: "var(--charcoal-300)" }}>Totaal</span>
        <span className="hb-tabular" style={{ font: "800 38px/1 var(--font-sans)", color: "var(--offwhite)" }}>{euro(total)}</span>
      </div>
      <div style={{ flex: 1, display: "flex", gap: 10 }}>
        {payKey("pin", "PIN", "credit-card", "var(--hop-600)", "var(--text-on-accent)")}
        {payKey("cash", "Contant", "banknote", "var(--paper-bright)", "var(--text-strong)", "var(--line-strong)")}
      </div>
      <button disabled={disabled} onClick={onSecondary} style={{ flex: "none", height: 52, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-md)", font: "700 15px/1 var(--font-sans)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, WebkitTapHighlightColor: "transparent" }}>
        <Icon name="file-text" size={18} /> Op rekening
      </button>
    </div>
  );
}

/* ---------- Overlays ---------- */
function PaymentOverlay({ total, method: initialMethod = null, onClose, onComplete }) {
  const { Button } = window.HopBitesDesignSystem_c232d8;
  const [step, setStep] = React.useState(initialMethod ? "done" : "choose");
  const [method, setMethod] = React.useState(initialMethod);
  const pay = (m) => { setMethod(m); setStep("done"); };
  const methodBtn = (id, label, icon, sub) => (
    <button onClick={() => pay(id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "32px 20px", background: "var(--paper-bright)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", cursor: "pointer", minHeight: 200 }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--hop-600)"; e.currentTarget.style.background = "var(--hop-50)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line-strong)"; e.currentTarget.style.background = "var(--paper-bright)"; }}>
      <div style={{ width: 72, height: 72, borderRadius: 18, background: "var(--hop-100)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={36} color="var(--hop-700)" /></div>
      <div style={{ font: "800 24px/1 var(--font-sans)", color: "var(--text-strong)" }}>{label}</div>
      <div style={{ font: "500 15px/1 var(--font-sans)", color: "var(--text-muted)" }}>{sub}</div>
    </button>
  );
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(27,32,29,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={step === "choose" ? onClose : undefined}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 680, background: "var(--bg-receipt)", borderRadius: "var(--radius-xl)", border: "1px solid var(--line-strong)", boxShadow: "var(--shadow-raised)", overflow: "hidden" }}>
        {step === "choose" ? (
          <>
            <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ font: "800 24px/1 var(--font-sans)", color: "var(--text-strong)" }}>Afrekenen</span>
              <button onClick={onClose} style={{ width: 48, height: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}><Icon name="x" size={26} color="var(--charcoal-600)" /></button>
            </div>
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
                <span style={{ font: "600 20px/1 var(--font-sans)", color: "var(--text-muted)" }}>Te betalen</span>
                <span className="hb-tabular" style={{ font: "800 48px/1 var(--font-sans)", color: "var(--text-strong)" }}>{euro(total)}</span>
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                {methodBtn("pin", "PIN / Contactloos", "credit-card", "Tik of houd de kaart bij")}
                {methodBtn("cash", "Contant", "banknote", "Lade opent automatisch")}
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: "48px 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
            <div style={{ width: 96, height: 96, borderRadius: 999, background: "var(--hop-600)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={52} color="var(--offwhite)" strokeWidth={3} /></div>
            <div style={{ font: "800 30px/1.1 var(--font-sans)", color: "var(--text-strong)" }}>Betaald · {euro(total)}</div>
            <div style={{ font: "500 17px/1.3 var(--font-sans)", color: "var(--text-muted)" }}>{method === "pin" ? "PIN / contactloos geslaagd" : "Contant ontvangen"} · bon naar keuken</div>
            <Button variant="primary" size="lg" fullWidth onClick={onComplete} style={{ marginTop: 12 }}>Nieuwe bon</Button>
          </div>
        )}
      </div>
    </div>
  );
}
function SplitOverlay({ total, onClose }) {
  const { Button } = window.HopBitesDesignSystem_c232d8;
  const [n, setN] = React.useState(2);
  const per = total / n;
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(27,32,29,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, background: "var(--bg-receipt)", borderRadius: "var(--radius-xl)", border: "1px solid var(--line-strong)", overflow: "hidden" }}>
        <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ font: "800 24px/1 var(--font-sans)", color: "var(--text-strong)" }}>Splitsen</span>
          <button onClick={onClose} style={{ width: 48, height: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}><Icon name="x" size={26} color="var(--charcoal-600)" /></button>
        </div>
        <div style={{ padding: 28 }}>
          <div style={{ font: "600 17px/1 var(--font-sans)", color: "var(--text-muted)", marginBottom: 14 }}>Gelijk verdelen over</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            {[2, 3, 4, 5].map((k) => (
              <button key={k} onClick={() => setN(k)} style={{ flex: 1, height: 72, borderRadius: "var(--radius-md)", cursor: "pointer", background: n === k ? "var(--charcoal-900)" : "var(--paper-bright)", color: n === k ? "var(--offwhite)" : "var(--text-strong)", border: "1px solid " + (n === k ? "var(--charcoal-900)" : "var(--line-strong)"), font: "800 24px/1 var(--font-sans)" }}>{k}×</button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "16px 0", borderTop: "1px solid var(--border)" }}>
            <span style={{ font: "700 20px/1 var(--font-sans)", color: "var(--text-strong)" }}>Per persoon</span>
            <span className="hb-tabular" style={{ font: "800 40px/1 var(--font-sans)", color: "var(--hop-700)" }}>{euro(per)}</span>
          </div>
          <Button variant="primary" size="lg" fullWidth onClick={onClose} style={{ marginTop: 12 }}>Bevestig splitsing</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Kassa app ---------- */
function Kassa() {
  const { go, tweaks, addOrder, nextOrderNo } = useApp();
  const [lines, setLines] = React.useState([
    { id: "l-pork", name: "Langós Pulled Pork", price: 9.5, qty: 2 },
    { id: "b-spec", name: "Speciaalbier", price: 4.5, qty: 2, sublabel: "hop!" },
  ]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [discountPct, setDiscountPct] = React.useState(0);
  const [orderNo, setOrderNo] = React.useState(() => nextOrderNo());
  const [holdCount, setHoldCount] = React.useState(1);
  const [paying, setPaying] = React.useState(false);
  const [payMethod, setPayMethod] = React.useState(null);
  const [splitOpen, setSplitOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [pendingQty, setPendingQty] = React.useState("");

  const flash = (msg) => { setToast(msg); clearTimeout(window.__hbT); window.__hbT = setTimeout(() => setToast(null), 2200); };
  const addProduct = (p) => {
    const add = Math.max(1, parseInt(pendingQty || "1", 10));
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === p.id);
      if (i >= 0) { const c = [...prev]; c[i] = { ...c[i], qty: c[i].qty + add }; return c; }
      return [...prev, { id: p.id, name: p.name, price: p.price, qty: add, sublabel: p.sublabel }];
    });
    if (pendingQty) setPendingQty("");
  };
  const setQty = (id, q) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qty: q } : l)));
  const del = (id) => { setLines((prev) => prev.filter((l) => l.id !== id)); setSelectedId(null); };
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const total = subtotal * (1 - discountPct / 100);
  const empty = lines.length === 0;
  const reset = () => { setLines([]); setSelectedId(null); setDiscountPct(0); };
  const onKorting = () => setDiscountPct((d) => (d > 0 ? 0 : 10));
  const onHold = () => { setHoldCount((h) => h + 1); reset(); flash("Bon in de wacht gezet"); };
  const onRetour = () => { reset(); flash("Bon geannuleerd"); };
  const onPay = (method) => { setPayMethod(method); setPaying(true); };
  const onComplete = () => {
    // Push the order to the shared queue so it shows up in Keuken & Klantscherm.
    addOrder({
      id: orderNo, label: "#" + orderNo, customer: null, status: "placed", placedAt: Date.now(),
      items: lines.map((l) => ({ qty: l.qty, name: l.name, station: NAME_STATION[l.name] || "alle", mods: l.sublabel ? [l.sublabel] : [] })),
    });
    setPaying(false); setPayMethod(null); setOrderNo(nextOrderNo()); reset(); flash("Bon afgerond · naar keuken");
  };

  const tb = tweaks.topBar;
  const reverse = tweaks.receiptSide === "rechts";
  const leftCol = (
    <div style={{ width: 520, flex: "none", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReceiptPanel lines={lines} selectedId={selectedId} onSelect={(id) => setSelectedId((s) => (s === id ? null : id))} onQty={setQty} onDelete={del} discountPct={discountPct} holdCount={holdCount} />
      </div>
      <div style={{ height: 360, flex: "none" }}><NumpadCell value={pendingQty} onChange={setPendingQty} /></div>
    </div>
  );
  const rightCol = (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0 }}><ProductArea onAdd={addProduct} density={tweaks.density} /></div>
      <div style={{ height: 232, flex: "none", display: "flex", gap: 12 }}>
        <div style={{ width: 380, flex: "none" }}><FunctionGrid discountPct={discountPct} onKorting={onKorting} onHold={onHold} onSplit={() => setSplitOpen(true)} onRetour={onRetour} disabled={empty} /></div>
        <div style={{ width: 92, flex: "none" }}><MiddleUtility onAction={(l) => flash(l === "Lade" ? "Kassalade geopend" : l + " geopend")} /></div>
        <div style={{ flex: 1, minWidth: 0 }}><PaymentGrid total={total} onPay={onPay} onSecondary={() => flash("Op rekening geboekt")} disabled={empty} /></div>
      </div>
    </div>
  );

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-app)", position: "relative" }}>
      <KassaTopBar orderNo={orderNo} onHome={() => go("launcher")} topBar={tb} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 12, padding: 14, flexDirection: reverse ? "row-reverse" : "row" }}>
        {leftCol}
        {rightCol}
      </div>
      {paying ? <PaymentOverlay total={total} method={payMethod} onClose={() => { setPaying(false); setPayMethod(null); }} onComplete={onComplete} /> : null}
      {splitOpen ? <SplitOverlay total={total} onClose={() => setSplitOpen(false)} /> : null}
      {toast ? (
        <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12, padding: "16px 26px", background: "var(--charcoal-900)", color: "var(--offwhite)", borderRadius: "var(--radius-md)", font: "700 18px/1 var(--font-sans)", boxShadow: "var(--shadow-raised)", zIndex: 60 }}>
          <Icon name="check" size={22} color="var(--hop-500)" strokeWidth={3} /> {toast}
        </div>
      ) : null}
    </div>
  );
}

Object.assign(window, { Kassa });
