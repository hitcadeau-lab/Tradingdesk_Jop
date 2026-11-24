// Markten: alles loopt via Kraken Futures (perpetuals). Tickers hebben de vorm
// "KRAKEN:PF_XBTUSD". Hier staan de vaste watchlist, de korte namen, het bijbehorende
// TradingView-symbool (voor de grote grafiek) en de omzetting van oude tickers.
window.TD = window.TD || {};
(function (TD) {
  // tv: symbool voor de TradingView-grafiek (null = geen beursnotering, alleen Kraken-data).
  const LIST = [
    { sym: "PF_XBTUSD", name: "BTC", label: "Bitcoin", market: "crypto", tv: "KRAKEN:BTCUSD" },
    { sym: "PF_ETHUSD", name: "ETH", label: "Ether", market: "crypto", tv: "KRAKEN:ETHUSD" },
    { sym: "PF_SOLUSD", name: "SOL", label: "Solana", market: "crypto", tv: "KRAKEN:SOLUSD" },
    { sym: "PF_AMZNXUSD", name: "AMZNx", label: "Amazon", market: "stock", tv: "NASDAQ:AMZN" },
    { sym: "PF_AAPLXUSD", name: "AAPLx", label: "Apple", market: "stock", tv: "NASDAQ:AAPL" },
    { sym: "PF_ANTXUSD", name: "ANTx", label: "Anthropic (pre-IPO)", market: "stock", tv: null, preIpo: true },
    { sym: "PF_NVDAXUSD", name: "NVDAx", label: "Nvidia", market: "stock", tv: "NASDAQ:NVDA" },
    { sym: "PF_QQQXUSD", name: "QQQx", label: "Invesco Nasdaq 100 ETF", market: "stock", tv: "NASDAQ:QQQ" },
    { sym: "PF_GOOGLXUSD", name: "GOOGLx", label: "Alphabet (Google)", market: "stock", tv: "NASDAQ:GOOGL" },
    { sym: "PF_METAXUSD", name: "METAx", label: "Meta", market: "stock", tv: "NASDAQ:META" },
    { sym: "PF_GLDXUSD", name: "GLDx", label: "Goud (SPDR Gold ETF)", market: "stock", tv: "AMEX:GLD" },
    { sym: "PF_TSLAXUSD", name: "TSLAx", label: "Tesla", market: "stock", tv: "NASDAQ:TSLA" },
  ];
  const BY_SYM = new Map(LIST.map((m) => [m.sym, m]));
  const ALIAS = { BTC: "XBT" };
  const UNALIAS = { XBT: "BTC" };

  const ticker = (sym) => "KRAKEN:" + sym;
  const isKraken = (t) => /^KRAKEN:PF_[A-Z0-9]+$/.test(String(t || "").toUpperCase());
  const symOf = (t) => (isKraken(t) ? String(t).toUpperCase().slice(7) : null);
  function info(t) {
    const s = symOf(t);
    return s ? BY_SYM.get(s) || null : null;
  }
  // Korte naam: "KRAKEN:PF_XBTUSD" → "BTC", "KRAKEN:PF_AMZNXUSD" → "AMZNx".
  function short(t) {
    const m = info(t);
    if (m) return m.name;
    const s = symOf(t);
    if (!s) return null;
    const base = s.slice(3).replace(/USD$/, "");
    return UNALIAS[base] || base;
  }
  // TradingView-symbool voor de grote grafiek (null = niet beschikbaar).
  function tvSymbol(t) {
    if (!isKraken(t)) return t;
    const m = info(t);
    if (m) return m.tv;
    return "KRAKEN:" + short(t) + "USD";
  }

  // Oude tickers omzetten naar Kraken: "BINANCE:SOLUSDT" → "KRAKEN:PF_SOLUSD",
  // "NASDAQ:AAPL" → "KRAKEN:PF_AAPLXUSD" (als die in de lijst staat). Anders ongewijzigd.
  function canonical(t) {
    const u = String(t || "").toUpperCase();
    if (isKraken(u)) return u;
    const stock = LIST.find((m) => m.tv && m.market === "stock" && (m.tv === u || m.tv.split(":")[1] === u.split(":").pop()));
    if (stock && !/USDT?$|USDC$/.test(u)) return ticker(stock.sym);
    const src = TD.marketData && TD.marketData.source(u);
    if (src && src.type === "binance") {
      const mm = src.id.match(/^([A-Z0-9]+?)(USDT|USDC|USD|BUSD|FDUSD)$/);
      if (mm) return ticker(`PF_${ALIAS[mm[1]] || mm[1]}USD`);
    }
    return u;
  }

  // Invoer van de gebruiker ("XRP", "TSLA", "AMZNx", "BINANCE:XRPUSDT", "PF_XRPUSD") omzetten
  // naar een bestaande Kraken-perpetual. Geeft { symbol, market } of gooit een fout.
  async function resolve(input) {
    const raw = String(input || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!raw) throw new Error("Vul een pair in.");
    const cands = [];
    if (isKraken(raw)) cands.push(symOf(raw));
    else if (/^PF_/.test(raw)) cands.push(raw);
    else {
      const c = canonical(raw);
      if (isKraken(c)) cands.push(symOf(c));
      const base = raw.split(":").pop().replace(/(USDT|USDC|USD|PERP)$/, "") || raw;
      cands.push(`PF_${ALIAS[base] || base}USD`, `PF_${base.replace(/X$/, "")}XUSD`);
    }
    let list;
    try {
      list = await TD.kraken.instruments();
    } catch (e) {
      throw new Error("Kraken is niet bereikbaar: " + e.message);
    }
    for (const s of cands) {
      const i = list.get(s);
      if (i) return { symbol: ticker(s), market: String(i.base || "").endsWith("x") ? "stock" : "crypto" };
    }
    throw new Error(`${raw} staat niet als perpetual op Kraken Futures.`);
  }

  const defaultWatchlist = () => LIST.map((m) => ({ symbol: ticker(m.sym), market: m.market }));

  // Eenmalig (versie 1.8): watchlist en Notifier naar Kraken. Oude trades blijven ongewijzigd.
  function migrate() {
    const S = TD.store;
    if (!S) return false;
    // Opnieuw als er (bijv. na het terugzetten van een oude back-up) weer niet-Kraken-pairs in de watchlist staan.
    const wl = S._load("td.watchlist", null);
    const stale = Array.isArray(wl) && wl.some((w) => !isKraken(w.symbol));
    if (S._load("td.migr.kraken", false) && !stale) return addTf15(S);
    S.setWatchlist(defaultWatchlist());
    // Notifier: alle markten volgen. Timeframes die je al had (bijv. 15m op SOL) blijven staan.
    const cfg = S._load("td.notifier", null) || {};
    const map = new Map(LIST.map((m) => [ticker(m.sym), { symbol: ticker(m.sym), tfs: ["15m", "1h", "4h"] }]));
    for (const p of cfg.pairs || []) {
      const e = map.get(canonical(p.symbol));
      if (e && Array.isArray(p.tfs) && p.tfs.length) e.tfs = [...new Set([...e.tfs, ...p.tfs])].sort((a, b) => ["15m", "1h", "4h"].indexOf(a) - ["15m", "1h", "4h"].indexOf(b));
    }
    S._save("td.notifier", { ...cfg, pairs: [...map.values()] });
    // Lopende meldingen van oude (niet-Kraken) pairs worden niet meer gescand: laten vervallen.
    const sigs = S._load("td.signals", []);
    if (Array.isArray(sigs) && sigs.length) {
      for (const g of sigs) if (!isKraken(g.symbol) && ["reclaim", "accepted", "trigger"].includes(g.status)) g.status = "invalid";
      S._save("td.signals", sigs);
    }
    S._save("td.migr.kraken", true);
    S._save("td.migr.kraken15", true);
    return true;
  }

  // Eenmalig: 15m erbij voor alle vaste markten in de Notifier (naast 1H en 4H).
  function addTf15(S) {
    if (S._load("td.migr.kraken15", false)) return false;
    const cfg = S._load("td.notifier", null) || {};
    const pairs = Array.isArray(cfg.pairs) ? cfg.pairs : [];
    const order = ["15m", "1h", "4h"];
    for (const m of LIST) {
      const t = ticker(m.sym);
      const p = pairs.find((x) => x.symbol === t);
      if (p) p.tfs = [...new Set(["15m", ...(p.tfs || [])])].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      else pairs.push({ symbol: t, tfs: order.slice() });
    }
    S._save("td.notifier", { ...cfg, pairs });
    S._save("td.migr.kraken15", true);
    return true;
  }

  TD.markets = { LIST, ticker, isKraken, symOf, info, short, tvSymbol, canonical, resolve, defaultWatchlist, migrate };
})(window.TD);
