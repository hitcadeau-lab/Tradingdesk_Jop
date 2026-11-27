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
    let startTime, endTime, kind, kindGuessed = false;
    if (best) ({ startTime, endTime, kind } = best.r);
    else if (t.rangeFrom && t.rangeTo) {
      startTime = +t.rangeFrom;
      endTime = +t.rangeTo;
      const a = candles.find((c) => c.time >= startTime), b = candles.find((c) => c.time >= endTime);
      kind = a && b && b.close < a.close ? "dump" : "push";
    } else {
      startTime = endTime = candles[0].time;
      kind = t.direction === "Short" ? "push" : "dump";
      kindGuessed = true; // richting van de push onbekend: trend-check is dan minder zeker
    }
    const mid = (H + L) / 2;
    const after = candles.filter((c) => c.time > endTime);
    const below = after.length ? after.filter((c) => c.close < mid).length / after.length : 0.5;
    return { low: L, high: H, mid, height: h, startTime, endTime, kind, kindGuessed, distribution: { lower: below, upper: 1 - below } };
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
    // Breakout: acceptatie (langste reeks closes buiten de rand) en kracht van de uitbraak-candle.
    let acceptBars = null, strength = null;
    if (setup === "Breakout") {
      const edge = long ? range.high : range.low;
      const out = (c) => (long ? c.close > edge + 0.02 * range.height : c.close < edge - 0.02 * range.height);
      let run = 0, bestRun = 0, first = -1;
      after.forEach((c, i) => {
        run = out(c) ? run + 1 : 0;
        if (run === 1 && first < 0) first = i;
        bestRun = Math.max(bestRun, run);
      });
      acceptBars = bestRun;
      const inside = after.filter((c) => !out(c));
      const avg = inside.length ? inside.reduce((x, c) => x + (c.high - c.low), 0) / inside.length : null;
      if (first >= 0 && avg) strength = Math.abs(after[first].close - after[first].open) / avg;
    }
    const trig = String(pl.trigger || t.trigger || "");
    const signal = {
      setup,
      direction: long ? "Long" : "Short",
      // Een trade die je plaatste mét een retest-trigger telt als trigger; anders "wacht nog".
      status: /retest|swing failure|flip/i.test(trig) ? "trigger" : setup === "Breakout" ? "accepted" : "reclaim",
      entry, stopLoss: sl, tp1, tp2,
      rr1: Math.abs(tp1 - entry) / risk, rr2: Math.abs(tp2 - entry) / risk,
      depth: setup === "Reclaim" && depth ? depth : null,
      acceptBars, retestDepth: null, strength,
    };
    const tf = TF_OF[t.snapshot.tf] || TF_OF[pl.rangeTf] || "1h";
    const m = TD.advise.metrics(candles, range, signal);
    const r = setup === "Breakout" ? TD.advise.assessBreakout(m, signal, tf, candles, range) : TD.advise.assess(m, signal, tf);
    // Was de richting van de push niet vast te stellen, dan is de trend-check geen harde fout.
    if (range.kindGuessed)
      for (const c of r.checks)
        if (c.id === "trend" && c.state === "fail") {
          c.state = "warn";
          c.text += " (Let op: de richting van de push kon niet uit het marktbeeld worden afgeleid, dus dit is een inschatting.)";
        }
    const fails = r.checks.filter((c) => c.state === "fail").length, warns = r.checks.filter((c) => c.state === "warn").length;
    let verdict = r.verdict;
    if (range.kindGuessed && verdict.key === "skip" && fails === 0 && !["expired", "invalid", "untradeable", "failed"].includes(signal.status))
      verdict = { key: "doubt", label: "Twijfel", text: `Geen harde fout, wel ${warns} aandachtspunt${warns === 1 ? "" : "en"}.` };
    return { v: 2, checks: r.checks, verdict, setup, at: t.snapshot.takenAt || null, trigger: trig || null };
  }

  // Leerpunt: wat zegt de uitkomst, gegeven de beoordeling vooraf?
  function lesson(t, a) {
    if (!a || t.status !== "closed" || t.outcome === "Cancelled") return null;
    const win = t.outcome === "TP1 + TP2" || t.outcome === "TP1 + BE" || +t.pnl > 0;
    const key = a.verdict.key;
    const warns = a.checks.filter((c) => c.state === "warn").length;
    const fails = a.checks.filter((c) => c.state === "fail").length;
    if (key === "play" && win) return { tone: "pos", title: "Plan gevolgd en beloond", text: "De setup voldeed aan de range-principes en je trade werkte. Precies zo blijven doen." };
    if (key === "play") return { tone: "info", title: "Goede setup, toch verlies: geen fout", text: "De setup voldeed aan de principes. Verliezen horen bij een strategie met een edge: je nam 1R verlies zoals gepland. Niets aan veranderen." };
    if (key === "doubt" && win)
      return { tone: "warn", title: "Gewonnen, met kanttekeningen", text: `Het oordeel was "Twijfel": geen harde fout, wel ${warns} aandachtspunt${warns === 1 ? "" : "en"} (!). Mooi resultaat. Vraag jezelf af of je die punten bewust accepteerde, bijvoorbeeld door kleiner te spelen.` };
    if (key === "doubt")
      return { tone: "warn", title: "Verlies met een twijfel-setup", text: `Het oordeel was "Twijfel" (${warns} aandachtspunt${warns === 1 ? "" : "en"}). Kijk naar de punten met ! hieronder: speel zulke setups voortaan kleiner, of wacht op een betere.` };
    if (win)
      return { tone: "warn", title: "Gewonnen, maar de setup voldeed niet", text: `Het oordeel was "${a.verdict.label}": ${fails} principe${fails === 1 ? "" : "s"} niet in orde (✗). Deze winst was eerder geluk dan plan: zulke setups leveren op de lange termijn minder op. Niet herhalen.` };
    return { tone: "neg", title: "Leerpunt: deze setup had je kunnen overslaan", text: `Het oordeel was "${a.verdict.label}". Kijk naar de punten met ✗ en ! hieronder: dat zijn de signalen om de volgende keer te wachten of over te slaan.` };
  }

  TD.tradeReview = { assessTrade, lesson };
})(window.TD);
