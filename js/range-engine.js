// Range-engine: vindt ranges en range-trading setups in candles, volgens Range Trading 101.
//  - Range: van het begin van de push (of dump) tot het einde ervan. Mid = 50% (Fib 0 / 0,5 / 1).
//    De koers moet daarna in de range blijven en terugkomen (anders is het geen range).
//  - Setup: deviatie (candle sluit buiten de range) → reclaim (sluit weer binnen) → retest = trigger.
//    Te diepe deviatie (stop te ver van TP1) = niet tradeable. Clean break richting mid = te laat.
// Candles: [{ time (sec), open, high, low, close }], oud → nieuw.
(function (root) {
  const DEFAULTS = {
    pivot: 3, // candles links/rechts voor een swing high/low
    minRangeAtr: 3, // range moet minstens 3× ATR hoog zijn
    maxPushBars: 40, // een push duurt maximaal zoveel candles
    minDevelopBars: 8, // na de push minstens zoveel candles in de range
    maxOutside: 0.25, // max. aandeel closes buiten de range (na de push)
    edgeZone: 0.2, // "bij de rand" = binnen 20% van de range-hoogte
    signalLookback: 10, // deviatie + reclaim moet in de laatste zoveel candles vallen
    maxDevDepth: 0.35, // deviatie dieper dan 35% van de range = te grote stop
    retestZone: 0.06, // retest = low binnen 6% van de range low (of high bij short)
    minRR: 1.0, // minimale R:R tot TP1 (mid)
    acceptBars: 6, // zoveel closes op rij buiten de range = breakout (acceptatie)
  };

  function atr(c, n = 14) {
    const out = new Array(c.length).fill(null);
    let sum = 0;
    for (let i = 1; i < c.length; i++) {
      const tr = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
      if (i <= n) {
        sum += tr;
        if (i === n) out[i] = sum / n;
      } else out[i] = (out[i - 1] * (n - 1) + tr) / n;
    }
    return out;
  }

  function pivots(c, k) {
    const highs = [], lows = [];
    for (let i = k; i < c.length - k; i++) {
      let hi = true, lo = true;
      for (let j = i - k; j <= i + k; j++) {
        if (j === i) continue;
        if (c[j].high > c[i].high) hi = false;
        if (c[j].low < c[i].low) lo = false;
      }
      if (hi) highs.push(i);
      if (lo) lows.push(i);
    }
    return { highs, lows };
  }

  // Alle geldige ranges; de meest recente (en best ontwikkelde) eerst.
  function findRanges(c, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    if (c.length < 40) return [];
    const a = atr(c);
    const recentAtr = a.slice(-50).filter((v) => v !== null);
    const A = recentAtr.reduce((x, y) => x + y, 0) / (recentAtr.length || 1);
    const { highs, lows } = pivots(c, o.pivot);
    const out = [];

    const tryPush = (s, e, kind) => {
      if (e <= s || e - s > o.maxPushBars) return;
      let H = -Infinity, L = Infinity;
      for (let i = s; i <= e; i++) {
        H = Math.max(H, c[i].high);
        L = Math.min(L, c[i].low);
      }
      // De push moet echt van het ene uiterste naar het andere lopen.
      if (kind === "push" && (c[s].low !== L || c[e].high !== H)) return;
      if (kind === "dump" && (c[s].high !== H || c[e].low !== L)) return;
      const h = H - L;
      if (h < o.minRangeAtr * A) return;
      const after = c.slice(e + 1);
      if (after.length < o.minDevelopBars) return;
      // Ontwikkeling in de range (de laatste candles tellen niet mee: daar kan een deviatie lopen).
      const body = after.slice(0, Math.max(o.minDevelopBars, after.length - o.signalLookback));
      const isOut = (x) => x.close > H + 0.02 * h || x.close < L - 0.02 * h;
      const outside = body.filter(isOut).length;
      if (outside / body.length > o.maxOutside) return;
      // Range gebroken als de koers nu (te lang of te ver) buiten de range staat: acceptatie, geen deviatie.
      const lastClose = c[c.length - 1].close;
      if (lastClose > H + o.maxDevDepth * h || lastClose < L - o.maxDevDepth * h) return;
      let run = 0;
      for (let i = c.length - 1; i > e && isOut(c[i]); i--) run++;
      if (run >= o.acceptBars) return;
      // Na de push moet de koers terugkomen naar de randen en door de mid gaan.
      const mid = (H + L) / 2;
      const touchHigh = after.filter((x) => x.high >= H - o.edgeZone * h).length;
      const touchLow = after.filter((x) => x.low <= L + o.edgeZone * h).length;
      let midCross = 0;
      for (let i = 1; i < after.length; i++) if ((after[i - 1].close - mid) * (after[i].close - mid) < 0) midCross++;
      const backToStart = kind === "push" ? touchLow : touchHigh;
      if (backToStart < 1 || midCross < 2) return;
      const below = after.filter((x) => x.close < mid).length / after.length;
      out.push({
        kind,
        low: L,
        high: H,
        mid,
        height: h,
        start: s,
        end: e,
        startTime: c[s].time,
        endTime: c[e].time,
        bars: after.length,
        touchesHigh: touchHigh,
        touchesLow: touchLow,
        midCrosses: midCross,
        distribution: { lower: below, upper: 1 - below }, // aandeel closes onder/boven de mid
        score: Math.min(after.length, 60) + 4 * Math.min(touchHigh + touchLow, 10) + 3 * Math.min(midCross, 8),
      });
    };

    for (const s of lows) for (const e of highs) tryPush(s, e, "push");
    for (const s of highs) for (const e of lows) tryPush(s, e, "dump");
    // Meest recente push eerst; bij gelijke eindcandle de best ontwikkelde.
    out.sort((x, y) => y.end - x.end || y.score - x.score);
    return out;
  }

  function findRange(c, opts) {
    return findRanges(c, opts)[0] || null;
  }

  // Setup in de laatste candles: deviatie → reclaim (→ retest). Geeft null als er niets te doen is.
  function findSignal(c, range, opts = {}) {
    if (!range) return null;
    const o = { ...DEFAULTS, ...opts };
    const n = c.length;
    const from = Math.max(range.end + 1, n - o.signalLookback);
    const best = [];
    for (const dir of ["long", "short"]) {
      const s = scanDir(c, range, dir, from, o);
      if (s) best.push(s);
    }
    best.sort((a, b) => b.reclaimIndex - a.reclaimIndex);
    return best[0] || null;
  }

  function scanDir(c, R, dir, from, o) {
    const n = c.length;
    const long = dir === "long";
    const edge = long ? R.low : R.high;
    const outside = (x) => (long ? x.close < edge : x.close > edge);
    const inside = (x) => (long ? x.close > edge : x.close < edge);
    // Zoek de laatste deviatie-reeks die gevolgd wordt door een reclaim.
    let dev = -1, rec = -1;
    for (let i = n - 1; i >= from; i--) {
      if (outside(c[i])) {
        // eerste candle na deze reeks die weer binnen sluit
        let j = i + 1;
        while (j < n && outside(c[j])) j++;
        if (j < n && inside(c[j])) {
          let k = i;
          while (k - 1 >= from && outside(c[k - 1])) k--;
          dev = k;
          rec = j;
        }
        break;
      }
    }
    if (rec < 0) return null;
    // Opnieuw buiten gesloten na de reclaim? Dan is deze setup ongeldig.
    for (let i = rec + 1; i < n; i++) if (outside(c[i])) return null;

    let extreme = long ? Infinity : -Infinity;
    for (let i = dev; i <= rec; i++) extreme = long ? Math.min(extreme, c[i].low) : Math.max(extreme, c[i].high);
    const depth = (long ? edge - extreme : extreme - edge) / R.height;
    const last = c[n - 1];
    const toMid = long ? R.mid - last.close : last.close - R.mid;
    let retest = -1;
    for (let i = rec + 1; i < n; i++) {
      const touched = long ? c[i].low <= edge + o.retestZone * R.height : c[i].high >= edge - o.retestZone * R.height;
      if (touched && inside(c[i])) retest = i;
    }
    const sl = long ? extreme - 0.03 * R.height : extreme + 0.03 * R.height;
    const entry = retest >= 0 ? last.close : edge;
    const tp1 = R.mid;
    const tp2 = long ? R.high : R.low;
    const rr1 = Math.abs(tp1 - entry) / Math.abs(entry - sl);
    const rr2 = Math.abs(tp2 - entry) / Math.abs(entry - sl);

    let status = retest >= 0 ? "trigger" : "reclaim";
    let reason = "";
    if (depth > o.maxDevDepth) {
      status = "untradeable";
      reason = "Deviatie te diep: je stop komt te ver van TP1.";
    } else if (toMid <= 0.1 * R.height) {
      status = "expired";
      reason = "De koers is al bij de mid (TP1): te laat om in te stappen.";
    } else if (rr1 < o.minRR) {
      status = "untradeable";
      reason = `R:R tot TP1 is maar ${rr1.toFixed(2)}.`;
    }
    return {
      direction: long ? "Long" : "Short",
      status,
      reason,
      deviationIndex: dev,
      reclaimIndex: rec,
      retestIndex: retest,
      deviationTime: c[dev].time,
      reclaimTime: c[rec].time,
      retestTime: retest >= 0 ? c[retest].time : null,
      depth,
      entry,
      stopLoss: sl,
      tp1,
      tp2,
      rr1,
      rr2,
    };
  }

  // Alles in één keer: range + setup.
  function analyze(c, opts) {
    const range = findRange(c, opts);
    return { range, signal: range ? findSignal(c, range, opts) : null };
  }

  // Wat gebeurde er na een setup? Eerst SL, of eerst TP1 (en daarna TP2)?
  function outcome(c, sig, fromIndex) {
    const long = sig.direction === "Long";
    let res = "open";
    for (let i = fromIndex + 1; i < c.length; i++) {
      const slHit = long ? c[i].low <= sig.stopLoss : c[i].high >= sig.stopLoss;
      const t1 = long ? c[i].high >= sig.tp1 : c[i].low <= sig.tp1;
      const t2 = long ? c[i].high >= sig.tp2 : c[i].low <= sig.tp2;
      if (res === "open") {
        if (slHit) return { result: "sl", time: c[i].time };
        if (t2) return { result: "tp2", time: c[i].time };
        if (t1) res = "tp1";
      } else if (res === "tp1") {
        // Na TP1 staat de stop op break-even (TP1 + BE) of loopt hij door naar TP2.
        if (long ? c[i].low <= sig.entry : c[i].high >= sig.entry) return { result: "tp1", time: c[i].time };
        if (t2) return { result: "tp2", time: c[i].time };
      }
    }
    return { result: res, time: null };
  }

  // Alle setups uit de geschiedenis: loop candle voor candle door de data, zoals de
  // Notifier het destijds live gezien zou hebben (geen kennis van de toekomst).
  function findHistory(c, opts = {}) {
    const start = Math.max(60, opts.from || 60);
    const byKey = new Map();
    for (let t = start; t < c.length; t++) {
      const w = c.slice(0, t + 1);
      const { range, signal } = analyze(w, opts);
      if (!range || !signal) continue;
      const key = `${signal.direction}|${signal.reclaimTime}`;
      const prev = byKey.get(key);
      // Bewaar de toestand op het beslissende moment: de eerste trigger, anders de reclaim.
      if (!prev || (prev.signal.status !== "trigger" && signal.status === "trigger")) {
        byKey.set(key, { range, signal: { ...signal }, atIndex: t, atTime: c[t].time });
      }
    }
    return [...byKey.values()]
      .map((h) => ({ ...h, outcome: outcome(c, h.signal, h.atIndex) }))
      .sort((a, b) => b.atTime - a.atTime);
  }

  // Een plan voor de toekomst: nog geen deviatie, wel een range. Entry op de rand,
  // stop voorbij een verwachte deviatie (15% van de range), TP1 = mid, TP2 = andere kant.
  function planSetup(range, direction, buffer = 0.15) {
    const long = direction === "Long";
    const h = range.high - range.low;
    const entry = long ? range.low : range.high;
    const stopLoss = long ? range.low - (buffer + 0.03) * h : range.high + (buffer + 0.03) * h;
    const tp1 = range.mid;
    const tp2 = long ? range.high : range.low;
    return {
      direction,
      status: "planned",
      reason: "",
      entry,
      stopLoss,
      tp1,
      tp2,
      rr1: Math.abs(tp1 - entry) / Math.abs(entry - stopLoss),
      rr2: Math.abs(tp2 - entry) / Math.abs(entry - stopLoss),
      depth: null,
      deviationTime: null,
      reclaimTime: null,
      retestTime: null,
    };
  }

  const api = { DEFAULTS, atr, pivots, findRanges, findRange, findSignal, analyze, outcome, findHistory, planSetup };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TD = root.TD || {};
    root.TD.rangeEngine = api;
  }
})(typeof window !== "undefined" ? window : null);
