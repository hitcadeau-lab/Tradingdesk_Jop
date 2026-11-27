// Router: koppelt de URL (#/markt, #/trades/..., #/portfolio, #/leerschool) aan de juiste pagina.
(function (TD) {
  const root = document.getElementById("view");

  function parse() {
    const raw = location.hash.replace(/^#/, "") || "/markt";
    const [path, qs] = raw.split("?");
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    return { parts, query: new URLSearchParams(qs || "") };
  }

  function route() {
    const { parts, query } = parse();
    const [section, a, b] = parts;
    const V = TD.views;
    if (section !== "notifier" && V.notifier) V.notifier.teardown();
    if (section !== "advise" && V.advise) V.advise.teardown();
    if (V.backtest) V.backtest.teardown();
    if (V.trades) V.trades.teardown();
    if (section !== "meldingen" && V.meldingen) V.meldingen.teardown();
    document.querySelectorAll("[data-nav]").forEach((l) => l.classList.toggle("active", l.dataset.nav === (section || "markt")));

    switch (section) {
      case "trades":
        if (!a) return V.trades.renderList(root, {}, query);
        if (a === "new") return V.trades.renderForm(root, {}, query);
        if (b === "edit") return V.trades.renderForm(root, { id: a }, query);
        return V.trades.renderDetail(root, { id: a }, query);
      case "portfolio":
        return V.portfolio.render(root, {}, query);
      case "leerschool":
        return V.leerschool.render(root, {}, query);
      case "notifier":
        return V.notifier.render(root, { id: a }, query);
      case "advise":
        return V.advise.render(root, { id: a }, query);
      case "backtest":
        return V.backtest.render(root, {}, query);
      case "meldingen":
        return V.meldingen.render(root, {}, query);
      case "instellingen":
        return V.instellingen.render(root, {}, query);
      case "markt":
      default:
        return V.markt.render(root, { symbol: a }, query);
    }
  }

  function rerender() {
    route();
  }

  // Klikbare tabelrijen: elke rij met data-href opent de bijbehorende pagina.
  document.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-href]");
    if (tr && !e.target.closest("a, button, input, select")) location.hash = tr.dataset.href;
  });

  window.addEventListener("hashchange", () => {
    route();
    window.scrollTo(0, 0);
  });

  // Teller met nieuwe meldingen naast "Notifier".
  function paintCount() {
    const el = document.getElementById("nav-count");
    if (!el || !TD.notifier) return;
    const n = TD.notifier.unseenCount();
    el.textContent = n;
    el.hidden = n === 0;
  }

  // Teller op de bel (ongelezen meldingen).
  function paintBell() {
    const el = document.getElementById("bell-count");
    if (!el || !TD.inbox) return;
    const n = TD.inbox.unreadCount();
    el.textContent = n > 99 ? "99+" : n;
    el.hidden = n === 0;
  }

  TD.app = { rerender };
  if (TD.markets) TD.markets.migrate(); // eenmalig: alles naar Kraken
  // Stop-buffer voorbij de lont (reclaims) uit Instellingen → Trading, voor Notifier, Advise en Backtest.
  if (TD.rangeEngine) TD.rangeEngine.DEFAULTS.stopBuffer = +TD.store.getSettings().stopBuffer;
  route();
  if (TD.inbox) {
    TD.inbox.onChange(paintBell);
    paintBell();
  }
  if (TD.tradeAlerts) TD.tradeAlerts.start();
  if (TD.paper) TD.paper.start();
  if (TD.notifier) {
    TD.notifier.onChange(paintCount);
    paintCount();
    TD.notifier.start();
  }
})(window.TD);
