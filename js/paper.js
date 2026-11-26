// Papier-modus: gesimuleerd handelen op echte Kraken Futures-koersen (perpetuals).
// Per trade: entry (limit of markt) → stop loss + TP1 (50%) + TP2 (rest); na TP1 gaat de stop
// naar break-even. Fees: maker 0,02% (limit), taker 0,05% (markt/stop). Liquidatie wordt bewaakt.
// Als de trade dicht is, wordt je journal automatisch bijgewerkt (uitkomst, exit, PnL incl. fees).
(function (TD) {
  const S = TD.store;
  const K = TD.kraken;
  const KEY = "td.paper";
  const POLL_MS = 15000;
  let timer = null;
  let syncing = false;
  const listeners = new Set();

  // ---------- account ----------
  function account() {
    const a = S._load(KEY, null) || {};
    return { enabled: false, startBalance: 10000, balance: 10000, leverage: 3, plans: {}, createdAt: Date.now(), ...a, plans: a.plans || {} };
  }
  function saveAccount(a) {
    S._save(KEY, a);
    emit();
  }
  function setConfig(patch) {
    saveAccount({ ...account(), ...patch });
    restart();
  }
  function reset(startBalance) {
    const a = account();
    const open = Object.values(a.plans).filter((p) => p.status === "open" || p.status === "pending");
    if (open.length) throw new Error("Sluit of annuleer eerst je open papier-trades.");
    saveAccount({ ...a, startBalance, balance: startBalance, plans: {}, createdAt: Date.now() });
  }

  const usedMargin = (a) =>
    Object.values(a.plans)
      .filter((p) => p.status === "open" || p.status === "pending")
      .reduce((s, p) => s + (p.status === "open" ? (p.remaining * p.avgEntry) / p.leverage : p.margin), 0);

  // ---------- berekeningen ----------
  function liqPrice(side, entry, leverage, mm) {
    const d = 1 / leverage - mm;
    return side === "long" ? entry * (1 - d) : entry * (1 + d);
  }

  // Ordervoorstel voor een journal-trade. Geeft { plan, errors, warnings }.
  async function preview(trade, opts = {}) {
    const errors = [], warnings = [];
    const a = account();
    const symbol = K.toSymbol(trade.ticker);
    if (!symbol) return { errors: ["Papier-modus werkt met Kraken-perpetuals (bijv. KRAKEN:PF_XBTUSD)."] };
    let inst, tk;
    try {
      [inst, tk] = await Promise.all([K.instrument(symbol), K.ticker(symbol)]);
    } catch (e) {
      return { errors: [e.message] };
    }
    const side = trade.direction === "Short" ? "short" : "long";
    const entryType = opts.entryType || "limit";
    const leverage = Math.min(+opts.leverage || a.leverage || 3, Math.floor(1 / inst.initialMargin));
    const n = (v) => (v === null || v === undefined || v === "" || isNaN(+v) ? null : +v);
    let entry = entryType === "market" ? (side === "long" ? tk.ask : tk.bid) : n(trade.entry);
    const sl = n(trade.stopLoss), tp1 = n(trade.tp1), tp2 = n(trade.tp2);
    if (entry === null || sl === null) return { errors: ["Vul entry en stoploss in."] };
    entry = K.roundPrice(entry, inst.tickSize);
    if (side === "long" ? sl >= entry : sl <= entry) errors.push(`De stoploss ligt aan de verkeerde kant van de ${entryType === "market" ? "huidige prijs" : "entry"}.`);
    if (tp1 !== null && (side === "long" ? tp1 <= entry : tp1 >= entry)) errors.push("TP1 ligt aan de verkeerde kant van de entry.");
    if (entryType === "limit" && (side === "long" ? entry > tk.ask : entry < tk.bid))
      warnings.push(`Je limit-entry ligt ${side === "long" ? "boven" : "onder"} de huidige prijs (${tk.last}): hij wordt vrijwel direct gevuld.`);

    const riskAmount = a.balance * ((n(trade.riskPct) || 0) / 100);
    if (!(riskAmount > 0)) errors.push("Vul een risico-% in.");
    const dist = Math.abs(entry - sl);
    let size = dist ? K.roundSize(riskAmount / dist, inst.precision) : 0;
    if (size > inst.maxPositionSize) size = inst.maxPositionSize;
    if (!(size > 0)) errors.push(`De positie wordt te klein voor dit contract (minimaal ${1 / 10 ** inst.precision} ${inst.base}). Verhoog je risico-% of verklein de afstand tot je stop.`);
    const notional = size * entry;
    const margin = notional / leverage;
    const feeIn = notional * (entryType === "market" ? K.FEES.taker : K.FEES.maker);
    const available = a.balance - usedMargin(a);
    if (margin + feeIn > available) errors.push(`Te weinig vrije marge: nodig ${margin.toFixed(2)} USD, beschikbaar ${available.toFixed(2)} USD. Verhoog de leverage of verlaag je risico.`);
    const liq = liqPrice(side, entry, leverage, inst.maintenanceMargin);
    if (side === "long" ? liq >= sl : liq <= sl) errors.push(`Je liquidatieprijs (${liq.toFixed(4)}) ligt vóór je stoploss. Verlaag de leverage.`);
    if (tp2 === null) warnings.push("Geen TP2: na TP1 loopt de rest door tot break-even of tot je zelf sluit.");

    const plan = {
      id: "p" + Date.now().toString(36),
      tradeId: trade.id || null,
      symbol, side, entryType, leverage, size,
      entry, sl, tp1, tp2, tp1Share: tp1 !== null ? 0.5 : 0,
      notional, margin, liq, riskAmount, feeIn, liqMm: inst.maintenanceMargin,
      lossAtSl: size * dist + feeIn + size * sl * K.FEES.taker,
      last: tk.last,
    };
    return { plan, errors, warnings, inst, ticker: tk, available };
  }

  // Plaats de order (na bevestiging). Markt-orders worden direct gevuld.
  async function place(trade, opts) {
    const p = await preview(trade, opts);
    if (p.errors && p.errors.length) throw new Error(p.errors.join(" "));
    const a = account();
    const plan = {
      ...p.plan,
      tradeId: trade.id,
      status: "pending",
      createdAt: Math.floor(Date.now() / 1000),
      lastCandle: Math.floor(Date.now() / 60000) * 60 - 60,
      remaining: 0, avgEntry: null, slCurrent: p.plan.sl, tp1Done: false,
      realized: 0, fees: 0, events: [],
      lastPrice: p.ticker.last,
    };
    a.plans[plan.id] = plan;
    if (plan.entryType === "market") fill(a, plan, plan.entry, Math.floor(Date.now() / 1000), "taker");
    else event(plan, "order", plan.createdAt, plan.entry, plan.size, 0, 0, `Limit-order ${plan.side === "long" ? "koop" : "verkoop"} ${plan.size} @ ${plan.entry}`);
    saveAccount(a);
    notify(plan, plan.status === "open" ? "fill" : "order");
    restart();
    return plan;
  }

  // ---------- simulatie ----------
  function event(plan, type, t, price, size, fee, pnl, text) {
    plan.events.push({ type, t, price, size, fee, pnl, text });
  }
  function fill(a, plan, price, t, liq) {
    const fee = plan.size * price * K.FEES[liq];
    plan.status = "open";
    plan.avgEntry = price;
    plan.remaining = plan.size;
    plan.filledAt = t;
    plan.fees += fee;
    a.balance -= fee;
    plan.liq = liqPrice(plan.side, price, plan.leverage, plan.liqMm || 0.05);
    event(plan, "fill", t, price, plan.size, fee, -fee, `Entry gevuld: ${plan.size} @ ${price}`);
  }
  function reduce(a, plan, type, price, size, t, liq, text) {
    const dir = plan.side === "long" ? 1 : -1;
    const gross = size * (price - plan.avgEntry) * dir;
    const fee = size * price * K.FEES[liq];
    plan.remaining = +(plan.remaining - size).toFixed(10);
    plan.realized += gross;
    plan.fees += fee;
    a.balance += gross - fee;
    event(plan, type, t, price, size, fee, gross - fee, text);
  }

  // Eén candle (of prijspunt) verwerken. Volgorde bij twijfel: stop eerst (voorzichtig).
  function step(a, plan, c) {
    const long = plan.side === "long";
    const lo = c.low, hi = c.high;
    const hitDown = (p) => lo <= p, hitUp = (p) => hi >= p;
    if (plan.status === "pending") {
      if (long ? hitDown(plan.entry) : hitUp(plan.entry)) fill(a, plan, plan.entry, c.time, "maker");
      else return;
    }
    if (plan.status !== "open") return;
    // Liquidatie (zou nooit vóór de stop mogen gebeuren: dat controleert preview).
    if (long ? hitDown(plan.liq) && plan.liq > plan.slCurrent : hitUp(plan.liq) && plan.liq < plan.slCurrent) {
      reduce(a, plan, "liq", plan.liq, plan.remaining, c.time, "taker", "Geliquideerd");
      return close(a, plan, c.time, "liq");
    }
    if (long ? hitDown(plan.slCurrent) : hitUp(plan.slCurrent)) {
      const be = plan.tp1Done;
      reduce(a, plan, be ? "be" : "sl", plan.slCurrent, plan.remaining, c.time, "taker", be ? "Stop op break-even geraakt" : "Stop loss geraakt");
      return close(a, plan, c.time, be ? "be" : "sl");
    }
    if (plan.tp1 !== null && !plan.tp1Done && (long ? hitUp(plan.tp1) : hitDown(plan.tp1))) {
      const part = plan.tp2 !== null ? Math.min(plan.remaining, Math.round(plan.size * plan.tp1Share * 1e10) / 1e10) : Math.round(plan.size * 0.5 * 1e10) / 1e10;
      reduce(a, plan, "tp1", plan.tp1, part, c.time, "maker", `TP1 gevuld: ${part} @ ${plan.tp1}, stop naar break-even`);
      plan.tp1Done = true;
      plan.slCurrent = plan.avgEntry;
    }
    if (plan.tp2 !== null && plan.remaining > 0 && (long ? hitUp(plan.tp2) : hitDown(plan.tp2))) {
      reduce(a, plan, "tp2", plan.tp2, plan.remaining, c.time, "maker", `TP2 gevuld: rest @ ${plan.tp2}`);
      return close(a, plan, c.time, "tp2");
    }
  }

  function close(a, plan, t, reason) {
    plan.status = "closed";
    plan.closedAt = t;
    plan.closeReason = reason;
    finalizeJournal(plan);
    notify(plan, "closed");
  }

  // Journal bijwerken als de papier-trade dicht is.
  function finalizeJournal(plan) {
    const tr = plan.tradeId && S.getTrade(plan.tradeId);
    if (!tr || tr.status === "closed") return;
    const net = plan.realized - plan.fees;
    const tp1 = plan.events.some((e) => e.type === "tp1"), tp2 = plan.events.some((e) => e.type === "tp2");
    let outcome;
    if (plan.closeReason === "cancel") outcome = "Cancelled";
    else if (tp1 && tp2) outcome = "TP1 + TP2";
    else if (tp1) outcome = "TP1 + BE";
    else outcome = net >= 0 && plan.closeReason === "manual" ? "TP1 + BE" : "Stop Loss";
    const d = new Date((plan.closedAt || Date.now() / 1000) * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const note = { manual: "Handmatig gesloten in papier-modus.", liq: "Geliquideerd in papier-modus.", cancel: "Order geannuleerd vóór de fill." }[plan.closeReason];
    S.saveTrade({
      ...tr,
      status: "closed",
      outcome,
      exitDate: d.toISOString().slice(0, 16),
      pnl: Math.round(net * 100) / 100,
      fees: Math.round(plan.fees * 100) / 100,
      lesson: tr.lesson || (note ? note + " " : ""),
    });
    if (TD.closeSnap) TD.closeSnap.capture(tr.id); // marktbeeld na afloop vastleggen
  }

  // Handmatige acties
  async function closeMarket(planId) {
    const a = account();
    const plan = a.plans[planId];
    if (!plan || plan.status !== "open") throw new Error("Geen open positie.");
    const tk = await K.ticker(plan.symbol);
    const price = plan.side === "long" ? tk.bid : tk.ask;
    const t = Math.floor(Date.now() / 1000);
    reduce(a, plan, "close", price, plan.remaining, t, "taker", `Handmatig gesloten @ ${price}`);
    close(a, plan, t, "manual");
    saveAccount(a);
  }
  function cancel(planId) {
    const a = account();
    const plan = a.plans[planId];
    if (!plan || plan.status !== "pending") throw new Error("Geen openstaande order.");
    const t = Math.floor(Date.now() / 1000);
    plan.status = "cancelled";
    plan.closedAt = t;
    plan.closeReason = "cancel";
    event(plan, "cancel", t, null, 0, 0, 0, "Order geannuleerd");
    finalizeJournal(plan);
    saveAccount(a);
  }
  function stopToBreakEven(planId) {
    const a = account();
    const plan = a.plans[planId];
    if (!plan || plan.status !== "open") throw new Error("Geen open positie.");
    plan.slCurrent = plan.avgEntry;
    event(plan, "move", Math.floor(Date.now() / 1000), plan.avgEntry, 0, 0, 0, "Stop handmatig naar break-even");
    saveAccount(a);
  }

  // ---------- live bijhouden ----------
  // Een papier-order zonder open journal-trade (handmatig gesloten of verwijderd) stopt stil:
  // geen meldingen meer en de marge komt vrij. Het journal blijft zoals je het invulde.
  function orphaned(plan) {
    const tr = plan.tradeId && S.getTrade(plan.tradeId);
    return !tr || tr.status === "closed";
  }
  function retireOrphans(a) {
    let n = 0;
    const t = Math.floor(Date.now() / 1000);
    for (const plan of Object.values(a.plans)) {
      if ((plan.status !== "pending" && plan.status !== "open") || !orphaned(plan)) continue;
      if (plan.status === "open") {
        const price = plan.lastPrice || plan.avgEntry;
        reduce(a, plan, "close", price, plan.remaining, t, "taker", `Journal-trade gesloten of verwijderd: positie gesloten @ ${price}`);
        plan.status = "closed";
      } else {
        event(plan, "cancel", t, null, 0, 0, 0, "Journal-trade gesloten of verwijderd: order geannuleerd");
        plan.status = "cancelled";
      }
      plan.closedAt = t;
      plan.closeReason = "journal";
      n++;
    }
    return n;
  }

  // opts.planIds: alleen deze papier-orders bijwerken (bijv. "Vernieuwen" op één trade).
  let syncRun = null;
  async function sync(opts = {}) {
    if (syncing) return syncRun;
    syncRun = doSync(opts);
    return syncRun;
  }
  async function doSync(opts) {
    {
      const a = account();
      if (retireOrphans(a)) saveAccount(a);
    }
    const a0 = account();
    const active = Object.values(a0.plans).filter((p) => p.status === "pending" || p.status === "open");
    if (!active.length) return;
    syncing = true;
    try {
      const a = account();
      const nowMin = Math.floor(Date.now() / 60000) * 60;
      const bySym = {};
      for (const p of Object.values(a.plans))
        if ((p.status === "pending" || p.status === "open") && (!opts.planIds || opts.planIds.includes(p.id))) (bySym[p.symbol] ||= []).push(p);
      for (const [sym, plans] of Object.entries(bySym)) {
        const from = Math.min(...plans.map((p) => p.lastCandle)) - 60;
        let candles;
        try {
          candles = await K.candles1m(sym, from);
        } catch {
          continue;
        }
        for (const plan of plans) {
          const before = plan.events.length;
          // Alleen afgesloten minuten (de lopende minuut kan nog veranderen).
          for (const c of candles) {
            if (c.time <= plan.lastCandle || c.time >= nowMin) continue; // lopende minuut overslaan
            if (plan.status !== "pending" && plan.status !== "open") break;
            step(a, plan, c);
            plan.lastCandle = c.time;
          }
          // Daarnaast de actuele prijs, voor een snelle reactie.
          if (plan.status === "pending" || plan.status === "open") {
            try {
              const tk = await K.ticker(sym);
              plan.lastPrice = tk.last;
              step(a, plan, { time: Math.floor(Date.now() / 1000), high: tk.last, low: tk.last });
            } catch {
              /* volgende keer */
            }
          }
          for (const e of plan.events.slice(before)) if (["fill", "tp1", "tp2", "sl", "be", "liq"].includes(e.type)) notifyEvent(plan, e);
        }
      }
      saveAccount(a);
    } finally {
      syncing = false;
    }
  }

  // ---------- meldingen ----------
  const sym = (plan) => {
    const tr = plan.tradeId && S.getTrade(plan.tradeId);
    return tr ? TD.util.shortSym(tr.ticker) : plan.symbol;
  };
  function notifyEvent(plan, e) {
    if (!TD.inbox) return;
    const label = { fill: "Entry gevuld", tp1: "TP1 gevuld · stop naar BE", tp2: "TP2 gevuld", sl: "Stop loss geraakt", be: "Break-even geraakt", liq: "Geliquideerd" }[e.type];
    const kind = { fill: "fill", tp1: "tp", tp2: "tp", sl: "sl", be: "be", liq: "sl" }[e.type];
    TD.inbox.add({
      key: `paper|${plan.id}|${e.type}`,
      kind,
      title: `${sym(plan)} ${plan.side === "long" ? "Long" : "Short"} – ${label} (papier)`,
      body: `${e.text}${e.pnl ? ` · ${e.pnl >= 0 ? "+" : ""}${e.pnl.toFixed(2)} USD` : ""} · Kraken ${plan.symbol}`,
      link: plan.tradeId ? `#/trades/${plan.tradeId}` : "#/instellingen",
      tradeId: plan.tradeId,
    });
  }
  function notify(plan, what) {
    if (!TD.inbox) return;
    if (what === "order")
      TD.inbox.add({ key: `paper|${plan.id}|order`, kind: "fill", silent: true, title: `${sym(plan)} – limit-order geplaatst (papier)`, body: `${plan.side === "long" ? "Koop" : "Verkoop"} ${plan.size} ${plan.symbol} @ ${plan.entry} · SL ${plan.sl}${plan.tp1 !== null ? ` · TP1 ${plan.tp1}` : ""}${plan.tp2 !== null ? ` · TP2 ${plan.tp2}` : ""}`, link: plan.tradeId ? `#/trades/${plan.tradeId}` : "#/instellingen", tradeId: plan.tradeId });
    if (what === "fill") notifyEvent(plan, plan.events[plan.events.length - 1]);
    if (what === "closed") {
      const net = plan.realized - plan.fees;
      TD.inbox.add({ key: `paper|${plan.id}|closed`, kind: net >= 0 ? "tp" : "sl", title: `${sym(plan)} – trade gesloten (papier)`, body: `Resultaat ${net >= 0 ? "+" : ""}${net.toFixed(2)} USD incl. ${plan.fees.toFixed(2)} USD fees. Je journal is bijgewerkt: vul nog ‘Plan gevolgd?’ en je les in.`, link: plan.tradeId ? `#/trades/${plan.tradeId}` : "#/instellingen", tradeId: plan.tradeId });
    }
  }

  // ---------- helpers voor de UI ----------
  function planForTrade(tradeId) {
    return Object.values(account().plans).find((p) => p.tradeId === tradeId) || null;
  }
  function unrealized(plan, price) {
    if (!plan || plan.status !== "open" || !(price > 0)) return 0;
    return plan.remaining * (price - plan.avgEntry) * (plan.side === "long" ? 1 : -1);
  }
  function summary() {
    const a = account();
    const plans = Object.values(a.plans);
    const open = plans.filter((p) => p.status === "open");
    const unreal = open.reduce((s, p) => s + unrealized(p, p.lastPrice), 0);
    return {
      enabled: a.enabled, balance: a.balance, startBalance: a.startBalance, leverage: a.leverage,
      equity: a.balance + unreal, unrealized: unreal, usedMargin: usedMargin(a), available: a.balance - usedMargin(a),
      open: open.length, pending: plans.filter((p) => p.status === "pending").length, closed: plans.filter((p) => p.status === "closed").length,
    };
  }

  function restart() {
    clearInterval(timer);
    timer = null;
    const a = account();
    if (!a.enabled) return;
    if (Object.values(a.plans).some((p) => p.status === "pending" || p.status === "open")) timer = setInterval(sync, POLL_MS);
  }
  function start() {
    restart();
    setTimeout(sync, 3000);
    document.addEventListener("visibilitychange", () => !document.hidden && sync());
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function emit() {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        /* negeren */
      }
    }
  }

  TD.paper = { orphaned, retireOrphans, account, setConfig, reset, preview, place, sync, step, liqPrice, closeMarket, cancel, stopToBreakEven, planForTrade, unrealized, summary, start, onChange };
})(window.TD);
