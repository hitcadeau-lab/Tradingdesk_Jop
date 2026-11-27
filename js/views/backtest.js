// Backtest-tab: test de strategie op de historie van een Kraken-pair en laat per aantal
// groene/oranje/rode signalen zien wat het opleverde, met een conclusie en finetune-tips.
(function (TD) {
  const { esc, date, shortSym } = TD.util;
  const S = TD.store;
  const B = TD.backtest;
  const KEY = "td.backtest.last";
  const TFS = [["15m", "15m"], ["1h", "1H"], ["4h", "4H"]];
  const PERIODS = [[30, "1 maand"], [90, "3 maanden"], [180, "6 maanden"], [365, "1 jaar"]];
  let running = false;
  let cleanup = null;
  const candleCache = new Map();

  const loadLast = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      return null;
    }
  };
  const saveLast = (r) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(r));
    } catch {
      /* te groot of geen opslag: alleen in deze sessie */
    }
  };
  const R = (v) => (v === null || v === undefined || isNaN(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`);
  const P = (v) => `${Math.round(v * 100)}%`;
  const PF = (v) => (v === Infinity ? "∞" : v.toFixed(2));
  const cls = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");

  function teardown() {
    if (cleanup) cleanup();
    cleanup = null;
  }

  // ---------- grafieken ----------
  function equitySVG(series) {
    const W = 900, H = 260, pl = 50, pr = 120, pt = 14, pb = 26;
    const all = series.flatMap((s) => s.points);
    if (!all.length) return "";
    const t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t));
    const v0 = Math.min(0, ...all.map((p) => p.v)), v1 = Math.max(0, ...all.map((p) => p.v));
    const x = (t) => pl + ((t - t0) / (t1 - t0 || 1)) * (W - pl - pr);
    const y = (v) => pt + ((v1 - v) / (v1 - v0 || 1)) * (H - pt - pb);
    let s = `<svg class="bt-eq" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Equity curve in R">`;
    for (const g of [v0, (v0 + v1) / 2, v1, 0]) s += `<line x1="${pl}" x2="${W - pr}" y1="${y(g)}" y2="${y(g)}" class="cc-grid" ${g === 0 ? 'stroke-width="1.5"' : ""}/><text x="${pl - 6}" y="${y(g) + 4}" text-anchor="end" class="cc-note">${g.toFixed(0)}R</text>`;
    series.forEach((se, k) => {
      if (!se.points.length) return;
      const pts = [{ t: t0, v: 0 }, ...se.points];
      s += `<polyline fill="none" stroke="${se.color}" stroke-width="${k === 0 ? 1.5 : 2.2}" ${k === 0 ? 'stroke-dasharray="4 3"' : ""} points="${pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}"/>`;
      const last = pts[pts.length - 1];
      s += `<text x="${W - pr + 6}" y="${y(last.v) + 4}" class="cc-note" fill="${se.color}">${esc(se.name)} ${R(last.v)}</text>`;
    });
    s += `<text x="${pl}" y="${H - 6}" class="cc-note">${date(t0 * 1000)}</text><text x="${W - pr}" y="${H - 6}" text-anchor="end" class="cc-note">${date(t1 * 1000)}</text>`;
    return s + "</svg>";
  }
  const curve = (list) => {
    let v = 0;
    return list
      .filter((x) => x.R !== null)
      .sort((a, b) => (a.exitTime || a.time) - (b.exitTime || b.time))
      .map((x) => ({ t: x.exitTime || x.time, v: (v += x.R) }));
  };

  // ---------- tabellen ----------
  const row = (name, st, extra = "") => `<tr>
      <td>${name}${extra}</td><td class="num">${st.n}</td><td class="num">${st.n ? P(st.winrate) : "—"}</td>
      <td class="num muted small">${st.tp2} / ${st.tp1} / ${st.sl}</td>
      <td class="num ${cls(st.expectancy)}"><strong>${st.n ? R(st.expectancy) : "—"}</strong></td>
      <td class="num ${cls(st.totalR)}">${st.n ? R(st.totalR) : "—"}</td><td class="num">${st.n ? PF(st.pf) : "—"}</td>
      <td class="num neg">${st.n ? R(st.maxDD) : "—"}</td></tr>`;
  const head = (first) => `<thead><tr><th>${first}</th><th class="num">Trades</th><th class="num" title="TP1 gehaald vóór de stop">Winrate</th><th class="num" title="TP1+TP2 / TP1+BE / Stop">TP2 / BE / SL</th><th class="num" title="Gemiddeld resultaat per trade, na fees">Gem. R</th><th class="num">Totaal</th><th class="num">PF</th><th class="num" title="Grootste daling van de equity">Max DD</th></tr></thead>`;

  function resultsHTML(res) {
    const T = res.trades;
    const c = B.conclude(T);
    const groups = B.SIGNAL_ORDER.map((g) => [g, T.filter((x) => B.signalGroup(x) === g)]).filter(([, l]) => l.length);
    const dot = { "Alles groen": "pos", "1 oranje": "warn", "2 oranje": "warn", "3+ oranje": "warn", "1 rood": "neg", "2+ rood": "neg" };
    const pc = B.perCheck(T);
    const cell = (st) => (st.n ? `<span class="${cls(st.expectancy)}">${R(st.expectancy)}</span> <span class="muted small">· ${P(st.winrate)} · ${st.n}×</span>` : '<span class="muted">—</span>');
    const verdictBadge = { play: "pos", doubt: "warn", skip: "neg" };
    const outTxt = { tp2: "TP1 + TP2", tp1: "TP1 + BE", sl: "Stop", open: "Nog open" };
    return `
      <section class="panel bt-verdict ${c.verdict.key}">
        <h2>${esc(c.verdict.title)}</h2>
        <p>${esc(c.verdict.text)}</p>
        ${c.tips.length ? `<h3>Finetunen</h3><ul class="bt-tips">${c.tips.map((t) => `<li class="${t.tone}">${esc(t.text)}</li>`).join("")}</ul>` : `<p class="muted small">Geen check springt er duidelijk uit (te weinig trades per check of weinig verschil).</p>`}
        ${
          res.moves
            ? (() => {
                const mv = Object.values(res.moves);
                const m = mv.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
                const a = Math.abs(m);
                const txt = a >= 0.2
                  ? ` — een sterke ${m > 0 ? "stijging" : "daling"}. Range-trades (reclaims) werken het best in zijwaartse markten; in een sterke trend mislukken ze vaker. Test ook een andere periode om te vergelijken.`
                  : a >= 0.08
                  ? ` — een duidelijke ${m > 0 ? "stijging" : "daling"}. Let op: tegen die trend in werken range-trades minder goed.`
                  : " — een vrij zijwaartse markt, waarin range-trades normaal goed werken.";
                return `<p class="small"><strong>Markt in deze periode:</strong> ${esc(shortSym(res.ticker))} ${m >= 0 ? "+" : ""}${Math.round(m * 100)}%${txt}</p>`;
              })()
            : ""
        }
        <p class="muted small">${esc(shortSym(res.ticker))} · ${res.tfs.map((t) => (t === "1h" ? "1H" : t === "4h" ? "4H" : t)).join(", ")} · ${esc(res.periodLabel)} · ${res.setups.join(" + ")} · fee ${String(res.feePct).replace(".", ",")}% per kant · stop ${Math.round((res.cfg.stopBuf ?? 0.03) * 100)}% voorbij de lont · entry ${res.cfg.entryMode === "edge" ? "limit op de rand" : "op de close"}${res.noOverlap ? " · 1 trade tegelijk" : ""} · getest op ${date(res.at, true)}</p>
      </section>

      <section class="panel">
        <h2>Per aantal signalen <span class="muted small">— zoals de beoordeling in Advise</span></h2>
        <table class="table">${head("Signalen")}<tbody>
          ${groups.map(([g, l]) => row(`<span class="badge ${dot[g]}">${g}</span>`, B.stats(l))).join("")}
          <tr class="bt-total">${row("<strong>Alle trades</strong>", c.all).slice(4)}
        </tbody></table>
        <p class="muted small">Winrate = TP1 gehaald vóór de stop. Gem. R = gemiddeld resultaat per trade na fees (50% op TP1, rest op break-even of TP2). Een setup met een rode check is volgens de regels “Niet spelen”.</p>
      </section>

      <section class="panel">
        <h2>Per oordeel, setup en timeframe</h2>
        <table class="table">${head("Groep")}<tbody>
          ${[["play", "Speelbaar"], ["doubt", "Twijfel"], ["skip", "Niet spelen"]].map(([k, l]) => row(`<span class="badge ${verdictBadge[k]}">${l}</span>`, B.stats(T.filter((x) => x.verdict === k)))).join("")}
          ${["Reclaim", "Breakout"].filter((s) => res.setups.includes(s)).map((s) => row(s, B.stats(T.filter((x) => x.setup === s)))).join("")}
          ${res.tfs.map((tf) => row(tf === "1h" ? "1H" : tf === "4h" ? "4H" : tf, B.stats(T.filter((x) => x.tf === tf)))).join("")}
          ${["Long", "Short"].map((d) => row(d, B.stats(T.filter((x) => x.direction === d)))).join("")}
        </tbody></table>
      </section>

      <section class="panel">
        <h2>Equity curve <span class="muted small">— opgeteld resultaat in R</span></h2>
        ${equitySVG([
          { name: "Alles", color: "#8b919c", points: curve(T) },
          { name: "Speelbaar + Twijfel", color: "#f5a623", points: curve(T.filter((x) => x.verdict !== "skip")) },
          { name: "Speelbaar", color: "#26a69a", points: curve(T.filter((x) => x.verdict === "play")) },
        ])}
      </section>

      <section class="panel">
        <h2>Per check <span class="muted small">— hier zie je wat je kunt finetunen</span></h2>
        <table class="table"><thead><tr><th>Check</th><th>Groen</th><th>Oranje</th><th>Rood</th></tr></thead><tbody>
          ${pc.map((x) => `<tr><td>${esc(x.label)}</td><td>${cell(x.pass)}</td><td>${cell(x.warn)}</td><td>${cell(x.fail)}</td></tr>`).join("")}
        </tbody></table>
        <p class="muted small">Per check: gemiddeld R · winrate · aantal trades, voor trades waarbij die check groen, oranje of rood was. Een goede check heeft bij groen duidelijk betere cijfers dan bij oranje of rood.</p>
      </section>

      <details class="panel bt-trades">
        <summary><h2>Alle trades <span class="muted small">(${T.length}) — klik op een trade voor de grafiek</span></h2></summary>
        <table class="table clickable"><thead><tr><th>Moment</th><th>TF</th><th>Setup</th><th>Richting</th><th>Oordeel</th><th class="num">✓ / ! / ✗</th><th>Uitkomst</th><th class="num">R</th></tr></thead><tbody>
          ${T.slice()
            .sort((a, b) => b.time - a.time)
            .map(
              (x, k) => `<tr class="bt-row" data-k="${T.indexOf(x)}"><td>${date(x.time * 1000, true)}</td><td>${x.tf === "1h" ? "1H" : x.tf === "4h" ? "4H" : x.tf}</td><td>${x.setup}</td>
              <td><span class="dir ${x.direction === "Long" ? "pos" : "neg"}">${x.direction}</span></td><td><span class="badge ${verdictBadge[x.verdict] || "muted"}">${esc(x.verdictLabel)}</span></td>
              <td class="num"><span class="pos">${x.pass}</span> / <span class="warn-text">${x.warn}</span> / <span class="neg">${x.fail}</span></td>
              <td>${outTxt[x.result]}</td><td class="num ${cls(x.R)}">${x.R === null ? "—" : R(x.R)}</td></tr>`
            )
            .join("")}
        </tbody></table>
      </details>

      <p class="muted small">Backtest op historische Kraken-koersen, candle voor candle zoals de Notifier het live had gezien. Aannames: entry op de close van de trigger-candle; raakt één candle zowel stop als target, dan telt de stop (voorzichtig); geen slippage en geen funding. Resultaten uit het verleden zijn geen garantie voor de toekomst.</p>`;
  }

  // Grafiek van één backtest-trade (range, entry, stop, targets).
  async function showTrade(tr, x, ticker) {
    const next = tr.nextElementSibling;
    if (next && next.classList.contains("bt-chart-row")) return next.remove();
    const cell = document.createElement("tr");
    cell.className = "bt-chart-row";
    cell.innerHTML = `<td colspan="8"><div class="bt-chart"><p class="muted pad">Grafiek laden…</p></div></td>`;
    tr.after(cell);
    const box = cell.querySelector(".bt-chart");
    try {
      const key = `${ticker}|${x.tf}`;
      let c = candleCache.get(key);
      if (!c) {
        const sec = B.TF_SEC[x.tf];
        const sym = TD.markets.symOf(ticker);
        const from = Math.min(x.range.startTime, x.time) - 30 * sec, to = (x.exitTime || x.time) + 40 * sec;
        const d = await TD.net.json(`https://futures.kraken.com/api/charts/v1/trade/${sym}/${x.tf}?from=${from}&to=${to}`);
        c = (d.candles || []).map((k) => ({ time: Math.floor(k.time / 1000), open: +k.open, high: +k.high, low: +k.low, close: +k.close }));
      } else {
        const sec = B.TF_SEC[x.tf];
        c = c.filter((k) => k.time >= Math.min(x.range.startTime, x.time) - 30 * sec && k.time <= (x.exitTime || x.time) + 40 * sec);
      }
      box.innerHTML = "";
      const sig = { direction: x.direction, entry: x.entry, stopLoss: x.stopLoss, tp1: x.tp1, tp2: x.tp2, setup: x.setup, retestTime: x.time };
      const un = TD.rangeChart.mount(box, c, x.range, sig, { height: 340 });
      const prev = cleanup;
      cleanup = () => {
        un();
        if (prev) prev();
      };
    } catch (e) {
      box.innerHTML = `<p class="neg pad">${esc(e.message)}</p>`;
    }
  }

  // ---------- pagina ----------
  function render(root) {
    teardown();
    const last = loadLast();
    const wl = S.getWatchlist();
    const cfg = { ticker: (wl[0] && wl[0].symbol) || "KRAKEN:PF_XBTUSD", tfs: ["1h", "4h"], days: 180, setups: ["Reclaim", "Breakout"], feePct: 0.05, noOverlap: false, stopBuf: 0.03, entryMode: "close", ...(last ? last.cfg : {}) };
    root.innerHTML = `
      <div class="page-head">
        <div><h1>Backtest</h1><div class="muted small">Test je strategie op de historie: hoe deden de setups het met alles groen, één oranje, een rode, enzovoort?</div></div>
      </div>
      <section class="panel bt-settings">
        <div class="grid g4">
          <label>Pair<select id="bt-pair">${wl.map((w) => `<option value="${esc(w.symbol)}" ${w.symbol === cfg.ticker ? "selected" : ""}>${esc(shortSym(w.symbol))}${TD.markets.info(w.symbol) ? " · " + esc(TD.markets.info(w.symbol).label) : ""}</option>`).join("")}</select></label>
          <label>Periode<select id="bt-days">${PERIODS.map(([d, l]) => `<option value="${d}" ${+cfg.days === d ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label>Fee per kant (%)<input type="number" id="bt-fee" step="0.01" min="0" value="${cfg.feePct}"></label>
          <div><div class="label">Timeframes</div>${TFS.map(([k, l]) => `<label class="chk inline-chk"><input type="checkbox" data-tf="${k}" ${cfg.tfs.includes(k) ? "checked" : ""}> ${l}</label>`).join("")}</div>
          <div><div class="label">Setups</div>${["Reclaim", "Breakout"].map((s) => `<label class="chk inline-chk"><input type="checkbox" data-setup="${s}" ${cfg.setups.includes(s) ? "checked" : ""}> ${s}</label>`).join("")}</div>
          <label>Stop voorbij de lont<select id="bt-stop">${[[0.03, "3% van de range (standaard)"], [0.1, "10% van de range"], [0.2, "20% van de range"], [0.3, "30% van de range"]].map(([v, l]) => `<option value="${v}" ${+cfg.stopBuf === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label>Entry<select id="bt-entry"><option value="close" ${cfg.entryMode !== "edge" ? "selected" : ""}>Op de close van de trigger-candle (standaard)</option><option value="edge" ${cfg.entryMode === "edge" ? "selected" : ""}>Limit op de rand (alleen als de koers terugkomt)</option></select></label>
          <label class="chk span2"><input type="checkbox" id="bt-overlap" ${cfg.noOverlap ? "checked" : ""}> Maximaal 1 trade tegelijk per timeframe (realistischer als je één positie tegelijk aanhoudt)</label>
        </div>
        <div class="row gap" style="margin-top:10px">
          <button class="btn primary" id="bt-run" ${running ? "disabled" : ""}>${running ? "Bezig…" : "Start backtest"}</button>
          <span class="muted small" id="bt-status">15m werkt met maximaal 3 maanden (veel candles). Een backtest duurt meestal 10 tot 60 seconden.</span>
        </div>
        <div class="bt-progress" hidden><div class="bt-bar"></div></div>
      </section>
      <div id="bt-results">${last && last.trades ? resultsHTML(last) : `<div class="panel empty">Nog geen backtest. Kies je instellingen en klik op <strong>Start backtest</strong>.</div>`}</div>`;

    const status = root.querySelector("#bt-status");
    const bar = root.querySelector(".bt-progress"), fill = root.querySelector(".bt-bar");
    const setP = (p, txt) => {
      bar.hidden = false;
      fill.style.width = `${Math.round(p * 100)}%`;
      if (txt) status.textContent = txt;
    };

    root.querySelector("#bt-run").addEventListener("click", async () => {
      if (running) return;
      const c2 = {
        ticker: root.querySelector("#bt-pair").value,
        days: +root.querySelector("#bt-days").value,
        feePct: Math.max(0, +root.querySelector("#bt-fee").value || 0),
        tfs: [...root.querySelectorAll("[data-tf]:checked")].map((x) => x.dataset.tf),
        setups: [...root.querySelectorAll("[data-setup]:checked")].map((x) => x.dataset.setup),
        noOverlap: root.querySelector("#bt-overlap").checked,
        stopBuf: +root.querySelector("#bt-stop").value,
        entryMode: root.querySelector("#bt-entry").value,
      };
      if (!c2.tfs.length || !c2.setups.length) return (status.textContent = "Kies minstens één timeframe en één setup.");
      if (!TD.net.canProxy()) return (status.textContent = "Backtesten werkt in de Mac-app en de preview (Kraken-koersen).");
      running = true;
      const btn = root.querySelector("#bt-run");
      btn.disabled = true;
      btn.textContent = "Bezig…";
      try {
        const trades = [], moves = {};
        for (let k = 0; k < c2.tfs.length; k++) {
          const tf = c2.tfs[k];
          const days = tf === "15m" ? Math.min(c2.days, 90) : c2.days;
          const lbl = tf === "1h" ? "1H" : tf === "4h" ? "4H" : tf;
          const base = k / c2.tfs.length, part = 1 / c2.tfs.length;
          const candles = await B.history(c2.ticker, tf, days, (p) => setP(base + part * 0.25 * p, `${lbl}: koersdata ophalen…`));
          candleCache.set(`${c2.ticker}|${tf}`, candles);
          moves[tf] = B.move(candles);
          const t = await B.run(candles, { tf, feePct: c2.feePct, setups: c2.setups, noOverlap: c2.noOverlap, stopBuf: c2.stopBuf, entryMode: c2.entryMode }, (p) =>
            setP(base + part * (0.25 + 0.75 * p), `${lbl}: ${candles.length} candles doorlopen… ${Math.round(p * 100)}%`)
          );
          trades.push(...t);
        }
        const res = { cfg: c2, moves, ticker: c2.ticker, tfs: c2.tfs, setups: c2.setups, feePct: c2.feePct, noOverlap: c2.noOverlap, periodLabel: PERIODS.find(([d]) => d === c2.days)[1], at: Date.now(), trades };
        saveLast(res);
        running = false;
        render(root);
      } catch (e) {
        running = false;
        btn.disabled = false;
        btn.textContent = "Start backtest";
        status.textContent = "Backtest mislukt: " + e.message;
      }
    });

    const res = last;
    root.querySelectorAll(".bt-row").forEach((tr) => tr.addEventListener("click", () => res && showTrade(tr, res.trades[+tr.dataset.k], res.ticker)));
  }

  TD.views = TD.views || {};
  TD.views.backtest = { render, teardown };
})(window.TD);
