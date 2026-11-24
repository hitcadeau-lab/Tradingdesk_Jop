// Opslag (localStorage), trade-model en alle berekeningen voor het portfolio.
// Berekeningen volgen het TradingWizard Journal (Excel): oplopend saldo, R-multiple,
// winrate op basis van uitkomst, expectancy, profit factor, drawdown en plan adherence.
window.TD = window.TD || {};

(function (TD) {
  const KEYS = {
    trades: "td.trades",
    settings: "td.settings",
    watchlist: "td.watchlist",
    school: "td.school",
  };

  // Opslag-backend: in de Mac-app een JSON-bestand (via window.tdDesktop),
  // in de browser localStorage.
  const desktop = window.tdDesktop || null;
  let desktopStore = null;
  let desktopInfo = null;
  let saveTimer = null;
  if (desktop) {
    try {
      const r = desktop.load();
      desktopStore = (r && r.store) || {};
      desktopInfo = r && r.info;
    } catch {
      desktopStore = {};
    }
    // Bij afsluiten direct wegschrijven wat nog in de wachtrij staat.
    window.addEventListener("beforeunload", () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        desktop.saveSync(desktopStore);
      }
    });
  }

  function load(key, fallback) {
    if (desktopStore) {
      return Object.prototype.hasOwnProperty.call(desktopStore, key) ? JSON.parse(JSON.stringify(desktopStore[key])) : fallback;
    }
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function save(key, value) {
    if (desktopStore) {
      desktopStore[key] = JSON.parse(JSON.stringify(value));
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        desktop.save(desktopStore).catch((e) => alert("Opslaan in het databestand is mislukt: " + e.message));
      }, 250);
      return true;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      alert(
        "Opslaan is niet gelukt: de opslag van je browser is vol of geblokkeerd.\n" +
          "Maak een back-up (Portfolio → Exporteren) en verwijder grote afbeeldingen."
      );
      return false;
    }
  }

  // ---------- Vaste keuzelijsten (uit Excel + PDF) ----------
  const OPTIONS = {
    direction: ["Long", "Short"],
    tradeType: ["Scalp trade", "Day trade", "Swing trade"],
    setup: ["Reversal", "Continuation", "Breakout", "Reclaim"],
    outcome: ["Stop Loss", "TP1 + BE", "TP1 + TP2", "Cancelled"],
    followedPlan: ["Yes", "Partial", "No"],
    market: { crypto: "Crypto", stock: "Aandelen" },
    // Uit Range Trading 101: de range waarop je trade is leading.
    rangeTf: ["1D", "4H", "1H", "15m", "5m"],
    trigger: [
      "Deviatie + reclaim + retest",
      "Swing failure (kleine wick)",
      "Mid flip / retest",
      "Breakout + retest",
      "Trendlijn binnen range",
      "Anders",
    ],
  };

  // Mid range = 50%-niveau (Fib 0 / 0,5 / 1).
  function rangeMid(trade) {
    const h = num(trade.rangeHigh), l = num(trade.rangeLow);
    return h === null || l === null ? null : (h + l) / 2;
  }

  // Trade Entry Checklist uit de PDF. `good` = antwoorden die de check "groen" maken.
  const CHECKLIST = [
    {
      key: "emotion",
      q: "In welke emotionele staat ben ik nu?",
      hint: "Anger, Neutral, Happy",
      type: "select",
      options: ["Neutral", "Happy", "Anger", "Anders"],
      good: ["Neutral"],
    },
    {
      key: "influenced",
      q: "Is dit beïnvloed door iemand anders?",
      hint: "Signal group, Friend, Influencer",
      type: "select",
      options: ["Nee, eigen analyse", "Signal group", "Friend", "Influencer"],
      good: ["Nee, eigen analyse"],
    },
    {
      key: "aplus",
      q: "Zijn al mijn triggers duidelijk om het een A+ setup te noemen?",
      type: "select",
      options: ["Ja, A+ setup", "Twijfel", "Nee"],
      good: ["Ja, A+ setup"],
    },
    {
      key: "trend",
      q: "In welke trend zit de huidige marktstructuur?",
      hint: "Downtrend, Sideways, Uptrend",
      type: "select",
      options: ["Downtrend", "Sideways", "Uptrend"],
      good: ["Downtrend", "Sideways", "Uptrend"],
    },
    {
      key: "risk",
      q: "Volg ik mijn risk management regels?",
      hint: "R:R, limit orders gezet, SL gezet",
      type: "multi",
      options: ["R:R klopt", "Limit orders gezet", "SL gezet"],
    },
    {
      key: "share",
      q: "Kan ik dit delen met mijn accountability partner?",
      type: "select",
      options: ["Ja", "Nee"],
      good: ["Ja"],
    },
    {
      key: "desk",
      q: "Neem ik de trade achter mijn bureau of buiten in een haast?",
      type: "select",
      options: ["Achter mijn bureau", "Onderweg / in een haast"],
      good: ["Achter mijn bureau"],
    },
    {
      key: "news",
      q: "Zijn er nieuwsevents?",
      hint: "FOMC, CPI, NFP",
      type: "select",
      options: ["Geen", "FOMC", "CPI", "NFP", "Ander nieuws"],
      good: ["Geen"],
    },
  ];

  // Een check is "groen" als het antwoord in `good` staat (bij multi: alle drie aangevinkt).
  function checkPassed(item, answer) {
    if (!answer) return false;
    if (item.type === "multi") {
      return Array.isArray(answer.values) && item.options.every((o) => answer.values.includes(o));
    }
    return item.good.includes(answer.value);
  }

  function checklistScore(trade) {
    const cl = trade.checklist || {};
    let passed = 0;
    let answered = 0;
    for (const item of CHECKLIST) {
      const a = cl[item.key];
      if (a && (a.value || (a.values && a.values.length))) answered++;
      if (checkPassed(item, a)) passed++;
    }
    return { passed, answered, total: CHECKLIST.length };
  }

  // ---------- Settings ----------
  function getSettings() {
    const s = load(KEYS.settings, {});
    return { startingCapital: 1000, currency: "$", defaultRisk: 1, ...s };
  }
  function setSettings(patch) {
    save(KEYS.settings, { ...getSettings(), ...patch });
  }

  // ---------- Trades ----------
  function uid() {
    return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function getTrades() {
    const t = load(KEYS.trades, []);
    return Array.isArray(t) ? t : [];
  }
  function getTrade(id) {
    return getTrades().find((t) => t.id === id) || null;
  }
  function saveTrade(trade) {
    const trades = getTrades();
    const now = new Date().toISOString();
    if (!trade.id) {
      trade.id = uid();
      trade.createdAt = now;
      trades.push(trade);
    } else {
      const i = trades.findIndex((t) => t.id === trade.id);
      if (i === -1) trades.push(trade);
      else trades[i] = trade;
    }
    trade.updatedAt = now;
    return save(KEYS.trades, trades) ? trade : null;
  }
  function deleteTrade(id) {
    save(
      KEYS.trades,
      getTrades().filter((t) => t.id !== id)
    );
  }

  // ---------- Berekeningen per trade ----------
  const num = (v) => (v === "" || v === null || v === undefined || isNaN(+v) ? null : +v);

  // R van een target: (TP - entry) / (entry - SL). Werkt voor long én short.
  function rOf(trade, price) {
    const e = num(trade.entry);
    const sl = num(trade.stopLoss);
    const p = num(price);
    if (e === null || sl === null || p === null || e === sl) return null;
    return (p - e) / (e - sl);
  }

  function targets(trade) {
    return ["tp1", "tp2", "tp3"]
      .map((k, i) => ({ key: k, label: "TP" + (i + 1), price: num(trade[k]), r: rOf(trade, trade[k]) }))
      .filter((t) => t.price !== null);
  }

  // Totale R/R = R tot het verste ingevulde target.
  function totalRR(trade) {
    const t = targets(trade);
    return t.length ? t[t.length - 1].r : null;
  }

  function timeInTrade(trade) {
    if (!trade.entryDate || !trade.exitDate) return null;
    const ms = new Date(trade.exitDate) - new Date(trade.entryDate);
    if (isNaN(ms) || ms < 0) return null;
    const h = Math.floor(ms / 3600000);
    const d = Math.floor(h / 24);
    const m = Math.round((ms % 3600000) / 60000);
    if (d > 0) return `${d}d ${h % 24}u`;
    if (h > 0) return `${h}u ${m}m`;
    return `${m}m`;
  }

  // Voorgestelde PnL op basis van uitkomst (aanname: 50% sluit op TP1, rest op BE of TP2).
  function suggestedPnl(trade, riskAmount) {
    const r1 = rOf(trade, trade.tp1);
    const r2 = rOf(trade, trade.tp2);
    switch (trade.outcome) {
      case "Stop Loss":
        return -riskAmount;
      case "TP1 + BE":
        return r1 === null ? null : riskAmount * 0.5 * r1;
      case "TP1 + TP2":
        return r1 === null || r2 === null ? null : riskAmount * (0.5 * r1 + 0.5 * r2);
      case "Cancelled":
        return 0;
      default:
        return null;
    }
  }

  function isClosed(t) {
    return t.status === "closed";
  }
  function sortKey(t) {
    return t.exitDate || t.entryDate || t.createdAt || "";
  }

  // ---------- Portfolio (zelfde logica als het Journal + Dashboard) ----------
  function computePortfolio() {
    const settings = getSettings();
    const start = +settings.startingCapital || 0;
    const trades = getTrades();
    const closed = trades.filter(isClosed).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    let balance = start;
    let peak = start;
    let maxDD = 0;
    const rows = new Map(); // id -> {startBalance, endBalance, returnPct, r}
    const curve = [{ n: 0, balance: start, label: "Start" }];

    for (const t of closed) {
      const pnl = num(t.pnl);
      const startBal = balance;
      if (pnl !== null && t.outcome !== "Cancelled") balance += pnl;
      const risk = num(t.riskPct);
      const r = pnl !== null && risk ? pnl / (startBal * (risk / 100)) : null;
      peak = Math.max(peak, balance);
      const dd = peak ? (balance - peak) / peak : 0;
      maxDD = Math.min(maxDD, dd);
      rows.set(t.id, {
        startBalance: startBal,
        endBalance: balance,
        returnPct: pnl !== null && startBal ? pnl / startBal : null,
        r,
        drawdown: dd,
      });
      if (t.outcome !== "Cancelled") curve.push({ n: curve.length, balance, label: t.ticker, id: t.id });
    }

    const taken = closed.filter((t) => t.outcome !== "Cancelled");
    const wins = taken.filter((t) => t.outcome === "TP1 + TP2" || t.outcome === "TP1 + BE");
    const losses = taken.filter((t) => t.outcome === "Stop Loss");
    const pnls = taken.map((t) => num(t.pnl)).filter((v) => v !== null);
    const pos = pnls.filter((v) => v > 0);
    const neg = pnls.filter((v) => v < 0);
    const rs = taken.map((t) => rows.get(t.id).r).filter((v) => v !== null);
    const plan = taken.filter((t) => t.followedPlan);
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const avg = (a) => (a.length ? sum(a) / a.length : 0);

    // Per pair
    const byPair = {};
    for (const t of taken) {
      const p = (byPair[t.ticker] ||= { ticker: t.ticker, trades: 0, wins: 0, losses: 0, pnl: 0 });
      p.trades++;
      if (wins.includes(t)) p.wins++;
      if (losses.includes(t)) p.losses++;
      p.pnl += num(t.pnl) || 0;
    }

    const open = trades.filter((t) => t.status === "open");

    return {
      settings,
      startingCapital: start,
      balance,
      netPnl: balance - start,
      totalReturn: start ? (balance - start) / start : 0,
      taken: taken.length,
      wins: wins.length,
      losses: losses.length,
      winRate: wins.length + losses.length ? wins.length / (wins.length + losses.length) : 0,
      expectancy: avg(rs),
      profitFactor: neg.length ? sum(pos) / Math.abs(sum(neg)) : pos.length ? Infinity : 0,
      avgWin: avg(pos),
      avgLoss: avg(neg),
      maxDrawdown: maxDD,
      best: pnls.length ? Math.max(...pnls) : 0,
      worst: pnls.length ? Math.min(...pnls) : 0,
      planAdherence: plan.length ? plan.filter((t) => t.followedPlan === "Yes").length / plan.length : 0,
      byPair: Object.values(byPair).sort((a, b) => b.pnl - a.pnl),
      rows,
      curve,
      open,
      openRisk: open.reduce((s, t) => s + balance * ((num(t.riskPct) || 0) / 100), 0),
    };
  }

  // Risicobedrag voor een (nieuwe of open) trade = huidig saldo × risico%.
  function riskAmount(trade, portfolio) {
    const p = portfolio || computePortfolio();
    const row = p.rows.get(trade.id);
    const base = row ? row.startBalance : p.balance;
    return base * ((num(trade.riskPct) || 0) / 100);
  }

  function positionSize(trade, portfolio) {
    const e = num(trade.entry);
    const sl = num(trade.stopLoss);
    if (e === null || sl === null || e === sl) return null;
    return riskAmount(trade, portfolio) / Math.abs(e - sl);
  }

  // ---------- Watchlist ----------
  // Standaard: alle markten via Kraken Futures (zie js/markets.js).
  const DEFAULT_WATCHLIST = TD.markets ? TD.markets.defaultWatchlist() : [];

  function getWatchlist() {
    let w = load(KEYS.watchlist, null);
    if (!Array.isArray(w)) {
      // Neem de watchlist van de eerste versie van de app over (alleen aandelen).
      const old = load("tradingdesk.watchlist", null);
      w = DEFAULT_WATCHLIST.slice();
      if (Array.isArray(old)) {
        for (const s of old) if (!w.some((x) => x.symbol === s)) w.push({ symbol: s, market: "stock" });
      }
      save(KEYS.watchlist, w);
    }
    return w;
  }
  function setWatchlist(w) {
    save(KEYS.watchlist, w);
  }

  // ---------- Leerschool voortgang ----------
  function getSchool() {
    return { answered: 0, correct: 0, streak: 0, best: 0, byCat: {}, ...load(KEYS.school, {}) };
  }
  function recordAnswer(cat, correct) {
    const s = getSchool();
    s.answered++;
    if (correct) {
      s.correct++;
      s.streak++;
      s.best = Math.max(s.best, s.streak);
    } else s.streak = 0;
    const c = (s.byCat[cat] ||= { answered: 0, correct: 0 });
    c.answered++;
    if (correct) c.correct++;
    save(KEYS.school, s);
    return s;
  }
  function resetSchool() {
    save(KEYS.school, {});
  }

  // ---------- Export / import ----------
  function exportJSON() {
    return JSON.stringify(
      {
        app: "Tradingdesk",
        version: 2,
        exportedAt: new Date().toISOString(),
        settings: getSettings(),
        trades: getTrades(),
        watchlist: getWatchlist(),
        notifier: load("td.notifier", null),
        advice: load("td.advice", []),
        inbox: load("td.inbox", []),
        alerts: load("td.alerts", null),
        tradeHits: load("td.tradeHits", {}),
      },
      null,
      2
    );
  }

  function importJSON(text) {
    const d = JSON.parse(text);
    if (!d || !Array.isArray(d.trades)) throw new Error("Geen geldig Tradingdesk back-upbestand.");
    save(KEYS.trades, d.trades);
    if (d.settings) save(KEYS.settings, d.settings);
    if (Array.isArray(d.watchlist)) save(KEYS.watchlist, d.watchlist);
    if (d.notifier) save("td.notifier", d.notifier);
    if (Array.isArray(d.advice)) save("td.advice", d.advice);
    if (Array.isArray(d.inbox)) save("td.inbox", d.inbox);
    if (d.alerts) save("td.alerts", d.alerts);
    if (d.tradeHits) save("td.tradeHits", d.tradeHits);
    return d.trades.length;
  }

  // CSV in de kolomvolgorde van het Journal-tabblad, zodat je het in Excel kunt plakken.
  function exportCSV() {
    const p = computePortfolio();
    const head = [
      "#", "Date", "Pair", "Direction", "Setup / Range", "Outcome", "Followed Plan?", "Risk %",
      "Start Balance", "PnL ($)", "End Balance", "Return %", "R Multiple", "Lesson / Key Takeaway",
      "Chart — Range", "Chart — Trigger", "Trade type", "Entry", "Stoploss", "TP1", "TP2", "TP3",
      "Checklist", "Status", "Range TF", "Range High", "Range Low", "Mid", "Trigger",
    ];
    const trades = getTrades().slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const esc = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [head.map(esc).join(",")];
    trades.forEach((t, i) => {
      const row = p.rows.get(t.id) || {};
      const sc = checklistScore(t);
      lines.push(
        [
          i + 1, (t.entryDate || "").slice(0, 10), t.ticker, t.direction, t.setup, t.outcome || "",
          t.followedPlan || "", t.riskPct ? t.riskPct / 100 : "", row.startBalance ?? "", t.pnl ?? "",
          row.endBalance ?? "", row.returnPct ?? "", row.r ?? "", t.lesson || "", t.chartRange || "",
          t.chartTrigger || "", t.tradeType || "", t.entry ?? "", t.stopLoss ?? "", t.tp1 ?? "",
          t.tp2 ?? "", t.tp3 ?? "", `${sc.passed}/${sc.total}`, t.status,
          t.rangeTf || "", t.rangeHigh ?? "", t.rangeLow ?? "", rangeMid(t) ?? "", t.trigger || "",
        ]
          .map(esc)
          .join(",")
      );
    });
    return lines.join("\n");
  }

  TD.store = {
    OPTIONS, CHECKLIST, checkPassed, checklistScore,
    getSettings, setSettings,
    getTrades, getTrade, saveTrade, deleteTrade,
    rOf, targets, totalRR, rangeMid, timeInTrade, suggestedPnl, riskAmount, positionSize,
    computePortfolio,
    getWatchlist, setWatchlist,
    getSchool, recordAnswer, resetSchool,
    exportJSON, importJSON, exportCSV,
    num,
    desktop,
    desktopInfo: () => desktopInfo,
    // Voor andere modules (Notifier) die hun eigen sleutels in dezelfde opslag bewaren.
    _load: load,
    _save: save,
  };
})(window.TD);
