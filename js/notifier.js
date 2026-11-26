// Notifier-service: scant de gekozen pairs en timeframes op range-trading setups en
// geeft een melding: "BTCUSDT – Long – 4H". Draait zolang de app (of de pagina) open is.
(function (TD) {
  const S = TD.store;
  const { shortSym } = TD.util;
  const KEY_CONF = "td.notifier";
  const KEY_SIGNALS = "td.signals";
  const MAX_SIGNALS = 150;
  const ACTIVE = ["reclaim", "accepted", "trigger"];

  let timer = null;
  let scanning = false;
  let lastScanAt = null;
  let nextScanAt = null;
  const results = new Map(); // "SYMBOL|tf" → { range, signal, error, at }
  const listeners = new Set();

  function storeGet(key, fallback) {
    // Gebruik de opslag-backend van de store (bestand in de Mac-app, localStorage in de browser).
    return S._load(key, fallback);
  }
  function storeSet(key, value) {
    S._save(key, value);
  }

  function defaultPairs() {
    return S.getWatchlist().map((w) => ({ symbol: w.symbol, tfs: ["15m", "1h", "4h"] }));
  }

  function getConfig() {
    const c = storeGet(KEY_CONF, null);
    return { enabled: true, desktop: false, interval: 5, keepDays: 3, pairs: defaultPairs(), ...(c || {}) };
  }
  function setConfig(patch) {
    storeSet(KEY_CONF, { ...getConfig(), ...patch });
    restart();
    emit();
  }

  function getSignals() {
    const s = storeGet(KEY_SIGNALS, []);
    return Array.isArray(s) ? s : [];
  }
  function saveSignals(list) {
    storeSet(KEY_SIGNALS, list.slice(0, MAX_SIGNALS));
  }
  function getSignal(id) {
    return getSignals().find((s) => s.id === id) || null;
  }
  function unseenCount() {
    return getSignals().filter((s) => !s.seen && ACTIVE.includes(s.status)).length;
  }
  function markSeen(id) {
    const list = getSignals();
    let changed = false;
    for (const s of list) if ((!id || s.id === id) && !s.seen) {
      s.seen = true;
      changed = true;
    }
    if (changed) {
      saveSignals(list);
      emit();
    }
  }
  function clearSignals() {
    saveSignals([]);
    emit();
  }
  function removeSignal(id) {
    saveSignals(getSignals().filter((s) => s.id !== id));
    emit();
  }
  // Alle meldingen die niet meer actief zijn (verlopen, vervallen, niet tradeable, mislukt).
  function clearInactive() {
    saveSignals(getSignals().filter((s) => ACTIVE.includes(s.status)));
    emit();
  }

  // Hoe lang een setup geldig blijft, in candles van zijn timeframe.
  const MAX_AGE_BARS = { trigger: 4, reclaim: 12, accepted: 12 };
  function setupMoment(s) {
    return (s.status === "trigger" ? s.retestTime || s.reclaimTime || s.breakoutTime : s.reclaimTime || s.breakoutTime || s.retestTime) || null;
  }
  // Actieve meldingen die te oud zijn → verlopen. Oude inactieve meldingen → weg (na keepDays dagen).
  function tidy(list, now = Date.now()) {
    let changed = false;
    const tfSec = (tf) => (TD.marketData.TF[tf] || {}).seconds || 3600;
    for (const s of list) {
      if (!ACTIVE.includes(s.status)) continue;
      const t = setupMoment(s);
      const maxMs = (MAX_AGE_BARS[s.status] || 12) * tfSec(s.tf) * 1000;
      const ref = t ? t * 1000 : s.detectedAt;
      if (ref && now - ref > maxMs + tfSec(s.tf) * 1000) {
        const was = s.status;
        s.status = "expired";
        s.aged = true; // niet terugzetten bij de volgende scan
        s.reason = `Te oud: de ${was === "trigger" ? "trigger" : "setup"} is van ${new Date(ref).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Op ${tfLabel(s.tf)} is dat te lang geleden om nog in te stappen.`;
        s.updatedAt = now;
        changed = true;
      }
    }
    const keep = +getConfig().keepDays || 0;
    if (keep > 0) {
      const cutoff = now - keep * 86400000;
      const before = list.length;
      for (let i = list.length - 1; i >= 0; i--) if (!ACTIVE.includes(list[i].status) && (list[i].updatedAt || list[i].detectedAt) < cutoff) list.splice(i, 1);
      if (list.length !== before) changed = true;
    }
    return changed;
  }

  const tfLabel = (tf) => (TD.marketData.TF[tf] || {}).label || tf;
  const isBreakout = (sig) => sig && sig.setup === "Breakout";
  function title(sig) {
    return `${shortSym(sig.symbol)} – ${sig.direction} – ${tfLabel(sig.tf)}${isBreakout(sig) ? " – Breakout" : ""}`;
  }
  function describe(sig) {
    if (isBreakout(sig)) {
      const edge = sig.direction === "Long" ? "range high" : "range low";
      if (sig.status === "trigger") return `Trigger: breakout door de ${edge}, acceptatie erbuiten en de retest houdt (level flip).`;
      if (sig.status === "accepted") return `Breakout door de ${edge} met acceptatie. Wacht op de retest van de oude ${edge}; niet najagen.`;
      if (sig.status === "invalid") return "Vervallen: de breakout-setup is niet meer zichtbaar.";
      if (sig.status === "planned") return `Plan: breakout ${sig.direction.toLowerCase()} na acceptatie buiten de ${edge} en een retest die houdt.`;
      return sig.reason || "";
    }
    const edge = sig.direction === "Long" ? "range low" : "range high";
    if (sig.status === "trigger") return `Trigger: deviatie, reclaim en retest van de ${edge}.`;
    if (sig.status === "reclaim") return `Deviatie en reclaim van de ${edge}. Wacht op de retest.`;
    if (sig.status === "expired") return "Verlopen: de koers is al bij de mid (TP1).";
    if (sig.status === "untradeable") return sig.reason || "Niet tradeable.";
    if (sig.status === "invalid") return "Vervallen: de koers sloot opnieuw buiten de range.";
    return "";
  }

  // ---------- melding ----------
  function notify(sig) {
    const cfg = getConfig();
    if (!cfg.desktop || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const n = new Notification(title(sig), {
        body: `${describe(sig)} TP1${isBreakout(sig) ? "" : " (mid)"} ${TD.util.num(sig.tp1, 6)} · R:R ${sig.rr1.toFixed(1)}`,
        tag: sig.id,
        silent: false,
      });
      n.onclick = () => {
        window.focus();
        location.hash = "#/notifier/" + encodeURIComponent(sig.id);
      };
    } catch {
      /* meldingen niet beschikbaar */
    }
  }

  async function requestPermission() {
    if (typeof Notification === "undefined") return "unsupported";
    if (Notification.permission === "granted") return "granted";
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }

  // ---------- scannen ----------
  function sigId(symbol, tf, signal) {
    return signal.setup === "Breakout"
      ? `${symbol}|${tf}|BO|${signal.direction}|${signal.breakoutTime}`
      : `${symbol}|${tf}|${signal.direction}|${signal.reclaimTime}`;
  }
  function upsert(list, symbol, tf, range, signal, now) {
    const id = sigId(symbol, tf, signal);
    const existing = list.find((s) => s.id === id);
    const data = {
      id,
      symbol,
      tf,
      setup: signal.setup || "Reclaim",
      direction: signal.direction,
      status: signal.status,
      reason: signal.reason,
      range: { low: range.low, high: range.high, mid: range.mid, kind: range.kind, startTime: range.startTime, endTime: range.endTime, distribution: range.distribution },
      entry: signal.entry,
      stopLoss: signal.stopLoss,
      tp1: signal.tp1,
      tp2: signal.tp2,
      rr1: signal.rr1,
      rr2: signal.rr2,
      depth: signal.depth,
      deviationTime: signal.deviationTime,
      reclaimTime: signal.reclaimTime,
      retestTime: signal.retestTime,
      breakoutTime: signal.breakoutTime || null,
      acceptTime: signal.acceptTime || null,
      acceptBars: signal.acceptBars ?? null,
      extension: signal.extension ?? null,
      retestDepth: signal.retestDepth ?? null,
      strength: signal.strength ?? null,
      updatedAt: now,
    };
    if (!existing) {
      if (!ACTIVE.includes(signal.status)) return null; // alleen actieve setups melden
      const sig = { ...data, detectedAt: now, seen: false };
      list.unshift(sig);
      return sig;
    }
    // Op leeftijd verlopen? Dan blijft hij verlopen, ook als de engine dezelfde setup nog ziet.
    if (existing.aged) return null;
    const upgraded = (existing.status === "reclaim" || existing.status === "accepted") && signal.status === "trigger";
    Object.assign(existing, data);
    if (upgraded) {
      existing.seen = false;
      return existing;
    }
    return null;
  }

  async function scan() {
    if (scanning) return;
    scanning = true;
    emit();
    const cfg = getConfig();
    const now = Date.now();
    const list = getSignals();
    const toNotify = [];
    for (const p of cfg.pairs) {
      for (const tf of p.tfs || []) {
        const key = `${p.symbol}|${tf}`;
        try {
          const candles = await TD.marketData.candles(p.symbol, tf, 300);
          const { range, signal, breakout } = TD.rangeEngine.analyze(candles);
          results.set(key, { range, signal, breakout, error: null, at: now, last: candles[candles.length - 1].close, lastTime: candles[candles.length - 1].time });
          const seenIds = new Set();
          if (range && signal) {
            seenIds.add(sigId(p.symbol, tf, signal));
            const sig = upsert(list, p.symbol, tf, range, signal, now);
            if (sig) toNotify.push(sig);
          }
          if (breakout) {
            seenIds.add(sigId(p.symbol, tf, breakout.signal));
            const sig = upsert(list, p.symbol, tf, breakout.range, breakout.signal, now);
            if (sig) toNotify.push(sig);
          }
          // Actieve meldingen voor dit pair die niet meer gezien worden: vervallen of verlopen.
          for (const s of list) {
            if (s.symbol !== p.symbol || s.tf !== tf || !ACTIVE.includes(s.status) || seenIds.has(s.id)) continue;
            s.status = isBreakout(s) || range ? "invalid" : "expired";
            s.updatedAt = now;
          }
        } catch (e) {
          results.set(key, { range: null, signal: null, error: e.message, at: now });
        }
      }
    }
    tidy(list);
    saveSignals(list);
    lastScanAt = Date.now();
    scanning = false;
    toNotify.forEach((sig) => {
      notify(sig);
      if (TD.inbox)
        TD.inbox.add({
          key: `setup|${sig.id}|${sig.status}`,
          kind: "setup",
          title: title(sig),
          body: `${describe(sig)} TP1${isBreakout(sig) ? "" : " (mid)"} ${TD.util.price(sig.tp1)} · R:R ${sig.rr1.toFixed(1)}`,
          link: "#/notifier/" + encodeURIComponent(sig.id),
          silent: true,
          symbol: sig.symbol,
          tf: sig.tf,
          status: sig.status,
        });
    });
    emit();
    return toNotify;
  }

  function restart() {
    clearInterval(timer);
    timer = null;
    nextScanAt = null;
    const cfg = getConfig();
    if (!cfg.enabled || !cfg.pairs.length) return;
    const ms = Math.max(1, +cfg.interval || 5) * 60000;
    timer = setInterval(() => {
      nextScanAt = Date.now() + ms;
      scan();
    }, ms);
    nextScanAt = Date.now() + ms;
  }

  // Opruimen (verouderde triggers, oude geschiedenis) zonder te scannen.
  function tidyNow() {
    const list = getSignals();
    if (tidy(list)) saveSignals(list);
  }

  function start() {
    tidyNow();
    restart();
    if (getConfig().enabled) setTimeout(scan, 2500);
    // Als de pagina na slaap weer zichtbaar wordt: meteen bijwerken.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && getConfig().enabled && lastScanAt && Date.now() - lastScanAt > 60000) scan();
    });
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function emit() {
    // Kopie: een listener die zich opnieuw aanmeldt, mag niet in dezelfde ronde opnieuw draaien.
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        /* negeren */
      }
    }
  }

  TD.notifier = {
    getConfig, setConfig, getSignals, getSignal, unseenCount, markSeen, clearSignals, removeSignal, clearInactive, setupMoment, tidyNow, ACTIVE,
    scan, start, onChange, requestPermission, title, describe, tfLabel, isBreakout, sigId,
    status: () => ({ scanning, lastScanAt, nextScanAt }),
    results: () => results,
  };
})(window.TD);
