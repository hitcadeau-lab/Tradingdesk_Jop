// Advise: zet een Notifier-melding om in een uitgewerkt trade-plan.
//  - Beoordeling op de principes uit Range Trading 101 (structuur, mid, trigger, deviatie,
//    swing failures, R:R, snelheid en verdeling, timeframe) → Speelbaar / Twijfel / Niet spelen.
//  - Calculator: wat levert de trade op bij een bepaald bedrag (inzet of risico), inclusief kosten.
(function (TD) {
  const S = TD.store;
  const KEY = "td.advice";

  // ---------- opslag ----------
  function all() {
    const a = S._load(KEY, []);
    return Array.isArray(a) ? a : [];
  }
  function get(id) {
    return all().find((x) => x.id === id) || null;
  }
  function save(item) {
    const list = all();
    const i = list.findIndex((x) => x.id === item.id);
    if (i === -1) list.unshift(item);
    else list[i] = item;
    S._save(KEY, list);
    return item;
  }
  function remove(id) {
    S._save(KEY, all().filter((x) => x.id !== id));
  }

  // ---------- meetwaarden uit de candles ----------
  function metrics(candles, range, signal) {
    const { low: L, high: H, mid } = range;
    const h = H - L;
    const after = candles.filter((c) => c.time > range.endTime);
    const long = signal.direction === "Long";
    let midReactions = 0, midCrosses = 0, fastMoves = 0, bigWicks = 0;
    for (let i = 0; i < after.length; i++) {
      const c = after[i];
      const top = Math.max(c.open, c.close), bot = Math.min(c.open, c.close);
      // Reactie op de mid: wick door de mid, body blijft aan één kant (zoals in de video).
      if ((c.high >= mid && top < mid) || (c.low <= mid && bot > mid)) midReactions++;
      if (i && (after[i - 1].close - mid) * (c.close - mid) < 0) midCrosses++;
      // Snelle beweging: van de ene rand naar de andere in maximaal 3 candles.
      if (c.low <= L + 0.15 * h || c.high >= H - 0.15 * h) {
        const fromLow = c.low <= L + 0.15 * h;
        for (let j = i + 1; j <= Math.min(i + 3, after.length - 1); j++) {
          if (fromLow ? after[j].high >= H - 0.15 * h : after[j].low <= L + 0.15 * h) {
            fastMoves++;
            i = j;
            break;
          }
        }
      }
      // Grote swing failure aan de entry-kant: wick ver buiten de range zonder close erbuiten.
      if (long ? c.low < L - 0.25 * h && c.close > L : c.high > H + 0.25 * h && c.close < H) bigWicks++;
    }
    return {
      bars: after.length,
      touchesHigh: after.filter((c) => c.high >= H - 0.2 * h).length,
      touchesLow: after.filter((c) => c.low <= L + 0.2 * h).length,
      midReactions,
      midCrosses,
      fastMoves,
      bigWicks,
      distribution: range.distribution || { lower: 0.5, upper: 0.5 },
    };
  }

  // ---------- beoordeling ----------
  function assess(m, signal, tf) {
    const long = signal.direction === "Long";
    const checks = [];
    const add = (id, label, state, text) => checks.push({ id, label, state, text });

    const touches = m.touchesHigh + m.touchesLow;
    add(
      "structure",
      "Range-structuur",
      m.bars >= 15 && touches >= 4 ? "pass" : m.bars >= 8 ? "warn" : "fail",
      `${m.bars} candles na de push, ${touches} keer bij een rand. ${
        m.bars >= 15 && touches >= 4 ? "De range is goed ontwikkeld." : "De range is nog jong: minder data om op te vertrouwen. Neem de tijd voor je range, het frame moet sterk zijn."
      }`
    );
    add(
      "mid",
      "Mid sluit aan op S/R",
      m.midReactions >= 2 ? "pass" : m.midReactions === 1 ? "warn" : "fail",
      m.midReactions >= 2
        ? `De mid werkte ${m.midReactions}× als support/resistance (wick erdoor, body bleef aan één kant). Dat bevestigt dat de range goed staat.`
        : m.midReactions === 1
        ? "De mid reageerde maar één keer. Controleer of je range high en low goed staan."
        : "De mid reageert niet als support of resistance. Volgens de methode staat de range dan waarschijnlijk niet goed: teken hem zelf na."
    );
    add(
      "trigger",
      "Trigger",
      signal.status === "trigger" ? "pass" : signal.status === "reclaim" ? "warn" : "fail",
      signal.status === "trigger"
        ? "Deviatie, reclaim én retest: het level is geflipt. Dit is het moment waarop je de trekker overhaalt."
        : signal.status === "reclaim"
        ? "Er is een reclaim, maar nog geen retest. Wacht op de retest (limit order op het level) in plaats van in te springen."
        : "Geen geldige trigger meer (verlopen of vervallen)."
    );
    const d = signal.depth ?? 0;
    add(
      "deviation",
      "Deviatie",
      d <= 0.2 ? "pass" : d <= 0.35 ? "warn" : "fail",
      `De deviatie ging ${Math.round(d * 100)}% van de range-hoogte buiten de range. ${
        d <= 0.2 ? "Strak: je stop voorbij de deviatie blijft dichtbij." : d <= 0.35 ? "Redelijk diep: je stop komt verder weg, de R:R daalt." : "Te diep: je stop komt te ver van TP1."
      }`
    );
    add(
      "wicks",
      "Swing failures bij je level",
      m.bigWicks === 0 ? "pass" : m.bigWicks === 1 ? "warn" : "fail",
      m.bigWicks === 0
        ? `Geen grote wicks buiten de ${long ? "range low" : "range high"}: het level is schoon.`
        : `${m.bigWicks} grote wick(s) buiten de ${long ? "range low" : "range high"}. Grote swing failures maken een level (bijna) ontradeable, omdat je stop te ver weg moet.`
    );
    add(
      "rr",
      "Risk/reward",
      signal.rr1 >= 1.5 ? "pass" : signal.rr1 >= 1 ? "warn" : "fail",
      `TP1 (mid): ${signal.rr1.toFixed(2)}R · TP2 (${long ? "range high" : "range low"}): ${signal.rr2.toFixed(2)}R. ${
        signal.rr1 >= 1.5 ? "Ruim genoeg." : signal.rr1 >= 1 ? "Krap tot TP1: overweeg te wachten op een betere entry bij de retest." : "Te weinig ruimte tot TP1."
      }`
    );
    add(
      "speed",
      "Snelheid van de range",
      m.fastMoves === 0 ? "pass" : m.fastMoves === 1 ? "warn" : "fail",
      m.fastMoves === 0
        ? "Rustige, langzame prijsontwikkeling. Dit soort ranges trade je het liefst."
        : `${m.fastMoves}× schoot de koers in 3 candles of minder van rand naar rand. Snelle, spiky ranges zijn minder gunstig dan ranges met een trage opbouw.`
    );
    const slowSide = m.distribution.lower >= 0.6 ? "lower" : m.distribution.upper >= 0.6 ? "upper" : null;
    const entrySide = long ? "lower" : "upper";
    add(
      "distribution",
      "Verdeling",
      "info",
      `${Math.round(m.distribution.lower * 100)}% van de tijd onder de mid, ${Math.round(m.distribution.upper * 100)}% erboven. ${
        !slowSide
          ? "Evenwichtig verdeeld: geen duidelijke snelle of trage kant."
          : slowSide === entrySide
          ? "Je instapkant is de trage kant: de weg naar TP1 kan langer duren, maar na de mid gaat het vaak snel richting TP2."
          : "Je instapkant is de snelle kant: de koers gaat vaak snel richting de mid (TP1). Neem op tijd winst."
      }`
    );
    add(
      "timeframe",
      "Timeframe",
      tf === "15m" ? "warn" : "pass",
      tf === "15m"
        ? "15m: meer ruis en snellere bewegingen. In de video’s ligt de nadruk op de 4H- en 1H-range."
        : `${tf === "4h" ? "4H" : "1H"}: het timeframe waar de methode op draait. Houd deze range leading en wissel niet halverwege naar een kleinere range.`
    );

    const fails = checks.filter((c) => c.state === "fail").length;
    const warns = checks.filter((c) => c.state === "warn").length;
    const verdict =
      fails > 0 || signal.status === "expired" || signal.status === "invalid" || signal.status === "untradeable"
        ? { key: "skip", label: "Niet spelen", text: "Een of meer principes zijn niet in orde. Sla deze setup over of wacht op een nieuwe." }
        : warns >= 2
        ? { key: "doubt", label: "Twijfel", text: "Speelbaar, maar met kanttekeningen. Wacht op een betere entry, of speel kleiner." }
        : { key: "play", label: "Speelbaar", text: "De setup voldoet aan de range-principes. Loop nog wel je Trade Entry Checklist door (emotie, nieuws, risico)." };
    return { checks, verdict };
  }

  // ---------- calculator ----------
  // mode "stake": bedrag = inzet (positiewaarde). mode "risk": bedrag = maximaal verlies bij de SL.
  function calc({ entry, stopLoss, tp1, tp2, mode, amount, feePct = 0.1, split = 0.5 }) {
    const dist = Math.abs(entry - stopLoss);
    if (!(entry > 0) || !(dist > 0) || !(amount > 0)) return null;
    const fee = feePct / 100;
    // Bij "risico" is het bedrag je totale verlies bij de SL, inclusief kosten (in + uit).
    const units = mode === "risk" ? amount / (dist + (entry + stopLoss) * fee) : amount / entry;
    const stake = units * entry;
    const dir = Math.sign(tp1 - entry) || 1;
    const leg = (price, frac) => frac * units * (price - entry) * dir - frac * units * (entry + price) * fee; // winst minus kosten (in + uit)
    const scenarios = [
      { key: "sl", label: "Stop Loss", pnl: leg(stopLoss, 1), note: "Stop geraakt vóór TP1" },
      { key: "tp1be", label: "TP1 + BE", pnl: leg(tp1, split) + leg(entry, 1 - split), note: `${Math.round(split * 100)}% op TP1, rest op break-even` },
      { key: "tp1tp2", label: "TP1 + TP2", pnl: leg(tp1, split) + leg(tp2, 1 - split), note: `${Math.round(split * 100)}% op TP1, rest op TP2` },
      { key: "tp2", label: "Alles op TP2", pnl: leg(tp2, 1), note: "Hele positie tot TP2" },
    ];
    const loss = -scenarios[0].pnl;
    const win = scenarios[2].pnl;
    return {
      units,
      stake,
      risk: loss,
      fees: units * entry * fee * 2,
      scenarios,
      breakEvenWinrate: win > 0 ? loss / (loss + win) : null,
    };
  }

  // ---------- wat is er sinds het advies gebeurd? ----------
  function progress(candles, item) {
    const g = item.signal;
    const long = g.direction === "Long";
    const since = candles.filter((c) => c.time * 1000 > item.createdAt);
    const last = candles[candles.length - 1];
    let hit = null;
    for (const c of since) {
      const sl = long ? c.low <= g.stopLoss : c.high >= g.stopLoss;
      const t2 = long ? c.high >= g.tp2 : c.low <= g.tp2;
      const t1 = long ? c.high >= g.tp1 : c.low <= g.tp1;
      if (sl) { hit = "sl"; break; }
      if (t2) { hit = "tp2"; break; }
      if (t1 && !hit) hit = "tp1";
    }
    return { price: last.close, time: last.time, hit, fromEntry: (last.close - g.entry) / g.entry };
  }

  // Maak een advies van een Notifier-melding (haalt verse candles op voor de beoordeling).
  async function fromSignal(sig) {
    const candles = await TD.marketData.candles(sig.symbol, sig.tf, 300);
    const signal = {
      direction: sig.direction, status: sig.status, reason: sig.reason, entry: sig.entry, stopLoss: sig.stopLoss,
      tp1: sig.tp1, tp2: sig.tp2, rr1: sig.rr1, rr2: sig.rr2, depth: sig.depth,
      deviationTime: sig.deviationTime, reclaimTime: sig.reclaimTime, retestTime: sig.retestTime,
    };
    const m = metrics(candles, sig.range, signal);
    const { checks, verdict } = assess(m, signal, sig.tf);
    const s = S.getSettings();
    return save({
      id: "a" + Date.now().toString(36),
      fromSignal: sig.id,
      createdAt: Date.now(),
      symbol: sig.symbol,
      tf: sig.tf,
      direction: sig.direction,
      range: sig.range,
      signal,
      metrics: m,
      checks,
      verdict,
      notes: "",
      calc: { mode: "stake", amount: 1000, feePct: 0.1 },
      currency: s.currency,
    });
  }

  TD.advise = { all, get, save, remove, metrics, assess, calc, progress, fromSignal };
})(window.TD);
