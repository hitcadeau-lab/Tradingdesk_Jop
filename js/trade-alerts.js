// Trade-meldingen: houdt open trades in de gaten en meldt als de koers een TP, de stop loss
// of (na TP1) de entry (break-even) raakt. Gebruikt 15m-candles sinds de entry.
(function (TD) {
  const S = TD.store;
  const I = TD.inbox;
  const { shortSym, price } = TD.util;
  const KEY = "td.tradeHits"; // { tradeId: { tp1: ts, tp2: ts, tp3: ts, sl: ts, be: ts } }
  let timer = null;
  let running = false;
  let lastRun = null;

  const hitsAll = () => S._load(KEY, {}) || {};
  function hitsFor(id) {
    return hitsAll()[id] || {};
  }

  const n = (v) => (v === null || v === undefined || v === "" || isNaN(+v) ? null : +v);

  // Welke levels zijn geraakt in deze candles? (op volgorde; stopt na SL of de laatste TP)
  function detect(trade, candles, known) {
    const long = trade.direction !== "Short";
    const entry = n(trade.entry), sl = n(trade.stopLoss);
    if (entry === null || sl === null || entry === sl) return [];
    const tps = [["tp1", trade.tp1], ["tp2", trade.tp2], ["tp3", trade.tp3]].filter(([, v]) => n(v) !== null).map(([k, v]) => [k, n(v)]);
    const since = new Date(trade.entryDate || trade.createdAt || 0).getTime() / 1000;
    const done = { ...known };
    const found = [];
    const reached = (c, p) => (long ? c.high >= p : c.low <= p);
    const against = (c, p) => (long ? c.low <= p : c.high >= p);
    for (const c of candles) {
      if (c.time + 900 <= since) continue; // candle eindigde vóór de entry
      if (done.sl || done.be || (tps.length && done[tps[tps.length - 1][0]])) break;
      // Stop loss eerst controleren: bij twijfel binnen één candle is dat het voorzichtigste.
      if (!done.sl && !done.be && against(c, sl)) {
        done.sl = c.time;
        found.push({ level: "sl", time: c.time, price: sl });
        break;
      }
      for (const [k, p] of tps) {
        if (!done[k] && reached(c, p)) {
          done[k] = c.time;
          found.push({ level: k, time: c.time, price: p });
        }
      }
      // Na TP1 terug naar de entry = break-even (passend bij TP1 + BE).
      if (done.tp1 && !done.be && c.time > done.tp1 && against(c, entry)) {
        done.be = c.time;
        found.push({ level: "be", time: c.time, price: entry });
      }
    }
    return found;
  }

  const R = (trade, p) => (p - n(trade.entry)) / (n(trade.entry) - n(trade.stopLoss));
  function message(trade, h) {
    const sym = shortSym(trade.ticker);
    const label = { tp1: "TP1 geraakt", tp2: "TP2 geraakt", tp3: "TP3 geraakt", sl: "Stop loss geraakt", be: "Terug op entry (break-even)" }[h.level];
    const r = h.level === "be" ? 0 : h.level === "sl" ? -1 : R(trade, h.price);
    const when = new Date(h.time * 1000).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return {
      key: `trade|${trade.id}|${h.level}`,
      kind: h.level === "sl" ? "sl" : h.level === "be" ? "be" : "tp",
      title: `${sym} ${trade.direction} – ${label}`,
      body: `${label} op ${price(h.price)} (${r >= 0 ? "+" : ""}${r.toFixed(2)}R) · candle van ${when}${
        h.level === "sl" ? " · sluit je trade af in je journal" : h.level === "tp1" ? " · zet je stop op break-even" : ""
      }`,
      link: `#/trades/${trade.id}`,
      tradeId: trade.id,
    };
  }

  async function check() {
    if (running || !I.getConfig().trades) return;
    running = true;
    try {
      const open = S.getTrades().filter((t) => t.status === "open" && !t.broker && TD.marketData.source(t.ticker)); // papier-trades meldt de papier-engine zelf
      const all = hitsAll();
      let changed = false;
      for (const t of open) {
        try {
          const candles = await TD.marketData.candles(t.ticker, "15m", 300);
          const found = detect(t, candles, all[t.id] || {});
          for (const h of found) {
            all[t.id] = { ...(all[t.id] || {}), [h.level]: h.time };
            changed = true;
            I.add(message(t, h));
          }
        } catch {
          /* geen data voor dit pair: volgende keer opnieuw */
        }
      }
      if (changed) S._save(KEY, all);
      lastRun = Date.now();
    } finally {
      running = false;
    }
  }

  function start() {
    clearInterval(timer);
    const ms = Math.max(1, I.getConfig().intervalMin || 2) * 60000;
    timer = setInterval(check, ms);
    setTimeout(check, 4000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && (!lastRun || Date.now() - lastRun > 60000)) check();
    });
  }

  // Link naar het sluitformulier, vooraf ingevuld op basis van wat er geraakt is.
  function closeLink(trade) {
    const h = hitsFor(trade.id);
    const base = `#/trades/${trade.id}/edit?close=1`;
    let outcome = null, at = null, why = "";
    if (h.sl) [outcome, at, why] = ["Stop Loss", h.sl, "stop loss geraakt"];
    else if (h.tp2 || h.tp3) [outcome, at, why] = ["TP1 + TP2", h.tp2 || h.tp3, h.tp3 && !h.tp2 ? "TP3 geraakt" : "TP1 en TP2 geraakt"];
    else if (h.be) [outcome, at, why] = ["TP1 + BE", h.be, "TP1 geraakt en daarna terug op entry"];
    else if (h.tp1) [outcome, at, why] = ["TP1 + BE", h.tp1, "TP1 geraakt (rest nog open: kies zelf als het anders liep)"];
    if (!outcome) return base;
    const d = new Date(at * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const q = new URLSearchParams({ outcome, exitDate: d.toISOString().slice(0, 16), autopnl: "1", from: "alerts", why });
    return `${base}&${q}`;
  }

  TD.tradeAlerts = { start, check, detect, hitsFor, closeLink, lastRun: () => lastRun };
})(window.TD);
