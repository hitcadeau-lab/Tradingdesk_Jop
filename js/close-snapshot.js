// Marktbeeld na afloop: als een trade gesloten is, bewaren we de candles van vlak vóór de
// entry tot na de exit, en tekenen we waar de entry gevuld werd en welke levels geraakt zijn.
window.TD = window.TD || {};
(function (TD) {
  const S = TD.store;
  const SNAP_TF = { "15m": "15m", "1H": "1h", "4H": "4h" };
  const BEFORE = 20, AFTER = 20; // candles vóór de entry en na de exit
  const busy = new Set();

  const secs = (d) => {
    const t = d ? new Date(d).getTime() : NaN;
    return isNaN(t) ? null : Math.floor(t / 1000);
  };
  const tfFor = (t) => (t.snapshot && t.snapshot.tf) || SNAP_TF[t.rangeTf] || "1h";
  const tfSec = (tf) => (TD.marketData.TF[tf] || {}).seconds || 3600;

  // Index van de candle waarin moment ts valt.
  function idxOf(c, ts) {
    let k = -1;
    for (let i = 0; i < c.length; i++) {
      if (c[i].time > ts) break;
      k = i;
    }
    return k;
  }

  // Moet het marktbeeld (opnieuw) worden vastgelegd? Ja als het er niet is, of als er nog
  // weinig candles ná de exit in staan en die er nu wel kunnen zijn.
  function needsCapture(t) {
    if (t.status !== "closed" || t.outcome === "Cancelled" || !TD.marketData.source(t.ticker)) return false;
    const cs = t.closeSnapshot;
    if (!cs) return true;
    const exitT = secs(t.exitDate);
    if (!exitT) return false;
    const after = cs.candles.filter((c) => c[0] > exitT).length;
    return after < AFTER && Date.now() / 1000 < exitT + (AFTER + 5) * tfSec(cs.tf) && Date.now() - new Date(cs.takenAt).getTime() > tfSec(cs.tf) * 1000;
  }

  async function capture(tradeOrId) {
    const id = typeof tradeOrId === "string" ? tradeOrId : tradeOrId && tradeOrId.id;
    const t = id && S.getTrade(id);
    if (!t || busy.has(id) || t.status !== "closed") return null;
    busy.add(id);
    try {
      const tf = tfFor(t);
      const candles = await TD.marketData.candles(t.ticker, tf, 300, { fresh: true });
      const entryT = secs(t.entryDate), exitT = secs(t.exitDate) || Math.floor(Date.now() / 1000);
      if (!entryT || !candles.length) return null;
      const iE = idxOf(candles, entryT), iX = idxOf(candles, exitT);
      if (iX < 0) return null; // exit valt vóór de geladen koersdata: te lang geleden
      const from = Math.max(0, (iE < 0 ? 0 : iE) - BEFORE);
      const to = Math.min(candles.length, iX + 1 + AFTER);
      const snap = {
        tf,
        takenAt: new Date().toISOString(),
        partial: iE < 0, // entry viel buiten de beschikbare data
        candles: candles.slice(from, to).map((c) => [c.time, c.open, c.high, c.low, c.close]),
      };
      const fresh = S.getTrade(id);
      if (!fresh || fresh.status !== "closed") return null;
      S.saveTrade({ ...fresh, closeSnapshot: snap });
      return snap;
    } catch {
      return null; // geen data: volgende keer opnieuw
    } finally {
      busy.delete(id);
    }
  }

  // Wat er gebeurde, op volgorde: entry, TP's, stop, break-even, exit.
  // Papier-trades: de echte gebeurtenissen van de papier-engine. Andere trades: de geraakte levels.
  function events(t) {
    const out = [];
    const plan = t.broker && TD.paper ? TD.paper.planForTrade(t.id) : null;
    if (plan && plan.events && plan.events.length) {
      const L = { fill: "Entry", tp1: "TP1", tp2: "TP2", sl: "Stop", be: "Break-even", close: "Gesloten", liq: "Liquidatie" };
      for (const e of plan.events) if (L[e.type]) out.push({ kind: e.type, time: e.t, price: e.price, label: L[e.type], pnl: e.pnl });
    } else {
      const entryT = secs(t.entryDate);
      if (entryT) out.push({ kind: "fill", time: entryT, price: +t.entry, label: "Entry" });
      const h = TD.tradeAlerts ? TD.tradeAlerts.hitsFor(t.id) : {};
      const price = { tp1: +t.tp1, tp2: +t.tp2, tp3: +t.tp3, sl: +t.stopLoss, be: +t.entry };
      const L = { tp1: "TP1", tp2: "TP2", tp3: "TP3", sl: "Stop", be: "Break-even" };
      for (const k of Object.keys(L)) if (h[k]) out.push({ kind: k, time: h[k], price: price[k], label: L[k] });
      const exitT = secs(t.exitDate);
      if (exitT) out.push({ kind: "close", time: exitT, price: null, label: "Exit" });
    }
    // Op tijd; bij gelijke tijd de exit als laatste.
    return out.sort((a, b) => a.time - b.time || (a.kind === "close") - (b.kind === "close"));
  }

  TD.closeSnap = { capture, needsCapture, events, idxOf, secs };
})(window.TD);
