// Koersdata (candles) voor de Notifier en de range-grafiek.
//  - Crypto: Kraken Futures (de perpetual waarop je handelt, bijv. PF_XBTUSD) in de Mac-app en
//    de preview. Bestaat het pair niet op Kraken, of kan de omgeving Kraken niet lezen
//    (gewone browser, oude app-schil), dan Binance (openbare marktdata, geen key).
//  - Aandelen: Yahoo Finance. Alleen in de Mac-app (de browser blokkeert die bron).
(function (TD) {
  const CRYPTO_EXCHANGES = ["BINANCE", "BYBIT", "COINBASE", "KRAKEN", "OKX", "BITGET", "MEXC", "KUCOIN", "GATEIO", "BITSTAMP", "CRYPTO"];
  const YAHOO_SUFFIX = { EURONEXT: ".AS", AMS: ".AS", XETR: ".DE", FWB: ".F", LSE: ".L", SIX: ".SW", TSX: ".TO", MIL: ".MI", BME: ".MC", EPA: ".PA", EBR: ".BR" };
  const TF = {
    "15m": { binance: "15m", yahoo: "15m", yahooRange: "30d", label: "15m", seconds: 900 },
    "1h": { binance: "1h", yahoo: "60m", yahooRange: "60d", label: "1H", seconds: 3600 },
    "4h": { binance: "4h", yahoo: "60m", yahooRange: "200d", label: "4H", seconds: 14400, aggregate: 4 },
  };
  const KRAKEN_RES = { "15m": "15m", "1h": "1h", "4h": "4h" };
  let krakenDownUntil = 0; // na een fout 10 minuten niet opnieuw proberen
  const BINANCE_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];
  const cache = new Map();

  // "BINANCE:BTCUSDT" → { type: "binance", id: "BTCUSDT" }, "NASDAQ:AAPL" → { type: "yahoo", id: "AAPL" }
  function source(symbol) {
    const s = String(symbol || "").toUpperCase();
    // Kraken Futures-perpetual: "KRAKEN:PF_XBTUSD"
    if (/^KRAKEN:PF_[A-Z0-9]+$/.test(s)) return { type: "kraken", id: s.slice(7), label: "Kraken Futures" };
    const [ex, raw] = s.includes(":") ? s.split(":") : ["", s];
    if (CRYPTO_EXCHANGES.includes(ex) || (!ex && /(USDT|USDC|BUSD|FDUSD)$/.test(raw))) {
      let id = raw.replace(/[-/_]/g, "").replace(/\.P$|PERP$/, "");
      if (/USD$/.test(id)) id += "T"; // COINBASE:BTCUSD → BTCUSDT
      return { type: "binance", id, label: "Binance" };
    }
    if (!raw) return null;
    return { type: "yahoo", id: raw + (YAHOO_SUFFIX[ex] || ""), label: "Yahoo Finance" };
  }

  function stocksAvailable() {
    return !!(TD.net && TD.net.canProxy());
  }

  async function binance(id, tf, limit) {
    let lastErr;
    for (const host of BINANCE_HOSTS) {
      try {
        const res = await fetch(`${host}/api/v3/klines?symbol=${encodeURIComponent(id)}&interval=${TF[tf].binance}&limit=${limit}`);
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) throw new Error(data && data.msg ? data.msg : `HTTP ${res.status}`);
        return data.map((k) => ({ time: k[0] / 1000, open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
      } catch (e) {
        lastErr = e;
      }
    }
    // Een onbekend pair geeft bij Binance een fout zonder CORS-header ("Failed to fetch"),
    // net als offline zijn. Daarom één duidelijke melding voor beide.
    throw new Error(
      /Invalid symbol/i.test(lastErr && lastErr.message)
        ? `${id} bestaat niet op Binance.`
        : `Geen koersdata voor ${id} bij Binance. Bestaat dit pair op Binance, en ben je online?`
    );
  }

  // Welk Kraken-contract hoort bij dit crypto-pair, als Kraken bruikbaar is? (anders null)
  async function krakenSymbol(symbol) {
    if (!TD.kraken || !TD.net || !TD.net.canProxy() || Date.now() < krakenDownUntil) return null;
    const ks = TD.kraken.toSymbol(symbol);
    if (!ks) return null;
    try {
      const list = await TD.kraken.instruments();
      return list.has(ks) ? ks : null;
    } catch {
      krakenDownUntil = Date.now() + 600000;
      return null;
    }
  }

  async function kraken(ks, tf, limit) {
    const conf = TF[tf];
    const to = Math.floor(Date.now() / 1000);
    const from = to - Math.ceil(limit * 1.05 + 2) * conf.seconds;
    const d = await TD.net.json(`https://futures.kraken.com/api/charts/v1/trade/${ks}/${KRAKEN_RES[tf]}?from=${from}&to=${to}`);
    const out = (d.candles || []).map((c) => ({ time: Math.floor(c.time / 1000), open: +c.open, high: +c.high, low: +c.low, close: +c.close, volume: +c.volume || 0 }));
    if (!out.length) throw new Error(`Geen koersdata voor ${ks} bij Kraken.`);
    return out.slice(-limit);
  }

  // Welke bron wordt nu echt gebruikt voor dit symbool? (voor labels in de app)
  const lastFeed = new Map();
  function feedLabel(symbol) {
    const src = source(symbol);
    if (!src) return "—";
    return lastFeed.get(String(symbol).toUpperCase()) || src.label;
  }

  async function yahoo(id, tf, limit) {
    if (!stocksAvailable())
      throw new Error(window.tdDesktop ? "Voor aandelen-data heb je de nieuwste app-versie nodig: installeer de nieuwste .dmg." : "Aandelen-data werkt alleen in de Mac-app.");
    const conf = TF[tf];
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(id)}?interval=${conf.yahoo}&range=${conf.yahooRange}`;
    const data = await TD.net.json(url);
    const r = data && data.chart && data.chart.result && data.chart.result[0];
    if (!r || !r.timestamp) throw new Error(`Geen koersdata voor ${id} bij Yahoo Finance.`);
    const q = r.indicators.quote[0];
    let candles = r.timestamp
      .map((t, i) => ({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] || 0 }))
      .filter((c) => c.open != null && c.high != null && c.low != null && c.close != null);
    if (conf.aggregate) candles = aggregate(candles, conf.seconds);
    return candles.slice(-limit);
  }

  // 1-uurs candles samenvoegen tot 4-uurs candles (per blok van 4 uur, UTC).
  function aggregate(candles, seconds) {
    const out = [];
    for (const c of candles) {
      const bucket = Math.floor(c.time / seconds) * seconds;
      const last = out[out.length - 1];
      if (last && last.time === bucket) {
        last.high = Math.max(last.high, c.high);
        last.low = Math.min(last.low, c.low);
        last.close = c.close;
        last.volume += c.volume;
      } else out.push({ ...c, time: bucket });
    }
    return out;
  }

  async function candles(symbol, tf, limit = 300) {
    if (!TF[tf]) throw new Error("Onbekend timeframe: " + tf);
    const src = source(symbol);
    if (!src) throw new Error("Onbekend ticker: " + symbol);
    const key = `${String(symbol).toUpperCase()}:${tf}:${limit}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 60000) return hit.data;
    let data;
    if (src.type === "kraken") {
      if (!TD.net || !TD.net.canProxy())
        throw new Error("Kraken-koersen werken in de Mac-app en in de preview (de browser mag Kraken niet zelf lezen).");
      data = await kraken(src.id, tf, limit);
      lastFeed.set(String(symbol).toUpperCase(), `Kraken Futures (${src.id})`);
    } else if (src.type === "binance") {
      const ks = await krakenSymbol(symbol);
      if (ks) {
        try {
          data = await kraken(ks, tf, limit);
          lastFeed.set(String(symbol).toUpperCase(), `Kraken Futures (${ks})`);
        } catch {
          krakenDownUntil = Date.now() + 600000;
        }
      }
      if (!data) {
        data = await binance(src.id, tf, limit);
        lastFeed.set(String(symbol).toUpperCase(), "Binance");
      }
    } else data = await yahoo(src.id, tf, limit);
    cache.set(key, { at: Date.now(), data });
    return data;
  }

  TD.marketData = { source, candles, stocksAvailable, feedLabel, TF, aggregate };
})(window.TD);
