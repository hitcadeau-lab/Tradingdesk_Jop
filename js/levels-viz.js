// Levels-visualisatie (zelfde stijl als Advise): kerncijfers, scenario's en een prijsladder
// met de range (high / mid / low) en entry, stop loss en TP1–TP3.
// Gebruikt in het trade-formulier (live) en op de trade-detailpagina (vastgelegd plan).
(function (TD) {
  const { esc, num, money, signClass } = TD.util;

  const n = (v) => (v === null || v === undefined || v === "" || isNaN(+v) ? null : +v);

  // p: { direction, entry, stopLoss, tp1, tp2, tp3, rangeHigh, rangeLow, riskAmount, currency, current }
  function compute(p) {
    const entry = n(p.entry), sl = n(p.stopLoss);
    if (entry === null || sl === null || entry === sl) return null;
    const risk = Math.max(0, n(p.riskAmount) || 0);
    const R = (price) => (n(price) === null ? null : (n(price) - entry) / (entry - sl));
    const tps = [["TP1", p.tp1], ["TP2", p.tp2], ["TP3", p.tp3]].filter(([, v]) => n(v) !== null).map(([label, v]) => ({ label, price: n(v), r: R(v) }));
    const at = (r) => (r === null ? null : r * risk);
    const scen = [{ key: "sl", label: "Stop Loss", note: "Stop geraakt vóór TP1", r: -1 }];
    if (tps[0]) scen.push({ key: "tp1be", label: "TP1 + BE", note: "50% op TP1, rest op break-even", r: 0.5 * tps[0].r });
    if (tps[1]) scen.push({ key: "tp1tp2", label: "TP1 + TP2", note: "50% op TP1, rest op TP2", r: 0.5 * tps[0].r + 0.5 * tps[1].r });
    const last = tps[tps.length - 1];
    if (last) scen.push({ key: "all", label: `Alles op ${last.label}`, note: `Hele positie tot ${last.label}`, r: last.r });
    scen.forEach((s) => (s.pnl = at(s.r)));
    const win = scen.find((s) => s.key === "tp1tp2") || scen[scen.length - 1];
    const hi = n(p.rangeHigh), lo = n(p.rangeLow);
    const wrongSide = (p.direction === "Long" && sl >= entry) || (p.direction === "Short" && sl <= entry);
    return {
      entry, sl, tps, scen, risk,
      range: hi !== null && lo !== null && hi > lo ? { high: hi, low: lo, mid: (hi + lo) / 2 } : null,
      breakEven: win && win.r > 0 ? 1 / (1 + win.r) : null,
      wrongSide,
      currency: p.currency,
      current: n(p.current),
    };
  }

  function scenarioSVG(c) {
    const W = 520, rowH = 44, H = c.scen.length * rowH + 10;
    const max = Math.max(...c.scen.map((x) => Math.abs(x.r))) || 1;
    const zero = 200, span = 150;
    let s = `<svg class="scenarios" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Scenario's">`;
    s += `<line x1="${zero}" x2="${zero}" y1="0" y2="${H}" class="cc-grid" stroke-width="2"/>`;
    c.scen.forEach((sc, i) => {
      const yy = 8 + i * rowH;
      const w = (Math.abs(sc.r) / max) * span;
      const x = sc.r >= 0 ? zero : zero - w;
      const val = c.risk ? money(sc.pnl, c.currency) : `${sc.r.toFixed(2)}R`;
      s += `<text x="10" y="${yy + 16}" class="sc-label">${esc(sc.label)}</text>`;
      s += `<text x="10" y="${yy + 31}" class="sc-note">${esc(sc.note)}</text>`;
      s += `<rect x="${x}" y="${yy + 6}" width="${Math.max(2, w)}" height="22" rx="3" fill="${sc.r >= 0 ? "var(--pos)" : "var(--neg)"}" opacity="0.85"/>`;
      s += `<text x="${sc.r >= 0 ? zero + w + 8 : zero + 8}" y="${yy + 22}" class="sc-val ${signClass(sc.r)}">${esc(val)}${c.risk ? ` <tspan class="sc-note">(${sc.r.toFixed(2)}R)</tspan>` : ""}</text>`;
    });
    return s + "</svg>";
  }

  // Prijsladder: range op de achtergrond, trade-levels met naam, prijs, R en bedrag.
  function ladderSVG(c) {
    const lv = [
      { key: "entry", label: "Entry", price: c.entry, color: "var(--accent)" },
      { key: "sl", label: "Stop loss", price: c.sl, color: "var(--neg)", r: -1 },
      ...c.tps.map((t, i) => ({ key: "tp" + i, label: t.label + (i === 0 && c.range && Math.abs(t.price - c.range.mid) < 1e-9 ? " (mid)" : ""), price: t.price, color: i === 0 ? "var(--warn)" : "var(--pos)", r: t.r })),
    ];
    const rl = c.range
      ? [
          { label: "Range high", price: c.range.high, color: "var(--neg)" },
          { label: "Mid", price: c.range.mid, color: "var(--warn)" },
          { label: "Range low", price: c.range.low, color: "var(--pos)" },
        ]
      : [];
    const prices = [...lv, ...rl].map((l) => l.price).concat(c.current !== null ? [c.current] : []);
    const W = 520, H = 340, top = 20, bot = H - 20;
    const lo = Math.min(...prices), hi = Math.max(...prices);
    const pad = (hi - lo) * 0.04 || 1;
    const y = (p) => top + ((hi + pad - p) / (hi - lo + 2 * pad)) * (bot - top);
    let s = `<svg class="ladder" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Levels">`;
    // Range-band op de achtergrond
    if (c.range) {
      s += `<rect x="140" y="${y(c.range.high)}" width="170" height="${y(c.range.low) - y(c.range.high)}" fill="var(--text)" opacity="0.04"/>`;
      for (const r of rl) s += `<line x1="140" x2="310" y1="${y(r.price)}" y2="${y(r.price)}" stroke="${r.color}" stroke-width="1" stroke-dasharray="5 4" opacity="0.7"/>`;
    }
    // Winst- en verlieszone
    const far = c.tps.length ? c.tps[c.tps.length - 1].price : null;
    if (far !== null) s += `<rect x="165" y="${Math.min(y(c.entry), y(far))}" width="120" height="${Math.abs(y(far) - y(c.entry))}" fill="var(--pos)" opacity="0.14"/>`;
    s += `<rect x="165" y="${Math.min(y(c.entry), y(c.sl))}" width="120" height="${Math.abs(y(c.sl) - y(c.entry))}" fill="var(--neg)" opacity="0.2"/>`;

    // Labels links (trade-levels) en rechts (range) uit elkaar duwen.
    const spread = (items, gap) => {
      const a = items.map((it) => ({ ...it, ly: y(it.price) })).sort((p, q) => p.ly - q.ly);
      for (let i = 1; i < a.length; i++) if (a[i].ly - a[i - 1].ly < gap) a[i].ly = a[i - 1].ly + gap;
      const over = a.length ? a[a.length - 1].ly - (H - 8) : 0;
      if (over > 0) {
        a[a.length - 1].ly -= over;
        for (let i = a.length - 2; i >= 0; i--) if (a[i + 1].ly - a[i].ly < gap) a[i].ly = a[i + 1].ly - gap;
      }
      return a;
    };
    for (const l of spread(lv, 30)) {
      const ly = y(l.price);
      s += `<line x1="150" x2="300" y1="${ly}" y2="${ly}" stroke="${l.color}" stroke-width="2.5"/>`;
      s += `<line x1="134" x2="150" y1="${l.ly}" y2="${ly}" stroke="${l.color}" stroke-width="1"/>`;
      s += `<text x="130" y="${l.ly - 2}" text-anchor="end" class="lad-name" fill="${l.color}">${esc(l.label)}</text>`;
      s += `<text x="130" y="${l.ly + 12}" text-anchor="end" class="lad-price">${esc(num(l.price, 8))}${l.r !== undefined ? ` · ${l.r.toFixed(2)}R` : ""}</text>`;
      if (l.r !== undefined && c.risk) s += `<text x="${W - 6}" y="${l.ly + 5}" text-anchor="end" class="lad-pnl ${signClass(l.r)}">${esc(money(l.r * c.risk, c.currency))}</text>`;
    }
    for (const r of spread(rl, 16)) s += `<text x="314" y="${r.ly + 4}" class="lad-range" fill="${r.color}">${esc(r.label)}</text>`;
    if (c.current !== null) {
      const cy = y(c.current);
      s += `<line x1="150" x2="300" y1="${cy}" y2="${cy}" stroke="var(--text)" stroke-dasharray="2 3"/><text x="304" y="${cy - 4}" class="lad-now">nu ${esc(num(c.current, 8))}</text>`;
    }
    return s + "</svg>";
  }

  // Volledige weergave. opts.title: kop boven de visualisatie.
  function html(p, opts = {}) {
    const c = compute(p);
    if (!c) return `<div class="levels-empty">Vul <strong>entry</strong> en <strong>stoploss</strong> in om je levels, R en bedragen te zien.${p.rangeHigh && p.rangeLow ? "" : " Met range high en low erbij zie je ook de range."}</div>`;
    const tp1 = c.tps[0], win = c.scen.find((s) => s.key === "tp1tp2");
    return `
      ${opts.title ? `<div class="label">${esc(opts.title)}</div>` : ""}
      ${c.wrongSide ? `<p class="error">De stoploss ligt aan de verkeerde kant van de entry voor een ${esc(p.direction)}.</p>` : ""}
      <div class="kpis small calc-kpis">
        <div class="kpi"><span>Risico bij SL</span><strong class="neg">${c.risk ? money(-c.risk, c.currency) : "-1R"}</strong><em>${p.riskPct ? num(p.riskPct) + "% van je saldo" : ""}</em></div>
        <div class="kpi"><span>TP1${c.range && tp1 && Math.abs(tp1.price - c.range.mid) < 1e-9 ? " (mid)" : ""}</span><strong class="pos">${tp1 ? (c.risk ? money(tp1.r * c.risk, c.currency) : tp1.r.toFixed(2) + "R") : "—"}</strong><em>${tp1 ? tp1.r.toFixed(2) + "R bij hele positie" : "Nog geen TP1"}</em></div>
        <div class="kpi"><span>TP1 + TP2</span><strong class="pos">${win ? (c.risk ? money(win.pnl, c.currency) : win.r.toFixed(2) + "R") : "—"}</strong><em>${win ? win.r.toFixed(2) + "R" : "Vul TP2 in"}</em></div>
        <div class="kpi"><span>Benodigde winrate</span><strong>${c.breakEven !== null ? Math.round(c.breakEven * 100) + "%" : "—"}</strong><em>om break-even te draaien</em></div>
      </div>
      ${c.tps.length ? scenarioSVG(c) : ""}
      ${ladderSVG(c)}`;
  }

  TD.levelsViz = { compute, html };
})(window.TD);
