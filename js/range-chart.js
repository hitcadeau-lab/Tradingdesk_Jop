// Range-grafiek met TradingView Lightweight Charts™: candles + range high / mid / range low,
// en markeringen voor het begin en einde van de push, de deviatie, de reclaim, de breakout en de retest.
(function (TD) {
  const COL = { up: "#26a69a", down: "#ef5350", rh: "#ef5350", mid: "#f5a623", rl: "#26a69a", entry: "#2962ff", sl: "#ef5350", text: "#8b919c", grid: "#1f232c", bg: "#0f1115" };

  function available() {
    return typeof window.LightweightCharts !== "undefined";
  }

  // Teken in `el`. range/signal komen uit TD.rangeEngine. Geeft een functie terug om op te ruimen.
  function mount(el, candles, range, signal, { height = 460 } = {}) {
    el.innerHTML = "";
    if (!available()) {
      el.innerHTML = `<p class="muted pad">De grafiekbibliotheek kon niet laden.</p>`;
      return () => {};
    }
    const LC = window.LightweightCharts;
    const chart = LC.createChart(el, {
      height,
      autoSize: true,
      layout: { background: { color: COL.bg }, textColor: COL.text, fontFamily: "inherit" },
      grid: { vertLines: { color: COL.grid }, horzLines: { color: COL.grid } },
      rightPriceScale: { borderColor: "#262a33" },
      timeScale: { borderColor: "#262a33", timeVisible: true, secondsVisible: false },
      crosshair: { mode: LC.CrosshairMode.Normal },
      localization: { locale: "nl-NL" },
    });
    const series = chart.addCandlestickSeries({ upColor: COL.up, downColor: COL.down, wickUpColor: COL.up, wickDownColor: COL.down, borderVisible: false });
    series.setData(candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));

    if (range) {
      const from = range.startTime;
      const to = candles[candles.length - 1].time;
      // De range als "box": lijnen vanaf het begin van de push tot nu.
      const level = (price, color, title, style) => {
        const s = chart.addLineSeries({ color, lineWidth: 2, lineStyle: style, priceLineVisible: false, lastValueVisible: true, title, crosshairMarkerVisible: false });
        s.setData([{ time: from, value: price }, { time: to, value: price }]);
      };
      level(range.high, COL.rh, "Range high", LC.LineStyle.Dashed);
      level(range.mid, COL.mid, "Mid", LC.LineStyle.Dashed);
      level(range.low, COL.rl, "Range low", LC.LineStyle.Dashed);

      const markers = [
        { time: range.startTime, position: range.kind === "push" ? "belowBar" : "aboveBar", color: COL.text, shape: "circle", text: `Begin ${range.kind === "push" ? "push" : "dump"}` },
        { time: range.endTime, position: range.kind === "push" ? "aboveBar" : "belowBar", color: COL.text, shape: "circle", text: `Einde ${range.kind === "push" ? "push" : "dump"}` },
      ];
      if (signal) {
        const long = signal.direction === "Long";
        if (signal.deviationTime) markers.push({ time: signal.deviationTime, position: long ? "belowBar" : "aboveBar", color: COL.mid, shape: long ? "arrowUp" : "arrowDown", text: "Deviatie" });
        if (signal.reclaimTime) markers.push({ time: signal.reclaimTime, position: long ? "belowBar" : "aboveBar", color: COL.entry, shape: long ? "arrowUp" : "arrowDown", text: "Reclaim" });
        if (signal.breakoutTime) markers.push({ time: signal.breakoutTime, position: long ? "aboveBar" : "belowBar", color: COL.mid, shape: long ? "arrowUp" : "arrowDown", text: "Breakout" });
        if (signal.acceptTime && signal.acceptTime !== signal.breakoutTime) markers.push({ time: signal.acceptTime, position: long ? "aboveBar" : "belowBar", color: COL.text, shape: "circle", text: "Acceptatie" });
        if (signal.retestTime) markers.push({ time: signal.retestTime, position: long ? "belowBar" : "aboveBar", color: COL.up, shape: long ? "arrowUp" : "arrowDown", text: "Retest" });
        // Bij een breakout liggen de targets buiten de range: teken ze als lijn.
        if (signal.setup === "Breakout") {
          series.createPriceLine({ price: signal.tp1, color: COL.mid, lineWidth: 1, lineStyle: LC.LineStyle.Dotted, axisLabelVisible: true, title: "TP1" });
          series.createPriceLine({ price: signal.tp2, color: COL.up, lineWidth: 1, lineStyle: LC.LineStyle.Dotted, axisLabelVisible: true, title: "TP2 (nieuwe range)" });
        }
        series.createPriceLine({ price: signal.stopLoss, color: COL.sl, lineWidth: 1, lineStyle: LC.LineStyle.Solid, axisLabelVisible: true, title: "SL" });
        series.createPriceLine({ price: signal.entry, color: COL.entry, lineWidth: 1, lineStyle: LC.LineStyle.Solid, axisLabelVisible: true, title: "Entry" });
      }
      markers.sort((a, b) => a.time - b.time);
      series.setMarkers(markers.filter((m, i, a) => !i || m.time !== a[i - 1].time || m.text !== a[i - 1].text));
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }

  // Ophalen + analyseren + tekenen in één keer. Geeft { range, signal, candles } terug.
  async function render(el, symbol, tf, opts = {}) {
    el.innerHTML = `<p class="muted pad">Koersdata laden…</p>`;
    const candles = await TD.marketData.candles(symbol, tf, opts.limit || 300);
    const a = opts.analysis || TD.rangeEngine.analyze(candles);
    let { range, signal } = a;
    // Geen geldige range meer, wel een breakout? Toon dan de oude range met de breakout.
    if (!opts.analysis && !range && a.breakout) ({ range, signal } = a.breakout);
    const cleanup = mount(el, candles, range, signal, opts);
    return { candles, range, signal, breakout: a.breakout || null, cleanup };
  }

  TD.rangeChart = { mount, render, available };
})(window.TD);
