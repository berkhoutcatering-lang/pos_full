// Hop & Bites — Root. Holds navigation, venue, shared order queue and tweaks;
// provides them via context and renders the active surface inside the Stage.
function Root() {
  const [screen, setScreen] = React.useState(() => localStorage.getItem("hb_screen") || "login");
  const [venue, setVenue] = React.useState(null);
  const [orders, setOrders] = React.useState(seedOrders);
  const [tweaks, setTweak] = useTweaks();
  const seq = React.useRef(216);

  const go = React.useCallback((s) => { setScreen(s); try { localStorage.setItem("hb_screen", s); } catch {} }, []);
  const nextOrderNo = React.useCallback(() => seq.current++, []);
  const addOrder = React.useCallback((o) => setOrders((prev) => [...prev, o]), []);
  const bumpOrder = React.useCallback((id, to) => {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: to, preparedAt: to === "ready" ? Date.now() : o.preparedAt } : o));
  }, []);

  const ctx = React.useMemo(() => ({ screen, go, venue, setVenue, orders, addOrder, bumpOrder, nextOrderNo, tweaks, setTweak }),
    [screen, venue, orders, tweaks, go, addOrder, bumpOrder, nextOrderNo, setTweak]);

  const surface = () => {
    switch (screen) {
      case "login": return <Login />;
      case "venue": return <VenueSelect />;
      case "launcher": return <Launcher />;
      case "kassa": return <Kassa />;
      case "keuken": return <Keuken />;
      case "cfd": return <Cfd />;
      case "admin": return <Admin />;
      default: return <Login />;
    }
  };

  return (
    <AppCtx.Provider value={ctx}>
      <Stage>{surface()}</Stage>
      <DemoNav />
    </AppCtx.Provider>
  );
}
Object.assign(window, { Root });
