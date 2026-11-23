// Je echte Kraken Futures-account (stap 2: alleen lezen), via de Mac-app.
// De API-key zit in de app-schil (versleuteld met de macOS-sleutelhanger); deze code ziet hem nooit.
window.TD = window.TD || {};
(function (TD) {
  const D = () => window.tdDesktop;
  const available = () => !!(D() && D().krakenStatus);
  let last = null;
  const listeners = new Set();

  const clean = (e) => new Error(String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
  async function call(fn, ...args) {
    if (!available()) throw new Error("Je Kraken-account koppelen kan alleen in de Mac-app (met de nieuwste .dmg).");
    try {
      return await D()[fn](...args);
    } catch (e) {
      throw clean(e);
    }
  }

  async function status() {
    return available() ? call("krakenStatus") : { connected: false };
  }
  async function connect(key, secret) {
    const r = await call("krakenConnect", key, secret);
    last = null;
    emit();
    return r;
  }
  async function disconnect() {
    const r = await call("krakenDisconnect");
    last = null;
    emit();
    return r;
  }

  // Het multi-collateral account ("flex") is de wallet voor de perpetuals (PF_…).
  function parse(data) {
    const a = (data && data.accounts) || {};
    const flex = a.flex || Object.values(a).find((x) => x && x.type === "multiCollateralMarginAccount");
    const n = (v) => (v === undefined || v === null || isNaN(+v) ? 0 : +v);
    if (!flex) return { hasFlex: false, balance: 0, equity: 0, available: 0, initialMargin: 0, unrealized: 0, currencies: {} };
    return {
      hasFlex: true,
      balance: n(flex.balanceValue), // saldo zonder open PnL
      equity: n(flex.portfolioValue), // inclusief open PnL
      available: n(flex.availableMargin),
      initialMargin: n(flex.initialMargin),
      unrealized: n(flex.totalUnrealized ?? flex.pnl),
      currencies: flex.currencies || {},
    };
  }

  async function summary(force) {
    if (!force && last && Date.now() - last.at < 30000) return last.data;
    const acc = await call("krakenRead", "accounts");
    let positions = [];
    try {
      positions = (await call("krakenRead", "openpositions")).openPositions || [];
    } catch {
      /* posities zijn extra; saldo is genoeg */
    }
    const data = { ...parse(acc), positions, at: Date.now() };
    last = { at: Date.now(), data };
    emit();
    return data;
  }
  const cached = () => (last ? last.data : null);

  // Startkapitaal zo kiezen dat je journal-saldo (start + gesloten PnL) gelijk is aan je Kraken-saldo.
  function alignedStart(krakenBalance) {
    const p = TD.store.computePortfolio();
    return Math.round((krakenBalance - p.netPnl) * 100) / 100;
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

  TD.krakenAccount = { available, status, connect, disconnect, summary, cached, parse, alignedStart, onChange };
})(window.TD);
