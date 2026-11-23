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

  TD.app = { rerender };
  route();
})(window.TD);
