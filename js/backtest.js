// Backtest: de hele strategie op de historie van een Kraken-pair.
//  1. Koersdata ophalen bij Kraken (meerdere stukken van 2000 candles).
//  2. Candle voor candle door de geschiedenis lopen, met alleen de candles tot dat moment
//     (zoals de Notifier het live had gezien). Elke Trigger (reclaim of breakout) = een trade.
//  3. Elke trade beoordelen op de range-principes (zoals Advise): groen / oranje / rood.
//  4. Uitkomst volgens je regels: SL vóór TP1 = −1R; TP1 = 50% eraf en stop naar break-even;
//     daarna BE of TP2. Fees (taker, in en uit) gaan eraf in R.
window.TD = window.TD || {};
(function (TD) {
  const E = TD.rangeEngine;
  const TF_SEC = { "15m": 900, "1h": 3600, "4h": 14400 };
  const WINDOW = 300; // net als de Notifier: de laatste 300 candles

  // ---------- data ----------
  async function history(ticker, tf, days, onProgress) {
    const sym = TD.markets && TD.markets.symOf(ticker);
    if (!sym) throw new Error("Backtesten kan met Kraken-pairs (bijv. BTC).");
    const sec = TF_SEC[tf];
    const now = Math.floor(Date.now() / 1000);
    let from = now - days * 86400 - WINDOW * sec; // extra aanloop voor de eerste range
    const map = new Map();
    let guard = 0;
    while (from < now && guard++ < 60) {
      const to = Math.min(now, from + 1990 * sec);
      const d = await TD.net.json(`https://futures.kraken.com/api/charts/v1/trade/${sym}/${tf}?from=${from}&to=${to}`);
      for (const c of d.candles || []) {
        const t = Math.floor(c.time / 1000);
        map.set(t, { time: t, open: +c.open, high: +c.high, low: +c.low, close: +c.close, volume: +c.volume || 0 });
      }
      if (onProgress) onProgress(Math.min(1, (to - (now - days * 86400 - WINDOW * sec)) / (days * 86400 + WINDOW * sec)));
      from = to;
    }
    return [...map.values()].sort((a, b) => a.time - b.time);
  }

  // ---------- uitkomst van één trade ----------
  // limit: entry is een limit-order op g.entry; die moet binnen 12 candles gevuld worden
  // (en vóór TP1), anders telt de trade niet mee (result "nofill").
  function simulate(c, t, g, feePct, limit) {
    const long = g.direction === "Long";
    const risk = Math.abs(g.entry - g.stopLoss);
    if (!(risk > 0)) return null;
    const r1 = Math.abs(g.tp1 - g.entry) / risk, r2 = Math.abs(g.tp2 - g.entry) / risk;
    let start = t;
    if (limit) {
      let fillI = -1;
      for (let i = t; i < Math.min(c.length, t + 13); i++) {
        if (long ? c[i].low <= g.entry : c[i].high >= g.entry) {
          fillI = i;
          break;
        }
        if (long ? c[i].high >= g.tp1 : c[i].low <= g.tp1) break; // weggelopen zonder fill
      }
      if (fillI < 0) return { result: "nofill", R: null, exitI: t, r1, r2 };
      start = fillI;
      // Raakt de fill-candle zelf ook de stop? Dan telt de stop (voorzichtig).
      if (long ? c[fillI].low <= g.stopLoss : c[fillI].high >= g.stopLoss) {
        const fee = ((feePct / 100) * 2 * g.entry) / risk;
        return { result: "sl", R: -1 - fee, gross: -1, fee, exitI: fillI, r1, r2 };
      }
    }
    let stop = g.stopLoss, tp1Done = false, exitI = null, result = "open";
    for (let i = start + 1; i < c.length; i++) {
      const x = c[i];
      const hitStop = long ? x.low <= stop : x.high >= stop;
      const hit1 = long ? x.high >= g.tp1 : x.low <= g.tp1;
      const hit2 = long ? x.high >= g.tp2 : x.low <= g.tp2;
      if (!tp1Done) {
        if (hitStop) { result = "sl"; exitI = i; break; } // stop eerst (voorzichtig)
        if (hit2) { result = "tp2"; exitI = i; break; }
        if (hit1) { tp1Done = true; stop = g.entry; }
      } else {
        if (hitStop) { result = "tp1"; exitI = i; break; } // TP1 + break-even
        if (hit2) { result = "tp2"; exitI = i; break; }
      }
    }
    if (result === "open") return { result, R: null, exitI: null, r1, r2 };
    const gross = result === "sl" ? -1 : result === "tp1" ? 0.5 * r1 : 0.5 * r1 + 0.5 * r2;
    const fee = ((feePct / 100) * 2 * g.entry) / risk; // in + uit, uitgedrukt in R
    return { result, R: gross - fee, gross, fee, exitI, r1, r2 };
  }

  // ---------- de backtest ----------
  // opts: { tf, feePct, setups: ["Reclaim","Breakout"], noOverlap }
  async function run(candles, opts, onProgress) {
    const tf = opts.tf;
    const trades = [];
    const seen = new Set();
    let busyUntil = -1;
    const n = candles.length;
    const chunk = 150;
    for (let t = WINDOW; t < n; t++) {
      const w = candles.slice(t - WINDOW + 1, t + 1);
      const a = E.analyze(w);
      const found = [];
      if (a.range && a.signal && a.signal.status === "trigger") found.push({ setup: "Reclaim", range: a.range, sig: a.signal, key: `R|${a.signal.direction}|${a.signal.reclaimTime}` });
      if (a.breakout && a.breakout.signal.status === "trigger") found.push({ setup: "Breakout", range: a.breakout.range, sig: a.breakout.signal, key: `B|${a.breakout.signal.direction}|${a.breakout.signal.breakoutTime}` });
      for (const f of found) {
        if (seen.has(f.key) || !opts.setups.includes(f.setup)) continue;
        seen.add(f.key);
        if (opts.noOverlap && t <= busyUntil) continue;
        const signal = { ...f.sig, setup: f.setup };
        // Finetunen: stop verder voorbij de lont en/of entry met een limit op de rand.
        const h = f.range.high - f.range.low, long = signal.direction === "Long";
        const extra = ((opts.stopBuf ?? 0.03) - 0.03) * h;
        if (extra) signal.stopLoss = long ? signal.stopLoss - extra : signal.stopLoss + extra;
        if (opts.entryMode === "edge") signal.entry = f.setup === "Breakout" ? (long ? f.range.high : f.range.low) : long ? f.range.low : f.range.high;
        const risk = Math.abs(signal.entry - signal.stopLoss);
        if (!(risk > 0) || (long ? signal.stopLoss >= signal.entry : signal.stopLoss <= signal.entry)) continue;
        signal.rr1 = Math.abs(signal.tp1 - signal.entry) / risk;
        signal.rr2 = Math.abs(signal.tp2 - signal.entry) / risk;
        let checks = [], verdict = { key: "skip", label: "?" };
        try {
          const m = TD.advise.metrics(w, f.range, signal);
          ({ checks, verdict } = f.setup === "Breakout" ? TD.advise.assessBreakout(m, signal, tf, w, f.range) : TD.advise.assess(m, signal, tf));
        } catch {
          /* beoordeling mislukt: trade telt mee zonder oordeel */
        }
        const out = simulate(candles, t, signal, opts.feePct, opts.entryMode === "edge");
        if (!out || out.result === "nofill") continue;
        if (opts.noOverlap) busyUntil = out.exitI ?? n;
        trades.push({
          i: t, time: candles[t].time, tf, setup: f.setup, direction: signal.direction,
          entry: signal.entry, stopLoss: signal.stopLoss, tp1: signal.tp1, tp2: signal.tp2,
          range: { low: f.range.low, high: f.range.high, mid: f.range.mid, startTime: f.range.startTime, endTime: f.range.endTime, kind: f.range.kind },
          verdict: verdict.key, verdictLabel: verdict.label,
          checks: checks.map((c) => ({ id: c.id, label: c.label, state: c.state })),
          pass: checks.filter((c) => c.state === "pass").length,
          warn: checks.filter((c) => c.state === "warn").length,
          fail: checks.filter((c) => c.state === "fail").length,
          ...out,
          exitTime: out.exitI != null ? candles[out.exitI].time : null,
        });
      }
      if ((t - WINDOW) % chunk === 0) {
        if (onProgress) onProgress((t - WINDOW) / (n - WINDOW));
        await new Promise((r) => setTimeout(r, 0)); // scherm laten bijwerken
      }
    }
    return trades;
  }

  // Hoe bewoog de markt in de geteste periode (vanaf het begin van de test, na de aanloop)?
  function move(candles) {
    const a = candles[Math.min(WINDOW, candles.length - 1)], b = candles[candles.length - 1];
    return a && b ? b.close / a.close - 1 : 0;
  }

  // ---------- statistiek ----------
  function stats(list) {
    const done = list.filter((x) => x.R !== null);
    const n = done.length;
    const wins = done.filter((x) => x.result !== "sl").length;
    const sum = done.reduce((a, x) => a + x.R, 0);
    const pos = done.filter((x) => x.R > 0).reduce((a, x) => a + x.R, 0);
    const neg = -done.filter((x) => x.R < 0).reduce((a, x) => a + x.R, 0);
    let eq = 0, peak = 0, dd = 0;
    for (const x of done.slice().sort((a, b) => a.time - b.time)) {
      eq += x.R;
      peak = Math.max(peak, eq);
      dd = Math.min(dd, eq - peak);
    }
    return {
      n, open: list.length - n, wins, winrate: n ? wins / n : 0,
      tp2: done.filter((x) => x.result === "tp2").length, tp1: done.filter((x) => x.result === "tp1").length, sl: done.filter((x) => x.result === "sl").length,
      totalR: sum, expectancy: n ? sum / n : 0, pf: neg > 0 ? pos / neg : pos > 0 ? Infinity : 0, maxDD: dd,
    };
  }
  // Groep op het aantal oranje en rode signalen.
  function signalGroup(x) {
    if (x.fail > 0) return x.fail === 1 ? "1 rood" : "2+ rood";
    if (x.warn === 0) return "Alles groen";
    return x.warn === 1 ? "1 oranje" : x.warn === 2 ? "2 oranje" : "3+ oranje";
  }
  const SIGNAL_ORDER = ["Alles groen", "1 oranje", "2 oranje", "3+ oranje", "1 rood", "2+ rood"];

  // Per check: hoe deden trades het waarbij die check groen / oranje / rood was?
  function perCheck(list) {
    const by = new Map();
    for (const x of list) for (const c of x.checks) {
      if (c.state === "info") continue;
      const e = by.get(c.id) || { id: c.id, label: c.label, pass: [], warn: [], fail: [] };
      e[c.state].push(x);
      by.set(c.id, e);
    }
    return [...by.values()].map((e) => ({ id: e.id, label: e.label, pass: stats(e.pass), warn: stats(e.warn), fail: stats(e.fail) }));
  }

  // Conclusie en finetune-tips.
  function conclude(list) {
    const all = stats(list);
    const play = stats(list.filter((x) => x.verdict === "play"));
    const playDoubt = stats(list.filter((x) => x.verdict !== "skip"));
    const tips = [];
    for (const c of perCheck(list)) {
      const good = c.pass, bad = { n: c.warn.n + c.fail.n, expectancy: c.warn.n + c.fail.n ? (c.warn.totalR + c.fail.totalR) / (c.warn.n + c.fail.n) : 0 };
      if (good.n >= 8 && bad.n >= 8) {
        const diff = good.expectancy - bad.expectancy;
        if (diff >= 0.25) tips.push({ tone: "pos", text: `“${c.label}” doet ertoe: groen ${good.expectancy.toFixed(2)}R per trade tegenover ${bad.expectancy.toFixed(2)}R als hij oranje/rood is. Houd je hier strikt aan.` });
        else if (diff <= -0.15) tips.push({ tone: "warn", text: `“${c.label}” filtert vooral winners weg: oranje/rood deed het beter (${bad.expectancy.toFixed(2)}R) dan groen (${good.expectancy.toFixed(2)}R). Overweeg deze check te versoepelen.` });
      }
    }
    let verdict;
    const base = play.n >= 15 ? play : playDoubt;
    const label = play.n >= 15 ? "Speelbaar" : "Speelbaar + Twijfel";
    if (base.n < 15) verdict = { key: "few", title: "Nog te weinig trades voor een conclusie", text: `Maar ${base.n} afgeronde trades in “${label}”. Neem een langere periode of meer timeframes.` };
    else if (base.expectancy > 0.1 && base.pf > 1.2) verdict = { key: "yes", title: "Ja: de strategie is winstgevend in deze periode", text: `${label}: ${base.n} trades, gemiddeld ${base.expectancy.toFixed(2)}R per trade (na fees), profit factor ${base.pf === Infinity ? "∞" : base.pf.toFixed(2)}.` };
    else if (base.expectancy > 0) verdict = { key: "meh", title: "Licht positief: de edge is klein", text: `${label}: gemiddeld ${base.expectancy.toFixed(2)}R per trade. Na fees en slippage blijft er weinig over; finetunen loont.` };
    else verdict = { key: "no", title: "Nee: in deze periode niet winstgevend", text: `${label}: gemiddeld ${base.expectancy.toFixed(2)}R per trade. Kijk hieronder welke checks het verschil maken.` };
    return { all, play, playDoubt, verdict, tips };
  }

  TD.backtest = { history, run, simulate, move, stats, signalGroup, SIGNAL_ORDER, perCheck, conclude, TF_SEC, WINDOW };
})(window.TD);
