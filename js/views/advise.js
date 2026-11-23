// Advise: opgeslagen setups uit de Notifier met een beoordeling op de range-principes,
// een calculator (bedrag → wat levert het op) en de range in de grafiek.
(function (TD) {
  const { esc, num, money, pct, shortSym, date, signClass } = TD.util;
  const A = TD.advise;
  const S = TD.store;
  let cleanup = null;

  function teardown() {
    if (cleanup) cleanup();
    cleanup = null;
  }

  const tfLabel = (tf) => (TD.marketData.TF[tf] || {}).label || tf;
  const title = (a) => `${shortSym(a.symbol)} – ${a.direction} – ${tfLabel(a.tf)}`;
  const verdictBadge = (v) => `<span class="badge verdict ${v.key}">${esc(v.label)}</span>`;
  const MARK = { pass: "✓", warn: "!", fail: "✗", info: "i" };
  const kindTag = (a) =>
    a.kind === "history" ? '<span class="badge muted">Historisch</span>' : a.kind === "plan" ? '<span class="badge open">Plan</span>' : '<span class="badge pos">Live</span>';
  function subtitle(a) {
    const g = a.signal;
    if (a.kind === "history") return `Historische setup van ${date(a.asOf * 1000, true)}, beoordeeld met de data van toen`;
    if (a.kind === "plan") return `Plan van ${date(a.createdAt, true)}: entry bij de ${g.direction === "Long" ? "range low" : "range high"}, wacht op deviatie + reclaim + retest`;
    return `Advies van ${date(a.createdAt, true)} · trigger: ${g.status === "trigger" ? "retest" : g.status === "reclaim" ? "reclaim (wacht op retest)" : g.status}`;
  }

  // ---------------- lijst ----------------
  function renderList(root) {
    teardown();
    const items = A.all();
    root.innerHTML = `
      <div class="page-head">
        <div><h1>Advise</h1><div class="muted small">Setups uit de Notifier, beoordeeld op de range-trading-principes, met doorgerekende uitkomsten.</div></div>
        <a class="btn" href="#/notifier">Naar de Notifier</a>
      </div>
      ${
        items.length
          ? `<div class="advice-grid">${items
              .map(
                (a) => `<a class="advice-card ${a.verdict.key}" href="#/advise/${encodeURIComponent(a.id)}">
                  <div class="row gap between"><strong>${esc(title(a))}</strong>${verdictBadge(a.verdict)}</div>
                  <div class="muted small">${kindTag(a)} ${date(a.asOf ? a.asOf * 1000 : a.createdAt, true)} · ${a.checks.filter((c) => c.state === "pass").length}/${a.checks.filter((c) => c.state !== "info").length} principes in orde</div>
                  <dl class="mini">
                    <dt>Entry</dt><dd>${num(a.signal.entry, 6)}</dd>
                    <dt>SL</dt><dd>${num(a.signal.stopLoss, 6)}</dd>
                    <dt>TP1</dt><dd>${num(a.signal.tp1, 6)} <span class="muted">(${a.signal.rr1.toFixed(1)}R)</span></dd>
                    <dt>TP2</dt><dd>${num(a.signal.tp2, 6)} <span class="muted">(${a.signal.rr2.toFixed(1)}R)</span></dd>
                  </dl>
                </a>`
              )
              .join("")}</div>`
          : `<div class="panel empty">Nog geen setups. Open een melding in de <a href="#/notifier">Notifier</a> en klik op <strong>Get advise</strong>.</div>`
      }`;
  }

  // ---------------- visualisaties ----------------
  // Uitkomst als de hele positie op één prijs sluit (incl. kosten).
  function allAt(a, price) {
    const g = a.signal;
    const c = A.calc({ entry: g.entry, stopLoss: g.stopLoss, tp1: g.tp1, tp2: price, mode: a.calc.mode, amount: +a.calc.amount, feePct: +a.calc.feePct });
    return c ? c.scenarios[3].pnl : 0;
  }

  // Prijsladder: SL, entry, TP1 en TP2 op schaal, met wat je verdient of verliest op elk niveau.
  function ladderSVG(a, c, cur) {
    const g = a.signal;
    const levels = [
      { key: "tp2", label: "TP2", price: g.tp2, color: "var(--pos)", pnl: c && c.scenarios[3].pnl },
      { key: "tp1", label: "TP1 (mid)", price: g.tp1, color: "var(--warn)", pnl: c && allAt(a, g.tp1) },
      { key: "entry", label: "Entry", price: g.entry, color: "var(--accent)", pnl: 0 },
      { key: "sl", label: "Stop loss", price: g.stopLoss, color: "var(--neg)", pnl: c && c.scenarios[0].pnl },
    ];
    const W = 520, H = 300, top = 18, bot = H - 18;
    const lo = Math.min(...levels.map((l) => l.price)), hi = Math.max(...levels.map((l) => l.price));
    const y = (p) => top + ((hi - p) / (hi - lo || 1)) * (bot - top);
    let s = `<svg class="ladder" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Prijsladder">`;
    s += `<rect x="150" y="${Math.min(y(g.entry), y(g.tp2))}" width="140" height="${Math.abs(y(g.tp2) - y(g.entry))}" fill="var(--pos)" opacity="0.14"/>`;
    s += `<rect x="150" y="${Math.min(y(g.entry), y(g.stopLoss))}" width="140" height="${Math.abs(y(g.stopLoss) - y(g.entry))}" fill="var(--neg)" opacity="0.18"/>`;
    for (const l of levels) {
      const ly = y(l.price);
      s += `<line x1="140" x2="300" y1="${ly}" y2="${ly}" stroke="${l.color}" stroke-width="2"/>`;
      s += `<text x="132" y="${ly - 2}" text-anchor="end" class="lad-name" fill="${l.color}">${esc(l.label)}</text>`;
      s += `<text x="132" y="${ly + 13}" text-anchor="end" class="lad-price">${esc(num(l.price, 6))}</text>`;
      if (c && l.key !== "entry") s += `<text x="312" y="${ly + 5}" class="lad-pnl ${signClass(l.pnl)}">${esc(money(l.pnl, a.currency))}${l.key === "tp1" ? " (alles op TP1)" : l.key === "tp2" ? " (alles op TP2)" : ""}</text>`;
    }
    if (cur && cur > Math.min(lo, hi) - (hi - lo) && cur < hi + (hi - lo)) {
      const cy = Math.max(top - 10, Math.min(bot + 10, y(cur)));
      s += `<line x1="150" x2="290" y1="${cy}" y2="${cy}" stroke="var(--text)" stroke-dasharray="3 3"/><text x="296" y="${cy - 4}" class="lad-now">nu ${esc(num(cur, 6))}</text>`;
    }
    return s + "</svg>";
  }

  // Scenario-staafjes rond de nul-lijn.
  function scenarioSVG(c, cur) {
    const W = 520, rowH = 44, H = c.scenarios.length * rowH + 10;
    const max = Math.max(...c.scenarios.map((x) => Math.abs(x.pnl))) || 1;
    const zero = 200, span = 150;
    let s = `<svg class="scenarios" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Scenario's">`;
    s += `<line x1="${zero}" x2="${zero}" y1="0" y2="${H}" class="cc-grid" stroke-width="2"/>`;
    c.scenarios.forEach((sc, i) => {
      const yy = 8 + i * rowH;
      const w = (Math.abs(sc.pnl) / max) * span;
      const x = sc.pnl >= 0 ? zero : zero - w;
      s += `<text x="10" y="${yy + 16}" class="sc-label">${esc(sc.label)}</text>`;
      s += `<text x="10" y="${yy + 31}" class="sc-note">${esc(sc.note)}</text>`;
      s += `<rect x="${x}" y="${yy + 6}" width="${Math.max(2, w)}" height="22" rx="3" fill="${sc.pnl >= 0 ? "var(--pos)" : "var(--neg)"}" opacity="0.85"/>`;
      s += `<text x="${sc.pnl >= 0 ? zero + w + 8 : zero + 8}" y="${yy + 22}" class="sc-val ${signClass(sc.pnl)}">${esc(money(sc.pnl, cur))}</text>`;
    });
    return s + "</svg>";
  }

  // ---------------- detail ----------------
  async function renderDetail(root, a) {
    teardown();
    const g = a.signal;
    const p = S.computePortfolio();
    const pass = a.checks.filter((c) => c.state === "pass").length;
    const warn = a.checks.filter((c) => c.state === "warn").length;
    const fail = a.checks.filter((c) => c.state === "fail").length;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <a class="back" href="#/advise">← Advise</a>
          <h1>${esc(title(a))} ${verdictBadge(a.verdict)} ${kindTag(a)}</h1>
          <div class="muted small">${esc(subtitle(a))}</div>
        </div>
        <div class="row gap">
          <a class="btn primary" id="adv-trade" href="#">Trade plaatsen</a>
          <button class="btn danger" id="adv-del">Verwijderen</button>
        </div>
      </div>

      <section class="panel verdict-panel ${a.verdict.key}">
        <div class="verdict-main">
          <div class="verdict-label">${esc(a.verdict.label)}</div>
          <p>${esc(a.verdict.text)}</p>
        </div>
        <div class="verdict-score">
          <span class="pos">✓ ${pass} in orde</span><span class="warn-text">! ${warn} let op</span><span class="neg">✗ ${fail} niet in orde</span>
        </div>
        <div class="verdict-live" id="adv-live">Actuele koers laden…</div>
      </section>

      <div class="detail-grid">
        <section class="panel">
          <h2>Beoordeling op de range-principes</h2>
          <ul class="principles">${a.checks
            .map((c) => `<li class="${c.state}"><span class="mark">${MARK[c.state]}</span><div><div class="p-label">${esc(c.label)}</div><div class="p-text">${esc(c.text)}</div></div></li>`)
            .join("")}</ul>
          <p class="muted small">Zelf nog checken in je Trade Entry Checklist: emotie, beïnvloeding, nieuws (FOMC, CPI, NFP), en of je achter je bureau zit.</p>
        </section>

        <section class="panel">
          <h2>Calculator</h2>
          <div class="calc-form">
            <span class="view-toggle" role="group" aria-label="Wat vul je in?">
              <button type="button" data-mode="stake" class="${a.calc.mode === "stake" ? "active" : ""}">Inzet</button>
              <button type="button" data-mode="risk" class="${a.calc.mode === "risk" ? "active" : ""}">Risico</button>
            </span>
            <label>${a.calc.mode === "risk" ? "Maximaal verlies bij SL" : "Bedrag dat je inzet"} (${esc(a.currency)})<input type="number" id="adv-amount" min="0" step="any" value="${esc(a.calc.amount)}"></label>
            <label>Kosten per kant (%)<input type="number" id="adv-fee" min="0" step="0.01" value="${esc(a.calc.feePct)}"></label>
          </div>
          <div id="adv-out"></div>
        </section>

        <section class="panel span2">
          <h2>Range in de grafiek</h2>
          <div id="adv-chart" class="range-chart"></div>
        </section>

        <section class="panel span2">
          <h2>Mijn notities</h2>
          <textarea id="adv-notes" rows="3" placeholder="Bijv. wachten op retest, limit op ${esc(num(g.entry, 6))}, letten op CPI donderdag…">${esc(a.notes || "")}</textarea>
          <p class="saved small" id="adv-saved" hidden>Opgeslagen</p>
        </section>
      </div>`;

    let current = null;

    function paintCalc() {
      const c = A.calc({ entry: g.entry, stopLoss: g.stopLoss, tp1: g.tp1, tp2: g.tp2, mode: a.calc.mode, amount: +a.calc.amount, feePct: +a.calc.feePct });
      const out = root.querySelector("#adv-out");
      if (!c) {
        out.innerHTML = `<p class="muted">Vul een bedrag in om de uitkomsten te zien.</p>`;
        return null;
      }
      const ofAccount = p.balance ? c.risk / p.balance : null;
      out.innerHTML = `
        <div class="kpis small calc-kpis">
          <div class="kpi"><span>Positie</span><strong>${money(c.stake, a.currency)}</strong><em>${num(c.units, 6)} ${esc(shortSym(a.symbol).replace(/USDT?$/, "")) || "units"}</em></div>
          <div class="kpi"><span>Risico bij SL</span><strong class="neg">${money(-c.risk, a.currency)}</strong><em>${ofAccount !== null ? pct(ofAccount, 2) + " van je saldo" : ""}</em></div>
          <div class="kpi"><span>TP1 + TP2</span><strong class="pos">${money(c.scenarios[2].pnl, a.currency)}</strong><em>${(c.scenarios[2].pnl / c.risk).toFixed(2)}R</em></div>
          <div class="kpi"><span>Benodigde winrate</span><strong>${c.breakEvenWinrate !== null ? pct(c.breakEvenWinrate, 0) : "—"}</strong><em>om break-even te draaien</em></div>
        </div>
        ${scenarioSVG(c, a.currency)}
        ${ladderSVG(a, c, current)}
        ${ofAccount !== null && ofAccount > 0.02 ? `<p class="warn-text small">Let op: je riskeert ${pct(ofAccount, 1)} van je saldo. Veel range traders houden 1–2% per trade aan.</p>` : ""}
        <p class="muted small">Kosten: ${money(c.fees, a.currency)} (in en uit). Uitkomsten zijn berekend, niet gegarandeerd: slippage en een gemiste fill zijn mogelijk.</p>`;
      return c;
    }
    paintCalc();

    // events
    root.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => {
        if (a.calc.mode === b.dataset.mode) return;
        // Omrekenen zodat dezelfde positie blijft staan.
        const c = A.calc({ entry: g.entry, stopLoss: g.stopLoss, tp1: g.tp1, tp2: g.tp2, mode: a.calc.mode, amount: +a.calc.amount, feePct: +a.calc.feePct });
        a.calc.mode = b.dataset.mode;
        if (c) a.calc.amount = Math.round((a.calc.mode === "risk" ? c.risk : c.stake) * 100) / 100;
        A.save(a);
        renderDetail(root, a);
      })
    );
    const persist = () => {
      a.calc.amount = +root.querySelector("#adv-amount").value || 0;
      a.calc.feePct = Math.max(0, +root.querySelector("#adv-fee").value || 0);
      A.save(a);
      paintCalc();
    };
    root.querySelector("#adv-amount").addEventListener("input", persist);
    root.querySelector("#adv-fee").addEventListener("input", persist);
    const notes = root.querySelector("#adv-notes");
    notes.addEventListener("change", () => {
      a.notes = notes.value;
      A.save(a);
      const s = root.querySelector("#adv-saved");
      s.hidden = false;
      setTimeout(() => (s.hidden = true), 1500);
    });
    root.querySelector("#adv-del").addEventListener("click", () => {
      if (!confirm("Dit advies verwijderen?")) return;
      A.remove(a.id);
      location.hash = "#/advise";
    });
    root.querySelector("#adv-trade").addEventListener("click", (e) => {
      e.preventDefault();
      const c = paintCalc();
      const q = new URLSearchParams({
        ticker: a.symbol, direction: a.direction, setup: "Reclaim", trigger: "Deviatie + reclaim + retest",
        rangeTf: tfLabel(a.tf), rangeHigh: +a.range.high.toPrecision(10), rangeLow: +a.range.low.toPrecision(10),
        entry: +g.entry.toPrecision(10), stopLoss: +g.stopLoss.toPrecision(10), tp1: +g.tp1.toPrecision(10), tp2: +g.tp2.toPrecision(10),
      });
      if (c && p.balance) q.set("riskPct", (Math.round((c.risk / p.balance) * 10000) / 100).toString());
      location.hash = "#/trades/new?" + q;
    });

    // grafiek + actuele koers
    try {
      const res = await TD.rangeChart.render(root.querySelector("#adv-chart"), a.symbol, a.tf, { analysis: { range: a.range, signal: g } });
      cleanup = res.cleanup;
      const pr = A.progress(res.candles, a);
      current = pr.price;
      const since = a.kind === "history" ? "na deze setup" : "sinds dit advies";
      const hitTxt = {
        sl: `<span class="neg">${a.kind === "history" ? "Achteraf: de stop loss werd" : "De stop loss is"} ${since} geraakt.</span>`,
        tp1: `<span class="pos">${a.kind === "history" ? "Achteraf: TP1 (mid) werd" : "TP1 (mid) is"} ${since} geraakt.</span>`,
        tp2: `<span class="pos">${a.kind === "history" ? "Achteraf: TP2 werd" : "TP2 is"} ${since} geraakt.</span>`,
      }[pr.hit] || `Nog geen SL of TP geraakt ${since}.`;
      root.querySelector("#adv-live").innerHTML = `Koers nu <strong>${num(pr.price, 6)}</strong> (${pr.fromEntry >= 0 ? "+" : ""}${pct(pr.fromEntry, 2)} t.o.v. entry) · ${hitTxt}`;
      paintCalc();
    } catch (e) {
      root.querySelector("#adv-chart").innerHTML = `<p class="neg pad">${esc(e.message)}</p>`;
      root.querySelector("#adv-live").textContent = "Actuele koers niet beschikbaar: " + e.message;
    }
  }

  function render(root, params) {
    if (params.id) {
      const a = A.get(params.id);
      if (!a) {
        teardown();
        root.innerHTML = `<div class="panel empty">Dit advies bestaat niet meer. <a href="#/advise">Terug naar Advise</a></div>`;
        return;
      }
      return renderDetail(root, a);
    }
    return renderList(root);
  }

  TD.views = TD.views || {};
  TD.views.advise = { render, teardown };
})(window.TD);
