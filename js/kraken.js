// Kraken Futures (openbare marktdata): contracten, koersen en 1-minuut-candles.
// Gebruikt TD.net, omdat de browser Kraken niet rechtstreeks mag lezen.
(function (TD) {
  const BASE = "https://futures.kraken.com";
  const FEES = { maker: 0.0002, taker: 0.0005 }; // standaard tarieven (0,02% / 0,05%)
  // EU-retail (MiFID II): max 10x, onderhoudsmarge 5% (eerste staffel).
  const EU_RETAIL = { initialMargin: 0.1, maintenanceMargin: 0.05 };
  let instCache = null, instAt = 0;
  let tickCache = null, tickAt = 0;

  const ALIAS = { BTC: "XBT" };

  // "BINANCE:BTCUSDT" → "PF_XBTUSD" (perpetual in USD). Null als het geen crypto-pair is.
  function toSymbol(ticker) {
    const src = TD.marketData.source(ticker);
    if (!src || src.type !== "binance") return null;
    const m = src.id.match(/^([A-Z0-9]+?)(USDT|USDC|USD|BUSD|FDUSD)$/);
    if (!m) return null;
    return `PF_${ALIAS[m[1]] || m[1]}USD`;
  }

  async function instruments() {
    if (instCache && Date.now() - instAt < 3600000) return instCache;
    const d = await TD.net.json(`${BASE}/derivatives/api/v3/instruments`);
    instCache = new Map((d.instruments || []).filter((i) => String(i.symbol).startsWith("PF_")).map((i) => [i.symbol, i]));
    instAt = Date.now();
    return instCache;
  }

  async function instrument(symbol) {
    const i = (await instruments()).get(symbol);
    if (!i) throw new Error(`${symbol} bestaat niet als perpetual op Kraken Futures.`);
    if (!i.tradeable || i.suspended) throw new Error(`${symbol} is op dit moment niet verhandelbaar op Kraken.`);
    const eu = i.marginSchedules && i.marginSchedules.europa && i.marginSchedules.europa.retail && i.marginSchedules.europa.retail[0];
    return {
      symbol,
      tickSize: +i.tickSize,
      precision: +i.contractValueTradePrecision,
      maxPositionSize: +i.maxPositionSize,
      initialMargin: eu ? +eu.initialMargin : EU_RETAIL.initialMargin,
      maintenanceMargin: eu ? +eu.maintenanceMargin : EU_RETAIL.maintenanceMargin,
      base: i.base,
    };
  }

  async function tickers() {
    if (tickCache && Date.now() - tickAt < 5000) return tickCache;
    const d = await TD.net.json(`${BASE}/derivatives/api/v3/tickers`);
    tickCache = new Map((d.tickers || []).map((t) => [t.symbol, t]));
    tickAt = Date.now();
    return tickCache;
  }

  async function ticker(symbol) {
    const t = (await tickers()).get(symbol);
    if (!t) throw new Error(`Geen koers voor ${symbol}.`);
    return { last: +t.last, mark: +t.markPrice, bid: +t.bid, ask: +t.ask, funding: +t.fundingRate };
  }

  // 1-minuut-candles vanaf `fromSec` (Kraken geeft er maximaal ~2000 per keer).
  async function candles1m(symbol, fromSec) {
    const d = await TD.net.json(`${BASE}/api/charts/v1/trade/${symbol}/1m?from=${Math.floor(fromSec)}`);
    return (d.candles || []).map((c) => ({ time: Math.floor(c.time / 1000), open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
  }

  // Afronden op de stapgrootte van het contract.
  const roundSize = (size, precision) => Math.floor(size * 10 ** precision + 1e-9) / 10 ** precision;
  const roundPrice = (p, tick) => Math.round(p / tick) * tick;

  TD.kraken = { toSymbol, instruments, instrument, tickers, ticker, candles1m, roundSize, roundPrice, FEES };
})(window.TD);
