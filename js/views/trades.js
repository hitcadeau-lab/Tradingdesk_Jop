// Trades: overzicht, nieuwe trade / bewerken (met de Trade Entry Checklist uit de PDF)
// en de detailpagina van één trade.
(function (TD) {
  const { esc, money, pct, num, r, date, shortSym, signClass, nowLocal, compressImage } = TD.util;
  const S = TD.store;

  // Fill-status van de papier-order: wacht op entry, gevuld, TP1 gevuld.
  function fillBadge(t) {
    const p = t.broker && TD.paper ? TD.paper.planForTrade(t.id) : null;
    if (!p || t.status !== "open") return "";
    if (p.status === "pending") return ` <span class="badge muted" title="De limit-order op ${esc(p.entry)} is nog niet geraakt">Wacht op fill</span>`;
    if (p.status === "open") return ` <span class="badge pos" title="Gevuld op ${esc(p.avgEntry)}">${p.tp1Done ? "TP1 gevuld · stop BE" : "Gevuld"}</span>`;
    return "";
  }

  function statusBadge(t) {
    const paper = t.broker ? ` <span class="badge paper" title="Papier-order bij Kraken Futures">Papier</span>` : "";
    if (t.status === "open") return `<span class="badge open">Open</span>${paper}${fillBadge(t)}`;
    if (t.outcome === "Cancelled") return `<span class="badge muted">Cancelled</span>${paper}`;
    const cls = t.outcome === "Stop Loss" ? "neg" : "pos";
    return `<span class="badge ${cls}">${esc(t.outcome || "Gesloten")}</span>${paper}`;
  }

  function scoreBadge(t) {
    const sc = S.checklistScore(t);
    const cls = sc.passed === sc.total ? "pos" : sc.passed >= sc.total - 2 ? "warn" : "neg";
    return `<span class="badge ${cls}" title="Groene checks">${sc.passed}/${sc.total}</span>`;
  }

  // PnL-kolom: gesloten = journal-PnL, open papier-positie = live open PnL (cursief).
  function pnlCell(t) {
    if (t.status === "closed") return `<td class="num ${signClass(+t.pnl)}">${money(+t.pnl)}</td>`;
    const p = t.broker && TD.paper ? TD.paper.planForTrade(t.id) : null;
    if (p && p.status === "open") {
      const u = TD.paper.unrealized(p, p.lastPrice) + p.realized - p.fees;
      return `<td class="num ${signClass(u)}" title="Open PnL (live, inclusief gerealiseerd en fees)"><em>${money(u)}</em></td>`;
    }
    return `<td class="num">—</td>`;
  }

  // ---------------- Vernieuwen ----------------
  // Haalt verse koersen op en werkt bij: papier-orders (fills, TP/SL, open PnL) en de TP/SL/BE-check
  // van je andere open trades. Met trade: alleen die ene trade.
  let lastRefresh = null;
  const clock = (ms) => new Date(ms).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  async function refreshTrades(btn, out, trade, done) {
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "↻ Bezig…";
    if (out) out.textContent = "";
    const jobs = [];
    try {
      if (trade) {
        const plan = trade.broker && TD.paper ? TD.paper.planForTrade(trade.id) : null;
        if (plan) jobs.push(TD.paper.sync({ planIds: [plan.id] }));
        else if (TD.tradeAlerts) jobs.push(TD.tradeAlerts.check({ tradeId: trade.id, force: true }));
      } else {
        if (TD.paper) jobs.push(TD.paper.sync());
        if (TD.tradeAlerts) jobs.push(TD.tradeAlerts.check({ force: true }));
      }
      await Promise.all(jobs);
      lastRefresh = Date.now();
      done();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = label;
      if (out) out.textContent = "Vernieuwen mislukt: " + e.message;
    }
  }

  // ---------------- Overzicht ----------------
  function renderList(root, params, query) {
    const p = S.computePortfolio();
    const all = S.getTrades();
    const f = {
      status: query.get("status") || "",
      ticker: query.get("ticker") || "",
      setup: query.get("setup") || "",
      tf: query.get("tf") || "",
    };
    const tickers = [...new Set(all.map((t) => t.ticker))].sort();
    const list = all
      .filter((t) => !f.status || t.status === f.status)
      .filter((t) => !f.ticker || t.ticker === f.ticker)
      .filter((t) => !f.setup || t.setup === f.setup)
      .filter((t) => !f.tf || (t.rangeTf || "") === f.tf)
      .sort((a, b) => (b.entryDate || "").localeCompare(a.entryDate || ""));

    const sel = (name, label, opts) =>
      `<label class="inline">${label}<select data-filter="${name}"><option value="">Alle</option>${opts
        .map((o) => `<option value="${esc(o.v ?? o)}" ${f[name] === (o.v ?? o) ? "selected" : ""}>${esc(o.l ?? o)}</option>`)
        .join("")}</select></label>`;

    root.innerHTML = `
      <div class="page-head">
        <h1>Trades</h1>
        <div class="row gap">
          <span class="muted small" id="refresh-out">${lastRefresh ? "Bijgewerkt " + clock(lastRefresh) : ""}</span>
          <button class="btn" id="refresh" title="Koersen ophalen: fills, TP/SL en open PnL van al je open trades">↻ Vernieuwen</button>
          <a class="btn primary" href="#/trades/new">+ Nieuwe trade</a>
        </div>
      </div>
      <div class="filters">
        ${sel("status", "Status", [{ v: "open", l: "Open" }, { v: "closed", l: "Gesloten" }])}
        ${sel("ticker", "Ticker", tickers)}
        ${sel("setup", "Setup", S.OPTIONS.setup)}
        ${sel("tf", "Timeframe", S.OPTIONS.rangeTf.filter((x) => all.some((t) => t.rangeTf === x)))}
        <span class="muted">${list.length} trade${list.length === 1 ? "" : "s"}</span>
      </div>
      <div class="panel">
      ${
        list.length
          ? `<table class="table clickable"><thead><tr>
            <th>Datum</th><th>Ticker</th><th title="Range-timeframe (leading)">TF</th><th>Richting</th><th>Setup</th><th>Type</th><th>Checks</th>
            <th>Status</th><th class="num">R/R plan</th><th class="num">R</th><th class="num">PnL</th></tr></thead><tbody>
            ${list
              .map((t) => {
                const row = p.rows.get(t.id);
                return `<tr data-href="#/trades/${t.id}">
                  <td>${date(t.entryDate)}</td><td><strong>${esc(shortSym(t.ticker))}</strong></td>
                  <td>${t.rangeTf ? `<span class="badge muted">${esc(t.rangeTf)}</span>` : '<span class="muted">—</span>'}</td>
                  <td><span class="dir ${t.direction === "Long" ? "pos" : "neg"}">${esc(t.direction)}</span></td>
                  <td>${esc(t.setup)}</td><td>${esc(t.tradeType)}</td><td>${scoreBadge(t)}</td>
                  <td>${statusBadge(t)}</td><td class="num">${r(S.totalRR(t))}</td>
                  <td class="num">${row ? r(row.r) : "—"}</td>
                  ${pnlCell(t)}</tr>`;
              })
              .join("")}
            </tbody></table>`
          : `<div class="empty">Nog geen trades${f.status || f.ticker || f.setup || f.tf ? " met deze filters" : ""}. <a href="#/trades/new">Plaats je eerste trade</a>.</div>`
      }
      </div>`;

    // Live bijwerken zolang het overzicht open staat (fills, open PnL, sluitingen).
    if (TD.paper && all.some((t) => t.broker && t.status === "open")) {
      const here = location.hash;
      const un = TD.paper.onChange(() => {
        if (location.hash === here) renderList(root, params, query);
      });
      if (snapCleanup) snapCleanup();
      snapCleanup = un;
    }

    root.querySelector("#refresh").addEventListener("click", (e) => refreshTrades(e.currentTarget, root.querySelector("#refresh-out"), null, () => renderList(root, params, query)));

    root.querySelectorAll("[data-filter]").forEach((s) =>
      s.addEventListener("change", () => {
        const q = new URLSearchParams();
        root.querySelectorAll("[data-filter]").forEach((x) => x.value && q.set(x.dataset.filter, x.value));
        location.hash = "#/trades" + (q.toString() ? "?" + q : "");
      })
    );
  }

  // Geraakte levels (uit de trade-meldingen) als korte tijdlijn.
  function hitsHTML(t) {
    if (!TD.tradeAlerts) return "";
    const h = TD.tradeAlerts.hitsFor(t.id);
    const order = [["tp1", "TP1"], ["tp2", "TP2"], ["tp3", "TP3"], ["be", "Break-even"], ["sl", "Stop loss"]].filter(([k]) => h[k]);
    if (!order.length) return t.status === "open" ? `<dt>Geraakt</dt><dd class="muted">Nog niets</dd>` : "";
    return `<dt>Geraakt</dt><dd>${order
      .map(([k, l]) => `<span class="badge ${k === "sl" ? "neg" : k === "be" ? "muted" : "pos"}">${l}</span> <span class="muted small">${TD.util.stamp(h[k] * 1000)}</span>`)
      .join("<br>")}</dd>`;
  }

  // ---------------- Papier-positie (Kraken) ----------------
  function paintPosition(root, t) {
    const box = root.querySelector("#ex-position");
    if (!box || !TD.paper) return;
    const p = TD.paper.planForTrade(t.id);
    if (!p) {
      box.innerHTML = `<h2>Kraken Futures <span class="badge warn">papier</span></h2><p class="muted">Geen papier-order gevonden (mogelijk na een reset van het papier-account).</p>`;
      return;
    }
    const usd = (v) => (v === null || v === undefined || isNaN(v) ? "—" : v.toLocaleString("nl-NL", { style: "currency", currency: "USD" }));
    const st = { pending: '<span class="badge open">Wacht op fill</span>', open: `<span class="badge pos">Open${p.tp1Done ? " · TP1 gevuld" : ""}</span>`, closed: '<span class="badge muted">Gesloten</span>', cancelled: '<span class="badge muted">Geannuleerd</span>' }[p.status];
    const un = TD.paper.unrealized(p, p.lastPrice);
    box.innerHTML = `
      <h2>Kraken Futures <span class="badge warn">papier</span> ${st} <span class="muted small">${esc(p.symbol)} · ${p.leverage}x</span></h2>
      <div class="kpis small">
        <div class="kpi"><span>Laatste prijs</span><strong>${p.lastPrice ?? "—"}</strong><em>${p.status === "pending" ? "entry " + p.entry : "gem. entry " + (p.avgEntry ?? "—")}</em></div>
        <div class="kpi"><span>Positie</span><strong>${p.remaining || 0} / ${p.size}</strong><em>${p.side === "long" ? "Long" : "Short"}</em></div>
        <div class="kpi"><span>Stop nu</span><strong>${+(+p.slCurrent).toPrecision(8)}</strong><em>${p.tp1Done ? "break-even" : "oorspronkelijke stop"} · liq ≈ ${+(+p.liq).toPrecision(6)}</em></div>
        <div class="kpi"><span>Open PnL</span><strong class="${un >= 0 ? "pos" : "neg"}">${usd(un)}</strong><em>gerealiseerd ${usd(p.realized - p.fees)} (fees ${usd(p.fees)})</em></div>
      </div>
      <div class="row gap">
        ${p.status === "pending" ? `<button class="btn small" data-ex="cancel">Order annuleren</button>` : ""}
        ${p.status === "open" ? `<button class="btn small danger" data-ex="close">Positie sluiten (markt)</button>` : ""}
        ${p.status === "open" && !p.tp1Done ? `<button class="btn small" data-ex="be">Stop nu naar break-even</button>` : ""}
        <button class="btn small" data-ex="sync">Nu bijwerken</button>
        <span class="muted small" id="ex-msg"></span>
      </div>
      <h3>Verloop</h3>
      <table class="table"><thead><tr><th>Tijd</th><th>Gebeurtenis</th><th class="num">Prijs</th><th class="num">Fee</th><th class="num">Resultaat</th></tr></thead><tbody>
        ${p.events
          .slice()
          .reverse()
          .map((e) => `<tr><td>${TD.util.stamp(e.t * 1000)}</td><td class="wrap">${esc(e.text)}</td><td class="num">${e.price ?? "—"}</td><td class="num">${e.fee ? usd(e.fee) : "—"}</td><td class="num ${e.pnl > 0 ? "pos" : e.pnl < 0 ? "neg" : ""}">${e.pnl ? usd(e.pnl) : "—"}</td></tr>`)
          .join("")}
      </tbody></table>
      <p class="muted small">Papier-modus: gesimuleerd op echte Kraken Futures-koersen (1-minuut-candles), bijgewerkt elke 15 seconden zolang de app open is. Funding wordt niet meegerekend.</p>`;
    box.querySelectorAll("[data-ex]").forEach((b) =>
      b.addEventListener("click", async () => {
        const msg = box.querySelector("#ex-msg");
        try {
          if (b.dataset.ex === "cancel" && confirm("Papier-order annuleren?")) TD.paper.cancel(p.id);
          if (b.dataset.ex === "close" && confirm("Papier-positie nu tegen de marktprijs sluiten?")) await TD.paper.closeMarket(p.id);
          if (b.dataset.ex === "be") TD.paper.stopToBreakEven(p.id);
          if (b.dataset.ex === "sync") {
            msg.textContent = "Bijwerken…";
            await TD.paper.sync();
            msg.textContent = "";
          }
        } catch (e) {
          msg.textContent = e.message;
        }
      })
    );
  }

  // ---------------- Plan & marktbeeld ----------------
  const PLAN_KEYS = ["direction", "entry", "stopLoss", "tp1", "tp2", "tp3", "rangeHigh", "rangeLow", "rangeFrom", "rangeTo", "rangeTf", "trigger", "setup", "riskPct"];
  function makePlan(o, riskAmount) {
    const plan = { placedAt: new Date().toISOString(), riskAmount, currency: S.getSettings().currency };
    for (const k of PLAN_KEYS) plan[k] = o[k] ?? null;
    return plan;
  }
  // Welke velden zijn na het plaatsen nog veranderd?
  function planChanges(t) {
    if (!t.plan) return [];
    const label = { entry: "entry", stopLoss: "stoploss", tp1: "TP1", tp2: "TP2", tp3: "TP3", rangeHigh: "range high", rangeLow: "range low", direction: "richting", riskPct: "risico %" };
    return Object.keys(label).filter((k) => String(t.plan[k] ?? "") !== String(t[k] ?? "")).map((k) => label[k]);
  }
  const SNAP_TF = { "15m": "15m", "1H": "1h", "4H": "4h" };
  async function marketSnapshot(o) {
    const tf = SNAP_TF[o.rangeTf] || "1h";
    if (!TD.marketData || !TD.marketData.source(o.ticker)) return null;
    try {
      const candles = await Promise.race([
        TD.marketData.candles(o.ticker, tf, 300),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
      ]);
      return { tf, takenAt: new Date().toISOString(), candles: candles.slice(-150).map((c) => [c.time, c.open, c.high, c.low, c.close]) };
    } catch {
      return null; // geen data (bijv. offline of aandeel in de browser): plan wordt wel bewaard
    }
  }
  let snapCleanup = null;
  function teardown() {
    if (snapCleanup) snapCleanup();
    snapCleanup = null;
    if (typeof closeCleanup === "function") closeCleanup();
    closeCleanup = null;
  }
  function mountSnapshot(el, t) {
    if (snapCleanup) snapCleanup();
    snapCleanup = null;
    if (!el || !t.snapshot || !window.LightweightCharts) return;
    const LC = window.LightweightCharts;
    const pl = t.plan || t;
    const chart = LC.createChart(el, {
      height: 380, autoSize: true,
      layout: { background: { color: "#0f1115" }, textColor: "#8b919c" },
      grid: { vertLines: { color: "#1f232c" }, horzLines: { color: "#1f232c" } },
      rightPriceScale: { borderColor: "#262a33" },
      timeScale: { borderColor: "#262a33", timeVisible: true },
      localization: { locale: "nl-NL" },
    });
    const series = chart.addCandlestickSeries({ upColor: "#26a69a", downColor: "#ef5350", wickUpColor: "#26a69a", wickDownColor: "#ef5350", borderVisible: false });
    const data = t.snapshot.candles.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
    series.setData(data);
    const line = (price, color, title, style) => price !== null && price !== undefined && price !== "" && series.createPriceLine({ price: +price, color, lineWidth: style ? 1 : 2, lineStyle: style ?? LC.LineStyle.Solid, axisLabelVisible: true, title });
    if (pl.rangeHigh != null && pl.rangeLow != null) {
      line(pl.rangeHigh, "#ef5350", "Range high", LC.LineStyle.Dashed);
      line((+pl.rangeHigh + +pl.rangeLow) / 2, "#f5a623", "Mid", LC.LineStyle.Dashed);
      line(pl.rangeLow, "#26a69a", "Range low", LC.LineStyle.Dashed);
    }
    line(pl.entry, "#2962ff", "Entry");
    line(pl.stopLoss, "#ef5350", "SL");
    line(pl.tp1, "#f5a623", "TP1");
    line(pl.tp2, "#26a69a", "TP2");
    line(pl.tp3, "#26a69a", "TP3");
    const last = data[data.length - 1];
    const marks = [];
    // Getekende range: begin en einde van de push.
    if (pl.rangeFrom && pl.rangeTo && TD.chartDraw) {
      const a = TD.chartDraw.candleOf(data, pl.rangeFrom), b = TD.chartDraw.candleOf(data, pl.rangeTo);
      if (a) marks.push({ time: a.time, position: "belowBar", color: "#8b919c", shape: "circle", text: "Begin" });
      if (b && (!a || b.time !== a.time)) marks.push({ time: b.time, position: "aboveBar", color: "#8b919c", shape: "circle", text: "Einde" });
    }
    if (last) marks.push({ time: last.time, position: pl.direction === "Short" ? "aboveBar" : "belowBar", color: "#2962ff", shape: pl.direction === "Short" ? "arrowDown" : "arrowUp", text: "Geplaatst" });
    marks.sort((a, b) => a.time - b.time);
    series.setMarkers(marks);
    chart.timeScale().fitContent();
    snapCleanup = () => chart.remove();
  }

  // ---------------- Live chart in het formulier ----------------
  // Laadt candles bij een ander pair/timeframe; de lijnen worden bij elke invoer bijgewerkt.
  function liveChart(el, titleEl, msgEl, draw) {
    let chart = null, series = null, lines = [], key = null, loading = null, timer = null, last = null;
    const LC = window.LightweightCharts;
    function clearLines() {
      if (series) lines.forEach((l) => series.removePriceLine(l));
      lines = [];
    }
    function drawLines(o) {
      if (!series) return;
      clearLines();
      const add = (price, color, title, dashed) => {
        if (price === null || price === undefined || price === "" || isNaN(+price)) return;
        lines.push(series.createPriceLine({ price: +price, color, lineWidth: dashed ? 1 : 2, lineStyle: dashed ? LC.LineStyle.Dashed : LC.LineStyle.Solid, axisLabelVisible: true, title }));
      };
      if (o.rangeHigh != null && o.rangeLow != null && +o.rangeHigh > +o.rangeLow) {
        add(o.rangeHigh, "#ef5350", "Range high", true);
        add((+o.rangeHigh + +o.rangeLow) / 2, "#f5a623", "Mid", true);
        add(o.rangeLow, "#26a69a", "Range low", true);
      }
      add(o.entry, "#2962ff", "Entry");
      add(o.stopLoss, "#ef5350", "SL");
      add(o.tp1, "#f5a623", "TP1");
      add(o.tp2, "#26a69a", "TP2");
      add(o.tp3, "#26a69a", "TP3");
    }
    async function load(ticker, tf) {
      const k = ticker + "|" + tf;
      if (k === key || loading === k) return;
      loading = k;
      msgEl.hidden = true;
      try {
        const candles = await TD.marketData.candles(ticker, tf, 300);
        if (loading !== k) return;
        if (chart) chart.remove();
        chart = LC.createChart(el, {
          height: 380, autoSize: true,
          layout: { background: { color: "#0f1115" }, textColor: "#8b919c" },
          grid: { vertLines: { color: "#1f232c" }, horzLines: { color: "#1f232c" } },
          rightPriceScale: { borderColor: "#262a33" },
          timeScale: { borderColor: "#262a33", timeVisible: true },
          localization: { locale: "nl-NL" },
        });
        series = chart.addCandlestickSeries({ upColor: "#26a69a", downColor: "#ef5350", wickUpColor: "#26a69a", wickDownColor: "#ef5350", borderVisible: false });
        const data = candles.slice(-200).map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }));
        series.setData(data);
        lines = [];
        key = k;
        if (draw) draw.bind(chart, series, data);
        el.hidden = false;
        titleEl.textContent = `(${shortSym(ticker)} · ${TD.marketData.TF[tf].label})`;
        if (last) drawLines(last);
      } catch (e) {
        if (chart) chart.remove();
        chart = series = null;
        key = null;
        el.hidden = true;
        msgEl.hidden = false;
        msgEl.textContent = `Geen chart: ${e.message}`;
      } finally {
        if (loading === k) loading = null;
      }
    }
    return {
      update(o) {
        last = o;
        drawLines(o);
        const tf = SNAP_TF[o.rangeTf] || "1h";
        if (!o.ticker || !TD.marketData.source(o.ticker)) {
          titleEl.textContent = "";
          msgEl.hidden = false;
          msgEl.textContent = "Vul een pair in om de chart te zien.";
          return;
        }
        clearTimeout(timer);
        timer = setTimeout(() => load(o.ticker, tf), 400); // wachten tot je klaar bent met typen
      },
      destroy() {
        clearTimeout(timer);
        if (draw) draw.destroy();
        if (chart) chart.remove();
        chart = null;
      },
    };
  }

  // Status-blok in het formulier voor een trade die via Kraken (papier) loopt.
  function brokerStatusHTML(t, p, live) {
    const opt = (list, val) => list.map((o) => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("");
    const head = `<h2>Status & resultaat <span class="badge paper">Papier</span> <span class="muted small">${esc(p.symbol)}</span></h2>`;
    if (live)
      return `<section class="panel ex-section" id="broker-status">${head}
        <p>${p.status === "pending" ? "Je limit-order op " + esc(p.entry) + " bij <strong>Kraken Futures</strong> wacht nog op een fill." : "Je positie bij <strong>Kraken Futures</strong> staat open, met je stop loss en TP's al geplaatst."}
        Wil je er eerder uit? ${p.status === "pending" ? "Annuleer de order" : "Klik op <strong>Positie sluiten</strong>: Tradingdesk sluit de positie tegen de marktprijs en haalt de openstaande stop en TP's weg"}.
        De uitkomst, de exit-tijd en de echte PnL (inclusief fees) vult de app daarna zelf in; ‘Plan gevolgd?’ en je les vul je hier daarna in.</p>
        <div class="row gap">
          ${p.status === "pending" ? `<button type="button" class="btn" data-broker="cancel">Order annuleren</button>` : ""}
          ${p.status === "open" ? `<button type="button" class="btn danger" data-broker="close">Positie sluiten (markt)</button>` : ""}
          <a class="btn" href="#/trades/${esc(t.id)}">Bekijk positie</a>
          <span class="muted small" id="broker-msg"></span>
        </div>
      </section>`;
    return `<section class="panel ex-section">${head}
      <dl class="dl"><dt>Uitkomst</dt><dd>${esc(t.outcome || "—")}</dd><dt>Exit</dt><dd>${esc(TD.util.stamp(t.exitDate) || "—")}</dd>
      <dt>PnL</dt><dd class="${signClass(+t.pnl)}">${money(+t.pnl)} <span class="muted small">via Kraken, inclusief fees</span></dd>
      <dt>Fees</dt><dd>${S.tradeFees(t) !== null ? money(-S.tradeFees(t)) : "—"}</dd></dl>
      <div class="grid g4">
        <label>Plan gevolgd?<select name="followedPlan"><option value="">— kies —</option>${opt(S.OPTIONS.followedPlan, t.followedPlan)}</select></label>
        <label class="span4">Les / key takeaway<textarea name="lesson" rows="3">${esc(t.lesson || "")}</textarea></label>
      </div>
    </section>`;
  }

  // ---------------- Formulier ----------------
  function renderForm(root, params, query) {
    const editing = params.id ? S.getTrade(params.id) : null;
    if (params.id && !editing) return notFound(root);
    const wl = S.getWatchlist();
    const t = editing
      ? JSON.parse(JSON.stringify(editing))
      : {
          ticker: query.get("ticker") || "",
          direction: query.get("direction") || "Long",
          tradeType: "Day trade",
          setup: query.get("setup") || "Reversal",
          // Vooraf ingevuld vanuit een Notifier-melding:
          rangeTf: query.get("rangeTf") || "",
          trigger: query.get("trigger") || "",
          ...Object.fromEntries(
            ["rangeHigh", "rangeLow", "entry", "stopLoss", "tp1", "tp2"].filter((k) => query.get(k) !== null).map((k) => [k, +query.get(k)])
          ),
          entryDate: nowLocal(),
          riskPct: query.get("riskPct") !== null ? +query.get("riskPct") : S.getSettings().defaultRisk,
          status: "open",
          checklist: {},
        };
    if (!t.checklist) t.checklist = {};
    // Loopt de trade via Kraken (papier)? Dan sluit je hem via de exchange, niet met de hand.
    const brokerPlan = editing && editing.broker && TD.paper ? TD.paper.planForTrade(editing.id) : null;
    const brokerLive = !!(brokerPlan && ["pending", "open"].includes(brokerPlan.status));
    const focusClose = query.get("close") === "1" && !brokerPlan;
    if (focusClose && t.status === "open") {
      t.status = "closed";
      // Vooraf ingevuld vanuit de geraakte levels (melding of detailpagina).
      if (query.get("outcome")) t.outcome = query.get("outcome");
      t.exitDate = query.get("exitDate") || t.exitDate || nowLocal();
    }
    const autoPnl = focusClose && query.get("autopnl") === "1" && (t.pnl === null || t.pnl === undefined || t.pnl === "");

    const opt = (list, val) =>
      list.map((o) => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("");

    const checklistHTML = S.CHECKLIST.map((item, i) => {
      const a = t.checklist[item.key] || {};
      const control =
        item.type === "multi"
          ? `<div class="multi">${item.options
              .map(
                (o) =>
                  `<label class="chk"><input type="checkbox" data-cl="${item.key}" value="${esc(o)}" ${
                    (a.values || []).includes(o) ? "checked" : ""
                  }> ${esc(o)}</label>`
              )
              .join("")}</div>`
          : `<select data-cl="${item.key}"><option value="">— kies —</option>${opt(item.options, a.value)}</select>`;
      return `<div class="cl-item" data-item="${item.key}">
          <div class="cl-status" aria-hidden="true"></div>
          <div class="cl-body">
            <div class="cl-q">${i + 1}. ${esc(item.q)} ${item.hint ? `<span class="muted">(${esc(item.hint)})</span>` : ""}</div>
            <div class="cl-ctrl">${control}
              <input type="text" class="cl-note" data-note="${item.key}" placeholder="Toelichting (optioneel)" value="${esc(a.note || "")}">
            </div>
          </div>
        </div>`;
    }).join("");

    root.innerHTML = `
      <div class="page-head">
        <h1>${editing ? "Trade bewerken" : "Nieuwe trade"}</h1>
        <a class="btn" href="${editing ? "#/trades/" + editing.id : "#/trades"}">Annuleren</a>
      </div>
      <form id="trade-form" class="trade-form" autocomplete="off">
        <section class="panel">
          <h2>Trade Entry Checklist <span id="cl-score" class="badge"></span></h2>
          <p class="muted small">Groen = check in orde, rood = let op. Alle 8 groen? Dan is het een A+ trade volgens je eigen regels.</p>
          <div class="checklist">${checklistHTML}</div>
        </section>

        <section class="panel">
          <h2>Trade</h2>
          <div class="grid g4">
            <label>Pair / ticker
              <input name="ticker" list="tick-options" required value="${esc(t.ticker)}" placeholder="KRAKEN:PF_XBTUSD">
              <datalist id="tick-options">${wl.map((w) => `<option value="${esc(w.symbol)}" label="${esc(shortSym(w.symbol))} Perp${TD.markets.info(w.symbol) ? " · " + esc(TD.markets.info(w.symbol).label) : ""}">`).join("")}</datalist>
            </label>
            <label>Richting<select name="direction">${opt(S.OPTIONS.direction, t.direction)}</select></label>
            <label>Trade type<select name="tradeType">${opt(S.OPTIONS.tradeType, t.tradeType)}</select></label>
            <label>Setup / range<select name="setup">${opt(S.OPTIONS.setup, t.setup)}</select></label>
            <label>Entry datum<input type="datetime-local" name="entryDate" value="${esc(t.entryDate || "")}" required></label>
            <label>Risico % van saldo<input type="number" step="0.01" min="0" name="riskPct" value="${esc(t.riskPct ?? "")}"></label>
          </div>
        </section>

        <section class="panel">
          <h2>Range <span class="muted small">— het frame van je trade</span></h2>
          <div class="grid g4">
            <label>Range timeframe (leading)<select name="rangeTf"><option value="">— kies —</option>${opt(S.OPTIONS.rangeTf, t.rangeTf)}</select></label>
            <label>Range high<input type="number" step="any" name="rangeHigh" value="${esc(t.rangeHigh ?? "")}" placeholder="einde van de push"></label>
            <label>Range low<input type="number" step="any" name="rangeLow" value="${esc(t.rangeLow ?? "")}" placeholder="begin van de push"></label>
            <label>Mid range (50%)<input type="text" id="mid-out" readonly tabindex="-1" placeholder="automatisch"></label>
            <label>Trigger<select name="trigger"><option value="">— kies —</option>${opt(S.OPTIONS.trigger, t.trigger)}</select></label>
            <label class="span3">Range-notities<input type="text" name="rangeNotes" value="${esc(t.rangeNotes || "")}" placeholder="bijv. 80/20 verdeling, veel deviaties boven, grote SFP onder de low"></label>
          </div>
          <div class="row gap" style="margin-top:10px">
            <button type="button" class="btn small" id="fill-tps">TP1 = mid, TP2 = andere kant van de range</button>
            <span class="muted small" id="range-warn"></span>
          </div>
        </section>

        <section class="panel">
          <h2>Trade Details</h2>
          <div class="details-grid">
            <div class="grid g2">
              <label>Entry<input type="number" step="any" name="entry" value="${esc(t.entry ?? "")}" required></label>
              <label>Stoploss<input type="number" step="any" name="stopLoss" value="${esc(t.stopLoss ?? "")}" required></label>
              <label>TP 1<input type="number" step="any" name="tp1" value="${esc(t.tp1 ?? "")}"></label>
              <label>TP 2<input type="number" step="any" name="tp2" value="${esc(t.tp2 ?? "")}"></label>
              <label>TP 3<input type="number" step="any" name="tp3" value="${esc(t.tp3 ?? "")}"></label>
              <div class="calc" id="calc"></div>
            </div>
            <div class="levels-live">
              <div class="label">Levels <span class="muted">— live, verandert mee met wat je invult</span></div>
              <div id="levels-viz"></div>
            </div>
          </div>
          <div class="form-chart-wrap">
            <div class="row gap between">
              <div class="label">Chart met je levels <span class="muted" id="form-chart-title"></span></div>
              <span class="view-toggle" role="group" aria-label="Timeframe">${["15m", "1H", "4H"]
                .map((tf) => `<button type="button" data-ctf="${tf}" class="${(t.rangeTf || "1H") === tf ? "active" : ""}">${tf}</button>`)
                .join("")}</span>
            </div>
            <div class="draw-bar" id="draw-bar"></div>
            <p class="muted small draw-hint" id="draw-hint">Teken je range en levels in de grafiek: kies hierboven wat je wilt zetten en klik op de prijs. Sleep een lijn om hem te verplaatsen.</p>
            <div id="form-chart" class="snap-chart"></div>
            <p class="muted small" id="form-chart-msg" hidden></p>
            <input type="hidden" name="rangeFrom" value="${esc(t.rangeFrom ?? "")}">
            <input type="hidden" name="rangeTo" value="${esc(t.rangeTo ?? "")}">
          </div>
        </section>

        ${brokerPlan ? brokerStatusHTML(t, brokerPlan, brokerLive) : `<section class="panel">
          <h2>Status & resultaat</h2>
          <div class="grid g4">
            <label>Status
              <select name="status">
                <option value="open" ${t.status === "open" ? "selected" : ""}>Open</option>
                <option value="closed" ${t.status === "closed" ? "selected" : ""}>Gesloten</option>
              </select>
            </label>
          </div>
          <div id="close-fields" class="grid g4" ${t.status === "closed" ? "" : "hidden"}>
            <label>Exit datum<input type="datetime-local" name="exitDate" value="${esc(t.exitDate || "")}"></label>
            <label>Uitkomst<select name="outcome"><option value="">— kies —</option>${opt(S.OPTIONS.outcome, t.outcome)}</select></label>
            <label>PnL (${esc(S.getSettings().currency)})
              <span class="row gap"><input type="number" step="any" name="pnl" value="${esc(t.pnl ?? "")}">
              <button type="button" class="btn small" id="use-suggest" title="Bereken PnL uit uitkomst en R">Voorstel</button></span>
              <span class="muted small" id="pnl-suggest"></span>
            </label>
            <label>Plan gevolgd?<select name="followedPlan"><option value="">— kies —</option>${opt(S.OPTIONS.followedPlan, t.followedPlan)}</select></label>
            <label>Fees (${esc(S.getSettings().currency)}) <span class="muted small">optioneel, al verwerkt in je PnL</span><input type="number" step="any" min="0" name="fees" value="${esc(t.fees ?? "")}" placeholder="bijv. 1,25"></label>
            <label class="span4">Les / key takeaway<textarea name="lesson" rows="3">${esc(t.lesson || "")}</textarea></label>
          </div>
        </section>`}

        ${
          !editing
            ? `<section class="panel ex-section" id="ex-section" hidden>
          <h2>Kraken Futures <span class="badge warn">papier</span> <span class="muted small" id="ex-sym"></span></h2>
          <label class="chk"><input type="checkbox" id="ex-on" checked> Plaats deze trade ook als papier-order bij Kraken Futures</label>
          <div class="grid g4 ex-opts">
            <label>Entry
              <select id="ex-entry"><option value="limit">Limit op je entry-prijs</option><option value="market">Markt (nu, tegen de huidige prijs)</option></select>
            </label>
            <label>Leverage<select id="ex-lev">${[1, 2, 3, 5, 10].map((l) => `<option value="${l}" ${TD.paper && +TD.paper.account().leverage === l ? "selected" : ""}>${l}x</option>`).join("")}</select></label>
          </div>
          <div id="ex-out" class="ex-out"><p class="muted small">Order wordt berekend…</p></div>
        </section>`
            : ""
        }

        <div class="form-actions">
          <button type="submit" class="btn primary">${editing ? "Opslaan" : "Trade plaatsen"}</button>
          <a class="btn" href="${editing ? "#/trades/" + editing.id : "#/trades"}">Annuleren</a>
        </div>
      </form>`;

    const form = root.querySelector("#trade-form");
    let drawing = t.drawing || null;
    teardown();
    // Tekenen in de grafiek: zet de velden van het formulier, alsof je ze zelf intypt.
    const DRAW_FIELDS = ["rangeHigh", "rangeLow", "entry", "stopLoss", "tp1", "tp2", "tp3", "rangeFrom", "rangeTo", "direction"];
    const draw =
      window.LightweightCharts && TD.chartDraw
        ? TD.chartDraw.create({
            el: root.querySelector("#form-chart"),
            toolbar: root.querySelector("#draw-bar"),
            get() {
              const v = {};
              for (const k of DRAW_FIELDS) v[k] = form[k] ? form[k].value : "";
              return v;
            },
            set(patch) {
              for (const [k, v] of Object.entries(patch)) if (form[k]) form[k].value = v === null || v === undefined ? "" : v;
              form.dispatchEvent(new Event("input", { bubbles: true }));
            },
            hint(text) {
              root.querySelector("#draw-hint").textContent = text;
            },
          })
        : null;
    if (!draw) root.querySelector("#draw-bar").hidden = true;
    const live = window.LightweightCharts ? liveChart(root.querySelector("#form-chart"), root.querySelector("#form-chart-title"), root.querySelector("#form-chart-msg"), draw) : null;
    if (live) snapCleanup = () => live.destroy();

    // ----- checklist live status -----
    function readChecklist() {
      const cl = {};
      for (const item of S.CHECKLIST) {
        const note = form.querySelector(`[data-note="${item.key}"]`).value.trim();
        if (item.type === "multi") {
          const values = [...form.querySelectorAll(`[data-cl="${item.key}"]:checked`)].map((x) => x.value);
          cl[item.key] = { values, note };
        } else {
          cl[item.key] = { value: form.querySelector(`[data-cl="${item.key}"]`).value, note };
        }
      }
      return cl;
    }
    function paintChecklist() {
      const cl = readChecklist();
      let passed = 0;
      for (const item of S.CHECKLIST) {
        const a = cl[item.key];
        const has = a.value || (a.values && a.values.length);
        const ok = S.checkPassed(item, a);
        if (ok) passed++;
        const el = form.querySelector(`[data-item="${item.key}"]`);
        el.classList.toggle("ok", ok);
        el.classList.toggle("bad", !!has && !ok);
      }
      const b = root.querySelector("#cl-score");
      b.textContent = `${passed}/${S.CHECKLIST.length}`;
      b.className = "badge " + (passed === S.CHECKLIST.length ? "pos" : passed >= S.CHECKLIST.length - 2 ? "warn" : "neg");
      return passed;
    }

    // ----- berekeningen -----
    function readTrade() {
      const fd = new FormData(form);
      const o = { ...t };
      for (const [k, v] of fd.entries()) o[k] = typeof v === "string" ? v.trim() : v;
      for (const k of ["entry", "stopLoss", "tp1", "tp2", "tp3", "riskPct", "pnl", "fees", "rangeHigh", "rangeLow", "rangeFrom", "rangeTo"]) o[k] = o[k] === "" || o[k] === undefined ? null : +o[k];
      o.ticker = (o.ticker || "").toUpperCase().replace(/\s+/g, "");
      const w = wl.find((x) => x.symbol === o.ticker);
      o.market = w ? w.market : o.market || (/USDT?$|BTC$|PERP/.test(o.ticker) ? "crypto" : "stock");
      o.checklist = readChecklist();
      o.drawing = drawing;
      if (o.status !== "closed") {
        o.exitDate = "";
        o.outcome = "";
        o.pnl = null;
        o.fees = null;
        o.followedPlan = "";
      }
      return o;
    }

    function paintCalc() {
      const o = readTrade();
      const p = S.computePortfolio();
      const risk = S.riskAmount(o, p);
      const size = S.positionSize(o, p);
      const tg = S.targets(o);
      const e = S.num(o.entry), sl = S.num(o.stopLoss);
      let warn = "";
      if (e !== null && sl !== null) {
        if (o.direction === "Long" && sl >= e) warn = "Bij een long moet de stoploss ónder de entry liggen.";
        if (o.direction === "Short" && sl <= e) warn = "Bij een short moet de stoploss bóven de entry liggen.";
      }
      root.querySelector("#calc").innerHTML = `
        ${tg.map((x) => `<div><span>${x.label}</span><strong class="${signClass(x.r)}">${r(x.r)}</strong></div>`).join("")}
        <div class="total"><span>Total R/R</span><strong>${r(S.totalRR(o))}</strong></div>
        <div><span>Risico</span><strong>${money(risk)}</strong></div>
        <div><span>Positiegrootte</span><strong>${size === null ? "—" : num(size, 4)} ${esc(shortSym(o.ticker).replace(/USDT?$/, "") || "")}</strong></div>
        <div><span>Tijd in trade</span><strong>${S.timeInTrade(o) || "—"}</strong></div>
        ${warn ? `<p class="error">${warn}</p>` : ""}`;
      // Range: mid automatisch, en waarschuwen als de range niet klopt.
      const mid = S.rangeMid(o);
      root.querySelector("#mid-out").value = mid === null ? "" : num(mid, 8);
      let rw = "";
      if (o.rangeHigh !== null && o.rangeLow !== null && o.rangeHigh <= o.rangeLow) rw = "Range high moet boven de range low liggen.";
      else if (mid !== null && e !== null) {
        const pos = (e - o.rangeLow) / (o.rangeHigh - o.rangeLow);
        if (pos > 0.35 && pos < 0.65) rw = "Let op: je entry ligt rond de mid. Daar heb je geen edge, triggers zoek je bij de randen.";
      }
      root.querySelector("#range-warn").textContent = rw;
      root.querySelector("#levels-viz").innerHTML = TD.levelsViz.html({ ...o, riskAmount: risk, currency: S.getSettings().currency });
      if (live) live.update(o);
      const sug = S.suggestedPnl(o, risk);
      const sugEl = root.querySelector("#pnl-suggest");
      if (sugEl) sugEl.textContent = o.status === "closed" && sug !== null ? `Voorstel: ${money(sug)} (50% op TP1, rest op BE/TP2)` : "";
      return sug;
    }

    // ----- Kraken papier-order (voorvertoning) -----
    const exSec = root.querySelector("#ex-section");
    let exTimer = null, exLast = null;
    function exOpts() {
      return { entryType: root.querySelector("#ex-entry").value, leverage: +root.querySelector("#ex-lev").value };
    }
    function paintExchange() {
      if (!exSec) return;
      const o = readTrade();
      const sym = TD.paper && TD.paper.account().enabled && TD.kraken.toSymbol(o.ticker);
      exSec.hidden = !sym;
      if (!sym) return;
      root.querySelector("#ex-sym").textContent = sym;
      const on = root.querySelector("#ex-on").checked;
      root.querySelector(".ex-opts").hidden = !on;
      if (!on) {
        root.querySelector("#ex-out").innerHTML = `<p class="muted small">Alleen in je journal, geen papier-order.</p>`;
        return;
      }
      clearTimeout(exTimer);
      exTimer = setTimeout(async () => {
        const r = await TD.paper.preview(o, exOpts());
        exLast = r;
        const out = root.querySelector("#ex-out");
        if (!out) return;
        const p = r.plan, usd = (v) => (v === null || v === undefined || isNaN(v) ? "—" : v.toLocaleString("nl-NL", { style: "currency", currency: "USD" }));
        out.innerHTML = `
          ${r.errors && r.errors.length ? `<div class="ex-msg neg">${r.errors.map((e) => `<p>✗ ${esc(e)}</p>`).join("")}</div>` : ""}
          ${r.warnings && r.warnings.length ? `<div class="ex-msg warn-text">${r.warnings.map((e) => `<p>! ${esc(e)}</p>`).join("")}</div>` : ""}
          ${
            p
              ? `<dl class="dl ex-dl">
              <dt>Huidige prijs</dt><dd>${esc(p.last)}</dd>
              <dt>Orders</dt><dd>${p.side === "long" ? "Koop" : "Verkoop"} <strong>${esc(p.size)}</strong> ${esc(r.inst.base)} ${p.entryType === "market" ? "markt (≈ " + esc(p.entry) + ")" : "limit @ " + esc(p.entry)}<br>
                Stop loss @ ${esc(p.sl)}${p.tp1 !== null ? `<br>TP1 50% @ ${esc(p.tp1)} → stop naar break-even` : ""}${p.tp2 !== null ? `<br>TP2 rest @ ${esc(p.tp2)}` : ""}</dd>
              <dt>Positiewaarde</dt><dd>${usd(p.notional)} · marge ${usd(p.margin)} (${p.leverage}x)</dd>
              <dt>Verlies bij SL</dt><dd class="neg">${usd(-p.lossAtSl)} <span class="muted">(${esc(o.riskPct)}% van je papier-saldo + fees)</span></dd>
              <dt>Liquidatie ≈</dt><dd>${esc(+p.liq.toPrecision(6))} <span class="muted">(${p.side === "long" ? "onder" : "boven"} je stop: veilig)</span></dd>
              <dt>Vrije marge</dt><dd>${usd(r.available)}</dd>
            </dl>`
              : ""
          }`;
      }, 400);
    }
    if (exSec) {
      ["#ex-on", "#ex-entry", "#ex-lev"].forEach((sel) => root.querySelector(sel).addEventListener("change", paintExchange));
    }

    form.addEventListener("input", () => {
      paintChecklist();
      paintCalc();
      paintExchange();
    });
    // Timeframe-knoppen boven de grafiek = het range-timeframe van je trade.
    const paintCtf = () => root.querySelectorAll("[data-ctf]").forEach((b) => b.classList.toggle("active", b.dataset.ctf === (form.rangeTf.value || "1H")));
    root.querySelectorAll("[data-ctf]").forEach((b) =>
      b.addEventListener("click", () => {
        form.rangeTf.value = b.dataset.ctf;
        form.dispatchEvent(new Event("change", { bubbles: true }));
        paintCtf();
      })
    );
    form.rangeTf.addEventListener("change", paintCtf);
    form.addEventListener("change", (e) => {
      if (e.target.name === "status") {
        const closed = e.target.value === "closed";
        root.querySelector("#close-fields").hidden = !closed;
        if (closed && !form.exitDate.value) form.exitDate.value = nowLocal();
      }
      paintChecklist();
      paintCalc();
      paintExchange();
    });
    root.querySelector("#fill-tps").addEventListener("click", () => {
      const o = readTrade();
      const mid = S.rangeMid(o);
      if (mid === null || o.rangeHigh <= o.rangeLow) return alert("Vul eerst een geldige range high en range low in.");
      form.tp1.value = +mid.toPrecision(10);
      form.tp2.value = o.direction === "Long" ? o.rangeHigh : o.rangeLow;
      paintCalc();
    });
    // Trade via Kraken: sluiten of annuleren vanuit het formulier.
    root.querySelectorAll("[data-broker]").forEach((b) =>
      b.addEventListener("click", async () => {
        const msg = root.querySelector("#broker-msg");
        const what = b.dataset.broker;
        if (!confirm(what === "close" ? "Papier-positie nu tegen de marktprijs sluiten bij Kraken?\n\nWijzigingen in dit formulier die je nog niet hebt opgeslagen, gaan verloren." : "Papier-order annuleren?")) return;
        b.disabled = true;
        msg.textContent = what === "close" ? "Sluiten bij Kraken…" : "";
        try {
          if (what === "close") await TD.paper.closeMarket(brokerPlan.id);
          else TD.paper.cancel(brokerPlan.id);
          location.hash = "#/trades/" + editing.id;
        } catch (err) {
          b.disabled = false;
          msg.textContent = err.message;
        }
      })
    );
    const useSug = root.querySelector("#use-suggest");
    if (useSug) useSug.addEventListener("click", () => {
      const sug = paintCalc();
      if (sug === null) {
        alert("Kies eerst een uitkomst en vul entry, stoploss en TP's in.");
        return;
      }
      form.pnl.value = Math.round(sug * 100) / 100;
      paintCalc();
    });

    // ----- opslaan -----
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const o = readTrade();
      if (editing && editing.broker) {
        const fresh = S.getTrade(editing.id) || editing;
        for (const k of ["status", "outcome", "exitDate", "pnl", "fees"]) o[k] = fresh[k];
        if (o.status !== "closed") o.followedPlan = "";
      }
      const passed = paintChecklist();
      if (passed < S.CHECKLIST.length && !editing) {
        if (!confirm(`Niet alle checks zijn groen (${passed}/${S.CHECKLIST.length}).\nWeet je zeker dat je deze trade wilt plaatsen?`)) return;
      }
      if (o.status === "closed") {
        if (!o.outcome) return alert("Kies een uitkomst om de trade te sluiten.");
        if (o.pnl === null && o.outcome !== "Cancelled") return alert("Vul de PnL in (of klik op Voorstel).");
        if (o.outcome === "Cancelled" && o.pnl === null) o.pnl = 0;
      }
      if (!wl.some((w) => w.symbol === o.ticker)) {
        wl.push({ symbol: o.ticker, market: o.market });
        S.setWatchlist(wl);
      }
      // Bij het plaatsen: plan en marktbeeld vastleggen, zodat je later ziet waarom je de trade nam.
      if (!o.plan && !editing) {
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = "Plan vastleggen…";
        o.plan = makePlan(o, S.riskAmount(o, S.computePortfolio()));
        o.snapshot = await marketSnapshot(o);
        // Beoordeling op de range-principes vastleggen, zoals het er bij het plaatsen voor stond.
        if (TD.tradeReview) {
          try {
            o.assessment = TD.tradeReview.assessTrade(o);
          } catch {
            o.assessment = null;
          }
        }
      }
      // Papier-order bij Kraken: eerst controleren en bevestigen.
      const wantsPaper = exSec && !exSec.hidden && root.querySelector("#ex-on").checked;
      let exPrev = null;
      if (wantsPaper) {
        exPrev = await TD.paper.preview(o, exOpts());
        if (exPrev.errors && exPrev.errors.length) {
          const btn = form.querySelector('button[type="submit"]');
          btn.disabled = false;
          btn.textContent = "Trade plaatsen";
          return alert("Papier-order niet mogelijk:\n\n" + exPrev.errors.join("\n"));
        }
        const p = exPrev.plan;
        const ok = confirm(
          `Papier-order bij Kraken Futures (${p.symbol}) plaatsen?\n\n` +
            `${p.side === "long" ? "Koop" : "Verkoop"} ${p.size} ${p.entryType === "market" ? "markt" : "limit @ " + p.entry}\n` +
            `Stop loss @ ${p.sl}\n${p.tp1 !== null ? `TP1 (50%) @ ${p.tp1}, daarna stop naar break-even\n` : ""}${p.tp2 !== null ? `TP2 (rest) @ ${p.tp2}\n` : ""}` +
            `Leverage ${p.leverage}x · marge ${p.margin.toFixed(2)} USD\nVerlies bij SL ≈ ${p.lossAtSl.toFixed(2)} USD\n\nDit is papier-modus: er gaat geen echt geld om.`
        );
        if (!ok) {
          const btn = form.querySelector('button[type="submit"]');
          btn.disabled = false;
          btn.textContent = "Trade plaatsen";
          return;
        }
      }
      const saved = S.saveTrade(o);
      if (saved && wantsPaper) {
        try {
          const plan = await TD.paper.place(saved, exOpts());
          saved.broker = { mode: "paper", venue: "kraken", symbol: plan.symbol, planId: plan.id };
          if (plan.entryType === "market") saved.entry = plan.avgEntry;
          // Het vastgelegde plan rekent met het papier-account (risico en fill-prijs).
          if (saved.plan) {
            saved.plan.riskAmount = plan.riskAmount;
            saved.plan.currency = "$";
            if (plan.entryType === "market") saved.plan.entry = plan.avgEntry;
          }
          S.saveTrade(saved);
        } catch (err) {
          alert("De trade staat in je journal, maar de papier-order is niet geplaatst: " + err.message);
        }
      }
      if (saved && saved.status === "closed" && TD.closeSnap && TD.closeSnap.needsCapture(saved)) TD.closeSnap.capture(saved.id);
      if (saved) location.hash = "#/trades/" + saved.id;
    });

    paintChecklist();
    const sug0 = paintCalc();
    paintExchange();
    if (autoPnl && sug0 !== null) {
      form.pnl.value = Math.round(sug0 * 100) / 100;
      paintCalc();
    }
    if (focusClose) {
      const box = root.querySelector("#close-fields");
      if (query.get("from") === "alerts")
        box.insertAdjacentHTML(
          "afterbegin",
          `<p class="prefill-note span4">Vooraf ingevuld op basis van de geraakte levels: ${esc(query.get("why") || "")}. Controleer uitkomst, exit en PnL, en vul ‘Plan gevolgd?’ en je les zelf in.</p>`
        );
      box.scrollIntoView({ behavior: "smooth" });
    }
  }

  // ---------------- Beoordeling op de range-principes ----------------
  // Gemaakt met het marktbeeld van het moment van plaatsen (zoals in Advise), plus een leerpunt
  // dat de beoordeling naast de uitkomst legt.
  function reviewSectionHTML(t) {
    if (!TD.tradeReview) return "";
    let a = t.assessment;
    if (!a && t.snapshot) {
      try {
        a = TD.tradeReview.assessTrade(t);
        if (a) S.saveTrade({ ...S.getTrade(t.id), assessment: a }); // eenmalig berekenen en bewaren
      } catch {
        a = null;
      }
    }
    if (!a)
      return `<section class="panel span2"><h2>Beoordeling op de range-principes</h2><p class="muted">Niet beschikbaar: ${
        t.snapshot ? "vul range high en low, entry en stop in om de beoordeling te zien" : "deze trade heeft geen marktbeeld van het moment van plaatsen"
      }.</p></section>`;
    const MARK = { pass: "✓", warn: "!", fail: "✗", info: "i" };
    const n = (st) => a.checks.filter((c) => c.state === st).length;
    const les = TD.tradeReview.lesson(t, a);
    return `<section class="panel span2 review">
      <div class="row gap between">
        <h2>Beoordeling op de range-principes <span class="muted small">— bij het plaatsen${a.at ? `, ${date(a.at, true)}` : ""}</span></h2>
        <span class="badge verdict ${esc(a.verdict.key)}">${esc(a.verdict.label)}</span>
      </div>
      <div class="verdict-score"><span class="pos">✓ ${n("pass")} in orde</span><span class="warn-text">! ${n("warn")} let op</span><span class="neg">✗ ${n("fail")} niet in orde</span></div>
      ${
        les
          ? `<div class="review-lesson ${les.tone}"><strong>${esc(les.title)}</strong><p>${esc(les.text)}</p></div>`
          : t.status === "open"
          ? `<p class="muted small">Het leerpunt verschijnt hier zodra de trade gesloten is.</p>`
          : ""
      }
      <ul class="principles">${a.checks
        .map((c) => `<li class="${c.state}"><span class="mark">${MARK[c.state]}</span><div><div class="p-label">${esc(c.label)}</div><div class="p-text">${esc(c.text)}</div></div></li>`)
        .join("")}</ul>
      <p class="muted small">Zelfde beoordeling als in Advise, met de grafiek van het moment dat je de trade plaatste. ${esc(a.verdict.text)}</p>
    </section>`;
  }

  // ---------------- Marktbeeld na afloop ----------------
  const EV_COLOR = { fill: "#2962ff", tp1: "#f5a623", tp2: "#26a69a", tp3: "#26a69a", sl: "#ef5350", be: "#8b919c", close: "#d1d4dc", liq: "#ef5350" };
  function closeSectionHTML(t, row) {
    const ev = TD.closeSnap ? TD.closeSnap.events(t) : [];
    const first = ev.find((e) => e.kind === "fill"), last = ev[ev.length - 1];
    const dur = first && last && last.time > first.time ? last.time - first.time : null;
    const human = (sec) => (sec < 3600 ? `${Math.round(sec / 60)} min` : sec < 86400 ? `${Math.round(sec / 3600)} uur` : `${(sec / 86400).toFixed(1).replace(".", ",")} dagen`);
    return `<section class="panel span2" id="close-view">
      <div class="row gap between">
        <h2>Marktbeeld na afloop <span class="muted small" id="close-sub"></span></h2>
        <a class="btn small" href="#/markt/${encodeURIComponent(TD.markets.canonical(t.ticker))}">Actuele ${esc(shortSym(t.ticker))} in Markt →</a>
      </div>
      ${
        ev.length
          ? `<ol class="timeline">${ev
              .map(
                (e) => `<li><span class="tl-dot" style="background:${EV_COLOR[e.kind] || "#8b919c"}"></span><strong>${esc(e.label)}</strong>${e.price ? ` @ ${TD.util.price(e.price)}` : ""} <span class="muted small">${TD.util.stamp(e.time * 1000)}</span>${
                  e.pnl ? ` <span class="${e.pnl > 0 ? "pos" : "neg"} small">${money(e.pnl)}</span>` : ""
                }</li>`
              )
              .join("")}</ol>`
          : ""
      }
      <p class="muted small">${esc(t.outcome || "")}${row ? ` · ${r(row.r)}` : ""} · ${money(+t.pnl)}${dur ? ` · ${human(dur)} in de trade` : ""}</p>
      <div id="close-chart" class="snap-chart"></div>
      <p class="muted small" id="close-msg"></p>
    </section>`;
  }
  let closeCleanup = null;
  function drawClose(el, t) {
    if (closeCleanup) closeCleanup();
    closeCleanup = null;
    const cs = t.closeSnapshot;
    if (!el || !cs || !window.LightweightCharts) return;
    const LC = window.LightweightCharts;
    const chart = LC.createChart(el, {
      height: 400, autoSize: true,
      layout: { background: { color: "#0f1115" }, textColor: "#8b919c" },
      grid: { vertLines: { color: "#1f232c" }, horzLines: { color: "#1f232c" } },
      rightPriceScale: { borderColor: "#262a33" },
      timeScale: { borderColor: "#262a33", timeVisible: true },
      localization: { locale: "nl-NL" },
    });
    const series = chart.addCandlestickSeries({ upColor: "#26a69a", downColor: "#ef5350", wickUpColor: "#26a69a", wickDownColor: "#ef5350", borderVisible: false });
    const data = cs.candles.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
    series.setData(data);
    const pl = t.plan || t;
    const line = (price, color, title, style) =>
      price !== null && price !== undefined && price !== "" && !isNaN(+price) && series.createPriceLine({ price: +price, color, lineWidth: style ? 1 : 2, lineStyle: style ?? LC.LineStyle.Solid, axisLabelVisible: true, title });
    if (pl.rangeHigh != null && pl.rangeLow != null) {
      line(pl.rangeHigh, "#ef5350", "Range high", LC.LineStyle.Dotted);
      line(pl.rangeLow, "#26a69a", "Range low", LC.LineStyle.Dotted);
    }
    line(t.entry, "#2962ff", "Entry");
    line(t.stopLoss, "#ef5350", "SL");
    line(t.tp1, "#f5a623", "TP1");
    line(t.tp2, "#26a69a", "TP2");
    line(t.tp3, "#26a69a", "TP3");
    // Markeringen op de candle waarin elke gebeurtenis viel.
    const long = t.direction !== "Short";
    const marks = [];
    for (const e of TD.closeSnap.events(t)) {
      const i = TD.closeSnap.idxOf(data, e.time);
      if (i < 0) continue;
      marks.push({ time: data[i].time, position: e.kind === "fill" ? (long ? "belowBar" : "aboveBar") : long ? "aboveBar" : "belowBar", color: EV_COLOR[e.kind] || "#8b919c", shape: e.kind === "fill" ? (long ? "arrowUp" : "arrowDown") : e.kind === "close" ? "square" : "circle", text: e.label });
    }
    marks.sort((a, b) => a.time - b.time);
    series.setMarkers(marks);
    // Inzoomen op de trade (met wat ruimte ervoor en erna).
    const ev = TD.closeSnap.events(t);
    if (ev.length) {
      const a = Math.max(0, TD.closeSnap.idxOf(data, ev[0].time) - 15), b = Math.min(data.length - 1, TD.closeSnap.idxOf(data, ev[ev.length - 1].time) + 15);
      if (b > a) chart.timeScale().setVisibleLogicalRange({ from: a, to: b });
      else chart.timeScale().fitContent();
    } else chart.timeScale().fitContent();
    closeCleanup = () => chart.remove();
  }
  async function mountCloseView(root, t) {
    const box = root.querySelector("#close-view");
    if (!box || !TD.closeSnap) return;
    const msg = box.querySelector("#close-msg"), sub = box.querySelector("#close-sub");
    const paint = (tr) => {
      const cs = tr.closeSnapshot;
      sub.textContent = cs ? `(${TD.marketData.TF[cs.tf] ? TD.marketData.TF[cs.tf].label : cs.tf}, van vlak vóór de entry tot na de exit)` : "";
      msg.textContent = cs && cs.partial ? "Let op: de entry viel buiten de beschikbare koersdata; de grafiek begint later." : "";
      drawClose(box.querySelector("#close-chart"), tr);
    };
    if (t.closeSnapshot) paint(t);
    if (TD.closeSnap.needsCapture(t)) {
      if (!t.closeSnapshot) msg.textContent = "Marktbeeld ophalen…";
      const snap = await TD.closeSnap.capture(t);
      const fresh = S.getTrade(t.id);
      if (!document.body.contains(box)) return;
      if (snap && fresh) paint(fresh);
      else if (!t.closeSnapshot) msg.textContent = "Geen marktbeeld beschikbaar: de trade is te lang geleden voor de koersdata (maximaal 300 candles terug), of er is geen verbinding.";
    }
  }

  // ---------------- Detail ----------------
  function renderDetail(root, params) {
    const t = S.getTrade(params.id);
    if (!t) return notFound(root);
    const p = S.computePortfolio();
    const row = p.rows.get(t.id);
    const sc = S.checklistScore(t);
    const risk = S.riskAmount(t, p);

    const cl = S.CHECKLIST.map((item, i) => {
      const a = (t.checklist || {})[item.key] || {};
      const ok = S.checkPassed(item, a);
      const ans = item.type === "multi" ? (a.values || []).join(", ") : a.value;
      return `<li class="${ok ? "ok" : ans ? "bad" : "none"}">
          <span class="mark">${ok ? "✓" : ans ? "✗" : "–"}</span>
          <div><div class="cl-q">${i + 1}. ${esc(item.q)}</div>
          <div class="cl-a">${ans ? esc(ans) : '<span class="muted">Niet ingevuld</span>'}${
            item.type === "multi" && ans
              ? ` <span class="muted">(${item.options.filter((o) => !(a.values || []).includes(o)).map(esc).join(", ") || "alles gezet"}${
                  item.options.every((o) => (a.values || []).includes(o)) ? "" : " ontbreekt"
                })</span>`
              : ""
          }${a.note ? `<div class="muted small">“${esc(a.note)}”</div>` : ""}</div></div></li>`;
    }).join("");

    const tg = S.targets(t);
    const changes = planChanges(t);

    root.innerHTML = `
      <div class="page-head">
        <div>
          <a class="back" href="#/trades">← Alle trades</a>
          <h1>${esc(shortSym(t.ticker))} <span class="dir ${t.direction === "Long" ? "pos" : "neg"}">${esc(t.direction)}</span> ${statusBadge(t)}</h1>
          <div class="muted">${esc(t.setup)} · ${esc(t.tradeType)} · <a href="#/markt/${encodeURIComponent(t.ticker)}">${esc(t.ticker)} in Markt</a></div>
        </div>
        <div class="row gap">
          ${t.status === "open" ? `<span class="muted small" id="refresh-out">${lastRefresh ? "Bijgewerkt " + clock(lastRefresh) : ""}</span><button class="btn" id="refresh" title="Verse koersen voor deze trade: fills, TP/SL en open PnL">↻ Vernieuwen</button>` : ""}
          ${t.status === "open" && !t.broker ? `<a class="btn primary" href="${TD.tradeAlerts ? TD.tradeAlerts.closeLink(t) : `#/trades/${t.id}/edit?close=1`}">Trade sluiten</a>` : ""}
          <a class="btn" href="#/trades/${t.id}/edit">Bewerken</a>
          <button class="btn danger" id="del">Verwijderen</button>
        </div>
      </div>

      <div class="kpis small">
        <div class="kpi"><span>PnL</span><strong class="${signClass(+t.pnl)}">${t.status === "closed" ? money(+t.pnl) : "—"}</strong></div>
        <div class="kpi"><span>R multiple</span><strong class="${signClass(row?.r)}">${row ? r(row.r) : "—"}</strong></div>
        <div class="kpi"><span>Return</span><strong class="${signClass(row?.returnPct)}">${row ? pct(row.returnPct, 2) : "—"}</strong></div>
        <div class="kpi"><span>Saldo na trade</span><strong>${row ? money(row.endBalance) : "—"}</strong></div>
        <div class="kpi"><span>Checks</span><strong>${scoreBadge(t)}</strong></div>
      </div>

      ${t.broker ? `<section class="panel ex-position" id="ex-position"></section>` : ""}

      <div class="detail-grid">
        <section class="panel">
          <h2>Trade Entry Checklist <span class="badge ${sc.passed === sc.total ? "pos" : "warn"}">${sc.passed}/${sc.total} groen</span></h2>
          <ul class="cl-view">${cl}</ul>
        </section>

        <section class="panel">
          <h2>Trade</h2>
          <dl class="dl">
            <dt>Pair</dt><dd><a href="#/markt/${encodeURIComponent(TD.markets.canonical(t.ticker))}" title="Open ${esc(t.ticker)} in Markt">${esc(t.ticker)}</a></dd>
            <dt>Trade type</dt><dd>${esc(t.tradeType)}</dd>
            <dt>Entry datum</dt><dd>${date(t.entryDate, true)}</dd>
            <dt>Exit datum</dt><dd>${date(t.exitDate, true)}</dd>
            <dt>Totale tijd in trade</dt><dd>${S.timeInTrade(t) || "—"}</dd>
            <dt>Risico</dt><dd>${num(t.riskPct)}% · ${money(risk)}</dd>
            ${hitsHTML(t)}
          </dl>
          <h2>Range</h2>
          <dl class="dl">
            <dt>Timeframe</dt><dd>${esc(t.rangeTf || "—")}</dd>
            <dt>Range high</dt><dd>${num(t.rangeHigh, 8)}</dd>
            <dt>Mid</dt><dd>${num(S.rangeMid(t), 8)}</dd>
            <dt>Range low</dt><dd>${num(t.rangeLow, 8)}</dd>
            <dt>Trigger</dt><dd>${esc(t.trigger || "—")}</dd>
            ${t.rangeNotes ? `<dt>Notities</dt><dd class="wrap">${esc(t.rangeNotes)}</dd>` : ""}
          </dl>
          <h2>Trade Details</h2>
          <dl class="dl">
            <dt>Entry</dt><dd>${num(t.entry, 8)}</dd>
            <dt>Stoploss</dt><dd>${num(t.stopLoss, 8)}</dd>
            ${tg.map((x) => `<dt>${x.label}</dt><dd>${num(x.price, 8)} <span class="muted">(${r(x.r)})</span></dd>`).join("")}
            <dt><strong>Total R/R</strong></dt><dd><strong>${r(S.totalRR(t))}</strong></dd>
            <dt>Positiegrootte</dt><dd>${num(S.positionSize(t, p), 4)}</dd>
          </dl>
        </section>

        <section class="panel span2">
          <h2>${t.plan ? "Plan bij het plaatsen" : "Levels"} ${t.plan ? `<span class="muted small">— vastgelegd op ${date(t.plan.placedAt, true)}</span>` : ""}</h2>
          ${changes.length ? `<p class="warn-text small">Na het plaatsen aangepast: ${esc(changes.join(", "))}. Hieronder zie je het oorspronkelijke plan.</p>` : ""}
          <div class="plan-grid">
            <div>${TD.levelsViz.html({ ...(t.plan || t), riskAmount: t.plan ? t.plan.riskAmount : risk, currency: t.plan ? t.plan.currency : S.getSettings().currency })}</div>
            <div>
              <div class="label row gap between">
                <span>Marktbeeld bij het plaatsen ${t.snapshot ? `<span class="muted">(${esc(t.plan?.rangeTf || t.snapshot.tf)}, ${date(t.snapshot.takenAt, true)})</span>` : ""}</span>
                <a class="btn small" href="#/markt/${encodeURIComponent(TD.markets.canonical(t.ticker))}${t.snapshot && ["1h", "4h"].includes(t.snapshot.tf) ? "?view=" + t.snapshot.tf : ""}">Actuele ${esc(shortSym(t.ticker))} in Markt →</a>
              </div>
              ${t.snapshot ? `<div id="snap-chart" class="snap-chart"></div>` : `<p class="muted">Geen marktbeeld vastgelegd${t.plan ? " (geen koersdata beschikbaar op dat moment)" : " (trade van vóór deze functie)"}.</p>`}
              <dl class="dl plan-meta">
                <dt>Trigger</dt><dd>${esc((t.plan || t).trigger || "—")}</dd>
                <dt>Setup</dt><dd>${esc((t.plan || t).setup || t.setup || "—")}</dd>
                <dt>Range-TF</dt><dd>${esc((t.plan || t).rangeTf || "—")}</dd>
              </dl>
            </div>
          </div>
        </section>
        ${t.status === "closed" && t.outcome !== "Cancelled" ? closeSectionHTML(t, row) : ""}
        ${
          t.drawing || t.chartRange || t.chartTrigger
            ? `<section class="panel span2">
          <h2>Trade drawing</h2>
          ${t.drawing ? `<a href="${t.drawing}" target="_blank" rel="noopener"><img class="drawing-img" src="${t.drawing}" alt="Trade drawing"></a>` : ""}
          <div class="row gap">
            ${t.chartRange ? `<a class="btn small" href="${esc(t.chartRange)}" target="_blank" rel="noopener">Chart — Range ↗</a>` : ""}
            ${t.chartTrigger ? `<a class="btn small" href="${esc(t.chartTrigger)}" target="_blank" rel="noopener">Chart — Trigger ↗</a>` : ""}
          </div>
        </section>`
            : ""
        }

        ${
          t.status === "closed"
            ? `<section class="panel span2">
          <h2>Resultaat</h2>
          <dl class="dl">
            <dt>Uitkomst</dt><dd>${esc(t.outcome)}</dd>
            ${S.tradeFees(t) !== null ? `<dt>Fees</dt><dd>${money(-S.tradeFees(t))} <span class="muted small">al verwerkt in je PnL</span></dd>` : ""}
            <dt>Plan gevolgd?</dt><dd>${esc(t.followedPlan || "—")}</dd>
            <dt>Saldo voor → na</dt><dd>${row ? money(row.startBalance) + " → " + money(row.endBalance) : "—"}</dd>
          </dl>
          <h3>Les / key takeaway</h3>
          <p class="lesson">${t.lesson ? esc(t.lesson).replace(/\n/g, "<br>") : '<span class="muted">Geen les ingevuld.</span>'}</p>
        </section>`
            : ""
        }
        ${reviewSectionHTML(t)}
      </div>`;

    mountSnapshot(root.querySelector("#snap-chart"), t);
    mountCloseView(root, t);
    if (t.broker) {
      paintPosition(root, t);
      const un = TD.paper.onChange(() => {
        if (location.hash === "#/trades/" + t.id) {
          const fresh = S.getTrade(t.id);
          if (fresh && fresh.status !== t.status) renderDetail(root, params);
          else paintPosition(root, fresh || t);
        }
      });
      const prev = snapCleanup;
      snapCleanup = () => {
        un();
        if (prev) prev();
      };
    }

    const rb = root.querySelector("#refresh");
    if (rb) rb.addEventListener("click", () => refreshTrades(rb, root.querySelector("#refresh-out"), t, () => renderDetail(root, params)));

    root.querySelector("#del").addEventListener("click", () => {
      if (confirm("Deze trade definitief verwijderen?")) {
        S.deleteTrade(t.id);
        location.hash = "#/trades";
      }
    });
  }

  function notFound(root) {
    root.innerHTML = `<div class="panel empty">Deze trade bestaat niet (meer). <a href="#/trades">Terug naar trades</a></div>`;
  }

  TD.views = TD.views || {};
  TD.views.trades = { renderList, renderForm, renderDetail, statusBadge, scoreBadge, teardown };
})(window.TD);
