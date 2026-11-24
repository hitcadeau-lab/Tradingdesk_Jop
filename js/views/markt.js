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
    const selected = params.symbol || (wl[0] && wl[0].symbol) || null;

    const group = (market) =>
      wl
        .filter((w) => w.market === market)
        .map(
          (w) => `
          <li class="${w.symbol === selected ? "active" : ""}">
            <a href="#/markt/${encodeURIComponent(w.symbol)}">${esc(w.symbol)}</a>
            <button class="icon remove" data-remove="${esc(w.symbol)}" title="Verwijder ${esc(w.symbol)}">×</button>
          </li>`
        )
        .join("") || `<li class="empty">Nog geen tickers.</li>`;

    root.innerHTML = `
      <div class="markt">
        <aside class="panel watchlist">
          <h2>Watchlist</h2>
          <form id="add-form" class="add-form" autocomplete="off">
            <input id="add-input" placeholder="bijv. BINANCE:XRPUSDT of NASDAQ:TSLA" aria-label="Ticker toevoegen">
            <select id="add-market" aria-label="Markt">
              <option value="crypto">Crypto</option>
              <option value="stock">Aandeel</option>
            </select>
            <button type="submit" class="btn primary">+</button>
          </form>
          <p id="add-error" class="error" hidden></p>
          <h3>Crypto</h3>
          <ul class="tick-list">${group("crypto")}</ul>
          <h3>Aandelen</h3>
          <ul class="tick-list">${group("stock")}</ul>
          <p class="hint">Gebruik <code>BEURS:TICKER</code>, bijv. <code>BINANCE:BTCUSDT</code>, <code>BYBIT:ETHUSDT</code> of <code>EURONEXT:ADYEN</code>.</p>
        </aside>

        <section class="markt-main">
          ${
            selected
              ? `
          <div class="markt-head">
            <h2 class="sym">${esc(selected)}</h2>
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
            <div class="panel chart-panel"><div id="tv-chart" class="tv-widget"></div><div id="range-summary" class="range-summary" hidden></div></div>
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
    root.querySelector("#add-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = root.querySelector("#add-input");
      const err = root.querySelector("#add-error");
      const sym = input.value.trim().toUpperCase().replace(/\s+/g, "");
      err.hidden = true;
      if (!sym) return;
      if (!/^([A-Z0-9_]+:)?[A-Z0-9._!/-]+$/.test(sym)) {
        err.textContent = "Ongeldige ticker. Gebruik bijv. BINANCE:BTCUSDT of NASDAQ:AAPL.";
        err.hidden = false;
        return;
      }
      if (wl.some((w) => w.symbol === sym)) {
        err.textContent = sym + " staat al in je watchlist.";
        err.hidden = false;
        return;
      }
      wl.push({ symbol: sym, market: root.querySelector("#add-market").value });
      S.setWatchlist(wl);
      location.hash = "#/markt/" + encodeURIComponent(sym);
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
      .filter((t) => t.ticker === symbol)
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
    if (chartMode !== "tv") {
      mountRange(symbol, chart);
    } else if (typeof TradingView === "undefined") {
      chart.innerHTML = `<p class="muted pad">TradingView kon niet laden. Controleer je internetverbinding.</p>`;
    } else {
      new TradingView.widget({
        container_id: "tv-chart",
        symbol,
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
    const holder = document.createElement("div");
    holder.className = "tradingview-widget-container__widget";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";
    script.async = true;
    script.textContent = JSON.stringify({
      symbol,
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
