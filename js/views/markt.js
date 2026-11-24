// Markt: watchlist (crypto + aandelen), TradingView-grafiek, technische analyse
// en de trades die je op het gekozen ticker hebt gedaan.
(function (TD) {
  const { esc, shortSym, money, r, date, signClass } = TD.util;
  const S = TD.store;

  const TA_INTERVAL = { "5": "5m", "15": "15m", "60": "1h", "240": "4h", D: "1D", W: "1W", M: "1M" };
  let interval = "D";
  try {
    interval = localStorage.getItem("td.interval") || "D";
  } catch {}
  if (!(interval in TA_INTERVAL)) interval = "D";
  // Grafiekweergave: "tv" (TradingView-widget) of een range-timeframe ("1h", "4h").
  let chartMode = "tv";
  try {
    chartMode = localStorage.getItem("td.chartMode") || "tv";
  } catch {}
  let rangeCleanup = null;

  function render(root, params, query) {
    // ?view=1h / 4h / tv: open meteen in die grafiekweergave (bijv. vanaf een trade).
    const v = query && query.get && query.get("view");
    if (v && ["tv", "1h", "4h"].includes(v)) {
      chartMode = v;
      try {
        localStorage.setItem("td.chartMode", v);
      } catch {}
    }
    const wl = S.getWatchlist();
    const MK = TD.markets;
    // Oude links (bijv. BINANCE:SOLUSDT vanaf een oude trade) openen de Kraken-perpetual.
    const selected = (params.symbol && MK ? MK.canonical(params.symbol) : params.symbol) || (wl[0] && wl[0].symbol) || null;
    const nameOf = (sym) => {
      const m = MK && MK.info(sym);
      return m ? m.label : sym;
    };

    const group = (market) =>
      wl
        .filter((w) => w.market === market)
        .map(
          (w) => `
          <li class="${w.symbol === selected ? "active" : ""}">
            <a href="#/markt/${encodeURIComponent(w.symbol)}" title="${esc(w.symbol)}"><strong>${esc(shortSym(w.symbol))}</strong> <span class="muted small">${esc(nameOf(w.symbol))}</span></a>
            <button class="icon remove" data-remove="${esc(w.symbol)}" title="Verwijder ${esc(w.symbol)}">×</button>
          </li>`
        )
        .join("") || `<li class="empty">Nog geen tickers.</li>`;

    root.innerHTML = `
      <div class="markt">
        <aside class="panel watchlist">
          <h2>Watchlist</h2>
          <form id="add-form" class="add-form" autocomplete="off">
            <input id="add-input" placeholder="bijv. XRP of COIN" aria-label="Kraken-pair toevoegen">
            <button type="submit" class="btn primary">+</button>
          </form>
          <p id="add-error" class="error" hidden></p>
          <h3>Crypto</h3>
          <ul class="tick-list">${group("crypto")}</ul>
          <h3>Aandelen</h3>
          <ul class="tick-list">${group("stock")}</ul>
          <p class="hint">Alles loopt via <strong>Kraken Futures</strong> (perpetuals). Typ een coin (<code>XRP</code>) of een aandeel (<code>COIN</code>, <code>HOOD</code>); de app zoekt de bijbehorende perpetual op Kraken.</p>
        </aside>

        <section class="markt-main">
          ${
            selected
              ? `
          <div class="markt-head">
            <div><h2 class="sym">${esc(shortSym(selected))} <span class="muted small">Perp · ${esc(nameOf(selected))}</span></h2>
            <div class="muted small">${esc(selected)}${MK && MK.info(selected) && MK.info(selected).preIpo ? ' · <span class="warn-text">nog niet beursgenoteerd: speculatief, beweegt hard</span>' : ""}</div></div>
            <label class="inline">Interval
              <select id="interval">
                ${Object.keys(TA_INTERVAL)
                  .map(
                    (k) =>
                      `<option value="${k}" ${k === interval ? "selected" : ""}>${
                        { "5": "5 min", "15": "15 min", "60": "1 uur", "240": "4 uur", D: "Dag", W: "Week", M: "Maand" }[k]
                      }</option>`
                  )
                  .join("")}
              </select>
            </label>
            <span class="view-toggle" role="group" aria-label="Grafiekweergave">
              ${[["tv", "TradingView"], ["1h", "Range 1H"], ["4h", "Range 4H"]]
                .map(([k, l]) => `<button type="button" data-mode="${k}" class="${chartMode === k ? "active" : ""}">${l}</button>`)
                .join("")}
            </span>
            <a class="btn primary" href="#/trades/new?ticker=${encodeURIComponent(selected)}">+ Nieuwe trade op ${esc(shortSym(selected))}</a>
          </div>
          <div class="markt-grid">
            <div class="panel chart-panel"><div id="tv-chart" class="tv-widget"></div><div id="range-summary" class="range-summary" hidden></div>
              ${(() => {
                const w = wl.find((x) => x.symbol === selected);
                const tv = MK && MK.tvSymbol(selected, w && w.market);
                return tv ? `<p class="muted small chart-src">TradingView: ${esc(tv)}${/\.PM$/.test(tv) ? " (de Kraken-perpetual waarop je handelt)" : " (Kraken spot; je handelt de perpetual, die vrijwel gelijk loopt)"}. <strong>Range 1H / 4H</strong> tonen de Kraken Futures-koersen met de automatische range.</p>` : "";
              })()}</div>
            <div class="panel ta-panel"><h2>Technische analyse</h2><div id="tv-ta" class="tv-widget ta"></div></div>
          </div>
          <div class="panel">
            <h2>Mijn trades op ${esc(shortSym(selected))}</h2>
            ${tradesFor(selected)}
          </div>`
              : `<div class="panel empty">Voeg links een ticker toe om te beginnen.</div>`
          }
        </section>
      </div>`;

    // Events
    root.querySelector("#add-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = root.querySelector("#add-input");
      const err = root.querySelector("#add-error");
      err.hidden = true;
      if (!input.value.trim()) return;
      let found;
      try {
        found = await MK.resolve(input.value);
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        return;
      }
      if (wl.some((w) => w.symbol === found.symbol)) {
        err.textContent = shortSym(found.symbol) + " staat al in je watchlist.";
        err.hidden = false;
        return;
      }
      wl.push(found);
      S.setWatchlist(wl);
      location.hash = "#/markt/" + encodeURIComponent(found.symbol);
    });

    root.querySelectorAll("[data-remove]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.preventDefault();
        const sym = b.dataset.remove;
        S.setWatchlist(wl.filter((w) => w.symbol !== sym));
        if (sym === selected) location.hash = "#/markt";
        else TD.app.rerender();
      })
    );

    const iv = root.querySelector("#interval");
    if (iv)
      iv.addEventListener("change", () => {
        interval = iv.value;
        try {
          localStorage.setItem("td.interval", interval);
        } catch {}
        mountWidgets(selected);
      });

    root.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => setMode(b.dataset.mode, selected))
    );

    if (selected) mountWidgets(selected);
  }

  // Wissel tussen TradingView en de range-weergave (en onthoud de keuze).
  function setMode(mode, symbol) {
    chartMode = mode;
    try {
      localStorage.setItem("td.chartMode", chartMode);
    } catch {}
    document.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("active", x.dataset.mode === mode));
    mountWidgets(symbol);
  }

  // Range-weergave: automatisch gevonden range + setup in Lightweight Charts.
  async function mountRange(symbol, chart) {
    const sum = document.getElementById("range-summary");
    try {
      const res = await TD.rangeChart.render(chart, symbol, chartMode, { height: 560 });
      rangeCleanup = res.cleanup;
      const R = res.range, g = res.signal, nm = TD.notifier;
      sum.hidden = false;
      const text = R
        ? `Range ${TD.util.num(R.low, 6)} – ${TD.util.num(R.high, 6)} · mid ${TD.util.num(R.mid, 6)} · ${
            g ? `<strong>${esc(g.direction)}</strong>: ${esc(nm.describe({ ...g, status: g.status }))}` : "geen setup op dit moment"
          } · <a href="#/notifier/range?symbol=${encodeURIComponent(symbol)}&tf=${chartMode}">details</a>`
        : "Geen geldige range gevonden op dit timeframe: de markt trendt of is uitgebroken.";
      sum.innerHTML = `<span>${text}</span><button type="button" class="icon close-range" title="Range-weergave sluiten" aria-label="Range-weergave sluiten">×</button>`;
      sum.querySelector(".close-range").addEventListener("click", () => setMode("tv", symbol));
    } catch (e) {
      chart.innerHTML = `<p class="neg pad">${esc(e.message)}</p>`;
      sum.hidden = true;
    }
  }

  function tradesFor(symbol) {
    const p = S.computePortfolio();
    const list = S.getTrades()
      .filter((t) => t.ticker === symbol || (TD.markets && TD.markets.canonical(t.ticker) === symbol))
      .sort((a, b) => (b.entryDate || "").localeCompare(a.entryDate || ""));
    if (!list.length) return `<p class="muted">Nog geen trades op dit ticker.</p>`;
    return `<table class="table clickable"><thead><tr><th>Datum</th><th>Richting</th><th>Setup</th><th>Status</th><th class="num">R</th><th class="num">PnL</th></tr></thead><tbody>
      ${list
        .map((t) => {
          const row = p.rows.get(t.id);
          return `<tr data-href="#/trades/${t.id}"><td>${date(t.entryDate)}</td><td>${esc(t.direction)}</td><td>${esc(t.setup)}</td>
          <td>${TD.views.trades.statusBadge(t)}</td><td class="num">${row ? r(row.r) : "—"}</td>
          <td class="num ${signClass(+t.pnl)}">${t.status === "closed" ? money(+t.pnl) : "—"}</td></tr>`;
        })
        .join("")}
    </tbody></table>`;
  }

  function mountWidgets(symbol) {
    const chart = document.getElementById("tv-chart");
    const ta = document.getElementById("tv-ta");
    if (!chart || !ta) return;
    if (rangeCleanup) rangeCleanup();
    rangeCleanup = null;
    chart.innerHTML = "";
    const sum = document.getElementById("range-summary");
    if (sum) sum.hidden = true;
    const w = S.getWatchlist().find((x) => x.symbol === symbol);
    const tv = TD.markets ? TD.markets.tvSymbol(symbol, w && w.market) : symbol;
    if (chartMode !== "tv" || !tv) {
      // Geen TradingView-symbool (pre-IPO): toon de range-grafiek met Kraken-koersen.
      if (!tv && chartMode === "tv") {
        chartMode = "1h";
        document.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("active", x.dataset.mode === "1h"));
      }
      mountRange(symbol, chart);
    } else if (typeof TradingView === "undefined") {
      chart.innerHTML = `<p class="muted pad">TradingView kon niet laden. Controleer je internetverbinding.</p>`;
    } else {
      new TradingView.widget({
        container_id: "tv-chart",
        symbol: tv,
        interval,
        autosize: true,
        timezone: "Europe/Amsterdam",
        theme: "dark",
        style: "1",
        locale: "nl_NL",
        allow_symbol_change: false,
        withdateranges: true,
        studies: ["Volume@tv-basicstudies"],
      });
    }
    ta.innerHTML = "";
    if (!tv) {
      ta.innerHTML = `<p class="muted small pad">Geen beursnotering, dus geen TradingView-analyse. Gebruik de range-grafiek (Kraken-koersen) en Get advise in de Notifier.</p>`;
      return;
    }
    const holder = document.createElement("div");
    holder.className = "tradingview-widget-container__widget";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";
    script.async = true;
    script.textContent = JSON.stringify({
      symbol: tv,
      interval: TA_INTERVAL[interval],
      width: "100%",
      height: "100%",
      isTransparent: true,
      colorTheme: "dark",
      showIntervalTabs: true,
      displayMode: "single",
      locale: "nl_NL",
    });
    ta.classList.add("tradingview-widget-container");
    ta.append(holder, script);
  }

  TD.views = TD.views || {};
  TD.views.markt = { render };
})(window.TD);
