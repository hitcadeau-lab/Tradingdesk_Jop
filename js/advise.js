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
      signal.status === "trigger" ? "pass" : signal.status === "reclaim" || signal.status === "planned" ? "warn" : "fail",
      signal.status === "planned"
        ? "Nog geen trigger: dit is een plan. Wacht tot een candle buiten de range sluit (deviatie), terug binnen sluit (reclaim) en de retest houdt."
        : signal.status === "trigger"
        ? "Deviatie, reclaim én retest: het level is geflipt. Dit is het moment waarop je de trekker overhaalt."
        : signal.status === "reclaim"
        ? "Er is een reclaim, maar nog geen retest. Wacht op de retest (limit order op het level) in plaats van in te springen."
        : "Geen geldige trigger meer (verlopen of vervallen)."
    );
    const d = signal.depth ?? 0;
    if (signal.depth == null) {
      add("deviation", "Deviatie", "info", "Nog geen deviatie. De stop is gebaseerd op een verwachte deviatie van ±15% van de range. Pas je stop aan zodra de echte deviatie er is: altijd voorbij de wick.");
    } else add(
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
        : signal.status === "planned"
        ? { key: "plan", label: "Klaarzetten", text: "Een plan voor de toekomst: zet een alert of limit order bij de rand, en speel hem alleen na deviatie, reclaim en retest." }
        : { key: "play", label: "Speelbaar", text: "De setup voldoet aan de range-principes. Loop nog wel je Trade Entry Checklist door (emotie, nieuws, risico)." };
    return { checks, verdict };
  }

  // ---------- beoordeling van een breakout ----------
  // Breakouts mislukken vaker dan range-trades (vaak blijkt de uitbraak een deviatie). Daarom
  // strengere eisen: een sterke range, echte acceptatie, een retest die houdt, ruimte tot de
  // targets, de trend mee en meer R:R. Eén punt van aandacht = al "Twijfel".
  function assessBreakout(m, signal, tf, candles, range) {
    const long = signal.direction === "Long";
    const edgeName = long ? "range high" : "range low";
    const h = range.high - range.low;
    const edge = long ? range.high : range.low;
    const sgn = long ? 1 : -1;
    const checks = [];
    const add = (id, label, state, text) => checks.push({ id, label, state, text });
    const planned = signal.status === "planned";

    const touches = m.touchesHigh + m.touchesLow;
    const edgeTests = long ? m.touchesHigh : m.touchesLow;
    add(
      "structure",
      "De range vóór de uitbraak",
      m.bars >= 15 && touches >= 4 ? "pass" : m.bars >= 8 ? "warn" : "fail",
      `${m.bars} candles in de range, ${edgeTests}× bij de ${edgeName}. ${
        m.bars >= 15 && touches >= 4
          ? "Een goed ontwikkelde range: een uitbraak daaruit zegt meer en de oude rand is een duidelijk level voor de retest."
          : "Een jonge range: een uitbraak uit een zwakke structuur is minder betrouwbaar."
      }`
    );
    if (planned)
      add("accept", "Acceptatie", "info", `Nog geen uitbraak. Wacht tot minstens 6 candles op rij buiten de ${edgeName} sluiten. Eén candle of een lont erdoor is nog een deviatie.`);
    else
      add(
        "accept",
        "Acceptatie buiten de range",
        signal.acceptBars >= 8 ? "pass" : "warn",
        `${signal.acceptBars} closes op rij buiten de ${edgeName}. ${
          signal.acceptBars >= 8 ? "Duidelijke acceptatie: de markt aanvaardt de nieuwe prijzen." : "Net genoeg acceptatie. Hoe langer de koers buiten blijft, hoe kleiner de kans dat het toch een deviatie is."
        }`
      );
    add(
      "trigger",
      "Trigger (retest)",
      signal.status === "trigger" ? "pass" : signal.status === "accepted" || planned ? "warn" : "fail",
      signal.status === "trigger"
        ? `De koers kwam terug naar de oude ${edgeName} en die hield (level flip). Dit is je instapmoment.`
        : signal.status === "accepted" || planned
        ? `Nog geen retest. Jaag de uitbraak niet na: zet een limit order op de oude ${edgeName} en stap alleen in als die houdt.`
        : signal.reason || "Geen geldige trigger meer."
    );
    if (signal.retestDepth != null)
      add(
        "retest",
        "Retest-diepte",
        signal.retestDepth <= 0.03 ? "pass" : signal.retestDepth <= 0.1 ? "warn" : "fail",
        `De retest kwam ${Math.round(signal.retestDepth * 100)}% van de range-hoogte terug in de oude range. ${
          signal.retestDepth <= 0.03
            ? "Het level houdt strak: precies wat je wilt zien."
            : signal.retestDepth <= 0.1
            ? "De lont ging terug de range in. Het level houdt nog, maar minder overtuigend."
            : "Te diep terug in de range: dit lijkt meer op een mislukte breakout."
        }`
      );
    if (signal.strength != null)
      add(
        "strength",
        "Kracht van de uitbraak",
        signal.strength >= 1.2 ? "pass" : "warn",
        signal.strength >= 1.2
          ? `De uitbraak-candle was ${signal.strength.toFixed(1)}× zo groot als een gemiddelde candle in de range: een duidelijke beweging.`
          : `De uitbraak-candle was niet groter dan normaal (${signal.strength.toFixed(1)}×). Een uitbraak zonder kracht mislukt vaker.`
      );

    // Trend: de push/dump waaruit de range kwam, en de grotere beweging in de geladen data.
    const pushDir = range.kind === "push" ? 1 : -1;
    const ref = candles.find((c) => c.time >= range.startTime) || candles[0];
    const ctx = Math.sign(ref.close - candles[0].close) || pushDir;
    const withTrend = (pushDir === sgn ? 1 : 0) + (ctx === sgn ? 1 : 0);
    add(
      "trend",
      "Trend",
      withTrend === 2 ? "pass" : withTrend === 1 ? "warn" : "fail",
      withTrend === 2
        ? `De uitbraak gaat mee met de ${range.kind === "push" ? "push" : "dump"} waaruit de range ontstond en met de grotere beweging. Breakouts met de trend mee slagen het vaakst.`
        : withTrend === 1
        ? "De uitbraak gaat maar deels met de trend mee. Tegen de grotere beweging in mislukken breakouts vaker."
        : "De uitbraak gaat tegen de trend in. Zulke breakouts mislukken vaak: grote kans dat het een deviatie is."
    );

    // Oude levels tussen de rand en de targets (swing highs/lows van vóór de range).
    const before = candles.filter((c) => c.time < range.startTime);
    const piv = TD.rangeEngine.pivots(before, 3);
    const levels = (long ? piv.highs.map((i) => before[i].high) : piv.lows.map((i) => before[i].low)).filter((p) => (p - edge) * sgn > 0.05 * h);
    const inTp1 = levels.filter((p) => (p - signal.tp1) * sgn < 0);
    const inTp2 = levels.filter((p) => (p - signal.tp1) * sgn >= 0 && (p - signal.tp2) * sgn < 0);
    const word = long ? "weerstand" : "support";
    add(
      "room",
      "Ruimte tot de targets",
      inTp1.length ? "warn" : "pass",
      inTp1.length
        ? `Oude ${word} vóór TP1 op ${inTp1.map((p) => TD.util.price(p)).slice(0, 3).join(", ")}. Daar kan de koers stokken; overweeg TP1 net daarvoor.`
        : `Geen oude ${word} tussen de rand en TP1${inTp2.length ? `; wel op ${inTp2.map((p) => TD.util.price(p)).slice(0, 2).join(", ")} vóór TP2` : ""}.`
    );
    add(
      "rr",
      "Risk/reward",
      signal.rr1 >= 2 ? "pass" : signal.rr1 >= 1.2 ? "warn" : "fail",
      `TP1 (½ range): ${signal.rr1.toFixed(2)}R · TP2 (hele range): ${signal.rr2.toFixed(2)}R. ${
        signal.rr1 >= 2
          ? "Ruim genoeg om de lagere slagingskans van breakouts te compenseren."
          : "Breakouts halen hun target minder vaak dan range-trades. Daarom wil je hier minstens 2R tot TP1."
      }`
    );
    add(
      "timeframe",
      "Timeframe",
      tf === "15m" ? "warn" : "pass",
      tf === "15m" ? "15m: veel nep-uitbraken. Breakouts op 1H en 4H zijn betrouwbaarder." : `${tf === "4h" ? "4H" : "1H"}: uitbraken op hogere timeframes zijn betrouwbaarder.`
    );
    add(
      "difficulty",
      "Moeilijkheid",
      "info",
      "Breakouts zijn lastiger dan range-trades: een groot deel blijkt achteraf een deviatie. Speel kleiner (bijvoorbeeld de helft van je normale risico), stap pas in op de retest en houd je stop strikt terug binnen de oude range. Sluit de koers weer binnen de range, dan is de breakout mislukt: neem je verlies en kijk naar een reclaim de andere kant op."
    );

    const fails = checks.filter((c) => c.state === "fail").length;
    const warns = checks.filter((c) => c.state === "warn").length;
    const bad = ["expired", "invalid", "untradeable", "failed"].includes(signal.status);
    const verdict =
      fails > 0 || bad
        ? { key: "skip", label: "Niet spelen", text: "Deze breakout voldoet niet aan de eisen. Breakouts zijn al lastiger: sla hem over of wacht op een betere." }
        : planned || signal.status === "accepted"
        ? { key: "plan", label: "Klaarzetten", text: `Zet een limit order op de retest van de oude ${edgeName}, met de stop terug binnen de range. Speel kleiner dan een range-trade.` }
        : warns >= 1
        ? { key: "doubt", label: "Twijfel", text: "Speelbaar, maar met kanttekeningen, en breakouts mislukken vaker. Speel kleiner (halve risico) of sla over." }
        : { key: "play", label: "Speelbaar", text: "Sterke breakout die aan alle eisen voldoet. Toch: speel kleiner dan een range-trade en loop je Trade Entry Checklist door." };
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
    const ref = item.asOf ? item.asOf * 1000 : item.createdAt;
    const since = candles.filter((c) => c.time * 1000 > ref);
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
  // opts.asOf (sec): historische setup — beoordeel alleen met de candles tot dat moment.
  async function fromSignal(sig, opts = {}) {
    const all = opts.candles || (await TD.marketData.candles(sig.symbol, sig.tf, 300));
    const candles = opts.asOf ? all.filter((c) => c.time <= opts.asOf) : all;
    const signal = {
      setup: sig.setup || "Reclaim",
      direction: sig.direction, status: sig.status, reason: sig.reason, entry: sig.entry, stopLoss: sig.stopLoss,
      tp1: sig.tp1, tp2: sig.tp2, rr1: sig.rr1, rr2: sig.rr2, depth: sig.depth,
      deviationTime: sig.deviationTime, reclaimTime: sig.reclaimTime, retestTime: sig.retestTime,
      breakoutTime: sig.breakoutTime || null, acceptTime: sig.acceptTime || null, acceptBars: sig.acceptBars ?? null,
      extension: sig.extension ?? null, retestDepth: sig.retestDepth ?? null, strength: sig.strength ?? null,
    };
    let checks, verdict, m;
    if (signal.setup === "Breakout") {
      // De range beoordelen op de candles van vóór de uitbraak.
      const pre = signal.breakoutTime ? candles.filter((c) => c.time < signal.breakoutTime) : candles;
      m = metrics(pre, sig.range, signal);
      ({ checks, verdict } = assessBreakout(m, signal, sig.tf, candles, sig.range));
    } else {
      m = metrics(candles, sig.range, signal);
      ({ checks, verdict } = assess(m, signal, sig.tf));
    }
    const s = S.getSettings();
    return save({
      id: "a" + Date.now().toString(36),
      fromSignal: sig.id,
      createdAt: Date.now(),
      asOf: opts.asOf || null, // historisch: moment van de setup
      kind: opts.asOf ? "history" : sig.status === "planned" ? "plan" : "live",
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

  TD.advise = { all, get, save, remove, metrics, assess, assessBreakout, calc, progress, fromSignal };
})(window.TD);
