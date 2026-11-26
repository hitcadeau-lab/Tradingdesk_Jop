// SVG-grafieken: candlestick-oefengrafieken voor de Leerschool en de equity curve.
window.TD = window.TD || {};

(function (TD) {
  // Deterministische random generator, zodat een opdracht met dezelfde seed er hetzelfde uitziet.
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Bouw candles langs een pad van waypoints: [{price, bars}, ...].
  // Elke stap beweegt de koers geleidelijk naar de volgende waypoint, met ruis en wieken.
  function candlesFromPath(rand, startPrice, path, opts = {}) {
    const vol = opts.vol ?? 0.006; // relatieve ruis per candle
    const out = [];
    let price = startPrice;
    for (const wp of path) {
      const from = price;
      for (let i = 1; i <= wp.bars; i++) {
        const target = from + ((wp.price - from) * i) / wp.bars;
        const noise = (rand() - 0.5) * 2 * vol * startPrice;
        const open = price;
        let close = i === wp.bars && wp.exact ? wp.price : target + noise;
        const body = Math.abs(close - open);
        const wick = () => rand() * (body * 0.6 + vol * startPrice * 0.8);
        let high = Math.max(open, close) + wick();
        let low = Math.min(open, close) - wick();
        if (wp.wickTo !== undefined && i === wp.bars) {
          if (wp.wickTo > high) high = wp.wickTo;
          if (wp.wickTo < low) low = wp.wickTo;
        }
        if (wp.clampHigh !== undefined) {
          high = Math.min(high, wp.clampHigh);
          close = Math.min(close, wp.clampHigh);
        }
        if (wp.clampLow !== undefined) {
          low = Math.max(low, wp.clampLow);
          close = Math.max(close, wp.clampLow);
        }
        high = Math.max(high, open, close);
        low = Math.min(low, open, close);
        out.push({ o: open, h: high, l: low, c: close });
        price = close;
      }
    }
    return out;
  }

  // Een range: de koers tikt een aantal keer de high en de low aan.
  function rangePath(rand, low, high, touches) {
    const path = [];
    const h = high - low;
    for (let i = 0; i < touches; i++) {
      const top = i % 2 === 0;
      path.push({
        price: top ? high - h * (0.03 + rand() * 0.06) : low + h * (0.03 + rand() * 0.06),
        bars: 4 + Math.floor(rand() * 4),
        wickTo: top ? high : low,
        clampHigh: high,
        clampLow: low,
      });
    }
    return path;
  }

  // Teken candles + horizontale lijnen + markers (A/B/C) als SVG-string.
  // lines: [{price, label, color, dash}], markers: [{i, price, label, color}], zones: [{from, to, color}]
  function candleSVG(candles, { lines = [], markers = [], zones = [], segments = [], width = 720, height = 340, note } = {}) {
    const padL = 10, padR = 96, padT = 16, padB = 22;
    let min = Infinity, max = -Infinity;
    for (const c of candles) {
      min = Math.min(min, c.l);
      max = Math.max(max, c.h);
    }
    for (const l of lines) {
      min = Math.min(min, l.price);
      max = Math.max(max, l.price);
    }
    for (const m of markers) {
      min = Math.min(min, m.price);
      max = Math.max(max, m.price);
    }
    const m = (max - min) * 0.08 || 1;
    min -= m;
    max += m;
    const w = width - padL - padR;
    const h = height - padT - padB;
    const step = w / candles.length;
    const x = (i) => padL + step * i + step / 2;
    const y = (p) => padT + ((max - p) / (max - min)) * h;
    const cw = Math.max(2, step * 0.62);

    let s = `<svg class="cchart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Oefengrafiek">`;
    s += `<rect x="0" y="0" width="${width}" height="${height}" class="cc-bg"/>`;
    // rasterlijnen
    for (let g = 1; g < 5; g++) {
      const gy = padT + (h * g) / 5;
      s += `<line x1="${padL}" x2="${width - padR}" y1="${gy}" y2="${gy}" class="cc-grid"/>`;
    }
    for (const z of zones) {
      const y1 = y(Math.max(z.from, z.to)), y2 = y(Math.min(z.from, z.to));
      s += `<rect x="${padL}" y="${y1}" width="${w}" height="${y2 - y1}" fill="${z.color}" opacity="0.12"/>`;
    }
    candles.forEach((c, i) => {
      const up = c.c >= c.o;
      const cls = up ? "cc-up" : "cc-down";
      const bt = y(Math.max(c.o, c.c));
      const bb = y(Math.min(c.o, c.c));
      s += `<line x1="${x(i)}" x2="${x(i)}" y1="${y(c.h)}" y2="${y(c.l)}" class="${cls}-w"/>`;
      s += `<rect x="${x(i) - cw / 2}" y="${bt}" width="${cw}" height="${Math.max(1, bb - bt)}" class="${cls}"/>`;
    });
    // Labels uit elkaar duwen als lijnen dicht bij elkaar liggen (min. 22px).
    const placed = lines.map((l) => ({ l, ly: y(l.price), labelY: y(l.price) })).sort((a, b) => a.ly - b.ly);
    for (let k = 1; k < placed.length; k++) {
      if (placed[k].labelY - placed[k - 1].labelY < 22) placed[k].labelY = placed[k - 1].labelY + 22;
    }
    const overflow = placed.length ? placed[placed.length - 1].labelY - (height - 12) : 0;
    if (overflow > 0) {
      placed[placed.length - 1].labelY -= overflow;
      for (let k = placed.length - 2; k >= 0; k--) {
        if (placed[k + 1].labelY - placed[k].labelY < 22) placed[k].labelY = placed[k + 1].labelY - 22;
      }
    }
    for (const { l, ly, labelY } of placed) {
      const col = l.color || "#8b919c";
      s += `<line x1="${padL}" x2="${width - padR + 4}" y1="${ly}" y2="${ly}" stroke="${col}" stroke-width="1.5" ${l.dash === false ? "" : 'stroke-dasharray="6 4"'}/>`;
      if (l.label) {
        if (Math.abs(labelY - ly) > 1) s += `<line x1="${width - padR + 4}" x2="${width - padR + 6}" y1="${ly}" y2="${labelY}" stroke="${col}" stroke-width="1.5"/>`;
        s += `<rect x="${width - padR + 6}" y="${labelY - 10}" width="${padR - 10}" height="20" rx="4" fill="${col}"/>`;
        s += `<text x="${width - padR + 6 + (padR - 10) / 2}" y="${labelY + 4}" text-anchor="middle" class="cc-label">${TD.util.esc(l.label)}</text>`;
      }
    }
    // Schuine lijnen (trendlijnen): [{i1, p1, i2, p2, color}]
    for (const sg of segments) {
      s += `<line x1="${x(sg.i1)}" y1="${y(sg.p1)}" x2="${x(sg.i2)}" y2="${y(sg.p2)}" stroke="${sg.color || "#82a8ff"}" stroke-width="2"/>`;
    }
    for (const mk of markers) {
      const mx = x(Math.min(mk.i, candles.length - 1));
      const my = y(mk.price);
      const col = mk.color || "#f5a623";
      s += `<circle cx="${mx}" cy="${my}" r="11" fill="${col}" stroke="#0f1115" stroke-width="2"/>`;
      s += `<text x="${mx}" y="${my + 4}" text-anchor="middle" class="cc-mk">${TD.util.esc(mk.label)}</text>`;
    }
    if (note) s += `<text x="${padL + 6}" y="${height - 6}" class="cc-note">${TD.util.esc(note)}</text>`;
    s += `</svg>`;
    return s;
  }

  // Equity curve als SVG-lijngrafiek. points: [{n, balance, label, id}]
  function equitySVG(points, start, { width = 760, height = 260 } = {}) {
    if (points.length < 2) {
      return `<div class="empty-chart">Nog geen gesloten trades. Je equity curve verschijnt hier zodra je een trade afsluit.</div>`;
    }
    const padL = 64, padR = 16, padT = 16, padB = 28;
    const vals = points.map((p) => p.balance);
    let min = Math.min(...vals, start), max = Math.max(...vals, start);
    const m = (max - min) * 0.1 || Math.max(1, start * 0.02);
    min -= m;
    max += m;
    const w = width - padL - padR, h = height - padT - padB;
    const x = (i) => padL + (w * i) / (points.length - 1);
    const y = (v) => padT + ((max - v) / (max - min)) * h;
    let s = `<svg class="eqchart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Equity curve">`;
    for (let g = 0; g <= 4; g++) {
      const v = min + ((max - min) * g) / 4;
      const gy = y(v);
      s += `<line x1="${padL}" x2="${width - padR}" y1="${gy}" y2="${gy}" class="cc-grid"/>`;
      s += `<text x="${padL - 8}" y="${gy + 4}" text-anchor="end" class="eq-axis">${TD.util.esc(TD.util.money(v))}</text>`;
    }
    s += `<line x1="${padL}" x2="${width - padR}" y1="${y(start)}" y2="${y(start)}" class="eq-start"/>`;
    const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
    const last = points[points.length - 1].balance;
    const col = last >= start ? "var(--pos)" : "var(--neg)";
    s += `<path d="${d} L${x(points.length - 1)},${y(min)} L${x(0)},${y(min)} Z" fill="${col}" opacity="0.08"/>`;
    s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2"/>`;
    points.forEach((p, i) => {
      if (!p.id) return;
      s += `<a href="#/trades/${encodeURIComponent(p.id)}"><circle cx="${x(i)}" cy="${y(p.balance)}" r="4.5" fill="${col}" class="eq-dot"><title>${TD.util.esc(p.label)} — ${TD.util.esc(TD.util.money(p.balance))}</title></circle></a>`;
    });
    s += `<text x="${padL}" y="${height - 8}" class="eq-axis">Trade 0</text>`;
    s += `<text x="${width - padR}" y="${height - 8}" text-anchor="end" class="eq-axis">Trade ${points.length - 1}</text>`;
    s += `</svg>`;
    return s;
  }

  // RSI-paneel onder een candleSVG (zelfde breedte en candle-posities), met 70/30-lijnen.
  // segments: [{ i1, v1, i2, v2, color }] om twee toppen of bodems te verbinden.
  function rsiSVG(values, { segments = [], width = 720, height = 130, mark } = {}) {
    const padL = 10, padR = 96, padT = 10, padB = 16;
    const w = width - padL - padR, h = height - padT - padB;
    const step = w / values.length;
    const x = (i) => padL + step * i + step / 2;
    const y = (v) => padT + ((100 - v) / 100) * h;
    let s = `<svg class="cchart rsi-pane" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="RSI">`;
    s += `<rect x="0" y="0" width="${width}" height="${height}" class="cc-bg"/>`;
    s += `<rect x="${padL}" y="${y(70)}" width="${w}" height="${y(30) - y(70)}" fill="#7e57c2" opacity="0.08"/>`;
    for (const lv of [70, 50, 30]) {
      s += `<line x1="${padL}" x2="${width - padR}" y1="${y(lv)}" y2="${y(lv)}" class="cc-grid" ${lv === 50 ? "" : 'stroke-dasharray="4 4"'}/>`;
      s += `<text x="${width - padR - 4}" y="${y(lv) - 3}" text-anchor="end" class="cc-note">${lv}</text>`;
    }
    s += `<polyline fill="none" stroke="#b39ddb" stroke-width="2" points="${values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>`;
    for (const sg of segments) s += `<line x1="${x(sg.i1)}" y1="${y(sg.v1)}" x2="${x(sg.i2)}" y2="${y(sg.v2)}" stroke="${sg.color || "#82a8ff"}" stroke-width="2"/>`;
    s += `<text x="${padL + 6}" y="${padT + 12}" class="cc-note">RSI (14)</text>`;
    if (mark !== undefined && values.length) {
      // Laatste waarde als label rechts, zoals op TradingView.
      const ly = y(values[values.length - 1]);
      s += `<circle cx="${x(values.length - 1)}" cy="${ly}" r="3.5" fill="#b39ddb"/>`;
      s += `<rect x="${width - padR + 6}" y="${ly - 10}" width="${padR - 10}" height="20" rx="4" fill="#7e57c2"/>`;
      s += `<text x="${width - padR + 6 + (padR - 10) / 2}" y="${ly + 4}" text-anchor="middle" class="cc-label">RSI ${Math.round(mark)}</text>`;
    }
    return s + "</svg>";
  }

  // Dezelfde schaal als candleSVG (zonder lijnen/markers), om klikken om te rekenen naar candle en prijs.
  function candleGeom(candles, { width = 720, height = 340 } = {}) {
    const padL = 10, padR = 96, padT = 16, padB = 22;
    let min = Infinity, max = -Infinity;
    for (const c of candles) {
      min = Math.min(min, c.l);
      max = Math.max(max, c.h);
    }
    const m = (max - min) * 0.08 || 1;
    min -= m;
    max += m;
    const w = width - padL - padR, h = height - padT - padB;
    const step = w / candles.length;
    return {
      width, height, padL, padR, padT, padB, min, max, n: candles.length,
      x: (i) => padL + step * i + step / 2,
      y: (p) => padT + ((max - p) / (max - min)) * h,
      i: (x) => (x - padL - step / 2) / step,
      p: (y) => max - ((y - padT) / h) * (max - min),
      right: width - padR,
    };
  }

  TD.charts = { rng, candlesFromPath, rangePath, candleSVG, candleGeom, rsiSVG, equitySVG };
})(window.TD);
