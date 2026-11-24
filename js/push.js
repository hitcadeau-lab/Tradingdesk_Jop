// Mobiele meldingen via ntfy (https://ntfy.sh): elke melding uit het meldingen-centrum kan
// ook als pushmelding naar je telefoon. Je abonneert je in de ntfy-app op een geheim kanaal.
// Alleen de tekst van de melding gaat mee: geen saldo, geen keys.
window.TD = window.TD || {};
(function (TD) {
  const S = TD.store;
  const KEY = "td.push";
  const DEFAULTS = {
    enabled: false,
    server: "https://ntfy.sh",
    topic: "",
    kinds: { trigger: true, wait: false, trade: true, fill: true },
    tfs: { "15m": true, "1h": true, "4h": true },
  };

  function getConfig() {
    const c = S._load(KEY, null) || {};
    return { ...DEFAULTS, ...c, kinds: { ...DEFAULTS.kinds, ...(c.kinds || {}) }, tfs: { ...DEFAULTS.tfs, ...(c.tfs || {}) } };
  }
  function setConfig(patch) {
    S._save(KEY, { ...getConfig(), ...patch });
  }

  // Een lange, willekeurige kanaalnaam: die werkt als wachtwoord.
  function newTopic() {
    const abc = "abcdefghijkmnopqrstuvwxyz23456789";
    const r = new Uint32Array(22);
    crypto.getRandomValues(r);
    return "tradingdesk-" + [...r].map((x) => abc[x % abc.length]).join("");
  }

  // Link die de melding op je telefoon opent: de markt bij Kraken Pro.
  function krakenLink(ticker) {
    const short = TD.markets && TD.markets.short(ticker);
    return short ? `https://pro.kraken.com/app/trade/futures-${short.toLowerCase()}-usd-perp` : "https://pro.kraken.com/app/trade";
  }

  // Wil je deze melding op je telefoon?
  function wanted(n, c) {
    if (n.kind === "setup") {
      if (n.tf && c.tfs[n.tf] === false) return false;
      return n.status === "trigger" ? c.kinds.trigger : c.kinds.wait;
    }
    if (n.kind === "fill") return c.kinds.fill;
    if (["tp", "sl", "be"].includes(n.kind)) return c.kinds.trade;
    return false;
  }

  const TAGS = { setup: ["bell"], tp: ["white_check_mark"], sl: ["x"], be: ["heavy_equals_sign"], fill: ["inbox_tray"] };

  async function publish(c, msg) {
    const res = await fetch(c.server.replace(/\/+$/, "") + "/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: c.topic, ...msg }),
    });
    if (!res.ok) throw new Error(`ntfy gaf een fout (${res.status}).`);
    return true;
  }

  // Aangeroepen door het meldingen-centrum bij elke nieuwe melding.
  async function onNotification(n) {
    const c = getConfig();
    if (!c.enabled || !c.topic || !wanted(n, c)) return false;
    const ticker = n.symbol || (n.tradeId && S.getTrade(n.tradeId) && S.getTrade(n.tradeId).ticker);
    try {
      return await publish(c, {
        title: n.title,
        message: n.body || n.title,
        tags: TAGS[n.kind] || [],
        priority: n.kind === "sl" || (n.kind === "setup" && n.status === "trigger") ? 4 : 3,
        ...(ticker ? { click: krakenLink(ticker) } : {}),
      });
    } catch {
      return false; // offline of ntfy niet bereikbaar: de melding staat wel in de app
    }
  }

  async function test() {
    const c = getConfig();
    if (!c.topic) throw new Error("Maak eerst een kanaal aan.");
    return publish(c, {
      title: "Tradingdesk – testmelding",
      message: "Het werkt! Zo krijg je meldingen van setups en je trades op je telefoon.",
      tags: ["tada"],
      click: "https://pro.kraken.com/app/trade",
    });
  }

  TD.push = { getConfig, setConfig, newTopic, test, onNotification, wanted, krakenLink };
})(window.TD);
