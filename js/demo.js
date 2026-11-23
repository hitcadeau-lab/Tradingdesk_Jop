// Voorbeelddata voor de preview: oefentrades op echte koersen van de afgelopen dagen,
// zo gekozen dat er echt TP's, een stop loss en break-even geraakt zijn, plus een setup.
// Alles krijgt demo: true en is met één klik weer te verwijderen.
(function (TD) {
  const S = TD.store;
  const PAIRS = ["BINANCE:BTCUSDT", "BINANCE:ETHUSDT", "BINANCE:SOLUSDT", "BINANCE:XRPUSDT", "BINANCE:BNBUSDT"];
  const isPreview = () => !window.tdDesktop && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  const localISO = (sec) => {
    const d = new Date(sec * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const round = (v) => +(+v).toPrecision(6);

  const CHECKS = {
    emotion: { value: "Neutral" }, influenced: { value: "Nee, eigen analyse" }, aplus: { value: "Ja, A+ setup" },
    trend: { value: "Sideways" }, risk: { values: ["R:R klopt", "Limit orders gezet", "SL gezet"] },
    share: { value: "Ja" }, desk: { value: "Achter mijn bureau" }, news: { value: "Geen" },
  };

  // Zoek levels in echte candles die precies de gewenste afloop geven.
  function build(candles, want) {
    const D = TD.tradeAlerts.detect;
    const n = candles.length;
    for (const back of [280, 240, 200, 160, 120, 80]) {
      const i0 = n - back;
      if (i0 < 1) continue;
      const entry = candles[i0].close;
      const after = candles.slice(i0 + 1);
      const hi = Math.max(...after.map((c) => c.high)), lo = Math.min(...after.map((c) => c.low));
      for (const dir of ["Long", "Short"]) {
        const fav = dir === "Long" ? hi - entry : entry - lo; // gunstige beweging
        const adv = dir === "Long" ? entry - lo : hi - entry; // ongunstige beweging
        const s = dir === "Long" ? 1 : -1;
        const tries = [];
        if (want === "tp2" && fav > 0) for (const k of [0.3, 0.4, 0.5]) tries.push({ tp1: entry + s * k * fav, tp2: entry + s * 2 * k * fav, sl: entry - s * 0.6 * k * fav });
        if (want === "sl" && adv > 0) for (const k of [0.4, 0.6, 0.8]) tries.push({ sl: entry - s * k * adv, tp1: entry + s * 3 * k * adv, tp2: entry + s * 5 * k * adv });
        // TP1 rond 2–3R (realistisch); pas als dat niet lukt een ruimere stop.
        if (want === "be" && fav > 0) {
          for (const k of [0.25, 0.35, 0.5, 0.7]) for (const rr of [2, 3, 1.5]) tries.push({ tp1: entry + s * k * fav, tp2: entry + s * 3 * fav, sl: entry - s * (k * fav) / rr });
        }
        if (want === "open") tries.push({ tp1: entry + s * (fav + adv + 1e-9) * 1.5, tp2: entry + s * (fav + adv) * 2.5, sl: entry - s * (fav + adv) * 1.5 });
        for (const lv of tries) {
          const t = { id: "probe", direction: dir, entry, stopLoss: lv.sl, tp1: lv.tp1, tp2: lv.tp2, entryDate: new Date(candles[i0].time * 1000).toISOString() };
          const got = D(t, candles.slice(i0), {}).map((h) => h.level).join(",");
          const ok = { tp2: got === "tp1,tp2", sl: got === "sl", be: got === "tp1,be", open: got === "" }[want];
          const r1 = Math.abs(lv.tp1 - entry) / Math.abs(entry - lv.sl);
          if (ok && (want === "open" || r1 >= 1)) return { direction: dir, entry, stopLoss: lv.sl, tp1: lv.tp1, tp2: lv.tp2, i0 };
        }
      }
    }
    return null;
  }

  async function load() {
    const wants = ["tp2", "sl", "be", "open"];
    const made = [];
    const balance = S.computePortfolio().balance;
    // Eerst alle koersen ophalen, dan per afloop een ander pair kiezen (meer variatie).
    const data = [];
    for (const sym of PAIRS) {
      try {
        data.push({ sym, candles: await TD.marketData.candles(sym, "15m", 300), used: 0 });
      } catch {
        /* pair overslaan */
      }
    }
    for (const w of wants) {
      let pick = null;
      for (const d of [...data].sort((a, b) => a.used - b.used)) {
        const lv = build(d.candles, w);
        if (lv) {
          pick = { d, lv };
          break;
        }
      }
      if (!pick) continue;
      pick.d.used++;
      const { sym, candles } = pick.d;
      const lv = pick.lv;
      {
        const lo = Math.min(lv.stopLoss, lv.tp2), hi = Math.max(lv.stopLoss, lv.tp2);
        const trade = {
          demo: true,
          ticker: sym,
          market: "crypto",
          direction: lv.direction,
          tradeType: "Day trade",
          setup: "Reclaim",
          trigger: "Deviatie + reclaim + retest",
          rangeTf: "15m",
          rangeHigh: round(lv.direction === "Long" ? lv.tp2 : lv.entry),
          rangeLow: round(lv.direction === "Long" ? lv.entry : lv.tp2),
          entryDate: localISO(candles[lv.i0].time),
          entry: round(lv.entry),
          stopLoss: round(lv.stopLoss),
          tp1: round(lv.tp1),
          tp2: round(lv.tp2),
          riskPct: 1,
          status: "open",
          checklist: CHECKS,
          rangeNotes: `Oefentrade (voorbeelddata): ${{ tp2: "TP1 en TP2 geraakt", sl: "stop loss geraakt", be: "TP1 en daarna break-even", open: "nog niets geraakt" }[w]}.`,
        };
        trade.plan = { placedAt: new Date(candles[lv.i0].time * 1000).toISOString(), riskAmount: balance * 0.01, currency: S.getSettings().currency,
          direction: trade.direction, entry: trade.entry, stopLoss: trade.stopLoss, tp1: trade.tp1, tp2: trade.tp2, tp3: null,
          rangeHigh: trade.rangeHigh, rangeLow: trade.rangeLow, rangeTf: "15m", trigger: trade.trigger, setup: trade.setup, riskPct: 1 };
        trade.snapshot = { tf: "15m", takenAt: trade.plan.placedAt, candles: candles.slice(Math.max(0, lv.i0 - 149), lv.i0 + 1).map((c) => [c.time, c.open, c.high, c.low, c.close]) };
        if (lo < hi) made.push(S.saveTrade(trade));
      }
    }

    // Een echte historische setup als Notifier-melding.
    try {
      const sym = "BINANCE:SOLUSDT", tf = "1h";
      const candles = await TD.marketData.candles(sym, tf, 300);
      const h = TD.rangeEngine.findHistory(candles).find((x) => ["trigger", "reclaim"].includes(x.signal.status));
      if (h) {
        const g = h.signal, R = h.range;
        const id = `${sym}|${tf}|${g.direction}|${g.reclaimTime}|demo`;
        const list = (S._load("td.signals", []) || []).filter((x) => x.id !== id);
        const sig = {
          id, demo: true, symbol: sym, tf, direction: g.direction, status: g.status, reason: g.reason,
          range: { low: R.low, high: R.high, mid: R.mid, kind: R.kind, startTime: R.startTime, endTime: R.endTime, distribution: R.distribution },
          entry: g.entry, stopLoss: g.stopLoss, tp1: g.tp1, tp2: g.tp2, rr1: g.rr1, rr2: g.rr2, depth: g.depth,
          deviationTime: g.deviationTime, reclaimTime: g.reclaimTime, retestTime: g.retestTime,
          detectedAt: h.atTime * 1000, updatedAt: Date.now(), seen: false,
        };
        list.unshift(sig);
        S._save("td.signals", list);
        TD.inbox.add({
          key: `setup|${id}`, kind: "setup", demo: true, silent: true,
          title: `${TD.notifier.title(sig)} (voorbeeld)`,
          body: `${TD.notifier.describe(sig)} TP1 (mid) ${TD.util.price(sig.tp1)} · R:R ${sig.rr1.toFixed(1)}`,
          link: "#/notifier/" + encodeURIComponent(id),
        });
      }
    } catch {
      /* geen setup-voorbeeld: niet erg */
    }

    await TD.tradeAlerts.check(); // de echte detectie maakt de TP/SL/BE-meldingen
    return made.length;
  }

  function clear() {
    const ids = new Set(S.getTrades().filter((t) => t.demo).map((t) => t.id));
    ids.forEach((id) => S.deleteTrade(id));
    S._save("td.signals", (S._load("td.signals", []) || []).filter((x) => !x.demo));
    const hits = S._load("td.tradeHits", {}) || {};
    ids.forEach((id) => delete hits[id]);
    S._save("td.tradeHits", hits);
    TD.inbox.all().filter((n) => n.demo || ids.has(n.tradeId)).forEach((n) => TD.inbox.remove(n.id));
    return ids.size;
  }

  const hasDemo = () => S.getTrades().some((t) => t.demo);

  TD.demo = { isPreview, load, clear, hasDemo };
})(window.TD);
