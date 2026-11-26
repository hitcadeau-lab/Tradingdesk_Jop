// Leerschool: oneindig veel multiple-choice opdrachten, gebaseerd op
// "Technical Analysis 101" en "Range Trading 101". Elke opdracht genereert een eigen
// oefengrafiek (SVG). Na je antwoord zie je bij élke optie waarom die goed (groen)
// of fout (rood) is.
(function (TD) {
  const { esc, money, num } = TD.util;
  const C = TD.charts;
  const S = TD.store;

  const COL = { rh: "#ef5350", rl: "#26a69a", mid: "#f5a623", neutral: "#8b919c", entry: "#2962ff", sl: "#ef5350", tp: "#26a69a" };

  // Niveau per opdracht (beginner / medior / professional).
  const LEVELS = { beginner: "Beginner", medior: "Medior", pro: "Professional" };
  const LEVEL_OF = {
    rangeLevels: "beginner", midCheck: "beginner", candleAnatomy: "beginner", structure: "beginner", srFlip: "beginner",
    trendLine: "beginner", rsi: "beginner", rr: "beginner", takeProfit: "beginner", devVsSfp: "beginner", mindset: "beginner",
    breakoutRisk: "beginner",
    rangeDrawing: "medior", distribution: "medior", reclaimRetest: "medior", midRange: "medior", stopLoss: "medior",
    setupType: "medior", pattern: "medior", patternName: "beginner", patternExpect: "beginner", patternTrade: "pro", positionSize: "medior", breakout: "medior", breakoutAcceptance: "medior",
    breakoutEntry: "medior", divergence: "medior",
    rangeInRange: "pro", sfpQuality: "pro", rangeTradeable: "pro", breakoutStop: "pro", breakoutTarget: "pro",
    breakoutFailed: "pro", outcomePnl: "pro", liquidation: "pro", breakevenWinrate: "pro", expectancy: "pro", sizeWithFees: "pro",
  };
  const levelOf = (f) => LEVEL_OF[f.name] || "medior";

  const CATS = {
    range: "Ranges tekenen",
    trigger: "Deviaties & swing failures",
    sltp: "Stops & targets",
    setup: "Setup types",
    ta: "Technische analyse basis",
    risk: "Risk & R:R",
    mindset: "Checklist & mindset",
  };

  // ---------- hulpjes ----------
  const pick = (rand, a) => a[Math.floor(rand() * a.length)];
  function shuffle(rand, a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }
  const fmt = (v) => {
    const a = Math.abs(v);
    const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : 4;
    return (+v).toLocaleString("nl-NL", { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const ok = (t, why) => ({ t, ok: true, why });
  const no = (t, why) => ({ t, ok: false, why });

  function makeRange(rand) {
    const base = pick(rand, [0.62, 2.4, 18, 96, 310, 1450, 27000, 64000]) * (0.85 + rand() * 0.3);
    const h = base * (0.06 + rand() * 0.07);
    const low = base, high = base + h;
    return { low, high, h, mid: (low + high) / 2, vol: (h * 0.07) / base };
  }
  const within = (R) => ({ clampHigh: R.high, clampLow: R.low });

  // Basispad: start in het midden en tik de randen een paar keer aan.
  // Even aantal touches eindigt bij de low, oneven bij de high.
  const rangePath = (rand, R, touches = 6) => [{ price: R.mid, bars: 3 }, ...C.rangePath(rand, R.low, R.high, touches)];
  const build = (rand, R, path, start) => C.candlesFromPath(rand, start ?? R.mid, path, { vol: R.vol });

  // Index van de laatste candle van elk pad-segment.
  function ends(path) {
    let n = -1;
    return path.map((p) => (n += p.bars));
  }

  // Spiegel een long-scenario naar een short-scenario (rond de mid).
  const mirror = (candles, R) => candles.map((c) => ({ o: R.low + R.high - c.o, c: R.low + R.high - c.c, h: R.low + R.high - c.l, l: R.low + R.high - c.h }));
  const mp = (R, p) => R.low + R.high - p;

  const rangeLines = (R) => [
    { price: R.high, label: "Range high", color: COL.rh },
    { price: R.mid, label: "Mid", color: COL.mid },
    { price: R.low, label: "Range low", color: COL.rl },
  ];

  // Scenario's bij de range low (spiegelen voor de range high).
  //  - "retest":  deviatie (closes onder RL) → reclaim → retest van RL van bovenaf die houdt
  //  - "clean":   deviatie → reclaim → in één ruk door richting mid (clean break, geen retest)
  //  - "noreclaim": deviatie, de koers blijft onder de RL sluiten
  //  - "sfp":     alleen een wick onder de RL (swing failure), close binnen de range
  function lowEvent(rand, R, kind, opts = {}) {
    const path = rangePath(rand, R, 5); // eindigt bij de high
    path.push({ price: R.mid, bars: 3, ...within(R) });
    path.push({ price: R.low + R.h * 0.14, bars: 4, ...within(R) });
    if (kind === "sfp") {
      const depth = opts.depth ?? 0.08;
      path.push({ price: R.low + R.h * 0.06, bars: 1, wickTo: R.low - R.h * depth, clampLow: R.low + R.h * 0.01 });
      path.push({ price: R.low + R.h * 0.12, bars: 2, ...within(R) });
    } else {
      // Deviatie: meerdere candles die duidelijk ónder de range low sluiten.
      path.push({ price: R.low - R.h * 0.16, bars: 3, wickTo: R.low - R.h * (0.22 + rand() * 0.06), clampHigh: R.low - R.h * 0.05 });
      if (kind === "noreclaim") {
        path.push({ price: R.low - R.h * 0.2, bars: 4, clampHigh: R.low - R.h * 0.04 });
      } else if (kind === "clean") {
        path.push({ price: R.low + R.h * 0.2, bars: 1, clampLow: R.low - R.h * 0.04 });
        path.push({ price: R.mid - R.h * 0.04, bars: 3, clampLow: R.low + R.h * 0.15 });
      } else {
        path.push({ price: R.low + R.h * 0.12, bars: 2, clampLow: R.low - R.h * 0.06 });
        path.push({ price: R.low + R.h * 0.03, bars: 2, wickTo: R.low + R.h * 0.005, clampLow: R.low + R.h * 0.005 });
        path.push({ price: R.low + R.h * 0.1, bars: 1, clampLow: R.low });
      }
    }
    const candles = build(rand, R, path);
    const tail = candles.slice(-7);
    return { candles, extreme: Math.min(...tail.map((c) => c.l)) };
  }

  // ---------- opdracht-templates ----------
  const T = [];

  // ===== Ranges tekenen =====

  T.push(function rangeLevels(rand) {
    const R = makeRange(rand);
    const candles = build(rand, R, [...rangePath(rand, R, 6), { price: R.mid + R.h * (rand() - 0.5) * 0.4, bars: 4, ...within(R) }]);
    const letters = shuffle(rand, ["A", "B", "C"]);
    const lv = [
      { name: "range high", price: R.high, l: letters[0], desc: "het einde van de push: daar stopte de beweging en kwam de koers steeds op terug" },
      { name: "mid range", price: R.mid, l: letters[1], desc: "het 50%-niveau, getekend met de Fib-tool (0, 0,5 en 1). Een goede mid werkt als support én resistance" },
      { name: "range low", price: R.low, l: letters[2], desc: "het begin van de push: het laagste punt waar de beweging startte" },
    ];
    const ask = pick(rand, lv);
    return {
      cat: "range",
      title: "Welke lijn is wat?",
      prompt: `Welke lijn is de <strong>${ask.name}</strong>?`,
      svg: C.candleSVG(candles, { lines: lv.map((x) => ({ price: x.price, label: x.l, color: COL.neutral })) }),
      options: [
        ...lv.map((x) => (x === ask ? ok : no)("Lijn " + x.l, `Lijn ${x.l} is de ${x.name}: ${x.desc}.`)),
        no("Dit is geen range", "Wel: horizontale support en resistance waar de koers steeds tussen heen en weer beweegt. Een range is niets meer dan horizontale S/R-levels."),
      ],
      lesson: "Een range = horizontale support en resistance. Range low = begin van de push, range high = einde van de push, mid = 50% (Fib 0 / 0,5 / 1).",
    };
  });

  T.push(function rangeDrawing(rand) {
    const R = makeRange(rand);
    const down = rand() < 0.5; // dump i.p.v. push
    const path = [
      { price: R.low + R.h * 0.08, bars: 5, ...within(R) },
      { price: R.low + R.h * 0.02, bars: 2, wickTo: R.low, ...within(R) },
      { price: R.high - R.h * 0.04, bars: 5, wickTo: R.high, ...within(R) }, // de push
      { price: R.mid + R.h * 0.1, bars: 4, ...within(R) },
      { price: R.high - R.h * 0.22, bars: 3, ...within(R) },
      { price: R.low + R.h * 0.15, bars: 5, ...within(R) },
      { price: R.mid, bars: 4, ...within(R) },
    ];
    const e = ends(path);
    let candles = build(rand, R, path, R.low + R.h * 0.1);
    const iStart = e[1], iEnd = e[2], iMidPush = e[1] + 3, iLower = e[4];
    let pts = [
      { i: iStart, p: R.low, key: "start" },
      { i: iEnd, p: R.high, key: "end" },
      { i: iMidPush, p: R.mid, key: "half" },
      { i: iLower, p: R.high - R.h * 0.2, key: "lower" },
    ];
    if (down) {
      candles = mirror(candles, R);
      pts = pts.map((x) => ({ ...x, p: mp(R, x.p) }));
    }
    const letters = shuffle(rand, ["A", "B", "C", "D"]);
    pts.forEach((x, k) => (x.l = letters[k]));
    const askEnd = rand() < 0.5;
    const move = down ? "dump" : "push";
    const askName = askEnd ? (down ? "range low" : "range high") : down ? "range high" : "range low";
    const target = askEnd ? "end" : "start";
    const why = {
      start: `Dit is het begin van de ${move}: de candle waar de hele beweging startte. Daar teken je de ${down ? "range high" : "range low"}.`,
      end: `Dit is het einde van de ${move}: de eerste plek waar de beweging stopte. Daar teken je de ${down ? "range low" : "range high"}.`,
      half: `Dit is halverwege de ${move}. Daar ligt ongeveer de mid, maar die teken je pas achteraf met de Fib-tool (0 / 0,5 / 1).`,
      lower: `Dit is een latere ${down ? "hogere low" : "lagere high"} binnen de range. Niet het extreme punt van de ${move}, dus geen rand.`,
    };
    return {
      cat: "range",
      title: "Waar teken je de range?",
      prompt: `Je tekent de range vanaf deze ${move}. Waar zet je de <strong>${askName}</strong>?`,
      svg: C.candleSVG(candles, { markers: pts.map((x) => ({ i: x.i, price: x.p, label: x.l })) }),
      options: pts.map((x) => (x.key === target ? ok : no)("Punt " + x.l, why[x.key])),
      lesson: "Teken een range altijd van het begin van de push (of dump) tot het einde ervan. Begin bij de uitersten. Wick of body hangt af van de chart: kijk waar de koers steeds op terugkomt.",
    };
  });

  T.push(function midCheck(rand) {
    const R = makeRange(rand);
    // Koers die de mid meerdere keren als support en resistance gebruikt (flips).
    const path = [
      { price: R.high - R.h * 0.05, bars: 5, wickTo: R.high, ...within(R) },
      { price: R.mid + R.h * 0.04, bars: 4, wickTo: R.mid, clampLow: R.mid },
      { price: R.high - R.h * 0.08, bars: 4, ...within(R) },
      { price: R.mid - R.h * 0.12, bars: 4, ...within(R) },
      { price: R.low + R.h * 0.06, bars: 4, wickTo: R.low, ...within(R) },
      { price: R.mid - R.h * 0.04, bars: 4, wickTo: R.mid, clampHigh: R.mid },
      { price: R.low + R.h * 0.12, bars: 3, ...within(R) },
      { price: R.mid + R.h * 0.15, bars: 4, ...within(R) },
    ];
    const candles = build(rand, R, path, R.mid);
    return {
      cat: "range",
      title: "Staat je range goed?",
      prompt: "Je hebt deze range getekend. Hoe controleer je of hij goed staat?",
      svg: C.candleSVG(candles, { lines: rangeLines(R) }),
      options: shuffle(rand, [
        ok("De mid moet aansluiten op support en resistance (flips)", "Klopt. Een goede mid werkt als resistance, flipt, en werkt dan als support (met de bodies erboven of eronder). Ligt je mid ‘random’ waar niets reageert, dan pas je de high of low aan."),
        no("De RSI moet op 50 staan bij de mid", "De RSI zegt niets over waar je range staat. De controle is de prijsreactie op de mid."),
        no("Er moeten minstens 100 candles in zitten", "Het aantal candles maakt niet uit. Het gaat om de reacties op de levels."),
        no("Er mogen geen wicks door de levels gaan", "Wicks mogen. Zolang de bodies boven of onder het level blijven, telt het als support of resistance. Veel wicks maken een range wel minder betrouwbaar."),
      ]),
      lesson: "Check je range met de mid: die moet ‘perfect’ aansluiten op support en resistance. Doet hij dat niet, dan ligt je high of low waarschijnlijk verkeerd.",
    };
  });

  T.push(function distribution(rand) {
    const R = makeRange(rand);
    const upper = rand() < 0.5;
    // Veel tijd in de onderste helft, snelle spikes naar boven (spiegelen voor de bovenkant).
    const path = [];
    for (let k = 0; k < 3; k++) {
      path.push({ price: R.low + R.h * (0.18 + rand() * 0.12), bars: 5, ...within(R) });
      path.push({ price: R.low + R.h * (0.05 + rand() * 0.06), bars: 4, wickTo: R.low, ...within(R) });
      path.push({ price: R.low + R.h * (0.25 + rand() * 0.1), bars: 4, ...within(R) });
      path.push({ price: R.high - R.h * 0.04, bars: 2, wickTo: R.high, ...within(R) });
      path.push({ price: R.low + R.h * 0.3, bars: 2, ...within(R) });
    }
    let candles = build(rand, R, path, R.low + R.h * 0.2);
    if (upper) candles = mirror(candles, R);
    const half = upper ? "bovenste" : "onderste";
    const other = upper ? "onderste" : "bovenste";
    return {
      cat: "range",
      title: "Verdeling van de range",
      prompt: "Bekijk hoeveel tijd de koers in elke helft van de range doorbrengt. Wat is de juiste conclusie?",
      svg: C.candleSVG(candles, { lines: rangeLines(R) }),
      options: shuffle(rand, [
        ok(`±80% in de ${half} helft: door de ${other} helft beweegt de koers snel`, `De koers zit het grootste deel van de tijd in de ${half} helft en schiet in een paar candles door de ${other} helft. Zo weet je dat een trade richting de ${other} kant snel gaat, en een trade in de ${half} helft langer duurt.`),
        no("50/50: de koers is evenwichtig verdeeld", `Tel de candles: de meeste zitten in de ${half} helft. Uitzoeken hoe de koers verdeeld is, is precies de informatie die je uit een range wilt halen.`),
        no(`±80% in de ${other} helft`, `Andersom: de ${other} helft wordt alleen kort aangetikt met snelle spikes.`),
        no("De verdeling zegt niets, alleen de randen tellen", "De verdeling vertelt je hoe snel de koers door een deel van de range gaat, en dus hoe lang een trade ongeveer duurt."),
      ]),
      lesson: "Haal zoveel mogelijk informatie uit elke range: welk percentage zit aan welke kant, welke kant is snel en welke traag, en hoeveel deviaties of swing failures zijn er.",
    };
  });

  T.push(function rangeInRange(rand) {
    const tfs = pick(rand, [["4H", "1H"], ["1D", "4H"], ["1H", "15m"]]);
    return {
      cat: "range",
      title: "Range binnen een range",
      prompt: `Je zit in een trade op je <strong>${tfs[0]}-range</strong>. Binnen die range vormt zich nu een kleinere <strong>${tfs[1]}-range</strong>. Wat doe je?`,
      svg: "",
      options: shuffle(rand, [
        ok(`De ${tfs[0]}-range blijft leading: je negeert de kleine range in deze trade`, "De range die je trade, is leading. Als je halverwege overstapt naar de kleinere range, pak je per ongeluk kleinere winsten en is je hele risk-reward weg. Zo meng je twee ‘businesses’ door elkaar."),
        no(`Je TP verplaatsen naar de high van de ${tfs[1]}-range`, "Dan pak je kleinere winsten dan gepland en klopt je R:R niet meer met je oorspronkelijke trade."),
        no("Beide ranges tegelijk traden", "Juist niet overcompliceren. Kies vóór je trade welke range het gunstigst is, en houd je daaraan."),
        no("De trade sluiten omdat de structuur veranderd is", "Een kleinere range binnen je range is normaal: overal in de chart zitten ranges. Je plan op je eigen timeframe blijft gelden."),
      ]),
      lesson: "Je vindt ranges op elk timeframe. Kies vóóraf de gunstigste (bijv. 4H, 1H of 15m) en blijf daarbij. Die range is leading.",
    };
  });

  // ===== Deviaties & swing failures =====

  T.push(function devVsSfp(rand) {
    const R = makeRange(rand);
    const kind = pick(rand, ["dev", "sfp", "noreclaim"]);
    const short = rand() < 0.5;
    let { candles, extreme } = lowEvent(rand, R, kind === "dev" ? "retest" : kind === "sfp" ? "sfp" : "noreclaim");
    const n = candles.length;
    const mi = kind === "sfp" ? n - 3 : kind === "dev" ? n - 6 : n - 4;
    let mpz = extreme - R.h * 0.04;
    if (short) {
      candles = mirror(candles, R);
      mpz = mp(R, mpz);
    }
    const lvl = short ? "range high" : "range low";
    const side = short ? "boven" : "onder";
    const answers = {
      dev: `Deviatie: er sloten candles ${side} de ${lvl}, daarna reclaimde de koers terug binnen de range.`,
      sfp: `Swing failure: de koers ging alleen met een wick ${side} de ${lvl}, maar er sloot geen candle buiten de range.`,
      noreclaim: `Nog geen deviatie of swing failure: de koers sluit ${side} de ${lvl} en is nog niet terug binnen. Zonder reclaim is het (nog) een breakout naar buiten.`,
    };
    const correct = { dev: "Deviatie", sfp: "Swing failure", noreclaim: "Nog geen reclaim: koers staat buiten de range" }[kind];
    return {
      cat: "trigger",
      title: "Deviatie of swing failure?",
      prompt: `Wat zie je bij punt <strong>A</strong> bij de ${lvl}?`,
      svg: C.candleSVG(candles, { lines: rangeLines(R), markers: [{ i: mi, price: mpz, label: "A" }] }),
      options: shuffle(rand, [
        (kind === "dev" ? ok : no)("Deviatie", kind === "dev" ? "Goed. " + answers.dev : `Bij een deviatie moeten er candles buiten de range sluiten én moet de koers terug binnen komen. ${kind === "sfp" ? "Hier is alleen een wick buiten de range." : "Hier is de koers nog niet terug binnen."}`),
        (kind === "sfp" ? ok : no)("Swing failure", kind === "sfp" ? "Goed. " + answers.sfp : "Bij een swing failure gaat alleen een wick buiten de range, zonder close buiten. Hier sloten er wel candles buiten de range."),
        (kind === "noreclaim" ? ok : no)("Nog geen reclaim: koers staat buiten de range", kind === "noreclaim" ? "Goed. " + answers.noreclaim : "De koers is wél terug binnen de range."),
        no("Mid flip", "De mid ligt in het midden van de range. Dit gebeurt bij de rand."),
      ]),
      lesson: "Deviatie = candle sluit buiten de range en reclaimt terug binnen. Swing failure = alleen een wick buiten, geen close. Deviaties zijn meestal tradeable, swing failures vaak niet.",
    };
  });

  T.push(function sfpQuality(rand) {
    const R = makeRange(rand);
    const good = rand() < 0.5;
    const depth = good ? 0.04 + rand() * 0.04 : 0.32 + rand() * 0.25;
    const short = rand() < 0.5;
    let { candles } = lowEvent(rand, R, "sfp", { depth });
    const entry = R.low + R.h * 0.06;
    const sl = R.low - R.h * (depth + 0.02);
    const tp1 = R.mid;
    const rr = (tp1 - entry) / (entry - sl);
    let lines = [
      { price: tp1, label: "Mid (TP1)", color: COL.mid },
      { price: entry, label: "Entry", color: COL.entry, dash: false },
      { price: R.low, label: "Range low", color: COL.rl },
      { price: sl, label: "SL", color: COL.sl },
    ];
    if (short) {
      candles = mirror(candles, R);
      lines = lines.map((l) => ({ ...l, price: mp(R, l.price), label: l.label === "Range low" ? "Range high" : l.label }));
    }
    const rrTxt = num(rr, 1) + "R";
    return {
      cat: "trigger",
      title: "Goede of slechte swing failure?",
      prompt: `Swing failure bij de ${short ? "range high" : "range low"}. Je stop moet voorbij de wick. Is dit een tradeable swing failure? (R:R tot TP1 ≈ <strong>${rrTxt}</strong>)`,
      svg: C.candleSVG(candles, { lines }),
      options: shuffle(rand, [
        (good ? ok : no)("Goede swing failure: tradeable", good ? `De wick is klein, dus je stop voorbij de wick staat dichtbij. Van entry tot TP1 (mid) is dat ±${rrTxt}: nog steeds een goede trade.` : `De wick is zo groot dat je stop ver weg moet. Tot TP1 haal je maar ±${rrTxt}. Dat is geen goede risk-reward.`),
        (!good ? ok : no)("Slechte swing failure: dit level is (voorlopig) niet tradeable", !good ? `Goed. Door de grote wick moet je stop zo ver weg dat je tot TP1 maar ±${rrTxt} haalt. Zo’n wick maakt het level ontradeable: wacht op de andere kant van de range. Dat redt je vaak van verliezen.` : `De wick is klein: met een stop voorbij de wick haal je ±${rrTxt} tot TP1. Dat is wel tradeable.`),
        no("Elke swing failure is een entry", "Nee. De grootte van de wick bepaalt of je risk-reward nog klopt. Grote wicks maken een level juist ontradeable."),
        no("Een swing failure is altijd beter dan een deviatie", "Andersom: een deviatie is meestal beter tradeable. Swing failures zijn vaak minder bruikbaar."),
      ]),
      lesson: "Bij een swing failure bepaalt de grootte van de wick alles. Een kleine wick (goede SFP) is tradeable. Een grote wick (slechte SFP) maakt het level ontradeable, omdat je stop te ver van TP1 komt.",
    };
  });

  T.push(function reclaimRetest(rand) {
    const R = makeRange(rand);
    const kind = pick(rand, ["retest", "retest", "clean", "noreclaim"]);
    const short = rand() < 0.5;
    let { candles } = lowEvent(rand, R, kind);
    if (short) candles = mirror(candles, R);
    const dir = short ? "Short" : "Long";
    const lvl = short ? "range high" : "range low";
    const flip = short ? "resistance (was support)" : "support (was resistance)";
    const desc = {
      retest: `De koers deviëerde ${short ? "boven" : "onder"} de ${lvl}, reclaimde terug binnen, en de laatste candles testen de ${lvl} opnieuw. Die houdt.`,
      clean: `De koers deviëerde ${short ? "boven" : "onder"} de ${lvl} en schoot daarna in één ruk terug de range in, richting de mid.`,
      noreclaim: `De koers sluit ${short ? "boven" : "onder"} de ${lvl} en blijft daar.`,
    }[kind];
    const options = {
      retest: [
        ok(`${dir} op de retest van de ${lvl}`, `Dit is de trigger: deviatie, reclaim, en de retest waarbij het level flipt naar ${flip}. Stop voorbij de deviatie, TP1 bij de mid.`),
        no("Niets doen, dit is een clean break", "Een clean break is direct terug naar binnen zónder retest. Hier komt de koers wél terug voor de retest, en dat is juist de entry."),
        no(`${short ? "Long" : "Short"}, de range is gebroken`, "De koers is weer binnen de range en het level houdt bij de retest. De breakout naar buiten is mislukt."),
        no("Wachten tot de koers bij de mid is", "Bij de mid neem je winst (TP1). Daar instappen geeft een slechte R:R."),
      ],
      clean: [
        ok("Geen trade: clean break zonder retest, niet achter de koers aan", "Na de reclaim kwam er geen retest. Er is dus geen moment waarop het level flipt en je je trigger kunt nemen. Zo’n deviatie met clean break is niet tradeable. Achter de koers aan stappen geeft een slechte R:R."),
        no(`${dir} nu, richting de mid`, "De koers is al ver van het level weg. Je stop moet voorbij de deviatie, dus je risico is groot en je ruimte tot TP1 klein."),
        no(`${short ? "Long" : "Short"} bij de mid`, "Dat is een nieuw idee zonder trigger bij een rand van de range."),
        no("Een limit order op de range low/high en hopen op een retest", "Zonder trigger heb je geen setup. Je wacht op een nieuwe situatie in plaats van een order op hoop te zetten."),
      ],
      noreclaim: [
        ok("Wachten: er is (nog) geen reclaim", `Zolang de koers ${short ? "boven" : "onder"} de ${lvl} blijft sluiten, is er geen deviatie-trigger. Je wacht op een reclaim + retest, of je markeert een nieuwe range.`),
        no(`${dir} nu, de koers komt vast terug`, "Zonder reclaim heb je geen bevestiging. Dat is een vallend mes vangen."),
        no(`Stop ruimer zetten en alsnog ${dir.toLowerCase()}`, "Je stop aanpassen om een trade passend te maken breekt je risk management. Geen trigger = geen trade."),
        no(`${short ? "Long" : "Short"} met vol risico, de range is voorbij`, "Een paar closes buiten de range is nog geen bevestigde nieuwe structuur. Wacht op de nieuwe range of een retest."),
      ],
    }[kind];
    return {
      cat: "trigger",
      title: kind === "retest" ? "Reclaim + retest" : kind === "clean" ? "Clean break" : "Geen reclaim",
      prompt: desc + " <strong>Wat doe je?</strong>",
      svg: C.candleSVG(candles, { lines: rangeLines(R) }),
      options: shuffle(rand, options),
      lesson: "Deviaties zijn je vriend: reclaim + retest = het level flipt (resistance → support of andersom) en daar haal je de trekker over. Clean break zonder retest = geen trade.",
    };
  });

  T.push(function midRange(rand) {
    const R = makeRange(rand);
    const candles = build(rand, R, [...rangePath(rand, R, 6), { price: R.mid + R.h * (rand() - 0.5) * 0.12, bars: 6, clampHigh: R.high - R.h * 0.2, clampLow: R.low + R.h * 0.2 }]);
    return {
      cat: "trigger",
      title: "Midden van de range",
      prompt: "De koers staat rond de mid, zonder deviatie of retest. Wat doe je?",
      svg: C.candleSVG(candles, { lines: rangeLines(R) }),
      options: shuffle(rand, [
        ok("Geen trade: wachten op een trigger bij een rand van de range", "Rond de mid heb je geen voordeel: je stop moet ver weg en je target is even ver als je risico. Bij de range high of low krijg je een strakke stop en veel meer ruimte."),
        no("Long, de koers kwam van onder", "Richting raden in het midden is gokken: er is geen trigger en geen level om je stop achter te zetten."),
        no("Short, de koers kwam van boven", "Zelfde probleem: geen trigger, slechte R:R."),
        no("Long en short tegelijk", "Dan betaal je dubbele fees zonder voordeel. Geduld tot de randen."),
      ]),
      lesson: "De mid is een support/resistance-level en een logisch TP1. Je triggers zoek je bij de randen van de range.",
    };
  });

  // ===== Stops & targets =====

  T.push(function stopLoss(rand) {
    const R = makeRange(rand);
    const short = rand() < 0.5;
    let { candles, extreme } = lowEvent(rand, R, "retest");
    const n = candles.length;
    let A = extreme - R.h * 0.04, B = R.low + R.h * 0.02, Cc = R.mid;
    if (short) {
      candles = mirror(candles, R);
      [A, B, Cc] = [A, B, Cc].map((p) => mp(R, p));
    }
    const letters = shuffle(rand, ["A", "B", "C"]);
    const pts = [
      { p: A, l: letters[0], good: true, why: `Net voorbij de deviatie. Daar is je idee ongeldig: komt de koers daar, dan was de reclaim fout en zit je ‘in een andere structuur’.` },
      { p: B, l: letters[1], good: false, why: `Net ${short ? "boven de range high" : "onder de range low"} zit binnen het bereik van de deviatie. Een nieuwe wick naar hetzelfde gebied stopt je uit, terwijl je idee nog klopt.` },
      { p: Cc, l: letters[2], good: false, why: `De mid ligt ${short ? "onder" : "boven"} je entry: dat is je TP1, geen stoploss.` },
    ];
    return {
      cat: "sltp",
      title: "Waar zet je je stoploss?",
      prompt: `Je gaat <strong>${short ? "short" : "long"}</strong> op de retest na de deviatie. Waar plaats je je stoploss?`,
      svg: C.candleSVG(candles, { lines: rangeLines(R), markers: pts.map((x) => ({ i: n - 1, price: x.p, label: x.l })) }),
      options: shuffle(rand, pts).map((x) => (x.good ? ok : no)("Punt " + x.l, x.why)),
      lesson: "Je stop gaat voorbij de deviatie of swing failure: het punt waarop je idee ongeldig is. Check altijd of de R:R tot TP1 dan nog goed is.",
    };
  });

  T.push(function takeProfit(rand) {
    const R = makeRange(rand);
    const short = rand() < 0.5;
    let { candles } = lowEvent(rand, R, "retest");
    const n = candles.length;
    let A = R.mid, B = R.high, Cc = R.high + R.h * 0.5;
    if (short) {
      candles = mirror(candles, R);
      [A, B, Cc] = [A, B, Cc].map((p) => mp(R, p));
    }
    const letters = shuffle(rand, ["A", "B", "C"]);
    const pts = [
      { p: A, l: letters[0], good: true, why: "De mid is het eerste support/resistance-level binnen de range en daarmee je logische eerste take profit. Neem hier deelwinst en zet je stop op break-even (‘TP1 + BE’ in je journal)." },
      { p: B, l: letters[1], good: false, why: `De ${short ? "range low" : "range high"} is de andere kant van de range: je TP2, niet je TP1.` },
      { p: Cc, l: letters[2], good: false, why: "Een target buiten de range gaat uit van een breakout. In een range-trade is de andere rand je eindtarget." },
    ];
    return {
      cat: "sltp",
      title: "Waar ligt TP1?",
      prompt: `Je bent <strong>${short ? "short" : "long"}</strong> gegaan op de retest van de ${short ? "range high" : "range low"}. Waar ligt je <strong>eerste take profit</strong>?`,
      svg: C.candleSVG(candles, { lines: rangeLines(R), markers: pts.map((x) => ({ i: n - 1, price: x.p, label: x.l })) }),
      options: shuffle(rand, pts).map((x) => (x.good ? ok : no)("Punt " + x.l, x.why)),
      lesson: "Ranges zijn sterk voor exits: TP1 bij de mid (deelwinst + BE), TP2 bij de andere kant van de range.",
    };
  });

  // ===== Setup types (uit je journal) =====

  T.push(function setupType(rand) {
    const R = makeRange(rand);
    const kind = pick(rand, ["Reversal", "Reclaim", "Breakout", "Continuation"]);
    let path;
    let lines = rangeLines(R);
    let start = R.mid;
    if (kind === "Reversal") {
      path = rangePath(rand, R, 5);
      path.push({ price: R.low + R.h * 0.06, bars: 5, wickTo: R.low, ...within(R) });
      path.push({ price: R.low + R.h * 0.35, bars: 3, ...within(R) });
    } else if (kind === "Reclaim") {
      path = rangePath(rand, R, 5);
      path.push({ price: R.low + R.h * 0.12, bars: 4, ...within(R) });
      path.push({ price: R.low - R.h * 0.12, bars: 3, clampHigh: R.low - R.h * 0.02 });
      path.push({ price: R.low + R.h * 0.12, bars: 2 });
      path.push({ price: R.low + R.h * 0.03, bars: 2, wickTo: R.low, clampLow: R.low });
      path.push({ price: R.low + R.h * 0.25, bars: 2, clampLow: R.low });
    } else if (kind === "Breakout") {
      path = rangePath(rand, R, 5);
      path.push({ price: R.high + R.h * 0.3, bars: 3 });
      path.push({ price: R.high + R.h * 0.4, bars: 3, clampLow: R.high + R.h * 0.08 });
      path.push({ price: R.high + R.h * 0.04, bars: 3, wickTo: R.high, clampLow: R.high - R.h * 0.02 });
      path.push({ price: R.high + R.h * 0.2, bars: 3, clampLow: R.high });
    } else {
      const s = R.low, h = R.h;
      start = s;
      path = [
        { price: s + h * 0.6, bars: 6 }, { price: s + h * 0.3, bars: 4 },
        { price: s + h * 1.0, bars: 6 }, { price: s + h * 0.65, bars: 4 },
        { price: s + h * 1.4, bars: 6 }, { price: s + h * 1.02, bars: 5, wickTo: s + h * 1.0 },
        { price: s + h * 1.25, bars: 3 },
      ];
      lines = [{ price: s + h * 1.0, label: "Oude high", color: COL.neutral }];
    }
    const candles = build(rand, R, path, start);
    const why = {
      Reversal: "Reversal: de koers tikt de rand van de range aan en draait direct om, zonder buiten de range te sluiten.",
      Reclaim: "Reclaim: deviatie (candles sloten buiten de range), daarna terug binnen, met een retest waarbij het level flipt. Dit is de klassieke deviatie-trade.",
      Breakout: "Breakout: de koers breekt uit de range, blijft erbuiten en de retest van de oude rand houdt. Er vormt zich een nieuwe range.",
      Continuation: "Continuation: in een trend (hogere highs en hogere lows) komt een pullback naar een oud level, waarna de trend doorgaat.",
    };
    return {
      cat: "setup",
      title: "Welk setup type?",
      prompt: "Welk setup type uit je journal zie je rechts in de grafiek?",
      svg: C.candleSVG(candles, { lines }),
      options: S.OPTIONS.setup.map((k) => (k === kind ? ok : no)(k, (k === kind ? "Goed. " : "Niet dit type. ") + why[k])),
      lesson: "Reversal = afwijzing aan de rand. Reclaim = deviatie + reclaim + retest. Breakout = uitbraak + retest, er ontstaat een nieuwe range. Continuation = vervolg van de trend na een pullback.",
    };
  });

  T.push(function rangeTradeable(rand) {
    const R = makeRange(rand);
    const kind = pick(rand, ["fast", "wicks", "good"]);
    let path;
    if (kind === "fast") {
      path = [];
      for (let k = 0; k < 4; k++) {
        path.push({ price: R.high - R.h * 0.03, bars: 2, wickTo: R.high, ...within(R) });
        path.push({ price: R.low + R.h * 0.03, bars: 2, wickTo: R.low, ...within(R) });
      }
    } else if (kind === "wicks") {
      path = [];
      for (let k = 0; k < 3; k++) {
        path.push({ price: R.high - R.h * 0.1, bars: 5, ...within(R) });
        path.push({ price: R.low + R.h * 0.08, bars: 2, wickTo: R.low - R.h * (0.35 + rand() * 0.2), clampLow: R.low + R.h * 0.02 });
        path.push({ price: R.low + R.h * 0.2, bars: 3, ...within(R) });
      }
    } else {
      path = rangePath(rand, R, 6).map((p) => ({ ...p, bars: p.bars + 3 }));
    }
    const candles = build(rand, R, path, R.mid);
    const verdict = {
      fast: "Minder gunstig: de koers schiet in een paar candles van rand naar rand. Bij zulke snelle prijsontwikkeling krijg je geen rustige triggers. Liever een range met langzame ontwikkeling.",
      wicks: "De range low is ontradeable: er zitten grote swing failures (wicks) onder. Je stop moet daar voorbij en dan klopt je R:R niet meer. Wacht op de range high, daar is de price action beter.",
      good: "Goed tradeable: rustige, langzame prijsontwikkeling en duidelijke reacties op de randen, zonder grote wicks.",
    };
    const label = { fast: "Te snelle prijsontwikkeling: minder gunstig", wicks: "Range low ontradeable door grote wicks", good: "Goed tradeable: rustige ontwikkeling, schone randen" };
    return {
      cat: "setup",
      title: "Is deze range tradeable?",
      prompt: "Niet elke range is tradeable. Wat is je oordeel over deze range?",
      svg: C.candleSVG(candles, { lines: rangeLines(R) }),
      options: shuffle(rand, [
        ...Object.keys(label).map((k) => (k === kind ? ok : no)(label[k], (k === kind ? "Goed. " : "Niet in deze grafiek. ") + verdict[k])),
        no("Elke range is tradeable", "Nee. Er zijn ranges zonder enige trade-opportunity. Een trade forceren is precies wat je niet wilt."),
      ]),
      lesson: "Dat iets een range is, betekent niet dat je hem moet traden. Let op de snelheid van de prijsontwikkeling (liever langzaam) en op grote wicks die een level ontradeable maken.",
    };
  });

  T.push(function breakout(rand) {
    const R = makeRange(rand);
    const short = rand() < 0.5;
    const path = rangePath(rand, R, 5);
    path.push({ price: R.high + R.h * 0.3, bars: 3 });
    path.push({ price: R.high + R.h * 0.4, bars: 4, clampLow: R.high + R.h * 0.08 });
    path.push({ price: R.high + R.h * 0.04, bars: 3, wickTo: R.high, clampLow: R.high - R.h * 0.02 });
    path.push({ price: R.high + R.h * 0.14, bars: 2, clampLow: R.high });
    let candles = build(rand, R, path);
    if (short) candles = mirror(candles, R);
    const lvl = short ? "range low" : "range high";
    return {
      cat: "setup",
      title: "Deviatie of breakout?",
      prompt: `De koers sloot buiten de ${lvl}, bleef daar meerdere candles en de retest van het oude level houdt. Is dit een deviatie?`,
      svg: C.candleSVG(candles, { lines: rangeLines(R) }),
      options: shuffle(rand, [
        ok("Nee: geen reclaim, het oude level is geflipt. Dit is een breakout", `Een deviatie reclaimt terug binnen de range. Hier blijft de koers buiten en houdt de oude ${lvl} nu als ${short ? "resistance" : "support"}. Dat is een breakout en het begin van een nieuwe range.`),
        no("Ja, de koers gaat zo terug naar de andere kant", "Pas bij een reclaim terug binnen de range is het een deviatie. Die is er niet."),
        no("Ja, want er zit een wick naar het level", "Een wick naar het oude level van buitenaf is een retest, geen reclaim."),
        no("Het maakt niet uit, je trade gewoon de oude range", "Na een breakout klopt je oude range niet meer. Je markeert een nieuwe, waarbij de oude levels belangrijke data blijven."),
      ]),
      lesson: "Deviatie = terug binnen de range. Breakout = buiten blijven + retest. Oude ranges blijven bruikbare levels voor de toekomst.",
    };
  });

  // ===== Breakouts: van de ene range naar de volgende =====
  // Basis voor alle breakout-opdrachten: een range, uitbraak boven de range high met
  // acceptatie, en (optioneel) een retest van de oude high die houdt. Spiegelen = short.
  function breakoutPath(rand, R, { retest = true, run = 0.35 } = {}) {
    const path = rangePath(rand, R, 5); // eindigt bij de high
    path.push({ price: R.high + R.h * (run * 0.7), bars: 3, clampLow: R.high + R.h * 0.03 });
    path.push({ price: R.high + R.h * run, bars: 5, clampLow: R.high + R.h * 0.06 });
    if (retest) {
      path.push({ price: R.high + R.h * 0.04, bars: 3, wickTo: R.high - R.h * 0.01, clampLow: R.high + R.h * 0.01 });
      path.push({ price: R.high + R.h * 0.1, bars: 1, clampLow: R.high + R.h * 0.02 });
    }
    return path;
  }

  T.push(function breakoutAcceptance(rand) {
    const R = makeRange(rand);
    const short = rand() < 0.5;
    const accepted = rand() < 0.5;
    let path;
    if (accepted) path = breakoutPath(rand, R, { retest: false, run: 0.3 });
    else {
      path = rangePath(rand, R, 5);
      path.push({ price: R.high + R.h * 0.18, bars: 2, clampLow: R.high + R.h * 0.06 });
      path.push({ price: R.high - R.h * 0.25, bars: 4, clampHigh: R.high - R.h * 0.03 });
      path.push({ price: R.mid + R.h * 0.1, bars: 3, ...within(R) });
    }
    let candles = build(rand, R, path);
    if (short) candles = mirror(candles, R);
    const lvl = short ? "range low" : "range high";
    const dir = short ? "short" : "long";
    return {
      cat: "setup",
      title: "Breakout met acceptatie?",
      prompt: `De koers ging door de ${lvl}. Wat zie je?`,
      svg: C.candleSVG(candles, { lines: rangeLines(R) }),
      options: shuffle(rand, [
        (accepted ? ok : no)(
          "Breakout met acceptatie: de koers blijft buiten de range sluiten",
          accepted
            ? `Goed. Candle na candle sluit buiten de ${lvl}: de markt accepteert de nieuwe prijzen. Nu wacht je op de retest van de oude ${lvl}.`
            : `Nee. Na twee candles sloot de koers weer binnen de range: er is geen acceptatie. Dit was een deviatie.`
        ),
        (!accepted ? ok : no)(
          "Deviatie: de koers sloot snel weer binnen de range",
          !accepted
            ? `Goed. Even buiten de ${lvl}, daarna direct terug binnen: een deviatie. Dat is juist een range-setup de andere kant op (reclaim), geen breakout.`
            : "Nee. De koers is niet teruggekomen; hij blijft buiten de range sluiten."
        ),
        no(`Direct ${dir} op de eerste candle door de ${lvl}`, "Eén candle door het level bewijst nog niets: de meeste uitbraken blijken een deviatie. Je wacht op acceptatie (meerdere closes buiten de range) en een retest."),
        no("Een wick door het level is genoeg voor een breakout", "Een wick zonder close erbuiten is een swing failure. Voor een breakout tellen alleen closes buiten de range, meerdere op rij."),
      ]),
      lesson: "Breakout = meerdere closes op rij buiten de range (acceptatie). Snel terug binnen = deviatie. Pas na acceptatie wacht je op de retest.",
    };
  });

  T.push(function breakoutEntry(rand) {
    const R = makeRange(rand);
    const short = rand() < 0.5;
    let candles = build(rand, R, breakoutPath(rand, R, { retest: false, run: 0.38 }));
    if (short) candles = mirror(candles, R);
    const lvl = short ? "range low" : "range high";
    const dir = short ? "short" : "long";
    return {
      cat: "setup",
      title: "Najagen of wachten?",
      prompt: `De koers is uitgebroken door de ${lvl} en sluit al een tijd erbuiten. Je wilt de breakout ${dir} spelen. Wat doe je?`,
      svg: C.candleSVG(candles, { lines: rangeLines(R) }),
      options: shuffle(rand, [
        ok(`Limit order op de retest van de oude ${lvl}`, `Goed. Je stapt in als de koers terugkomt naar de oude ${lvl} en die houdt (level flip). Dan staat je stop dichtbij, terug in de range, en is je R:R goed.`),
        no(`Nu ${dir} tegen de huidige prijs, anders mis je hem`, "Dat is najagen (FOMO). Je stop moet dan ver weg, terug in de range, en je R:R tot het target is slecht. Mist hij de retest, dan laat je hem gaan."),
        no(`${short ? "Long" : "Short"}, de koers is al te ver gelopen`, "Tegen een geaccepteerde breakout in traden betekent tegen de nieuwe beweging in. Daar is geen setup voor."),
        no("Instappen bij de mid van de oude range", "De oude mid ligt diep in de oude range. Komt de koers daar, dan is de breakout mislukt."),
      ]),
      lesson: "Een breakout jaag je niet na. Entry op de retest van de oude rand, en alleen als die houdt.",
    };
  });

  T.push(function breakoutStop(rand) {
    const R = makeRange(rand);
    const short = rand() < 0.5;
    let candles = build(rand, R, breakoutPath(rand, R));
    const n = candles.length;
    let A = R.high - R.h * 0.12, B = R.high + R.h * 0.01, Cc = R.low - R.h * 0.03;
    if (short) {
      candles = mirror(candles, R);
      [A, B, Cc] = [A, B, Cc].map((p) => mp(R, p));
    }
    const lvl = short ? "range low" : "range high";
    const letters = shuffle(rand, ["A", "B", "C"]);
    const pts = [
      { p: A, l: letters[0], good: true, why: `Net terug binnen de oude range, voorbij de lont van de retest. Sluit de koers daar, dan houdt de oude ${lvl} niet meer en is de breakout mislukt: precies het punt waarop je idee ongeldig is.` },
      { p: B, l: letters[1], good: false, why: `Precies op de oude ${lvl} ligt je stop binnen het bereik van de retest. Een gewone lont naar het level stopt je uit, terwijl de breakout nog klopt.` },
      { p: Cc, l: letters[2], good: false, why: `Aan de andere kant van de oude range is je stop veel te ver weg: je R:R is dan slecht. Komt de koers diep terug in de range, dan is de breakout allang mislukt.` },
    ];
    return {
      cat: "sltp",
      title: "Stop bij een breakout",
      prompt: `Je gaat <strong>${short ? "short" : "long"}</strong> op de retest van de oude ${lvl} na een breakout. Waar zet je je stoploss?`,
      svg: C.candleSVG(candles, { lines: rangeLines(R), markers: pts.map((x) => ({ i: n - 1, price: x.p, label: x.l })) }),
      options: shuffle(rand, pts).map((x) => (x.good ? ok : no)("Punt " + x.l, x.why)),
      lesson: "Bij een breakout staat je stop terug binnen de oude range, voorbij de lont van de retest. Komt de koers daar, dan is de breakout mislukt.",
    };
  });

  T.push(function breakoutTarget(rand) {
    const R = makeRange(rand);
    const short = rand() < 0.5;
    let candles = build(rand, R, breakoutPath(rand, R));
    const n = candles.length;
    let A = R.high + R.h * 0.5, B = R.mid, Cc = R.high + R.h * 2.2;
    if (short) {
      candles = mirror(candles, R);
      [A, B, Cc] = [A, B, Cc].map((p) => mp(R, p));
    }
    const letters = shuffle(rand, ["A", "B", "C"]);
    const pts = [
      { p: A, l: letters[0], good: true, why: "Een halve range-hoogte voorbij de oude rand: een logisch eerste target. Neem daar deelwinst en zet je stop op break-even. TP2 ligt een hele range-hoogte verder, waar de nieuwe range vaak eindigt." },
      { p: B, l: letters[1], good: false, why: `De oude mid ligt ${short ? "boven" : "onder"} je entry, terug in de oude range: daar ligt je stop, geen target.` },
      { p: Cc, l: letters[2], good: false, why: "Ruim twee range-hoogtes verder is geen logisch eerste target. Je geeft dan te veel weg als de breakout stokt." },
    ];
    return {
      cat: "sltp",
      title: "Target bij een breakout",
      prompt: `Je bent <strong>${short ? "short" : "long"}</strong> gegaan op de retest na een breakout. Waar ligt je <strong>TP1</strong>?`,
      svg: C.candleSVG(candles, { lines: rangeLines(R), markers: pts.map((x) => ({ i: n - 1, price: x.p, label: x.l })) }),
      options: shuffle(rand, pts).map((x) => (x.good ? ok : no)("Punt " + x.l, x.why)),
      lesson: "Na een breakout ontstaat vaak een nieuwe range van ongeveer dezelfde hoogte. TP1 = halve range-hoogte voorbij de rand, TP2 = een hele range-hoogte.",
    };
  });

  T.push(function breakoutFailed(rand) {
    const R = makeRange(rand);
    const short = rand() < 0.5;
    const path = breakoutPath(rand, R, { retest: false, run: 0.28 });
    path.push({ price: R.high - R.h * 0.22, bars: 4, clampHigh: R.high + R.h * 0.2 });
    path.push({ price: R.high - R.h * 0.3, bars: 2, clampHigh: R.high - R.h * 0.12 });
    let candles = build(rand, R, path);
    // Je stop zoals het systeem hem zet: net terug binnen de oude range.
    let stop = R.high - R.h * 0.11;
    if (short) {
      candles = mirror(candles, R);
      stop = mp(R, stop);
    }
    const lvl = short ? "range low" : "range high";
    const dir = short ? "short" : "long";
    const opp = short ? "long" : "short";
    return {
      cat: "setup",
      title: "Mislukte breakout",
      prompt: `Je zat <strong>${dir}</strong> op een breakout door de ${lvl}, met je stop net terug binnen de oude range. De koers kwam terug, <strong>je stop is geraakt</strong> en hij sluit nu weer duidelijk binnen de range. Wat doe je nu?`,
      svg: C.candleSVG(candles, { lines: [...rangeLines(R), { price: stop, label: "Stop (geraakt)", color: "#ef5350", dash: false }] }),
      options: shuffle(rand, [
        ok(
          `Niet opnieuw ${dir}: de breakout is mislukt. Kijk naar een ${opp}-setup (deviatie + reclaim van de ${lvl})`,
          `Goed. Je stop deed zijn werk: je verlies is 1R, zoals gepland. Terug binnen de range betekent dat de uitbraak een deviatie was. Zo'n mislukte breakout is vaak juist een ${opp}-setup: de koers reclaimt de ${lvl}, en na een retest heb je je trigger.`
        ),
        no(`Direct opnieuw ${dir}, hij breekt vast nog een keer uit`, "Wraak-traden (revenge trading). De breakout is net mislukt: dat is informatie, geen reden om het nog eens te proberen. Wacht op een nieuwe, geldige setup."),
        no("Volgende keer geen stop, dan was ik er nog in gebleven", "De stop beschermde je juist: de koers sloot duidelijk binnen de range, de breakout was mislukt. Zonder stop kan één mislukte breakout veel meer kosten dan 1R."),
        no("Niets: het blijft een breakout, de koers gaat zo weer verder", "Een breakout bestaat zolang de koers buiten de range blijft. Sluit hij duidelijk weer binnen, dan is het geen breakout meer."),
      ]),
      lesson: "Bij een breakout staat je stop net terug binnen de oude range. Wordt hij geraakt en sluit de koers weer binnen, dan was het een deviatie: accepteer je 1R verlies en kijk naar een reclaim de andere kant op.",
    };
  });

  T.push(function breakoutRisk(rand) {
    const variant = pick(rand, ["size", "when"]);
    if (variant === "size")
      return {
        cat: "mindset",
        title: "Breakouts en risico",
        prompt: "Breakouts mislukken vaker dan range-trades. Je risico per trade is normaal 1%. Wat doe je bij een breakout?",
        svg: "",
        options: shuffle(rand, [
          ok("Kleiner spelen (bijv. 0,5%) en strengere eisen: acceptatie, retest en minstens 2R", "Goed. Een lagere slagingskans vang je op met kleiner risico en een betere R:R. Zo kost een reeks mislukte breakouts je weinig."),
          no("Groter spelen (2%), breakouts lopen verder", "Breakouts kunnen verder lopen, maar ze mislukken ook vaker. Groter risico op een lagere winrate vergroot je drawdown."),
          no("Zelfde 1%, maar zonder stop, want hij komt toch terug", "Zonder stop kan één mislukte breakout je hele account raken. Een stop is nooit optioneel."),
          no("Alleen breakouts traden, die zijn het makkelijkst", "Breakouts zijn juist lastiger: veel uitbraken blijken een deviatie. Range-trades bij de randen hebben vaak de betere winrate."),
        ]),
        lesson: "Lagere slagingskans = kleiner risico en hogere R:R-eis. Speel breakouts kleiner dan range-trades.",
      };
    return {
      cat: "mindset",
      title: "Wanneer speel je een breakout?",
      prompt: "Welke situatie geeft de beste kans op een geslaagde breakout?",
      svg: "",
      options: shuffle(rand, [
        ok("Een goed ontwikkelde range, uitbraak met de trend mee, acceptatie en een retest die houdt", "Goed. Hoe sterker de range en hoe meer de trend meewerkt, hoe meer de uitbraak betekent. De retest bevestigt de level flip."),
        no("Een jonge range van een paar candles, uitbraak tegen de trend in", "Een jonge range heeft weinig betekenis, en tegen de trend in mislukken breakouts het vaakst."),
        no("Een uitbraak-candle met een lange lont terug in de range", "Een lange lont terug in de range laat zien dat de uitbraak werd afgewezen: dat lijkt eerder op een deviatie."),
        no("Een uitbraak vlak voor groot nieuws", "Rond groot nieuws ontstaan veel nep-uitbraken. De checklist vraagt je nieuws te checken en dan juist voorzichtig te zijn."),
      ]),
      lesson: "Beste breakouts: sterke range, met de trend mee, acceptatie en een retest die houdt. Anders: overslaan.",
    };
  });

  // ===== Technische analyse basis =====

  T.push(function candleAnatomy(rand) {
    const bull = rand() < 0.5;
    const o = bull ? 10 : 14, c = bull ? 14 : 10, hi = 16, lo = 8;
    const W = 720, H = 320, y = (p) => 20 + ((17 - p) / 10) * 280, cx = 300;
    const parts = shuffle(rand, ["upper", "body", "lower", "close"]);
    const letters = ["A", "B", "C", "D"];
    const pos = {
      upper: [cx + 70, y((hi + Math.max(o, c)) / 2)],
      body: [cx + 70, y((o + c) / 2)],
      lower: [cx + 70, y((lo + Math.min(o, c)) / 2)],
      close: [cx - 90, y(c)],
    };
    let s = `<svg class="cchart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Candle"><rect width="${W}" height="${H}" class="cc-bg"/>`;
    const cls = bull ? "cc-up" : "cc-down";
    s += `<line x1="${cx}" x2="${cx}" y1="${y(hi)}" y2="${y(lo)}" class="${cls}-w" stroke-width="3"/>`;
    s += `<rect x="${cx - 40}" y="${y(Math.max(o, c))}" width="80" height="${y(Math.min(o, c)) - y(Math.max(o, c))}" class="${cls}"/>`;
    for (const [p, lab] of [[hi, "$16"], [Math.max(o, c), "$" + Math.max(o, c)], [Math.min(o, c), "$" + Math.min(o, c)], [lo, "$8"]]) {
      s += `<line x1="${cx + 140}" x2="${cx + 260}" y1="${y(p)}" y2="${y(p)}" class="cc-grid" stroke-dasharray="4 4"/><text x="${cx + 270}" y="${y(p) + 4}" class="eq-axis">${lab}</text>`;
    }
    // Aanwijslijntjes van de letter naar het onderdeel.
    const tip = { upper: [cx, pos.upper[1]], body: [cx + 40, pos.body[1]], lower: [cx, pos.lower[1]], close: [cx - 40, y(c)] };
    parts.forEach((pt) => {
      s += `<line x1="${pos[pt][0]}" y1="${pos[pt][1]}" x2="${tip[pt][0]}" y2="${tip[pt][1]}" stroke="#f5a623" stroke-width="1.5" stroke-dasharray="3 3"/>`;
    });
    parts.forEach((pt, k) => {
      const [mx, my] = pos[pt];
      s += `<circle cx="${mx}" cy="${my}" r="12" fill="#f5a623" stroke="#0f1115" stroke-width="2"/><text x="${mx}" y="${my + 4}" text-anchor="middle" class="cc-mk">${letters[k]}</text>`;
    });
    s += `</svg>`;
    const names = { upper: "upper wick", body: "body", lower: "lower wick", close: "close" };
    const desc = {
      upper: "het stuk van de bovenkant van de body tot de high: de koers kwam daar wel, maar sloot er niet",
      body: "het stuk tussen open en close",
      lower: "het stuk van de onderkant van de body tot de low",
      close: `de slotkoers van de candle (bij een ${bull ? "bullish candle de bovenkant" : "bearish candle de onderkant"} van de body)`,
    };
    const ask = pick(rand, parts);
    const li = (pt) => letters[parts.indexOf(pt)];
    return {
      cat: "ta",
      title: "Anatomie van een candle",
      prompt: `Dit is een <strong>${bull ? "bullish" : "bearish"}</strong> daily candle: open $${o}, high $16, low $8, close $${c}. Welke letter wijst de <strong>${names[ask]}</strong> aan?`,
      svg: s,
      options: parts.map((pt) => (pt === ask ? ok : no)(`Letter ${li(pt)}`, `${li(pt)} is de ${names[pt]}: ${desc[pt]}.${pt === "upper" && !bull ? " Ook bij een rode candle blijft dit de upper wick." : ""}`)),
      lesson: "Elke candle = één timeframe (1m, 15m, 4H, 1D …). Body = open tot close, wicks = waar de koers kwam maar niet sloot. Tip uit de video: maak je candles wit en zwart in plaats van groen en rood, zodat je minder emotioneel kijkt.",
    };
  });

  T.push(function srFlip(rand) {
    const R = makeRange(rand);
    const lvl = R.high;
    const path = [
      { price: lvl - R.h * 0.05, bars: 5, wickTo: lvl, clampHigh: lvl },
      { price: R.mid, bars: 4, clampHigh: lvl },
      { price: lvl - R.h * 0.04, bars: 4, wickTo: lvl, clampHigh: lvl },
      { price: R.mid + R.h * 0.1, bars: 4, clampHigh: lvl },
      { price: lvl + R.h * 0.35, bars: 4 },
      { price: lvl + R.h * 0.04, bars: 3, wickTo: lvl, clampLow: lvl },
      { price: lvl + R.h * 0.2, bars: 2, clampLow: lvl },
    ];
    const candles = build(rand, R, path, R.mid);
    return {
      cat: "ta",
      title: "Support & resistance",
      prompt: "Dit level was meerdere keren resistance. Daarna brak de koers erdoor en kwam terug. Wat is het level nu?",
      svg: C.candleSVG(candles, { lines: [{ price: lvl, label: "Level", color: COL.neutral }] }),
      options: shuffle(rand, [
        ok("Support: resistance is geflipt naar support", "Toen de koers erdoor brak, ‘spraken kopers af’ dat dit niveau nu een eerlijke prijs is. Bij de terugkeer houdt het als support. Zo is de hele chart opgebouwd."),
        no("Nog steeds resistance", "Na de doorbraak en de houdende retest is de rol omgedraaid."),
        no("Het level is waardeloos geworden", "Integendeel: oude levels blijven belangrijke data. Ze voorspellen waar kopers en verkopers weer actief worden."),
        no("Een trendlijn", "Een horizontaal level is support of resistance. Een trendlijn loopt schuin langs hogere lows of lagere highs."),
      ]),
      lesson: "Support = prijs waar de markt koopt, resistance = prijs waar de markt verkoopt. Breekt resistance, dan wordt het vaak support (en andersom).",
    };
  });

  T.push(function trendLine(rand) {
    const R = makeRange(rand);
    const down = rand() < 0.5;
    const s = R.low, h = R.h;
    const touches = pick(rand, [2, 3, 4]);
    const path = [];
    const lows = [];
    let base = 0;
    for (let k = 0; k < touches; k++) {
      path.push({ price: s + h * (base + 0.55), bars: 5 });
      base += 0.25;
      path.push({ price: s + h * base, bars: 4, exact: true, wickTo: s + h * base });
    }
    path.push({ price: s + h * (base + 0.5), bars: 5 });
    const e = ends(path);
    let candles = build(rand, R, path, s);
    for (let k = 0; k < touches; k++) lows.push({ i: e[k * 2 + 1], p: s + h * 0.25 * (k + 1) });
    const step = lows.length > 1 ? (lows[1].p - lows[0].p) / (lows[1].i - lows[0].i) : 0;
    let seg = { i1: lows[0].i, p1: lows[0].p, i2: candles.length - 1, p2: lows[0].p + step * (candles.length - 1 - lows[0].i) };
    let A = 0;
    if (down) {
      A = Math.max(...candles.map((c) => c.h)) + Math.min(...candles.map((c) => c.l));
      candles = candles.map((c) => ({ o: A - c.o, c: A - c.c, h: A - c.l, l: A - c.h }));
      seg = { ...seg, p1: A - seg.p1, p2: A - seg.p2 };
    }
    const official = touches >= 3;
    return {
      cat: "ta",
      title: "Trendlijn",
      prompt: `Deze ${down ? "downtrend" : "uptrend"}-lijn heeft <strong>${touches} touches</strong>. Wat klopt?`,
      svg: C.candleSVG(candles, { segments: [seg] }),
      options: shuffle(rand, [
        (official ? ok : no)(`Officiële trendlijn, getekend langs de ${down ? "highs (van bovenaf)" : "lows (van onderaf)"}`, official ? `Goed: vanaf de 3e touch noem je het officieel een trendlijn. Een ${down ? "downtrend teken je van bovenaf, langs de lagere highs" : "uptrend teken je van onderaf, langs de hogere lows"}.` : `Met ${touches} touches is het nog geen officiële trendlijn: daarvoor zijn minstens 3 touches nodig.`),
        (!official ? ok : no)("Nog geen officiële trendlijn: er zijn minstens 3 touches nodig", !official ? "Goed: twee punten kun je altijd verbinden. Pas bij de derde touch is het officieel een trendlijn." : `Er zijn ${touches} touches, dus het is wél officieel.`),
        no(`Een ${down ? "downtrend" : "uptrend"} teken je langs de ${down ? "lows" : "highs"}`, `Andersom: een uptrend teken je van onderaf (langs de lows), een downtrend van bovenaf (langs de highs). Dat is een veelgemaakte fout.`),
        no("Een trendlijn is hetzelfde als een range", "Een range is horizontaal (support en resistance). Een trendlijn loopt schuin. In de strategie gebruik je trendlijnen later als trigger binnen de range."),
      ]),
      lesson: "Trendlijn = officieel vanaf 3 touches. Uptrend van onderaf (hogere lows), downtrend van bovenaf (lagere highs).",
    };
  });

  T.push(function structure(rand) {
    const R = makeRange(rand);
    const kind = pick(rand, ["Uptrend", "Downtrend", "Sideways"]);
    let candles;
    if (kind === "Sideways") {
      candles = build(rand, R, rangePath(rand, R, 7));
    } else {
      const s = R.low, h = R.h;
      const path = [];
      let lvl = 0;
      for (let i = 0; i < 5; i++) {
        lvl += 0.55 + rand() * 0.2;
        path.push({ price: s + h * lvl, bars: 4 + Math.floor(rand() * 3) });
        lvl -= 0.25 + rand() * 0.12;
        path.push({ price: s + h * lvl, bars: 3 + Math.floor(rand() * 2) });
      }
      candles = C.candlesFromPath(rand, s, path, { vol: R.vol });
      if (kind === "Downtrend") {
        const A = Math.max(...candles.map((c) => c.h)) + Math.min(...candles.map((c) => c.l));
        candles = candles.map((c) => ({ o: A - c.o, c: A - c.c, h: A - c.l, l: A - c.h }));
      }
    }
    const why = {
      Uptrend: "Uptrend: higher highs en higher lows (HH + HL).",
      Downtrend: "Downtrend: lower highs en lower lows (LH + LL).",
      Sideways: "Sideways: equal highs en equal lows. Afgesproken resistance en support, met andere woorden een range.",
    };
    return {
      cat: "ta",
      title: "Welke marktstructuur?",
      prompt: "Checklist-vraag 4: in welke trend zit de huidige marktstructuur?",
      svg: C.candleSVG(candles, {}),
      options: ["Downtrend", "Sideways", "Uptrend"].map((k) => (k === kind ? ok : no)(k, (k === kind ? "Goed. " : "Nee. ") + why[k])),
      lesson: "HH + HL = uptrend, equal highs/lows = sideways (range), LH + LL = downtrend. Een trader kan in elke fase geld verdienen, ook met shorts in een downtrend.",
    };
  });

  // ===== Chart patterns (uit de Chart Patterns-sheet), altijd in de context van je range =====
  // Elk patroon als reeks draaipunten (0 = laag, 1 = hoog). Lijnen: horizontaal (neklijn,
  // rechthoek) of door twee draaipunten (wedges, pennants, driehoeken).
  // fam: reversal / continuation / bilateral. bias: bearish / bullish / null.
  const PATTERNS = (() => {
    const base = {
      doubleTop: { name: "Double top", fam: "reversal", bias: "bearish", piv: [0, 0.82, 0.5, 0.82, 0.38, 0.5, 0.12], breakAt: 4,
        lines: [{ h: 0.5, label: "Neklijn" }], desc: "twee gelijke toppen met een dal ertussen; breekt de koers onder de neklijn (het dal), dan is het patroon bevestigd" },
      headShoulders: { name: "Head & shoulders", fam: "reversal", bias: "bearish", piv: [0, 0.66, 0.45, 0.92, 0.45, 0.66, 0.34, 0.45, 0.08], breakAt: 6,
        lines: [{ a: 2, b: 4, label: "Neklijn" }], desc: "linkerschouder, hoger hoofd, rechterschouder op dezelfde hoogte als links; de neklijn loopt door de twee dalen" },
      risingWedge: { name: "Rising wedge", fam: "reversal", bias: "bearish", piv: [0, 0.55, 0.34, 0.66, 0.5, 0.74, 0.62, 0.79, 0.69, 0.52, 0.6, 0.15], breakAt: 9,
        lines: [{ a: 1, b: 7 }, { a: 2, b: 8 }], desc: "hogere highs en hogere lows die naar elkaar toe lopen (twee stijgende, samenkomende lijnen); de koopkracht neemt af" },
      fallingWedgeCont: { name: "Falling wedge (continuation)", fam: "continuation", bias: "bullish", piv: [0.25, 0.78, 0.54, 0.7, 0.5, 0.63, 0.48, 0.66, 0.6, 1], breakAt: 7,
        lines: [{ a: 1, b: 5 }, { a: 2, b: 6 }], desc: "na een stijging een kleine dalende, samenkomende correctie; daarna gaat de stijging vaak verder" },
      bullRect: { name: "Bullish rectangle", fam: "continuation", bias: "bullish", piv: [0.2, 0.7, 0.48, 0.7, 0.48, 0.7, 0.48, 0.8, 0.7, 1], breakAt: 7,
        lines: [{ h: 0.7 }, { h: 0.48 }], desc: "na een stijging een kleine horizontale range (pauze); uitbraak naar boven = voortzetting" },
      bullPennant: { name: "Bullish pennant", fam: "continuation", bias: "bullish", piv: [0.2, 0.78, 0.5, 0.72, 0.56, 0.67, 0.6, 0.76, 0.68, 1], breakAt: 7,
        lines: [{ a: 1, b: 5 }, { a: 2, b: 6 }], desc: "na een sterke stijging (de vlaggenstok) een klein, symmetrisch samenkomend driehoekje; daarna vaak verder omhoog" },
      ascTriangle: { name: "Ascending triangle", fam: "bilateral", bias: null, piv: [0, 0.72, 0.38, 0.72, 0.52, 0.72, 0.62, 0.72, 0.67], breakAt: null,
        lines: [{ h: 0.72 }, { a: 2, b: 6 }], desc: "vlakke bovenkant en stijgende bodems; de koers wordt naar de top gedrukt, maar kan twee kanten op breken" },
      symTriangle: { name: "Symmetrical triangle", fam: "bilateral", bias: null, piv: [0.1, 0.95, 0.15, 0.85, 0.28, 0.75, 0.4, 0.66, 0.5], breakAt: null,
        lines: [{ a: 1, b: 7 }, { a: 2, b: 6 }], desc: "lagere highs en hogere lows die samenkomen; geen richting tot de uitbraak" },
    };
    const mirrorP = (p, name, extra) => ({
      ...p, ...extra, name,
      bias: p.bias === "bearish" ? "bullish" : p.bias === "bullish" ? "bearish" : null,
      piv: p.piv.map((y) => 1 - y),
      lines: p.lines.map((l) => (l.h !== undefined ? { ...l, h: 1 - l.h } : l)),
    });
    return {
      ...base,
      doubleBottom: mirrorP(base.doubleTop, "Double bottom", { desc: "twee gelijke bodems met een top ertussen; breekt de koers boven de neklijn, dan is het patroon bevestigd" }),
      invHeadShoulders: mirrorP(base.headShoulders, "Inverse head & shoulders", { desc: "linkerschouder, lager hoofd, rechterschouder; de neklijn loopt door de twee toppen" }),
      fallingWedge: mirrorP(base.risingWedge, "Falling wedge", { desc: "lagere highs en lagere lows die naar elkaar toe lopen (twee dalende, samenkomende lijnen); de verkoopdruk neemt af" }),
      risingWedgeCont: mirrorP(base.fallingWedgeCont, "Rising wedge (continuation)", { desc: "na een daling een kleine stijgende, samenkomende correctie; daarna gaat de daling vaak verder" }),
      bearRect: mirrorP(base.bullRect, "Bearish rectangle", { desc: "na een daling een kleine horizontale range (pauze); uitbraak naar beneden = voortzetting" }),
      bearPennant: mirrorP(base.bullPennant, "Bearish pennant", { desc: "na een sterke daling een klein samenkomend driehoekje; daarna vaak verder omlaag" }),
      descTriangle: mirrorP(base.ascTriangle, "Descending triangle", { desc: "vlakke onderkant en dalende toppen; de koers wordt naar de bodem gedrukt, maar kan twee kanten op breken" }),
    };
  })();
  const PKEYS = Object.keys(PATTERNS);
  const famTxt = { reversal: "reversal (omkeerpatroon)", continuation: "continuation (voortzettingspatroon)", bilateral: "bilateraal (kan twee kanten op)" };

  // Teken een patroon in het prijsgebied [lo, hi]. upto: tot welk draaipunt (voor "wat verwacht je?").
  function drawPattern(rand, key, lo, hi, opts = {}) {
    const P = PATTERNS[key];
    const piv = P.piv.slice(0, opts.upto ?? P.piv.length);
    const Y = (y) => lo + y * (hi - lo);
    const barsPer = opts.bars || 3;
    const path = piv.slice(1).map((y, k) => ({ price: Y(y), bars: k === 0 ? 5 : barsPer, exact: true, wickTo: Y(y) }));
    const start = Y(piv[0]);
    const candles = C.candlesFromPath(rand, start, [...(opts.before || []), ...path], { vol: ((hi - lo) / start) * 0.018 * (opts.noise || 1) });
    const off = (opts.before || []).reduce((a, x) => a + x.bars, 0);
    const idx = [off - 1 < 0 ? 0 : off - 1, ...ends(path).map((i) => i + off)];
    // Lijnen lopen tot de uitbraak (of tot het eind als het patroon nog niet uitgebroken is).
    const end = P.breakAt && P.breakAt < idx.length ? idx[P.breakAt] : candles.length - 1;
    const lines = [], segments = [];
    for (const l of P.lines) {
      if (l.h !== undefined) lines.push({ price: Y(l.h), label: l.label || "", color: "#82a8ff" });
      else if (l.a < piv.length && l.b < piv.length) {
        const i1 = idx[l.a], i2 = idx[l.b], p1 = Y(piv[l.a]), p2 = Y(piv[l.b]);
        const pe = p1 + ((p2 - p1) * (end - i1)) / (i2 - i1 || 1);
        segments.push({ i1, p1, i2: end, p2: pe, color: "#82a8ff" });
      }
    }
    return { candles, lines, segments, idx, Y, P };
  }
  // Drie verwarrende alternatieven: liefst uit dezelfde familie of de gespiegelde versie.
  function confusers(rand, key) {
    const P = PATTERNS[key];
    const same = PKEYS.filter((k) => k !== key && PATTERNS[k].fam === P.fam);
    const other = PKEYS.filter((k) => k !== key && PATTERNS[k].fam !== P.fam);
    return shuffle(rand, [...shuffle(rand, same).slice(0, 2), ...shuffle(rand, other).slice(0, 3)]).slice(0, 3);
  }

  // Beginner: welk patroon is dit?
  T.push(function patternName(rand) {
    const key = pick(rand, PKEYS);
    const { candles, lines, segments, P } = drawPattern(rand, key, 100, 140);
    return {
      cat: "ta",
      title: "Welk patroon?",
      prompt: "Welk chart pattern zie je? De blauwe lijnen helpen je.",
      svg: C.candleSVG(candles, { lines, segments, height: 300 }),
      options: shuffle(rand, [
        ok(P.name, `Goed. ${P.name}: ${P.desc}. Het is een ${famTxt[P.fam]}.`),
        ...confusers(rand, key).map((k) => no(PATTERNS[k].name, `Nee. ${PATTERNS[k].name}: ${PATTERNS[k].desc}. Wat je hier ziet is een ${P.name.toLowerCase()}: ${P.desc}.`)),
      ]),
      lesson: "Reversal: double top/bottom, (inverse) head & shoulders, wedges tegen de trend in. Continuation: rectangles, pennants, wedges in de trend. Bilateraal: driehoeken, die twee kanten op kunnen breken.",
    };
  });

  // Beginner: wat verwacht je meestal? (het patroon stopt vóór de uitbraak)
  T.push(function patternExpect(rand) {
    const key = pick(rand, PKEYS);
    const P = PATTERNS[key];
    const upto = P.breakAt ? P.breakAt : P.piv.length;
    const { candles, lines, segments } = drawPattern(rand, key, 100, 140, { upto });
    const answers = {
      bearRev: "Een omkering naar beneden (bearish)",
      bullRev: "Een omkering naar boven (bullish)",
      cont: "Voortzetting van de beweging ervoor",
      wait: "Geen voorkeur: wacht op de uitbraak",
    };
    const good = P.fam === "bilateral" ? "wait" : P.fam === "continuation" ? "cont" : P.bias === "bearish" ? "bearRev" : "bullRev";
    const why = {
      bearRev: `${P.name} is een ${famTxt[P.fam]}: ${P.desc}.`,
      bullRev: `${P.name} is een ${famTxt[P.fam]}: ${P.desc}.`,
      cont: `${P.name} is een ${famTxt[P.fam]}: ${P.desc}.`,
      wait: `${P.name} is ${famTxt[P.fam]}: ${P.desc}.`,
    }[good];
    return {
      cat: "ta",
      title: "Wat verwacht je?",
      prompt: `Dit is een <strong>${P.name.toLowerCase()}</strong>, net vóór de uitbraak. Wat verwacht je hier meestal?`,
      svg: C.candleSVG(candles, { lines, segments, height: 300 }),
      options: shuffle(rand, Object.entries(answers).map(([k, t]) => (k === good ? ok(t, `Goed. ${why} Het blijft een kans, geen zekerheid: wacht op de bevestiging (uitbraak + retest).`) : no(t, `Nee. ${why}`)))),
      lesson: "Patronen geven een verwachting, geen zekerheid. Een reversal draait de beweging om, een continuation zet hem voort, een driehoek kan twee kanten op. Pas de uitbraak (met acceptatie) bevestigt het patroon.",
    };
  });

  // Medior: het patroon in je range. Alleen aan de juiste kant van de range telt het.
  T.push(function pattern(rand) {
    const R = makeRange(rand);
    const bear = rand() < 0.5;
    const key = bear ? pick(rand, ["doubleTop", "headShoulders", "risingWedge"]) : pick(rand, ["doubleBottom", "invHeadShoulders", "fallingWedge"]);
    const where = pick(rand, ["edge", "edge", "mid", "wrong"]);
    const P = PATTERNS[key];
    // Prijsgebied van het patroon: bij de goede rand, rond de mid, of aan de verkeerde kant.
    const band = 0.42 * R.h;
    const top = where === "edge" ? (bear ? R.high : R.low + band) : where === "mid" ? R.mid + band / 2 : bear ? R.low + band : R.high;
    const lo = top - band, hi = top;
    const upto = P.breakAt ? P.breakAt + 1 : P.piv.length;
    const before = rangePath(rand, R, 4);
    const { candles, lines, segments } = drawPattern(rand, key, lo, hi, { upto, before });
    const edge = bear ? "range high" : "range low";
    const dir = bear ? "short" : "long";
    const good = {
      edge: ok(`Bruikbaar: extra bevestiging voor een ${dir}, samen met je trigger`, `Goed. Een ${P.name.toLowerCase()} bij de ${edge} staat aan de juiste kant van je range. Vaak is het in je eigen taal een deviatie of swing failure bij de ${edge}; de breuk van de neklijn of lijn + retest is je trigger.`),
      mid: ok("Niet bruikbaar: rond de mid heb je geen edge", `Goed. Het patroon staat rond de mid. Daar heb je geen edge, ook niet met een patroon: wacht tot de koers bij een rand van je range is.`),
      wrong: ok("Oppassen: het patroon staat aan de verkeerde kant van je range", `Goed. Een ${bear ? "bearish" : "bullish"} patroon bij de ${bear ? "range low" : "range high"} gaat in tegen je range-plan (daar zoek je juist een ${bear ? "long" : "short"}). Speel het niet; wacht op een setup bij de goede rand.`),
    }[where];
    const others = [
      where !== "edge" && no(`Bruikbaar: extra bevestiging voor een ${dir}, samen met je trigger`, `Het patroon staat niet bij de ${edge}, dus niet aan de juiste kant van je range.`),
      where !== "mid" && no("Niet bruikbaar: rond de mid heb je geen edge", `Het patroon staat niet rond de mid maar ${where === "edge" ? `bij de ${edge}` : `aan de verkeerde kant van de range`}.`),
      where !== "wrong" && no("Oppassen: het patroon staat aan de verkeerde kant van je range", `Nee, het staat ${where === "edge" ? "juist aan de goede kant" : "rond de mid"}.`),
      no(`Direct ${dir}: het patroon is een garantie`, "Patronen zijn waarschijnlijkheden, geen garantie. Gebruik ze nooit los van je range en je trigger."),
    ].filter(Boolean);
    return {
      cat: "ta",
      title: "Patroon in je range",
      prompt: `Je ziet een <strong>${P.name.toLowerCase()}</strong> rechts in de grafiek. Wat doe je ermee binnen je range-plan?`,
      svg: C.candleSVG(candles, { lines: [...rangeLines(R), ...lines], segments, height: 320 }),
      options: shuffle(rand, [good, ...others]),
      lesson: "Patronen zijn waarschijnlijkheden. Gebruik ze alleen aan de juiste kant van je range (bearish bij de range high, bullish bij de range low), als extra bevestiging naast je trigger.",
    };
  });

  // Professional: instappen, stop en mislukking bij een reversal-patroon.
  T.push(function patternTrade(rand) {
    const bear = rand() < 0.5;
    const key = bear ? pick(rand, ["doubleTop", "headShoulders"]) : pick(rand, ["doubleBottom", "invHeadShoulders"]);
    const P = PATTERNS[key];
    const variant = pick(rand, ["entry", "stop", "failed"]);
    const base = 100, span = 40;
    let d;
    if (variant === "failed") {
      // Breuk door de neklijn, daarna terug erboven (of eronder) en verder: patroon mislukt.
      const piv = P.piv.slice(0, P.breakAt + 1).concat(bear ? [0.62, 0.9] : [0.38, 0.1]);
      const saved = P.piv;
      P.piv = piv;
      d = drawPattern(rand, key, base, base + span);
      P.piv = saved;
    } else d = drawPattern(rand, key, base, base + span, { upto: P.breakAt + 2 });
    const { candles, lines, segments, idx, Y } = d;
    const n = candles.length;
    const neck = key.includes("ouble") ? Y(P.lines[0].h) : Y(P.piv[P.lines[0].a]);
    const extreme = bear ? Math.max(...P.piv.slice(0, P.breakAt)) : Math.min(...P.piv.slice(0, P.breakAt));
    const shoulder = key.toLowerCase().includes("head") ? Y(P.piv[5]) : Y(extreme);
    const dir = bear ? "short" : "long";
    if (variant === "entry") {
      const letters = shuffle(rand, ["A", "B", "C"]);
      const pts = [
        { p: neck, l: letters[0], good: true, why: `Op de retest van de neklijn na de breuk. Net als bij je range-setups: breuk (deviatie/reclaim), retest, en dan pas instappen. De oude ${bear ? "support" : "resistance"} wordt ${bear ? "resistance" : "support"}.` },
        { p: shoulder, l: letters[1], good: false, why: `Bij de ${key.toLowerCase().includes("head") ? "rechterschouder" : bear ? "tweede top" : "tweede bodem"} instappen is anticiperen: het patroon is dan nog niet bevestigd. Zonder breuk van de neklijn is het gewoon nog een range.` },
        { p: Y(bear ? 0.2 : 0.8), l: letters[2], good: false, why: "Ver na de breuk instappen is najagen: je stop moet dan ver weg en je R:R is slecht." },
      ];
      return {
        cat: "setup", title: "Instappen op een patroon",
        prompt: `Een <strong>${P.name.toLowerCase()}</strong> is door de neklijn gebroken. Waar stap je <strong>${dir}</strong> in?`,
        svg: C.candleSVG(candles, { lines, segments, markers: pts.map((x) => ({ i: n - 1, price: x.p, label: x.l })), height: 300 }),
        options: shuffle(rand, pts).map((x) => (x.good ? ok : no)("Punt " + x.l, x.why)),
        lesson: "Bij een patroon stap je in op de retest van de neklijn na de breuk, niet ervoor (anticiperen) en niet ver erna (najagen). Hetzelfde ritme als je deviatie, reclaim en retest.",
      };
    }
    if (variant === "stop") {
      const letters = shuffle(rand, ["A", "B", "C"]);
      const sAt = bear ? shoulder + span * 0.03 : shoulder - span * 0.03;
      const pts = [
        { p: sAt, l: letters[0], good: true, why: `Net voorbij de ${key.toLowerCase().includes("head") ? "rechterschouder" : bear ? "tweede top" : "tweede bodem"}. Komt de koers daar, dan is het patroon ongeldig.` },
        { p: bear ? neck + span * 0.02 : neck - span * 0.02, l: letters[1], good: false, why: "Vlak bij de neklijn staat je stop binnen het bereik van de retest: een gewone lont stopt je uit." },
        { p: Y(bear ? 1.05 : -0.05), l: letters[2], good: false, why: `${bear ? "Ver boven het hoogste" : "Ver onder het laagste"} punt van het hele patroon is te ver: je R:R wordt slecht. Het patroon is al ongeldig ${key.toLowerCase().includes("head") ? "voorbij de rechterschouder" : bear ? "boven de tweede top" : "onder de tweede bodem"}.` },
      ];
      return {
        cat: "setup", title: "Stop bij een patroon",
        prompt: `Je gaat <strong>${dir}</strong> op de retest van de neklijn van een <strong>${P.name.toLowerCase()}</strong>. Waar zet je je stop?`,
        svg: C.candleSVG(candles, { lines, segments, markers: pts.map((x) => ({ i: n - 1, price: x.p, label: x.l })), height: 300 }),
        options: shuffle(rand, pts).map((x) => (x.good ? ok : no)("Punt " + x.l, x.why)),
        lesson: "Stop bij een patroon: net voorbij het laatste draaipunt dat het patroon geldig houdt (tweede top/bodem of rechterschouder). Check daarna je R:R tot je targets in de range.",
      };
    }
    return {
      cat: "setup", title: "Mislukt patroon",
      prompt: `De koers brak door de neklijn van een <strong>${P.name.toLowerCase()}</strong>, maar kwam terug en sluit nu weer ${bear ? "boven" : "onder"} de neklijn. Wat zegt dit?`,
      svg: C.candleSVG(candles, { lines, segments, height: 300 }),
      options: shuffle(rand, [
        ok("Het patroon is mislukt: geen trade meer in die richting, en vaak beweegt de koers juist de andere kant op", `Goed. Terug ${bear ? "boven" : "onder"} de neklijn is een mislukte breuk, net als een deviatie. Mislukte patronen geven vaak een sterke beweging de andere kant op: wie op het patroon zat, moet eruit.`),
        no(`Bijkopen in je ${dir}: het patroon komt nog`, "Bijkopen in een trade waarvan het idee ongeldig is, vergroot alleen je verlies."),
        no("Niets: een patroon blijft geldig tot het hoofd of de top weer geraakt wordt", "De neklijn is het beslispunt. Sluit de koers er weer voorbij, dan is de breuk mislukt."),
        no("Een tweede patroon tekenen zodat het weer klopt", "Achteraf je analyse aanpassen aan de koers is precies wat je niet wilt. Accepteer dat het patroon mislukt is."),
      ]),
      lesson: "Een patroon is pas bevestigd na de breuk van de neklijn met acceptatie en een retest. Sluit de koers terug, dan is het mislukt: net als een mislukte breakout geeft dat vaak een beweging de andere kant op.",
    };
  });

  // RSI-lijn die met de koers meebeweegt en precies op `last` eindigt (de waarde uit de vraag).
  function rsiSeries(rand, candles, R, last) {
    const mid = (R.low + R.high) / 2;
    const v = candles.map((c) => 50 + 38 * Math.tanh((2.2 * (c.c - mid)) / R.h) + (rand() - 0.5) * 4);
    const n = v.length, k = Math.min(6, n - 1);
    const from = v[n - 1 - k];
    for (let j = 0; j <= k; j++) v[n - 1 - k + j] = from + ((last - from) * j) / k + (j && j < k ? (rand() - 0.5) * 3 : 0);
    return v.map((x) => Math.max(3, Math.min(97, x)));
  }

  T.push(function rsi(rand) {
    const R = makeRange(rand);
    const where = pick(rand, ["high", "mid", "low"]);
    const target = where === "high" ? R.high - R.h * 0.04 : where === "low" ? R.low + R.h * 0.04 : R.mid;
    const path = [...rangePath(rand, R, 5), { price: target, bars: 5, wickTo: where === "high" ? R.high : where === "low" ? R.low : undefined, ...within(R) }];
    const candles = build(rand, R, path);
    const val = where === "low" ? 22 + Math.floor(rand() * 6) : 72 + Math.floor(rand() * 8);
    const correct = {
      high: ok("Extra bevestiging voor een short-idee, maar alleen samen met een trigger", `Overbought (RSI ${val} > 70) bij de range high: een interessant level met een RSI die erbij past. Dat is een goed signaal, maar de RSI is lagging en nooit genoeg op zichzelf.`),
      low: ok("Extra bevestiging voor een long-idee, maar alleen samen met een trigger", `Oversold (RSI ${val} < 30) bij de range low: een interessant level met een RSI die erbij past. Gebruik het als extra trigger, niet als enige reden.`),
      mid: ok("Niets: de RSI telt alleen bij een interessant level in je range", `Overbought rond de mid zegt weinig: de koers staat niet bij een rand. De RSI neem je alleen serieus als de koers op een interessant level in je range staat.`),
    }[where];
    return {
      cat: "ta",
      title: "RSI in de range",
      prompt: `De koers staat bij de <strong>${where === "high" ? "range high" : where === "low" ? "range low" : "mid"}</strong> en de RSI staat op <strong>${val}</strong>. Wat zegt dit?`,
      svg: C.candleSVG(candles, { lines: rangeLines(R), height: 300 }) + C.rsiSVG(rsiSeries(rand, candles, R, val), { height: 150, mark: val }),
      options: shuffle(rand, [
        correct,
        no(`Direct ${val > 50 ? "shorten" : "longen"}: de RSI zegt ${val > 50 ? "overbought" : "oversold"}`, "De RSI is lagging en mag nooit alleen gebruikt worden. Combineer hem altijd met je range en triggers."),
        no("De RSI is een leading indicator, dus de koers draait nu", "Andersom: de RSI is lagging. Hij volgt de prijs."),
        ...(where === "mid"
          ? [no("Extra bevestiging voor een short", "Rond de mid is er geen interessant level. Daar heeft de RSI geen betekenis voor je trade.")]
          : [no("Niets: de RSI telt alleen bij de mid", "Andersom: juist bij de randen van je range (interessante levels) kan de RSI een extra trigger zijn.")]),
      ]),
      lesson: "RSI: > 70 = overbought, < 30 = oversold. Lagging, dus alleen bruikbaar bij een interessant level in je range en samen met andere triggers.",
    };
  });

  T.push(function divergence(rand) {
    const R = makeRange(rand);
    // Soms divergentie, soms niet: dan moet je het echt uit de grafiek lezen.
    const kind = pick(rand, ["bear", "bull", "none"]);
    const bear = kind !== "bull"; // "none" tekenen we als twee highs
    const path = [
      { price: R.mid, bars: 4 },
      { price: R.high - R.h * 0.15, bars: 5, wickTo: R.high - R.h * 0.1 },
      { price: R.mid, bars: 4 },
      { price: R.high - R.h * 0.02, bars: 5, wickTo: R.high },
      { price: R.high - R.h * 0.12, bars: 2 },
    ];
    const e = ends(path);
    let candles = build(rand, R, path, R.low + R.h * 0.2);
    if (!bear) candles = mirror(candles, R);
    // Toppen (of bodems) in de koers: de extreme candle in elk van de twee benen.
    const ext = (a, b) => {
      let k = a;
      for (let i = a; i <= b; i++) if (bear ? candles[i].h > candles[k].h : candles[i].l < candles[k].l) k = i;
      return k;
    };
    const p1 = ext(e[0] + 1, e[2]), p2 = ext(e[2] + 1, candles.length - 1);
    // RSI volgt de koers; in het tweede been is de beweging zwakker (divergentie) of even sterk (geen).
    const mid = (R.low + R.high) / 2;
    const raw = candles.map((c, i) => {
      const d = Math.tanh((2.2 * (c.c - mid)) / R.h);
      const weaker = kind !== "none" && i > e[2] ? 0.55 : kind === "none" && i > e[2] ? 1.15 : 1;
      return 50 + 40 * d * weaker + (rand() - 0.5) * 3;
    });
    // Op de toppen zelf een duidelijke waarde, zodat de lijn klopt.
    const top1 = bear ? 74 + rand() * 4 : 26 - rand() * 4;
    const top2 = kind === "none" ? (bear ? top1 + 6 : top1 - 6) : bear ? top1 - 14 - rand() * 6 : top1 + 14 + rand() * 6;
    // De top (of bodem) van elk been is precies het punt waar de lijn begint en eindigt.
    const cap = (v, t) => (bear ? Math.min(v, t - 1.5) : Math.max(v, t + 1.5));
    for (let i = 0; i < raw.length; i++) raw[i] = cap(raw[i], i <= e[2] ? top1 : top2);
    raw[p1] = top1;
    raw[p2] = top2;
    const rsi = raw.map((v) => Math.max(3, Math.min(97, v)));
    const col = kind === "none" ? "#82a8ff" : kind === "bear" ? "#ef5350" : "#26a69a";
    const priceSeg = { i1: p1, p1: bear ? candles[p1].h : candles[p1].l, i2: p2, p2: bear ? candles[p2].h : candles[p2].l, color: col };
    const svg =
      C.candleSVG(candles, { segments: [priceSeg], height: 300 }) +
      C.rsiSVG(rsi, { height: 170, segments: [{ i1: p1, v1: rsi[p1], i2: p2, v2: rsi[p2], color: col }] });
    const word = bear ? "highs" : "lows";
    const why = {
      bear: `De koers maakt een hogere high, maar de RSI een lagere high (${Math.round(rsi[p1])} → ${Math.round(rsi[p2])}). De koers stijgt, maar de koopkracht neemt af.`,
      bull: `De koers maakt een lagere low, maar de RSI een hogere low (${Math.round(rsi[p1])} → ${Math.round(rsi[p2])}). De koers daalt, maar de verkoopdruk neemt af.`,
      none: `De koers en de RSI maken allebei een hogere high (RSI ${Math.round(rsi[p1])} → ${Math.round(rsi[p2])}). Ze bewegen samen: geen divergentie.`,
    }[kind];
    return {
      cat: "ta",
      title: "RSI-divergentie",
      prompt: `Vergelijk de twee ${word} in de koers met die in de RSI (de lijnen in beide grafieken). Wat zie je?`,
      svg,
      options: shuffle(rand, [
        (kind === "bear" ? ok : no)("Bearish divergence", kind === "bear" ? "Goed. " + why : "Bearish is: koers hogere high, RSI lagere high. " + why),
        (kind === "bull" ? ok : no)("Bullish divergence", kind === "bull" ? "Goed. " + why : "Bullish is: koers lagere low, RSI hogere low. " + why),
        (kind === "none" ? ok : no)("Geen divergentie, ze bewegen samen", kind === "none" ? "Goed. " + why : "Ze bewegen juist uit elkaar. " + why),
        no("Overbought", "Overbought gaat over het niveau van de RSI (> 70), niet over het verschil tussen koers en RSI. " + why),
      ]),
      lesson: "Divergentie = koers en RSI lopen uit elkaar. Koers hoger + RSI lager = bearish. Koers lager + RSI hoger = bullish. Ook dit alleen gebruiken bij een interessant level in je range.",
    };
  });

  // ===== Risk & R:R =====

  T.push(function rr(rand) {
    const R = makeRange(rand);
    const short = rand() < 0.5;
    const target = pick(rand, [1.5, 2, 2.5, 3, 3.5, 4, 5]);
    const risk = R.h * (0.08 + rand() * 0.06);
    const entry = short ? R.high - R.h * 0.1 : R.low + R.h * 0.1;
    const sl = short ? entry + risk : entry - risk;
    const tp = short ? entry - risk * target : entry + risk * target;
    const wrong = [+(1 / target).toFixed(2), target + 1, target - 0.5].filter((v, i, a) => v > 0 && v !== target && a.indexOf(v) === i);
    while (wrong.length < 3) wrong.push(target + wrong.length + 1.5);
    const { candles } = lowEvent(rand, R, "retest");
    return {
      cat: "risk",
      title: "Bereken de R:R",
      prompt: `${short ? "Short" : "Long"}: entry <strong>${fmt(entry)}</strong>, stoploss <strong>${fmt(sl)}</strong>, take profit <strong>${fmt(tp)}</strong>. Wat is de R:R?`,
      svg: C.candleSVG(short ? mirror(candles, R) : candles, {
        lines: [
          { price: sl, label: "SL", color: COL.sl },
          { price: entry, label: "Entry", color: COL.entry, dash: false },
          { price: tp, label: "TP", color: COL.tp },
        ],
      }),
      options: shuffle(rand, [
        ok(`${num(target, 2)}R`, `Risico = |entry − SL| = ${fmt(risk)}. Beloning = |TP − entry| = ${fmt(risk * target)}. R:R = ${fmt(risk * target)} / ${fmt(risk)} = ${num(target, 2)}.`),
        ...wrong.map((w) =>
          no(
            `${num(w, 2)}R`,
            w < 1
              ? "Dit is risico gedeeld door beloning (omgekeerd). R:R = beloning / risico."
              : w === target + 1
              ? "Dit krijg je als je vanaf de stoploss meet. De beloning meet je vanaf je entry: R:R = |TP − entry| / |entry − SL|."
              : "Reken na: R:R = |TP − entry| / |entry − SL|."
          )
        ),
      ]),
      lesson: "R:R = (TP − entry) / (entry − SL). 1R = je risico. Met 3R per win heb je maar 25% winrate nodig om break-even te draaien.",
    };
  });

  T.push(function positionSize(rand) {
    const bal = pick(rand, [1000, 2500, 5000, 10000, 25000]);
    const riskPct = pick(rand, [0.5, 1, 2]);
    const R = makeRange(rand);
    const entry = R.low + R.h * 0.08;
    const sl = entry - R.h * (0.1 + rand() * 0.08);
    const riskAmt = (bal * riskPct) / 100;
    const size = riskAmt / (entry - sl);
    const cur = S.getSettings().currency;
    // Units met 4 significante cijfers: bij hoge koersen worden kleine aantallen anders allemaal "0,0002".
    const u = (v) => (+v).toLocaleString("nl-NL", { maximumSignificantDigits: 4 });
    return {
      cat: "risk",
      title: "Positiegrootte",
      prompt: `Saldo <strong>${money(bal, cur)}</strong>, je riskeert <strong>${riskPct}%</strong>. Long entry <strong>${fmt(entry)}</strong>, stoploss <strong>${fmt(sl)}</strong>. Hoeveel units koop je?`,
      svg: "",
      options: shuffle(rand, [
        ok(u(size), `Risicobedrag = ${money(bal, cur)} × ${riskPct}% = ${money(riskAmt, cur)}. Afstand tot SL = ${fmt(entry - sl)}. Units = ${money(riskAmt, cur)} / ${fmt(entry - sl)} = ${u(size)}. Raak je je SL, dan verlies je precies ${riskPct}%.`),
        no(u(riskAmt / entry), "Dit deelt het risicobedrag door de entryprijs. Dan bepaal je je inzet, niet je risico: je verlies bij de SL is dan veel kleiner dan je wilde."),
        no(u(size * 10), `Tien keer te groot: bij de SL zou je ${riskPct * 10}% verliezen.`),
        no(u(bal / entry), "Dit is je hele saldo inzetten. Je risico is dan niet meer gekoppeld aan je stoploss."),
      ]),
      lesson: "Positiegrootte = (saldo × risico%) / |entry − SL|. Zo is elke trade precies 1R, hoe ver je stop ook staat.",
    };
  });

  T.push(function outcomePnl(rand) {
    const riskAmt = pick(rand, [10, 20, 25, 50, 100]);
    const r1 = pick(rand, [1, 1.5, 2]);
    const r2 = r1 + pick(rand, [1, 1.5, 2]);
    const outcome = pick(rand, ["TP1 + BE", "TP1 + TP2", "Stop Loss"]);
    const cur = S.getSettings().currency;
    const pnl = outcome === "Stop Loss" ? -riskAmt : outcome === "TP1 + BE" ? riskAmt * 0.5 * r1 : riskAmt * (0.5 * r1 + 0.5 * r2);
    const cands = [
      pnl,
      outcome === "TP1 + BE" ? riskAmt * r1 : outcome === "TP1 + TP2" ? riskAmt * r2 : 0,
      outcome === "Stop Loss" ? -riskAmt * 0.5 : riskAmt * (r1 + r2),
      outcome === "Stop Loss" ? -riskAmt * 2 : 0,
    ].filter((v, i, a) => a.findIndex((x) => Math.abs(x - v) < 1e-9) === i);
    const right = (v) => Math.abs(v - pnl) < 1e-9;
    return {
      cat: "risk",
      title: "Wat is de PnL?",
      prompt: `Je riskeert <strong>${money(riskAmt, cur)}</strong> (1R). TP1 = <strong>${r1}R</strong> (mid), TP2 = <strong>${r2}R</strong> (andere kant van de range). Je sluit 50% op TP1. Uitkomst: <strong>${outcome}</strong>. Wat is je PnL?`,
      svg: "",
      options: shuffle(
        rand,
        cands.map((v) =>
          (right(v) ? ok : no)(
            money(v, cur),
            right(v)
              ? outcome === "Stop Loss"
                ? `Stop geraakt vóór TP1: je verliest precies 1R = ${money(riskAmt, cur)}.`
                : outcome === "TP1 + BE"
                ? `50% op TP1: 0,5 × ${r1}R = ${0.5 * r1}R. De rest sluit op break-even (0R). ${0.5 * r1}R × ${money(riskAmt, cur)} = ${money(pnl, cur)}.`
                : `50% op TP1 (${0.5 * r1}R) + 50% op TP2 (${0.5 * r2}R) = ${0.5 * r1 + 0.5 * r2}R × ${money(riskAmt, cur)} = ${money(pnl, cur)}.`
              : v === 0
              ? "0 zou kloppen als de hele positie op break-even sloot. Dat is hier niet zo."
              : "Reken met de verdeling: 50% van de positie per target, en je stop op BE na TP1."
          )
        )
      ),
      lesson: "Met deelwinst op TP1 en je stop naar BE is ‘TP1 + BE’ altijd een kleine win. Een full loss kan alleen nog vóór TP1.",
    };
  });

  // ===== Checklist & mindset (Trade Sheet) =====
  const SCEN = [
    {
      q: "Je hebt net een verlies genomen en bent boos. Je ziet direct een nieuwe setup die er ‘perfect’ uitziet.",
      o: [
        ["Niet traden: eerst afkoelen", true, "Check 1 (emotie) is rood. Na een verlies is de kans op revenge trading groot. Exchanges zijn ontworpen om je emotioneel te laten traden; een A+ setup komt terug."],
        ["Traden met dubbele positie om het verlies terug te winnen", false, "Klassieke revenge trade: groter risico precies op het moment dat je oordeel het slechtst is."],
        ["Traden, maar met een kleinere stop", false, "Je stop hoort bij de structuur (voorbij de deviatie), niet bij je gevoel."],
        ["Traden, de setup is toch goed", false, "Ook een goede setup voer je slecht uit als je emotioneel bent."],
      ],
    },
    {
      q: "In een signal group roept iemand ‘LONG NU!’. Op jouw chart staat de koers midden in de range, zonder trigger.",
      o: [
        ["Overslaan: geen eigen setup", true, "Check 2 (beïnvloed door anderen) en check 3 (A+ triggers) zijn rood. Rond de mid heb je geen edge."],
        ["Meedoen met een klein bedrag", false, "Klein of groot: het is niet jouw plan. Zo leer je ook niets van je eigen trades."],
        ["Meedoen, de groep heeft vaak gelijk", false, "Hun winrate is niet jouw edge. Je weet hun stop, risico en exit niet."],
        ["Short gaan, om tegen de groep in te gaan", false, "Tegen de groep in is net zo goed beïnvloed. Alleen je eigen setup telt."],
      ],
    },
    {
      q: "Over 20 minuten komen de CPI-cijfers. Je ziet een deviatie met reclaim bij de range low.",
      o: [
        ["Wachten tot na het nieuws", true, "Check 8 (nieuws) is rood. Bij nieuws (CPI, FOMC, NFP) kan de koers ‘tanken’ en levels negeren. Na het nieuws is de setup vaak duidelijker."],
        ["Instappen, het nieuws doet er niet toe", false, "Bij groot nieuws worden levels vaak genegeerd en stops overgeslagen."],
        ["Instappen zonder stoploss om niet uitgewicked te worden", false, "Zonder stop kan één nieuwscandle je account flink raken. Nooit doen."],
        ["Twee keer zo groot instappen voor de volatiliteit", false, "Meer volatiliteit vraagt juist minder risico."],
      ],
    },
    {
      q: "Je zit in de trein en ziet op je telefoon een setup. Je hebt geen tijd om de range goed te checken.",
      o: [
        ["Overslaan of een alert zetten voor later", true, "Check 7 (achter je bureau of in een haast) is rood. Haast leidt tot slordige ranges, verkeerde stops en een verkeerde positiegrootte."],
        ["Snel een market order plaatsen", false, "Zonder analyse en zonder limit order volg je je risk management niet (check 5)."],
        ["Instappen en de stop later zetten", false, "Een trade zonder stop is ongecontroleerd risico, ook voor ‘even’."],
        ["Een vriend vragen of het een goede trade is", false, "Dan is de trade ook nog beïnvloed door een ander (check 2)."],
      ],
    },
    {
      q: "Je setup is goed, maar je durft hem eigenlijk niet aan je accountability partner te laten zien.",
      o: [
        ["Niet nemen: als je hem niet kunt delen, klopt er iets niet", true, "Check 6 is een eerlijkheidstest. Als je een trade niet wilt laten zien, weet je vaak zelf al dat hij niet binnen je regels valt."],
        ["Nemen en alleen delen als hij wint", false, "Dan houd je jezelf voor de gek en wordt je journal onbetrouwbaar."],
        ["Nemen, het gaat niemand iets aan", false, "Accountability werkt alleen als je álle trades deelt."],
        ["Een andere partner zoeken", false, "Het probleem zit in de trade, niet in de partner."],
      ],
    },
    {
      q: "Je hebt entry en TP’s klaar, maar je stoploss nog niet gezet. Je wilt ‘eerst kijken hoe het loopt’.",
      o: [
        ["Eerst de SL zetten, dan pas instappen", true, "Check 5 (R:R, limit orders, SL) is pas groen als alle drie gezet zijn. Zonder SL weet je je risico en je positiegrootte niet."],
        ["Instappen, de SL komt later wel", false, "Juist als het tegen je in gaat, aarzel je om de stop te zetten."],
        ["Een mentale stop gebruiken", false, "Een mentale stop wordt in de praktijk vaak niet uitgevoerd."],
        ["Geen SL nodig in een range", false, "Ranges breken ook. Je SL is je verzekering voor als de structuur verandert."],
      ],
    },
    {
      q: "De koers is bij de range low, maar er is nog geen deviatie-close of reclaim. Je triggers zijn half duidelijk.",
      o: [
        ["Wachten op de trigger: A+ of niets", true, "Check 3: alleen A+ setups. Een half signaal is geen signaal. Wacht op de deviatie, reclaim en retest."],
        ["Alvast instappen, de trigger komt wel", false, "Dan anticipeer je. Als de range breekt, zit je verkeerd zonder bevestiging."],
        ["Half instappen, half later", false, "Dat is nog steeds instappen zonder trigger, alleen met minder geld."],
        ["Instappen met een ruime stop", false, "Een ruime stop verlaagt je R:R en lost het ontbreken van een trigger niet op."],
      ],
    },
  ];
  // ===== Professional: rekenen met leverage, winrate en expectancy (gebruik de rekenmachine) =====
  // Zorg dat de antwoorden na afronden echt verschillen.
  function distinct(vals, f) {
    const seen = new Set();
    return vals.every((v) => {
      const k = f(v);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  const pctTxt = (v, d = 1) => (v * 100).toLocaleString("nl-NL", { maximumFractionDigits: d, minimumFractionDigits: d }) + "%";
  const rTxt = (v) => (v >= 0 ? "+" : "") + v.toLocaleString("nl-NL", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) + "R";

  T.push(function liquidation(rand) {
    for (;;) {
      const entry = pick(rand, [64000, 3200, 145, 2.4, 330, 158]) * (0.9 + rand() * 0.2);
      const lev = pick(rand, [3, 5, 10]);
      const mm = 0.05;
      const long = rand() < 0.5;
      const sgn = long ? -1 : 1;
      const good = entry * (1 + sgn * (1 / lev - mm));
      const a = entry * (1 + sgn * (1 / lev)); // marge vergeten
      const b = entry * (1 + sgn * mm); // alleen onderhoudsmarge
      const c = entry * (1 + sgn * (1 / lev + mm)); // verkeerd om opgeteld
      if (!distinct([good, a, b, c], fmt)) continue;
      return {
        cat: "risk",
        title: "Liquidatieprijs",
        prompt: `Je gaat <strong>${long ? "long" : "short"}</strong> op <strong>${fmt(entry)}</strong> met <strong>${lev}x</strong> leverage. De onderhoudsmarge is <strong>5%</strong>. Rond welke prijs word je (ongeveer) geliquideerd?`,
        svg: "",
        options: shuffle(rand, [
          ok(fmt(good), `Liquidatie ≈ entry × (1 ${long ? "−" : "+"} (1/leverage − onderhoudsmarge)) = ${fmt(entry)} × (1 ${long ? "−" : "+"} (${fmt(1 / lev)} − 0,05)) = ${fmt(good)}. Je marge is 1/${lev} van de positie; als het verlies je marge min de onderhoudsmarge opeet, sluit de exchange je positie.`),
          no(fmt(a), "Dit is entry ± 1/leverage: je vergeet de onderhoudsmarge. De exchange liquideert al eerder, zodra er nog 5% marge over is."),
          no(fmt(b), "Dit is alleen de onderhoudsmarge van 5%. De leverage bepaalt hoeveel marge je hebt: die telt hier niet mee."),
          no(fmt(c), "Hier zijn de onderhoudsmarge en 1/leverage opgeteld in plaats van afgetrokken. Liquidatie komt juist eerder, niet later."),
        ]),
        lesson: "Liquidatie ≈ entry × (1 ∓ (1/leverage − onderhoudsmarge)). Je stop moet altijd ruim vóór je liquidatieprijs liggen; anders kies je minder leverage.",
      };
    }
  });

  T.push(function breakevenWinrate(rand) {
    for (;;) {
      const R = pick(rand, [0.8, 1, 1.2, 1.5, 1.8, 2, 2.4, 2.5, 3, 4]);
      const good = 1 / (1 + R);
      const opts = [good, R / (1 + R), 0.5, Math.min(0.95, 1 / R)];
      if (!distinct(opts, (v) => pctTxt(v))) continue;
      return {
        cat: "risk",
        title: "Benodigde winrate",
        prompt: `Je winnende trades leveren gemiddeld <strong>${R.toLocaleString("nl-NL")}R</strong> op, je verliezers kosten <strong>1R</strong>. Welke winrate heb je minimaal nodig om <strong>break-even</strong> te draaien (fees niet meegerekend)?`,
        svg: "",
        options: shuffle(rand, [
          ok(pctTxt(good), `Break-even winrate = 1 / (1 + R) = 1 / (1 + ${R.toLocaleString("nl-NL")}) = ${pctTxt(good)}. Dan is winrate × ${R.toLocaleString("nl-NL")}R precies gelijk aan (1 − winrate) × 1R.`),
          no(pctTxt(opts[1]), `Dit is R / (1 + R): het deel dat je verliest, niet de winrate die je nodig hebt. Reken na: ${pctTxt(opts[1])} × ${R.toLocaleString("nl-NL")}R is meer dan nodig.`),
          no(pctTxt(0.5), "50% is alleen nodig als je winst en verlies even groot zijn (1R tegen 1R)."),
          no(pctTxt(opts[3]), "Dit is 1 / R. De juiste formule is 1 / (1 + R): je moet het verlies van 1R meetellen."),
        ]),
        lesson: "Break-even winrate = 1 / (1 + gemiddelde R). Hoe groter je R:R, hoe lager de winrate die je nodig hebt. Daarom loont TP2.",
      };
    }
  });

  T.push(function expectancy(rand) {
    for (;;) {
      const wr = pick(rand, [0.35, 0.4, 0.45, 0.5, 0.55, 0.6]);
      const win = pick(rand, [1.2, 1.5, 1.8, 2, 2.4, 3]);
      const good = wr * win - (1 - wr);
      const opts = [good, wr * win, wr * win - wr, (1 - wr) * win - wr];
      if (!distinct(opts, rTxt)) continue;
      return {
        cat: "risk",
        title: "Expectancy",
        prompt: `Je winrate is <strong>${pctTxt(wr, 0)}</strong>. Een winnende trade levert gemiddeld <strong>${win.toLocaleString("nl-NL")}R</strong> op, een verliezer kost <strong>1R</strong>. Wat is je verwachte resultaat (expectancy) per trade?`,
        svg: "",
        options: shuffle(rand, [
          ok(rTxt(good), `Expectancy = winrate × winst − verliesrate × verlies = ${pctTxt(wr, 0)} × ${win.toLocaleString("nl-NL")}R − ${pctTxt(1 - wr, 0)} × 1R = ${rTxt(good)} per trade. ${good > 0 ? "Positief: op de lange termijn verdien je met deze aanpak." : "Negatief: op de lange termijn verlies je, hoe goed individuele trades ook voelen."}`),
          no(rTxt(opts[1]), "Dit is alleen de winstkant (winrate × winst). Je vergeet de verliezers af te trekken."),
          no(rTxt(opts[2]), "Hier is de winrate van de winst afgetrokken in plaats van de verliesrate (1 − winrate)."),
          no(rTxt(opts[3]), "Winrate en verliesrate zijn omgedraaid."),
        ]),
        lesson: "Expectancy = winrate × gem. winst − (1 − winrate) × gem. verlies. Positief = een strategie met edge. Je journal rekent dit voor je uit in het Portfolio.",
      };
    }
  });

  T.push(function sizeWithFees(rand) {
    for (;;) {
      const bal = pick(rand, [1000, 2500, 5000, 10000]);
      const riskPct = pick(rand, [0.5, 1, 2]);
      const entry = pick(rand, [64000, 3200, 145, 330]) * (0.95 + rand() * 0.1);
      const dist = entry * (0.006 + rand() * 0.02);
      const long = rand() < 0.5;
      const sl = long ? entry - dist : entry + dist;
      const fee = 0.0005;
      const risk = (bal * riskPct) / 100;
      const good = risk / (dist + (entry + sl) * fee);
      const noFee = risk / dist;
      const wrong1 = risk / (dist + entry * fee);
      const wrong2 = (risk * (1 - 2 * fee)) / entry;
      const u = (v) => (+v).toLocaleString("nl-NL", { maximumSignificantDigits: 4 });
      if (!distinct([good, noFee, wrong1, wrong2], u)) continue;
      return {
        cat: "risk",
        title: "Positiegrootte met fees",
        prompt: `Saldo <strong>${money(bal)}</strong>, risico <strong>${riskPct}%</strong>. ${long ? "Long" : "Short"} op <strong>${fmt(entry)}</strong>, stop op <strong>${fmt(sl)}</strong>. De fee is <strong>0,05%</strong> bij instappen én bij uitstappen. Hoeveel units neem je, zodat je verlies <em>inclusief fees</em> precies je risico is?`,
        svg: "",
        options: shuffle(rand, [
          ok(u(good), `Risico = ${money(risk)}. Verlies per unit = afstand tot stop (${fmt(dist)}) + fee bij instappen (${fmt(entry)} × 0,05%) + fee bij uitstappen (${fmt(sl)} × 0,05%) = ${fmt(dist + (entry + sl) * fee)}. Units = ${money(risk)} / ${fmt(dist + (entry + sl) * fee)} = ${u(good)}.`),
          no(u(noFee), `Dit is zonder fees (${money(risk)} / ${fmt(dist)}). Bij je stop verlies je dan meer dan ${riskPct}%, omdat de fees er nog bij komen.`),
          no(u(wrong1), "Hier is alleen de fee bij instappen meegeteld. Bij een stop betaal je ook een fee bij het uitstappen."),
          no(u(wrong2), "Dit deelt je risico door de prijs: zo bepaal je je inzet, niet je risico tot de stop."),
        ]),
        lesson: "Units = risico / (afstand tot stop + fee in + fee uit). Zo is je verlies bij de stop inclusief kosten precies 1R. De papier-modus en Advise rekenen zo.",
      };
    }
  });

  T.push(function mindset(rand) {
    const s = pick(rand, SCEN);
    return {
      cat: "mindset",
      title: "Checklist-scenario",
      prompt: s.q + " <strong>Wat doe je?</strong>",
      svg: "",
      options: shuffle(rand, s.o.map(([t, good, why]) => (good ? ok : no)(t, why))),
      lesson: "Je checklist beschermt je tegen jezelf. Eén rode check is genoeg om een trade over te slaan of te wachten.",
    };
  });

  // ---------- UI ----------
  let state = { cat: "", level: "", seed: null, q: null, fn: null, answered: false };
  try {
    state.level = localStorage.getItem("td.school.level") || "";
  } catch {}
  const catCache = new Map();
  function catOf(f) {
    if (!catCache.has(f)) catCache.set(f, f(C.rng(1)).cat);
    return catCache.get(f);
  }

  // Minder herhaling: opdrachten die je recent had, komen pas terug als je minstens de helft
  // van de andere opdrachten in deze selectie hebt gezien (ook na het herstarten van de app).
  function recent() {
    try {
      return JSON.parse(localStorage.getItem("td.school.recent") || "[]");
    } catch {
      return [];
    }
  }
  function remember(name) {
    const r = recent().filter((x) => x !== name);
    r.unshift(name);
    try {
      localStorage.setItem("td.school.recent", JSON.stringify(r.slice(0, 40)));
    } catch {}
  }
  function poolNow() {
    const pool = T.filter((f) => (!state.cat || catOf(f) === state.cat) && (!state.level || levelOf(f) === state.level));
    return pool.length ? pool : T.filter((f) => !state.cat || catOf(f) === state.cat);
  }
  function newQuestion() {
    const pool = poolNow();
    const block = new Set(recent().slice(0, Math.max(1, Math.floor(pool.length / 2))));
    let choices = pool.filter((f) => !block.has(f.name));
    if (!choices.length) choices = pool.filter((f) => f !== state.fn);
    if (!choices.length) choices = pool;
    state.seed = (Math.random() * 2 ** 31) | 0;
    const rand = C.rng(state.seed);
    state.fn = pick(rand, choices);
    remember(state.fn.name);
    state.q = state.fn(rand);
    state.answered = false;
    // Geschiedenis voor "Vorige": opdracht + seed is genoeg om hem exact opnieuw te maken.
    hist.splice(histPos + 1);
    hist.push({ name: state.fn.name, seed: state.seed, chosen: null });
    if (hist.length > 100) hist.shift();
    histPos = hist.length - 1;
  }
  const hist = [];
  let histPos = -1;
  // Naar een eerdere (of latere) opdracht uit de geschiedenis.
  function goTo(i) {
    const h = hist[i];
    if (!h) return false;
    const fn = T.find((f) => f.name === h.name);
    if (!fn) return false;
    const rand = C.rng(h.seed);
    pick(rand, [0]); // dezelfde stap als bij het kiezen van de opdracht, zodat de seed gelijk loopt
    state.fn = fn;
    state.seed = h.seed;
    state.q = fn(rand);
    state.answered = h.chosen !== null;
    histPos = i;
    return true;
  }

  function statsHTML(s, verdict) {
    return `${verdict === undefined ? "" : `<span class="${verdict ? "pos" : "neg"}"><strong>${verdict ? "✓ Goed!" : "✗ Fout"}</strong></span>`}
      <span>Beantwoord <strong>${s.answered}</strong></span>
      <span>Goed <strong>${s.answered ? Math.round((s.correct / s.answered) * 100) : 0}%</strong></span>
      <span>Reeks <strong>${s.streak}</strong></span>
      <span>Beste reeks <strong>${s.best}</strong></span>`;
  }

  // Bovenaan: kiezen tussen opdrachten (multiple choice) en zelf tekenen.
  function modeHTML() {
    return `<div class="view-toggle school-mode" role="group" aria-label="Leerschool-onderdeel">
      <button type="button" data-mode="quiz" class="${state.mode !== "draw" ? "active" : ""}">Opdrachten</button>
      <button type="button" data-mode="draw" class="${state.mode === "draw" ? "active" : ""}">✏️ Zelf tekenen</button>
    </div>`;
  }
  function bindMode(root) {
    root.querySelectorAll(".school-mode [data-mode]").forEach((b) =>
      b.addEventListener("click", () => {
        state.mode = b.dataset.mode;
        try {
          localStorage.setItem("td.school.mode", state.mode);
        } catch {}
        render(root);
      })
    );
  }
  function renderDraw(root) {
    const s = S.getSchool();
    root.innerHTML = `
      <div class="page-head">
        <div class="row gap"><h1>Leerschool</h1>${modeHTML()}</div>
        <div class="row gap">
          <div class="school-stats">${statsHTML(s)}</div>
        </div>
      </div>
      <p class="muted small">Teken zelf de range, de neklijn of de trendlijnen van een patroon. Daarna leggen we de juiste lijnen eroverheen en beoordelen we elke lijn.</p>
      <div id="draw-box"></div>`;
    bindMode(root);
    TD.drawSchool.render(root.querySelector("#draw-box"), (ok) => {
      const st = S.recordAnswer("draw", ok);
      const el = root.querySelector(".school-stats");
      if (el) el.innerHTML = statsHTML(st, ok);
    });
  }

  function render(root) {
    if (state.mode === undefined) {
      try {
        state.mode = localStorage.getItem("td.school.mode") || "quiz";
      } catch {
        state.mode = "quiz";
      }
    }
    if (state.mode === "draw" && TD.drawSchool) return renderDraw(root);
    if (!state.q || !state.fn) newQuestion();
    const s = S.getSchool();
    const q = state.q;
    const catStat = (k) => {
      const c = s.byCat[k];
      return c ? `${Math.round((c.correct / c.answered) * 100)}%` : "";
    };

    root.innerHTML = `
      <div class="page-head">
        <div class="row gap"><h1>Leerschool</h1>${modeHTML()}</div>
        <div class="row gap">
          <div class="school-stats">${statsHTML(s)}</div>
          <button class="btn small" id="reset">Reset score</button>
        </div>
      </div>
      <div class="chips levels">
        <span class="muted small">Niveau</span>
        <button class="chip ${state.level === "" ? "active" : ""}" data-level="">Alle niveaus</button>
        ${Object.entries(LEVELS)
          .map(([k, v]) => `<button class="chip lvl-${k} ${state.level === k ? "active" : ""}" data-level="${k}">${v} <em>${T.filter((f) => levelOf(f) === k).length}</em></button>`)
          .join("")}
      </div>
      <div class="chips">
        <button class="chip ${state.cat === "" ? "active" : ""}" data-cat="">Alles door elkaar</button>
        ${Object.entries(CATS)
          .map(([k, v]) => `<button class="chip ${state.cat === k ? "active" : ""}" data-cat="${k}">${v}${catStat(k) ? ` <em>${catStat(k)}</em>` : ""}</button>`)
          .join("")}
      </div>

      <section class="panel quiz">
        <div class="quiz-head">
          <span class="badge">${esc(CATS[q.cat])}</span>
          <span class="badge lvl-${levelOf(state.fn)}">${esc(LEVELS[levelOf(state.fn)])}</span>
          <h2>${esc(q.title)}</h2>
          <span class="muted small">Opdracht #${state.seed}</span>
        </div>
        ${q.svg ? `<div class="quiz-chart">${q.svg}</div>` : ""}
        <p class="quiz-prompt">${q.prompt}</p>
        <div class="answers">
          ${q.options
            .map(
              (o, i) => `<button class="answer" data-i="${i}">
                <span class="a-letter">${String.fromCharCode(65 + i)}</span>
                <span class="a-body"><span class="a-text">${esc(o.t)}</span><span class="a-why" hidden>${esc(o.why)}</span></span>
              </button>`
            )
            .join("")}
        </div>
        <div class="lesson-box" id="lesson" hidden><strong>Les:</strong> ${esc(q.lesson)}</div>
        <div class="quiz-actions">
          <button class="btn" id="prev" ${histPos > 0 ? "" : "disabled"} title="Vorige opdracht">← Vorige</button>
          <button class="btn" id="calc" title="Rekenmachine openen">🧮 Rekenmachine</button>
          <span class="muted small" id="replay-note">${state.answered ? "Al beantwoord: telt niet opnieuw mee." : ""}</span>
          <button class="btn primary" id="next">${state.answered ? "Volgende opdracht →" : "Overslaan →"}</button>
        </div>
      </section>

      <details class="panel theory">
        <summary>Theorie: Range Trading 101 & Technical Analysis 101</summary>
        <div class="theory-grid">
          <div><h3>Range = het frame</h3><p>Horizontale support en resistance. Staat je range verkeerd, dan kloppen al je triggers niet. Neem er de tijd voor (‘vind je eerste 3000 ranges’).</p></div>
          <div><h3>Range tekenen</h3><p>Van het <b>begin van de push</b> (range low) tot het <b>einde van de push</b> (range high), of andersom bij een dump. Begin bij de uitersten. Wick of body hangt af van de chart.</p></div>
          <div><h3>Mid range</h3><p>Fib-tool met alleen 0, 0,5 en 1. Een goede mid sluit aan op support- en resistance-flips. Doet hij dat niet, pas dan je high of low aan.</p></div>
          <div><h3>Deviatie</h3><p>Candle <b>sluit buiten</b> de range (high, low of mid) en reclaimt terug binnen. Meestal tradeable: ‘deviaties zijn je vriend’.</p></div>
          <div><h3>Swing failure</h3><p>Alleen een <b>wick</b> buiten de range, geen close. Kleine SFP = tradeable. Grote wick = het level wordt ontradeable (R:R kapot).</p></div>
          <div><h3>Reclaim + retest</h3><p>Na de deviatie terug binnen, en dan de retest waarbij resistance support wordt. Daar haal je de trekker over. <b>Clean break</b> zonder retest = geen trade.</p></div>
          <div><h3>Range-analyse</h3><p>Hoeveel % zit aan welke kant (bijv. 85/15)? Welke kant is snel en welke traag? Liever langzame prijsontwikkeling. Niet elke range is tradeable.</p></div>
          <div><h3>Range in range</h3><p>Overal zitten ranges. Kies vooraf de gunstigste (4H, 1H, 15m). De range die je trade, is leading.</p></div>
          <div><h3>Candles & timeframes</h3><p>Elke candle = één timeframe. Body = open tot close, wicks = waar de koers kwam maar niet sloot. Tip: wit en zwart in plaats van groen en rood.</p></div>
          <div><h3>Trend & structuur</h3><p>HH + HL = uptrend, equal highs/lows = sideways (range), LH + LL = downtrend. Trendlijn officieel vanaf 3 touches. Uptrend van onderaf tekenen, downtrend van bovenaf.</p></div>
          <div><h3>Patronen</h3><p>Double top/bottom, head & shoulders, wedges, continuation-patronen: waarschijnlijkheden. Alleen gebruiken aan de juiste kant van je range.</p></div>
          <div class="span-all"><h3>Chart patterns in je range</h3>
            <p><b>Reversal</b> (omkering): double top · head & shoulders · rising wedge (bearish, bij de <b>range high</b>), double bottom · inverse head & shoulders · falling wedge (bullish, bij de <b>range low</b>). Vaak is zo'n patroon in jouw taal een deviatie of swing failure bij de rand; de breuk van de neklijn + retest is je trigger, stop net voorbij de tweede top/bodem of rechterschouder.</p>
            <p><b>Continuation</b> (voortzetting): bullish/bearish rectangle, pennant en wedge ná een sterke beweging. Een rectangle is een kleine range; de uitbraak met acceptatie + retest is je breakout-setup.</p>
            <p><b>Bilateraal</b>: ascending, descending en symmetrical triangle. Kan twee kanten op: niet vooraf traden, wacht op de uitbraak met acceptatie en een retest.</p>
            <p class="muted">Patronen zijn waarschijnlijkheden, geen garantie. Niet rond de mid, niet als enige reden, en je targets blijven de mid en de andere rand van je range.</p></div>
          <div><h3>RSI</h3><p>&gt; 70 overbought, &lt; 30 oversold, plus divergenties. Lagging: alleen bij een interessant level in je range en samen met triggers.</p></div>
        </div>
        <p class="muted small">Nog niet in deze transcripts: trendlijnen als trigger binnen de range en ‘red zones’. Die modules kunnen er later bij.</p>
      </details>`;

    // Antwoord tonen: goed/fout per optie en de uitleg.
    const reveal = (idx) => {
      root.querySelectorAll(".answer").forEach((x) => {
        const o = q.options[+x.dataset.i];
        x.disabled = true;
        x.classList.add(o.ok ? "correct" : "wrong");
        if (+x.dataset.i === idx) x.classList.add("chosen");
        x.querySelector(".a-why").hidden = false;
      });
      root.querySelector("#lesson").hidden = false;
      root.querySelector("#next").textContent = "Volgende opdracht →";
    };
    const h = hist[histPos];
    if (state.answered && h && h.chosen !== null) reveal(h.chosen);
    root.querySelectorAll(".answer").forEach((b) =>
      b.addEventListener("click", () => {
        if (state.answered) return;
        state.answered = true;
        const idx = +b.dataset.i;
        if (hist[histPos]) hist[histPos].chosen = idx;
        const chosen = q.options[idx];
        const st = S.recordAnswer(q.cat, chosen.ok);
        reveal(idx);
        root.querySelector(".school-stats").innerHTML = statsHTML(st, chosen.ok);
      })
    );
    root.querySelector("#next").addEventListener("click", () => {
      // Eerst vooruit door de opdrachten waar je naar terug was gegaan; daarna een nieuwe.
      if (!(histPos < hist.length - 1 && goTo(histPos + 1))) newQuestion();
      render(root);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    root.querySelector("#prev").addEventListener("click", () => {
      if (histPos > 0 && goTo(histPos - 1)) {
        render(root);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
    bindMode(root);
    root.querySelector("#calc").addEventListener("click", () => TD.calculator && TD.calculator.toggle());
    root.querySelectorAll("[data-level]").forEach((c) =>
      c.addEventListener("click", () => {
        state.level = c.dataset.level;
        try {
          localStorage.setItem("td.school.level", state.level);
        } catch {}
        newQuestion();
        render(root);
      })
    );
    root.querySelectorAll("[data-cat]").forEach((c) =>
      c.addEventListener("click", () => {
        state.cat = c.dataset.cat;
        newQuestion();
        render(root);
      })
    );
    root.querySelector("#reset").addEventListener("click", () => {
      if (confirm("Je Leerschool-score resetten?")) {
        S.resetSchool();
        render(root);
      }
    });
  }

  TD.views = TD.views || {};
  TD.views.leerschool = { render, _templates: T, CATS, LEVELS, levelOf, _draw: { PATTERNS, drawPattern, makeRange, rangePath, build, pick, shuffle } };
})(window.TD);
