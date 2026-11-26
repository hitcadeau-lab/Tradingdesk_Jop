// Leerschool · Zelf tekenen: je krijgt een grafiek zonder hulplijnen en tekent zelf de range,
// de neklijn of de trendlijnen van een patroon. Daarna legt de app de juiste lijnen eroverheen
// en beoordeelt elke lijn (goed / bijna / fout).
window.TD = window.TD || {};
(function (TD) {
  const { esc } = TD.util;
  const C = TD.charts;
  const TOL_GOOD = 0.06, TOL_CLOSE = 0.12; // afwijking als deel van de hoogte van het patroon

  const KINDS = { range: "Range tekenen", find: "Ranges zoeken (lange grafiek)", neck: "Neklijn", trend: "Trendlijnen & driehoeken" };
  let state = { kind: "", task: null, lines: [], pending: null, tool: "h", checked: null, seed: null };

  // ---------- opdrachten ----------
  function makeTask(seed, kind) {
    const D = TD.views.leerschool._draw;
    const rand = C.rng(seed);
    const k = kind || D.pick(rand, ["range", "find", "find", "neck", "trend", "trend"]);
    if (k === "find") return findTask(rand, D);
    if (k === "range") {
      const R = D.makeRange(rand);
      const candles = D.build(rand, R, D.rangePath(rand, R, 6));
      return {
        kind: k, candles, height: R.h,
        title: "Teken de range",
        prompt: "Teken de <strong>range high</strong> en de <strong>range low</strong> met twee horizontale lijnen.",
        hint: "Begin bij de uitersten: de hoogste en laagste punten waar de koers steeds keert. Een enkele lont erbuiten mag (swing failure).",
        truth: [
          { name: "Range high", h: R.high },
          { name: "Range low", h: R.low },
        ],
        explain: "De range loopt van het begin tot het einde van de push. De randen zijn de prijzen waar de koers steeds keert; een losse lont erbuiten telt niet mee.",
        tools: ["h"],
      };
    }
    const keys = k === "neck" ? ["doubleTop", "doubleBottom", "headShoulders", "invHeadShoulders"] : ["risingWedge", "fallingWedge", "bullPennant", "bearPennant", "ascTriangle", "descTriangle", "symTriangle", "bullRect", "bearRect", "fallingWedgeCont", "risingWedgeCont"];
    const key = D.pick(rand, keys);
    const P = D.PATTERNS[key];
    const upto = P.breakAt ? P.breakAt + (k === "neck" ? 1 : 0) : P.piv.length;
    const d = D.drawPattern(rand, key, 100, 140, { upto });
    const span = [Math.max(0, d.idx[1] - 1), d.candles.length - 1];
    // Hoogte van het patroon zelf (zonder de beweging ervoor): daaraan meten we de afwijking.
    const endI = P.breakAt && P.breakAt < d.idx.length ? d.idx[P.breakAt] : d.candles.length - 1;
    let hi = -Infinity, lo = Infinity;
    for (let i = d.idx[1]; i <= endI; i++) {
      hi = Math.max(hi, d.candles[i].h);
      lo = Math.min(lo, d.candles[i].l);
    }
    const ph = Math.max(hi - lo, 40 * 0.12);
    const truth = [
      ...d.lines.map((l) => ({ name: l.label || "Lijn", h: l.price, from: span[0], to: span[1] })),
      ...d.segments.map((sg) => ({ name: "Trendlijn", i1: sg.i1, p1: sg.p1, i2: sg.i2, p2: sg.p2 })),
    ];
    if (k === "neck") {
      return {
        kind: k, candles: d.candles, height: ph, title: `Teken de neklijn · ${P.name}`,
        prompt: `Dit is een <strong>${P.name.toLowerCase()}</strong>. Teken de <strong>neklijn</strong>.`,
        hint: key.includes("ouble") ? "De neklijn loopt door het dal (of de top) tussen de twee toppen (of bodems)." : "De neklijn loopt door de twee dalen (of toppen) naast het hoofd.",
        truth: truth.slice(0, 1).map((t) => ({ ...t, name: "Neklijn" })),
        explain: `${P.name}: ${P.desc}. De neklijn is het beslispunt: pas als de koers er doorheen sluit (en de retest houdt), is het patroon bevestigd.`,
        tools: key.includes("ouble") ? ["h", "l"] : ["l", "h"],
      };
    }
    const n = truth.length;
    return {
      kind: k, candles: d.candles, height: ph, title: `Teken de lijnen · ${P.name}`,
      prompt: `Dit is een <strong>${P.name.toLowerCase()}</strong>. Teken de <strong>${n} lijnen</strong> van het patroon (boven- en onderkant).`,
      hint: "Een trendlijn trek je door minstens twee toppen (bovenkant) of twee bodems (onderkant). Horizontaal waar de koers steeds op dezelfde prijs keert.",
      truth: truth.map((t, i) => ({ ...t, name: n === 2 ? (i === 0 ? "Lijn 1" : "Lijn 2") : "Lijn" })),
      explain: `${P.name}: ${P.desc}.`,
      tools: ["l", "h"],
    };
  }

  // Lange grafiek met trends en 2 of 3 ranges. Elke range = van het begin van de push tot het einde
  // van de consolidatie erna; high en low = het begin en einde van de push.
  function findTask(rand, D) {
    const nR = 2 + (rand() < 0.45 ? 1 : 0);
    const start = 100;
    const path = [], boxes = [];
    let price = start, bars = 0;
    // Aanloop: wat zijwaarts-omhoog zonder duidelijke range.
    const lead = 6 + Math.floor(rand() * 5);
    path.push({ price: start * (1 + (rand() - 0.5) * 0.04), bars: lead });
    price = path[0].price;
    bars += lead;
    let dir = rand() < 0.5 ? 1 : -1;
    for (let k = 0; k < nR; k++) {
      const size = start * (0.08 + rand() * 0.07);
      const pushBars = 6 + Math.floor(rand() * 4);
      const from = price, to = price + dir * size;
      const lo = Math.min(from, to), hi = Math.max(from, to);
      const i1 = bars; // eerste candle van de push
      path.push({ price: to, bars: pushBars, exact: true });
      bars += pushBars;
      // Consolidatie binnen de range: na een push omhoog eerst terug naar de low, en andersom.
      // Af en toe een kleine lont buiten de rand (swing failure), maar geen close erbuiten.
      const h = hi - lo;
      const rp = [];
      let atTop = dir > 0;
      const nT = 4 + Math.floor(rand() * 2);
      for (let t = 0; t < nT; t++) {
        const toTop = !atTop;
        const sfp = rand() < 0.25;
        rp.push({
          price: toTop ? hi - h * (0.04 + rand() * 0.08) : lo + h * (0.04 + rand() * 0.08),
          bars: 4 + Math.floor(rand() * 4),
          wickTo: toTop ? hi + (sfp ? h * 0.04 : 0) : lo - (sfp ? h * 0.04 : 0),
          clampHigh: hi + h * 0.05,
          clampLow: lo - h * 0.05,
        });
        atTop = toTop;
      }
      rp.forEach((x) => path.push(x));
      const consBars = rp.reduce((a, x) => a + x.bars, 0);
      bars += consBars;
      boxes.push({ i1, i2: bars - 1, hi, lo });
      price = rp[rp.length - 1].price;
      // Volgende push: meestal dezelfde kant op (trend), soms omgekeerd.
      if (rand() < 0.3) dir = -dir;
      // De volgende push begint bij de rand van deze range.
      const edge = dir > 0 ? hi : lo;
      path.push({ price: edge, bars: 2 });
      bars += 2;
      price = edge;
    }
    // Afloop: trend weg van de laatste range.
    path.push({ price: price + dir * start * 0.06, bars: 6 });
    const candles = TD.charts.candlesFromPath(rand, start, path, { vol: 0.004 });
    return {
      kind: "find", candles, width: 1100, boxes,
      title: `Zoek de ${nR} ranges`,
      prompt: `In deze grafiek zitten <strong>${nR} ranges</strong>. Teken elke range als <strong>box</strong>: klik op het <em>begin van de push</em> bij de ene rand en daarna op het <em>einde van de range</em> bij de andere rand.`,
      hint: "Een range begint bij een push (snelle beweging) en daarna blijft de koers tussen het begin en het einde van die push heen en weer gaan. High en low = begin en einde van de push. De range eindigt waar de volgende push eruit breekt.",
      truth: boxes.map((b, j) => ({ name: `Range ${j + 1}`, box: b })),
      explain: "Ranges vind je door eerst de pushes te zoeken: de snelle bewegingen. Van het begin tot het einde van zo'n push loopt je range; daarna consolideert de koers erin tot de volgende push eruit breekt. Vind je eerste 3000 ranges: hoe vaker je ze tekent, hoe sneller je ze ziet.",
      tools: ["box"],
    };
  }

  // Box-beoordeling: prijs (high/low t.o.v. de hoogte van de range) en tijd (overlap van de periodes).
  function boxScore(u, b) {
    const uhi = Math.max(u.p1, u.p2), ulo = Math.min(u.p1, u.p2);
    const ui1 = Math.min(u.i1, u.i2), ui2 = Math.max(u.i1, u.i2);
    const h = b.hi - b.lo;
    const perr = (Math.abs(uhi - b.hi) + Math.abs(ulo - b.lo)) / 2 / h;
    const inter = Math.max(0, Math.min(ui2, b.i2) - Math.max(ui1, b.i1));
    const union = Math.max(ui2, b.i2) - Math.min(ui1, b.i1);
    const iou = union > 0 ? inter / union : 0;
    return { perr, iou, cost: perr + (1 - iou) };
  }
  function gradeBoxes(task, lines) {
    const B = task.truth;
    const perms = (arr, k) => (k === 0 ? [[]] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)], k - 1).map((p) => [x, ...p])));
    const k = Math.min(B.length, lines.length);
    let best = null;
    for (const p of perms(lines.map((_, i) => i), k)) {
      const sc = p.map((u, j) => boxScore(lines[u], B[j].box));
      const total = sc.reduce((x, y) => x + y.cost, 0);
      if (!best || total < best.total) best = { p, sc, total };
    }
    const res = B.map((t, j) => {
      if (!best || j >= best.p.length) return { truth: t, verdict: "missing" };
      const { perr, iou } = best.sc[j];
      const verdict = perr <= 0.1 && iou >= 0.6 ? "good" : perr <= 0.2 && iou >= 0.4 ? "close" : "wrong";
      return { truth: t, user: best.p[j], perr, iou, err: perr, verdict };
    });
    const extra = Math.max(0, lines.length - B.length);
    const ok = res.every((r) => r.verdict === "good") && extra === 0;
    return { res, extra, ok, close: !ok && res.every((r) => r.verdict === "good" || r.verdict === "close"), boxes: true };
  }

  // ---------- beoordeling ----------
  const priceAt = (ln, i) => (ln.h !== undefined ? ln.h : ln.p1 + ((ln.p2 - ln.p1) * (i - ln.i1)) / (ln.i2 - ln.i1 || 1));
  function lineError(user, truth, H) {
    const a = truth.h !== undefined ? truth.from : truth.i1;
    const b = truth.h !== undefined ? truth.to : truth.i2;
    let sum = 0;
    for (let k = 0; k <= 4; k++) {
      const i = a + ((b - a) * k) / 4;
      sum += Math.abs(priceAt(user, i) - priceAt(truth, i));
    }
    return sum / 5 / H;
  }
  function grade(task, lines) {
    if (task.kind === "find") return gradeBoxes(task, lines);
    const T = task.truth, H = task.height;
    const perms = (arr, k) => (k === 0 ? [[]] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)], k - 1).map((p) => [x, ...p])));
    const k = Math.min(T.length, lines.length);
    let best = null;
    for (const p of perms(lines.map((_, i) => i), k)) {
      const errs = p.map((u, j) => lineError(lines[u], T[j], H));
      const total = errs.reduce((x, y) => x + y, 0);
      if (!best || total < best.total) best = { p, errs, total };
    }
    const res = T.map((t, j) => {
      if (!best || j >= best.p.length) return { truth: t, err: null, verdict: "missing" };
      const e = best.errs[j];
      return { truth: t, user: best.p[j], err: e, verdict: e <= TOL_GOOD ? "good" : e <= TOL_CLOSE ? "close" : "wrong" };
    });
    const extra = Math.max(0, lines.length - T.length);
    const ok = res.every((r) => r.verdict === "good") && extra === 0;
    return { res, extra, ok, close: !ok && res.every((r) => r.verdict === "good" || r.verdict === "close") };
  }

  // ---------- tekenen ----------
  function svgLines(task, g, lines, pending, checked) {
    let s = "";
    const L = (x1, y1, x2, y2, col, w, dash) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
    const rect = (b, col, w, dash, fill) => {
      const x1 = g.x(Math.min(b.i1, b.i2)), x2 = g.x(Math.max(b.i1, b.i2)), y1 = g.y(b.hi), y2 = g.y(b.lo);
      return `<rect x="${x1}" y="${y1}" width="${Math.max(1, x2 - x1)}" height="${Math.max(1, y2 - y1)}" fill="${fill || "none"}" stroke="${col}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
    };
    const asBox = (u) => ({ i1: u.i1, i2: u.i2, hi: Math.max(u.p1, u.p2), lo: Math.min(u.p1, u.p2) });
    const draw = (ln, col, w, dash) => {
      if (ln.box) return rect(ln.box, col, w, dash);
      if (ln.type === "box") return rect(asBox(ln), col, w, dash, "rgba(130,168,255,.10)");
      if (ln.h !== undefined) return L(g.padL, g.y(ln.h), g.right, g.y(ln.h), col, w, dash);
      return L(g.x(ln.i1), g.y(ln.p1), g.x(ln.i2), g.y(ln.p2), col, w, dash);
    };
    lines.forEach((ln) => (s += draw(ln, "#82a8ff", 2.5)));
    if (pending && pending.type === "box") {
      s += `<circle cx="${g.x(pending.i1)}" cy="${g.y(pending.p1)}" r="4" fill="#82a8ff"/>`;
      if (pending.i2 !== undefined) s += rect(asBox(pending), "#82a8ff", 1.5, "5 4", "rgba(130,168,255,.08)");
    } else if (pending) {
      s += `<circle cx="${g.x(pending.i1)}" cy="${g.y(pending.p1)}" r="4" fill="#82a8ff"/>`;
      if (pending.i2 !== undefined) s += L(g.x(pending.i1), g.y(pending.p1), g.x(pending.i2), g.y(pending.p2), "#82a8ff", 2, "5 4");
    }
    if (checked) {
      const col = { good: "#26a69a", close: "#f5a623", wrong: "#ef5350", missing: "#ef5350" };
      const lbl = { good: "✓", close: "≈", wrong: "✗", missing: "✗ mist" };
      // Juiste lijnen tekenen; de labels rechts zo spreiden dat ze niet overlappen.
      const tags = checked.res.map((r) => {
        const t = r.truth;
        s += draw(t.box ? { box: t.box } : t.h !== undefined ? { h: t.h } : t, "#26a69a", 2, "7 5");
        if (t.box) s += `<text x="${g.x(t.box.i1) + 4}" y="${g.y(t.box.hi) - 5}" class="cc-note" fill="#26a69a">${esc(t.name)}</text>`;
        return { r, y: g.y(t.box ? t.box.hi : t.h !== undefined ? t.h : t.p2) };
      });
      tags.sort((a, b) => a.y - b.y);
      for (let k = 1; k < tags.length; k++) if (tags[k].y - tags[k - 1].y < 24) tags[k].y = tags[k - 1].y + 24;
      const bw = g.width - g.right - 6;
      for (const { r, y: yy } of tags) {
        s += `<rect x="${g.right + 4}" y="${yy - 10}" width="${bw}" height="20" rx="4" fill="${col[r.verdict]}"/>`;
        s += `<text x="${g.right + 4 + bw / 2}" y="${yy + 4}" text-anchor="middle" class="cc-label">${esc(r.truth.name.replace(/^Lijn /, "L"))}: ${lbl[r.verdict]}</text>`;
      }
    }
    return s;
  }

  function render(box, onAnswer) {
    if (!state.task) newTask();
    const t = state.task;
    const W = t.width || 720;
    const g = C.candleGeom(t.candles, { height: 360, width: W });
    const chart = C.candleSVG(t.candles, { height: 360, width: W });
    const ck = state.checked;
    box.innerHTML = `
      <div class="chips">
        <button class="chip ${state.kind === "" ? "active" : ""}" data-dk="">Alles door elkaar</button>
        ${Object.entries(KINDS).map(([k, v]) => `<button class="chip ${state.kind === k ? "active" : ""}" data-dk="${k}">${v}</button>`).join("")}
      </div>
      <section class="panel quiz draw-quiz">
        <div class="quiz-head"><span class="badge">Zelf tekenen</span><h2>${esc(t.title)}</h2><span class="muted small">Opdracht #${state.seed}</span></div>
        <p class="quiz-prompt">${t.prompt}</p>
        <div class="draw-tools row gap">
          ${t.tools.map((tl) => `<button type="button" class="btn small ${state.tool === tl ? "active" : ""}" data-tool="${tl}">${tl === "h" ? "— Horizontale lijn" : tl === "box" ? "▭ Range-box (klik twee hoeken)" : "／ Lijn (klik begin en eind)"}</button>`).join("")}
          <button type="button" class="btn small" data-act="undo" ${state.lines.length && !ck ? "" : "disabled"}>↶ Ongedaan</button>
          <button type="button" class="btn small" data-act="clear" ${state.lines.length && !ck ? "" : "disabled"}>✕ Wissen</button>
          <span class="muted small">${state.lines.length} ${t.kind === "find" ? (state.lines.length === 1 ? "box" : "boxen") : state.lines.length === 1 ? "lijn" : "lijnen"} getekend · nodig: ${t.truth.length}</span>
        </div>
        <div class="draw-wrap quiz-chart">${chart}<svg class="draw-layer" viewBox="0 0 ${g.width} ${g.height}" xmlns="http://www.w3.org/2000/svg">${svgLines(t, g, state.lines, state.pending, ck)}</svg></div>
        <details class="draw-hint"><summary>Hint</summary><p class="muted">${esc(t.hint)}</p></details>
        ${
          ck
            ? `<div class="lesson-box draw-result ${ck.ok ? "ok" : ck.close ? "close" : "bad"}">
            <strong>${ck.ok ? (ck.boxes ? "✓ Alle ranges gevonden!" : "✓ Goed getekend!") : ck.close ? `≈ Bijna: ${ck.boxes ? "de boxen" : "de lijnen"} liggen in de buurt, maar niet precies genoeg` : "✗ Nog niet goed"}</strong>
            <ul>${ck.res
              .map((r) => `<li><strong>${esc(r.truth.name)}</strong>: ${
                r.verdict === "missing"
                  ? "niet getekend"
                  : `${r.verdict === "good" ? "goed" : r.verdict === "close" ? "bijna" : "fout"} (${ck.boxes ? `prijs ${Math.round(r.perr * 100)}% naast de high/low, tijd ${Math.round(r.iou * 100)}% overlap` : `afwijking ${Math.round(r.err * 100)}% van de hoogte`})`
              }</li>`)
              .join("")}${ck.extra ? `<li>${ck.extra} lijn${ck.extra === 1 ? "" : "en"} te veel getekend.</li>` : ""}</ul>
            <p>${esc(t.explain)}</p>
            <p class="muted small">${
              ck.boxes
                ? "Groen gestippeld = de juiste ranges. Blauw = jouw boxen. Goed = high en low binnen 10% van de hoogte van de range én minstens 60% overlap in tijd; bijna = binnen 20% en 40% overlap."
                : `Groen gestippeld = de juiste lijnen. Blauw = jouw lijnen. Goed = afwijking tot ${TOL_GOOD * 100}% van de hoogte van het patroon, bijna = tot ${TOL_CLOSE * 100}%.`
            }</p>
          </div>`
            : ""
        }
        <div class="quiz-actions">
          ${ck ? "" : `<button class="btn primary" id="d-check" ${state.lines.length ? "" : "disabled"}>Controleer</button>`}
          <button class="btn ${ck ? "primary" : ""}" id="d-next">${ck ? "Volgende tekening →" : "Overslaan →"}</button>
        </div>
      </section>`;

    const layer = box.querySelector(".draw-layer");
    const toLocal = (e) => {
      const pt = layer.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const m = layer.getScreenCTM();
      const q = m ? pt.matrixTransform(m.inverse()) : pt;
      return { i: g.i(q.x), p: g.p(q.y) };
    };
    const repaintLayer = () => (layer.innerHTML = svgLines(t, g, state.lines, state.pending, state.checked));
    if (!ck) {
      layer.addEventListener("click", (e) => {
        const q = toLocal(e);
        if (state.tool === "h") {
          state.lines.push({ h: q.p });
          return render(box, onAnswer);
        }
        if (!state.pending) {
          state.pending = { i1: q.i, p1: q.p, ...(state.tool === "box" ? { type: "box" } : {}) };
          return repaintLayer();
        }
        if (Math.abs(q.i - state.pending.i1) < 0.5) return; // te kort
        state.lines.push({ ...(state.tool === "box" ? { type: "box" } : {}), i1: state.pending.i1, p1: state.pending.p1, i2: q.i, p2: q.p });
        state.pending = null;
        render(box, onAnswer);
      });
      layer.addEventListener("mousemove", (e) => {
        if ((state.tool !== "l" && state.tool !== "box") || !state.pending) return;
        const q = toLocal(e);
        state.pending.i2 = q.i;
        state.pending.p2 = q.p;
        repaintLayer();
      });
    }
    box.querySelectorAll("[data-tool]").forEach((b) =>
      b.addEventListener("click", () => {
        state.tool = b.dataset.tool;
        state.pending = null;
        render(box, onAnswer);
      })
    );
    box.querySelectorAll("[data-act]").forEach((b) =>
      b.addEventListener("click", () => {
        if (b.dataset.act === "undo") state.lines.pop();
        else state.lines = [];
        state.pending = null;
        render(box, onAnswer);
      })
    );
    box.querySelectorAll("[data-dk]").forEach((b) =>
      b.addEventListener("click", () => {
        state.kind = b.dataset.dk;
        newTask();
        render(box, onAnswer);
      })
    );
    const chk = box.querySelector("#d-check");
    if (chk)
      chk.addEventListener("click", () => {
        state.checked = grade(t, state.lines);
        state.pending = null;
        if (onAnswer) onAnswer(state.checked.ok);
        render(box, onAnswer);
      });
    box.querySelector("#d-next").addEventListener("click", () => {
      newTask();
      render(box, onAnswer);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function newTask() {
    state.seed = (Math.random() * 2 ** 31) | 0;
    state.task = makeTask(state.seed, state.kind);
    state.lines = [];
    state.pending = null;
    state.checked = null;
    state.tool = state.task.tools[0];
  }

  TD.drawSchool = { render, makeTask, grade, lineError, boxScore };
})(window.TD);
