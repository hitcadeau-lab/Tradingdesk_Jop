// Tekenen in de grafiek van het tradeformulier: range, entry, stop en TP's zetten met de muis,
// lijnen verslepen, magneet naar de candles, ongedaan maken en sneltoetsen.
// Werkt bovenop TradingView Lightweight Charts; de velden van het formulier blijven de bron.
window.TD = window.TD || {};
(function (TD) {
  const TOOLS = {
    range: { label: "Range", key: "r" },
    entry: { label: "Entry", key: "e" },
    stopLoss: { label: "Stop", key: "s" },
    tp1: { label: "TP1", key: "1" },
    tp2: { label: "TP2", key: "2" },
    tp3: { label: "TP3", key: "3" },
  };
  const DRAGGABLE = ["rangeHigh", "rangeLow", "entry", "stopLoss", "tp1", "tp2", "tp3"];
  const NAMES = { rangeHigh: "Range high", rangeLow: "Range low", entry: "Entry", stopLoss: "Stop", tp1: "TP1", tp2: "TP2", tp3: "TP3" };
  const round = (p) => +(+p).toPrecision(7);

  // De candle waarin moment t valt (ook als je de range op een ander timeframe tekende).
  function candleOf(data, t) {
    let hit = null;
    for (const c of data) {
      if (c.time > t) break;
      hit = c;
    }
    return hit && data.length && t - hit.time < (data.length > 1 ? data[1].time - data[0].time : 1e9) ? hit : null;
  }

  // opts: { el, toolbar, get() → huidige waarden, set(patch) → velden bijwerken, hint(text) }
  // Per geladen grafiek: bind(chart, series, candles).
  function create(opts) {
    const { el, toolbar } = opts;
    let chart = null, series = null, candles = [];
    let tool = null, rangeStart = null, drag = null, magnet = true;
    const undo = [];

    // ---------- coördinaten ----------
    const rel = (e) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    function candleAt(x) {
      if (!chart || !candles.length) return null;
      const lg = chart.timeScale().coordinateToLogical(x);
      if (lg === null) return null;
      const i = Math.max(0, Math.min(candles.length - 1, Math.round(lg)));
      return { i, c: candles[i] };
    }
    // Prijs onder de muis, met magneet naar high/low/open/close van de candle en naar bestaande levels.
    function priceAt(p, skip) {
      if (!series) return null;
      const raw = series.coordinateToPrice(p.y);
      if (raw === null) return null;
      if (!magnet) return round(raw);
      const near = [];
      const hit = candleAt(p.x);
      if (hit) near.push(hit.c.high, hit.c.low, hit.c.open, hit.c.close);
      const v = opts.get();
      for (const k of ["rangeHigh", "rangeLow"]) if (k !== skip && v[k] != null) near.push(+v[k]);
      if (v.rangeHigh != null && v.rangeLow != null) near.push((+v.rangeHigh + +v.rangeLow) / 2);
      let best = raw, bestD = 10; // max 10 pixels
      for (const q of near) {
        const y = series.priceToCoordinate(q);
        if (y === null) continue;
        const d = Math.abs(y - p.y);
        if (d < bestD) {
          bestD = d;
          best = q;
        }
      }
      return round(best);
    }
    function lineNear(y) {
      if (!series) return null;
      const v = opts.get();
      let best = null, bestD = 6;
      for (const k of DRAGGABLE) {
        if (v[k] === null || v[k] === undefined || v[k] === "" || isNaN(+v[k])) continue;
        const ly = series.priceToCoordinate(+v[k]);
        if (ly === null) continue;
        const d = Math.abs(ly - y);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      return best;
    }

    // ---------- wijzigen (met ongedaan maken) ----------
    function apply(patch, remember = true) {
      if (remember) {
        const v = opts.get();
        const before = {};
        for (const k of Object.keys(patch)) before[k] = v[k] ?? "";
        undo.push(before);
        if (undo.length > 50) undo.shift();
      }
      opts.set(patch);
    }
    function undoLast() {
      const p = undo.pop();
      if (p) opts.set(p);
    }

    // ---------- gereedschap ----------
    function setTool(t) {
      tool = tool === t ? null : t;
      rangeStart = null;
      if (series) series.setMarkers([]);
      paintToolbar();
      el.style.cursor = tool ? "crosshair" : "";
      opts.hint(
        tool === "range"
          ? "Klik op de candle waar de push (of dump) begint."
          : tool
          ? `Klik in de grafiek op de prijs voor ${TOOLS[tool].label}.`
          : "Tip: sleep een lijn omhoog of omlaag om hem te verplaatsen."
      );
    }
    function paintToolbar() {
      toolbar.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("active", b.dataset.tool === tool));
      const m = toolbar.querySelector("[data-act=magnet]");
      if (m) m.classList.toggle("active", magnet);
    }

    function clickTool(p) {
      if (tool === "range") {
        const hit = candleAt(p.x);
        if (!hit) return;
        if (!rangeStart) {
          rangeStart = hit;
          series.setMarkers([{ time: hit.c.time, position: "belowBar", color: "#8b919c", shape: "circle", text: "Begin" }]);
          opts.hint("Klik nu op de candle waar de push (of dump) eindigt.");
          return;
        }
        const a = Math.min(rangeStart.i, hit.i), b = Math.max(rangeStart.i, hit.i);
        let hi = -Infinity, lo = Infinity;
        for (let i = a; i <= b; i++) {
          hi = Math.max(hi, candles[i].high);
          lo = Math.min(lo, candles[i].low);
        }
        series.setMarkers([
          { time: candles[a].time, position: "belowBar", color: "#8b919c", shape: "circle", text: "Begin" },
          { time: candles[b].time, position: "aboveBar", color: "#8b919c", shape: "circle", text: "Einde" },
        ]);
        apply({ rangeHigh: round(hi), rangeLow: round(lo), rangeFrom: candles[a].time, rangeTo: candles[b].time });
        tool = null;
        rangeStart = null;
        paintToolbar();
        el.style.cursor = "";
        opts.hint("Range staat. Zet nu je entry en stop, of klik op ‘TP1 = mid, TP2 = andere kant’.");
        return;
      }
      const price = priceAt(p);
      if (price === null) return;
      const patch = { [tool]: price };
      // Richting volgt uit de stop ten opzichte van de entry.
      const v = opts.get();
      const entry = tool === "entry" ? price : v.entry != null && v.entry !== "" ? +v.entry : null;
      const sl = tool === "stopLoss" ? price : v.stopLoss != null && v.stopLoss !== "" ? +v.stopLoss : null;
      if (entry !== null && sl !== null && entry !== sl) patch.direction = sl < entry ? "Long" : "Short";
      apply(patch);
      const next = { entry: "stopLoss", stopLoss: "tp1", tp1: "tp2" }[tool];
      // Handig: na entry meteen de stop, enz. (zolang dat veld nog leeg is).
      if (next && (v[next] === null || v[next] === undefined || v[next] === "")) setTool(next);
      else setTool(null);
    }

    // ---------- muis ----------
    function onDown(e) {
      if (!series || e.button !== 0) return;
      const p = rel(e);
      if (tool) {
        e.preventDefault();
        e.stopPropagation();
        clickTool(p);
        return;
      }
      const k = lineNear(p.y);
      if (!k) return;
      e.preventDefault();
      e.stopPropagation();
      const v = opts.get();
      drag = { key: k, before: { [k]: v[k] } };
      chart.applyOptions({ handleScroll: false, handleScale: false });
      opts.hint(`${NAMES[k]} verslepen…`);
    }
    function onMove(e) {
      if (!series) return;
      const p = rel(e);
      if (drag) {
        const price = priceAt(p, drag.key);
        if (price !== null) opts.set({ [drag.key]: price });
        return;
      }
      if (!tool) el.style.cursor = lineNear(p.y) ? "ns-resize" : "";
    }
    function onUp() {
      if (!drag) return;
      undo.push(drag.before);
      const v = opts.get();
      // Richting bijwerken als de stop of entry over elkaar heen is gesleept.
      if ((drag.key === "stopLoss" || drag.key === "entry") && v.entry !== "" && v.stopLoss !== "" && +v.entry !== +v.stopLoss)
        opts.set({ direction: +v.stopLoss < +v.entry ? "Long" : "Short" });
      drag = null;
      if (chart) chart.applyOptions({ handleScroll: true, handleScale: true });
      opts.hint("Tip: sleep een lijn omhoog of omlaag om hem te verplaatsen.");
    }
    el.addEventListener("mousedown", onDown, true);
    el.addEventListener("mousemove", onMove);
    const onWinMove = (e) => drag && onMove(e);
    window.addEventListener("mousemove", onWinMove);
    window.addEventListener("mouseup", onUp);

    // ---------- sneltoetsen ----------
    function onKey(e) {
      if (!document.body.contains(el) || !series) return;
      const tag = (e.target && e.target.tagName) || "";
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoLast();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") return setTool(null);
      const t = Object.keys(TOOLS).find((k) => TOOLS[k].key === e.key.toLowerCase());
      if (t) {
        e.preventDefault();
        setTool(t);
      }
    }
    document.addEventListener("keydown", onKey);

    // ---------- werkbalk ----------
    toolbar.innerHTML = `
      ${Object.entries(TOOLS)
        .map(([k, t]) => `<button type="button" class="btn small" data-tool="${k}" title="${t.label} (toets ${t.key.toUpperCase()})">${k === "range" ? "▭ " : ""}${t.label}</button>`)
        .join("")}
      <span class="sep"></span>
      <button type="button" class="btn small" data-act="sl-suggest" title="Stop voorbij de lont van de deviatie, met de stop-buffer uit Instellingen">Stop-voorstel</button>
      <button type="button" class="btn small active" data-act="magnet" title="Klik springt naar high, low, open of close van de candle">🧲 Magneet</button>
      <button type="button" class="btn small" data-act="undo" title="Ongedaan maken (Cmd+Z)">↶ Ongedaan</button>
      <button type="button" class="btn small" data-act="clear">✕ Alles wissen</button>`;
    toolbar.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
    toolbar.querySelector("[data-act=magnet]").addEventListener("click", () => {
      magnet = !magnet;
      paintToolbar();
    });
    toolbar.querySelector("[data-act=undo]").addEventListener("click", undoLast);
    toolbar.querySelector("[data-act=clear]").addEventListener("click", () => {
      apply({ rangeHigh: "", rangeLow: "", entry: "", stopLoss: "", tp1: "", tp2: "", tp3: "", rangeFrom: "", rangeTo: "" });
      if (series) series.setMarkers([]);
    });
    toolbar.querySelector("[data-act=sl-suggest]").addEventListener("click", () => {
      const s = suggestStop();
      if (s === null) return opts.hint("Voor een stop-voorstel heb je een range en een entry nodig.");
      apply({ stopLoss: s.price, direction: s.direction });
      opts.hint(s.why);
    });

    // Stop-voorstel volgens de methode: net voorbij de laagste lont (long) of hoogste lont (short)
    // rond de rand van de range sinds het einde van de push, plus de stop-buffer (Instellingen → Trading).
    function suggestStop() {
      const v = opts.get();
      if (v.rangeHigh === "" || v.rangeLow === "" || v.entry === "" || v.rangeHigh == null || v.entry == null) return null;
      const H = +v.rangeHigh, L = +v.rangeLow, E = +v.entry, h = H - L;
      if (!(h > 0)) return null;
      const long = Math.abs(E - L) <= Math.abs(H - E);
      const from = v.rangeTo ? candles.filter((c) => c.time > +v.rangeTo) : candles.slice(-60);
      const recent = from.length ? from : candles.slice(-60);
      const ext = long ? Math.min(L, ...recent.map((c) => c.low)) : Math.max(H, ...recent.map((c) => c.high));
      const buf = +((TD.store && TD.store.getSettings().stopBuffer) ?? 0.2);
      const price = round(long ? ext - buf * h : ext + buf * h);
      return {
        price,
        direction: long ? "Long" : "Short",
        why: `Stop net ${long ? "onder" : "boven"} de ${ext === (long ? L : H) ? (long ? "range low" : "range high") : "lont van de deviatie"} (${round(ext)}), met ${Math.round(buf * 100)}% van de range als ademruimte (Instellingen → Trading).`,
      };
    }

    return {
      bind(c, s, data) {
        chart = c;
        series = s;
        candles = data;
        rangeStart = null;
        paintToolbar();
        const v = opts.get();
        // Getekende range markeren (begin en einde van de push).
        if (v.rangeFrom && v.rangeTo) {
          const a = candleOf(data, +v.rangeFrom), b = candleOf(data, +v.rangeTo);
          if (a && b)
            s.setMarkers([
              { time: a.time, position: "belowBar", color: "#8b919c", shape: "circle", text: "Begin" },
              { time: b.time, position: "aboveBar", color: "#8b919c", shape: "circle", text: "Einde" },
            ]);
        }
      },
      destroy() {
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("mousemove", onWinMove);
      },
      suggestStop,
    };
  }

  TD.chartDraw = { create, TOOLS, candleOf };
})(window.TD);
