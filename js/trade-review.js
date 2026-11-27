// Beoordeling van een trade op de range-principes, met de grafiek van het moment van plaatsen
// (het marktbeeld). Zelfde beoordeling als in Advise, zodat je achteraf ziet of je je aan je plan
// hield, en een leerpunt dat de beoordeling met de uitkomst vergelijkt.
window.TD = window.TD || {};
(function (TD) {
  const TF_OF = { "15m": "15m", "1h": "1h", "4h": "4h", "15M": "15m", "1H": "1h", "4H": "4h" };
  const num = (v) => (v === null || v === undefined || v === "" || isNaN(+v) ? null : +v);

  // Range-object zoals Advise het verwacht, op basis van de range uit de trade.
  function rangeFor(t, candles) {
    const H = num(t.rangeHigh), L = num(t.rangeLow);
    if (H === null || L === null || !(H > L)) return null;
    const h = H - L;
    // Liefst de range die de engine in dezelfde candles vindt (met begin/einde van de push).
    let best = null;
    try {
      for (const r of TD.rangeEngine.findRanges(candles)) {
        const d = Math.abs(r.high - H) + Math.abs(r.low - L);
        if (d < 0.3 * h && (!best || d < best.d)) best = { r, d };
      }
    } catch {
      /* geen engine-range: hieronder een eigen schatting */
    }
    let startTime, endTime, kind;
    if (best) ({ startTime, endTime, kind } = best.r);
    else if (t.rangeFrom && t.rangeTo) {
      startTime = +t.rangeFrom;
      endTime = +t.rangeTo;
      const a = candles.find((c) => c.time >= startTime), b = candles.find((c) => c.time >= endTime);
      kind = a && b && b.close < a.close ? "dump" : "push";
    } else {
      startTime = endTime = candles[0].time;
      kind = t.direction === "Short" ? "push" : "dump";
    }
    const mid = (H + L) / 2;
    const after = candles.filter((c) => c.time > endTime);
    const below = after.length ? after.filter((c) => c.close < mid).length / after.length : 0.5;
    return { low: L, high: H, mid, height: h, startTime, endTime, kind, distribution: { lower: below, upper: 1 - below } };
  }

  function assessTrade(t) {
    if (!t || !t.snapshot || !t.snapshot.candles || !t.snapshot.candles.length || !TD.advise) return null;
    const pl = t.plan || t;
    const candles = t.snapshot.candles.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
    const range = rangeFor(pl, candles);
    const entry = num(pl.entry), sl = num(pl.stopLoss);
    if (!range || entry === null || sl === null || entry === sl) return null;
    const long = pl.direction !== "Short";
    const tp1 = num(pl.tp1) ?? range.mid, tp2 = num(pl.tp2) ?? (long ? range.high : range.low);
    const risk = Math.abs(entry - sl);
    // Hoe diep ging de deviatie buiten de rand (sinds het einde van de push)?
    const after = candles.filter((c) => c.time > range.endTime);
    const ext = after.length ? (long ? Math.min(...after.map((c) => c.low)) : Math.max(...after.map((c) => c.high))) : null;
    const depth = ext === null ? null : Math.max(0, long ? range.low - ext : ext - range.high) / range.height;
    const setup = (pl.setup || t.setup) === "Breakout" ? "Breakout" : "Reclaim";
    const trig = String(pl.trigger || t.trigger || "");
    const signal = {
      setup,
      direction: long ? "Long" : "Short",
      // Een trade die je plaatste mét een retest-trigger telt als trigger; anders "wacht nog".
      status: /retest|swing failure|flip/i.test(trig) ? "trigger" : setup === "Breakout" ? "accepted" : "reclaim",
      entry, stopLoss: sl, tp1, tp2,
      rr1: Math.abs(tp1 - entry) / risk, rr2: Math.abs(tp2 - entry) / risk,
      depth: setup === "Reclaim" && depth ? depth : null,
      acceptBars: null, retestDepth: null, strength: null,
    };
    const tf = TF_OF[t.snapshot.tf] || TF_OF[pl.rangeTf] || "1h";
    const m = TD.advise.metrics(candles, range, signal);
    const r = setup === "Breakout" ? TD.advise.assessBreakout(m, signal, tf, candles, range) : TD.advise.assess(m, signal, tf);
    return { checks: r.checks, verdict: r.verdict, setup, at: t.snapshot.takenAt || null, trigger: trig || null };
  }

  // Leerpunt: wat zegt de uitkomst, gegeven de beoordeling vooraf?
  function lesson(t, a) {
    if (!a || t.status !== "closed" || t.outcome === "Cancelled") return null;
    const win = t.outcome === "TP1 + TP2" || t.outcome === "TP1 + BE" || +t.pnl > 0;
    const good = a.verdict.key === "play";
    if (good && win) return { tone: "pos", title: "Plan gevolgd en beloond", text: "De setup voldeed aan de range-principes en je trade werkte. Precies zo blijven doen." };
    if (good && !win) return { tone: "info", title: "Goede setup, toch verlies: geen fout", text: "De setup voldeed aan de principes. Verliezen horen bij een strategie met een edge: je nam 1R verlies zoals gepland. Niets aan veranderen." };
    if (!good && win)
      return { tone: "warn", title: "Gewonnen, maar de setup voldeed niet", text: `Het oordeel was "${a.verdict.label}". Deze winst was eerder geluk dan plan: zulke setups leveren op de lange termijn minder op. Niet herhalen.` };
    return { tone: "neg", title: "Leerpunt: deze setup had je kunnen overslaan", text: `Het oordeel was "${a.verdict.label}". Kijk naar de punten met ✗ en ! hieronder: dat zijn de signalen om de volgende keer te wachten of over te slaan.` };
  }

  TD.tradeReview = { assessTrade, lesson };
})(window.TD);
