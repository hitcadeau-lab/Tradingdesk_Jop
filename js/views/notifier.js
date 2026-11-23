// Notifier: meldingen van range-trading setups, de pairs en timeframes die je volgt,
// het scan-overzicht en per melding de range in de grafiek.
(function (TD) {
  const { esc, num, shortSym, date } = TD.util;
  const S = TD.store;
  const N = TD.notifier;
  const M = TD.marketData;
  const TFS = ["15m", "1h", "4h"];
  let cleanup = null;
  let unsub = null;

  function teardown() {
    if (cleanup) cleanup();
    cleanup = null;
    if (unsub) unsub();
    unsub = null;
  }

  const statusBadge = (st) =>
    ({
      trigger: '<span class="badge pos">Trigger</span>',
      reclaim: '<span class="badge warn">Reclaim · wacht op retest</span>',
      expired: '<span class="badge muted">Verlopen</span>',
      invalid: '<span class="badge muted">Vervallen</span>',
      untradeable: '<span class="badge neg">Niet tradeable</span>',
    })[st] || esc(st);

  const time = (ms) => (ms ? new Date(ms).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "—");

  // ---------------- overzicht ----------------
  function renderMain(root) {
    teardown();
    const cfg = N.getConfig();
    const signals = N.getSignals();
    const st = N.status();
    const wl = S.getWatchlist();
    const followed = new Map(cfg.pairs.map((p) => [p.symbol, p]));
    const symbols = [...new Set([...wl.map((w) => w.symbol), ...cfg.pairs.map((p) => p.symbol)])];
    const perm = typeof Notification === "undefined" ? "unsupported" : Notification.permission;

    const rows = signals.length
      ? `<table class="table clickable"><thead><tr><th>Tijd</th><th>Melding</th><th>Status</th><th class="num">Entry</th><th class="num">SL</th><th class="num">TP1 (mid)</th><th class="num">R:R</th></tr></thead><tbody>
        ${signals
          .map(
            (s) => `<tr data-href="#/notifier/${encodeURIComponent(s.id)}" class="${!s.seen && ["reclaim", "trigger"].includes(s.status) ? "unseen" : ""}">
            <td>${date(s.detectedAt, true)}</td>
            <td><strong>${esc(N.title(s))}</strong></td>
            <td>${statusBadge(s.status)}</td>
            <td class="num">${num(s.entry, 6)}</td><td class="num">${num(s.stopLoss, 6)}</td><td class="num">${num(s.tp1, 6)}</td>
            <td class="num">${s.rr1.toFixed(1)}</td></tr>`
          )
          .join("")}</tbody></table>`
      : `<div class="empty">Nog geen meldingen. Zodra er bij een gevolgd pair een deviatie + reclaim te zien is, verschijnt hij hier${cfg.desktop ? " en krijg je een melding op je Mac" : ""}.</div>`;

    const pairRows = symbols
      .map((sym) => {
        const p = followed.get(sym);
        const src = M.source(sym);
        const noData = src && src.type === "yahoo" && !M.stocksAvailable();
        return `<tr>
          <td><strong>${esc(shortSym(sym))}</strong> <span class="muted small">${esc(sym)}</span></td>
          <td class="muted small">${src ? esc(src.label) : "—"}${noData ? ` · <span class="warn-text">${S.desktop ? "nieuwste .dmg nodig" : "alleen in de Mac-app"}</span>` : ""}</td>
          ${TFS.map((tf) => `<td class="center"><input type="checkbox" data-pair="${esc(sym)}" data-tf="${tf}" ${p && p.tfs.includes(tf) ? "checked" : ""} aria-label="${esc(sym)} ${M.TF[tf].label}"></td>`).join("")}
        </tr>`;
      })
      .join("");

    const scanRows = cfg.pairs
      .flatMap((p) => p.tfs.map((tf) => ({ p, tf, r: N.results().get(`${p.symbol}|${tf}`) })))
      .map(({ p, tf, r }) => {
        let txt = '<span class="muted">Nog niet gescand</span>';
        if (r && r.error) txt = `<span class="neg">${esc(r.error)}</span>`;
        else if (r && !r.range) txt = '<span class="muted">Geen geldige range (trend of uitbraak)</span>';
        else if (r && r.range) {
          const d = r.range.distribution;
          txt = `Range ${num(r.range.low, 6)} – ${num(r.range.high, 6)} · mid ${num(r.range.mid, 6)} · verdeling ${Math.round(d.lower * 100)}/${Math.round(d.upper * 100)} · ${r.signal ? statusBadge(r.signal.status) : '<span class="muted">geen setup</span>'}`;
        }
        return `<tr data-href="#/notifier/range?symbol=${encodeURIComponent(p.symbol)}&tf=${tf}"><td><strong>${esc(shortSym(p.symbol))}</strong></td><td>${M.TF[tf].label}</td><td class="wrap">${txt}</td></tr>`;
      })
      .join("");

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Notifier</h1>
          <div class="muted small">${
            cfg.enabled
              ? st.scanning
                ? "Bezig met scannen…"
                : `Laatste scan ${time(st.lastScanAt)} · volgende ${st.nextScanAt ? time(st.nextScanAt) : "—"} · elke ${cfg.interval} min`
              : "Notifier staat uit"
          }</div>
        </div>
        <div class="row gap">
          ${signals.some((s) => !s.seen) ? '<button class="btn small" id="n-seen">Alles gelezen</button>' : ""}
          <button class="btn primary" id="n-scan" ${st.scanning ? "disabled" : ""}>${st.scanning ? "Scannen…" : "Nu scannen"}</button>
        </div>
      </div>

      <section class="panel">
        <h2>Meldingen</h2>
        ${rows}
      </section>

      <div class="two-col">
        <section class="panel">
          <h2>Pairs & timeframes</h2>
          <p class="muted small">Vink aan voor welke pairs en timeframes je een melding wilt. In de video’s werkt Camille vooral met de 4H- en 1H-range, en soms 15m.</p>
          <table class="table"><thead><tr><th>Pair</th><th>Data</th>${TFS.map((tf) => `<th class="center">${M.TF[tf].label}</th>`).join("")}</tr></thead><tbody>${pairRows}</tbody></table>
          <form id="n-add" class="add-form" autocomplete="off" style="margin-top:10px">
            <input id="n-add-input" placeholder="Pair toevoegen, bijv. BINANCE:XRPUSDT" aria-label="Pair toevoegen">
            <button class="btn small primary" type="submit">Toevoegen</button>
          </form>
          <p class="muted small">Toegevoegde pairs komen ook in je watchlist onder Markt.</p>
        </section>

        <section class="panel">
          <h2>Instellingen</h2>
          <label class="chk"><input type="checkbox" id="n-enabled" ${cfg.enabled ? "checked" : ""}> Notifier aan</label>
          <label class="inline">Scan elke
            <select id="n-interval">${[1, 5, 15, 30, 60].map((m) => `<option value="${m}" ${+cfg.interval === m ? "selected" : ""}>${m} min</option>`).join("")}</select>
          </label>
          <label class="chk"><input type="checkbox" id="n-desktop" ${cfg.desktop ? "checked" : ""} ${perm === "unsupported" ? "disabled" : ""}> Meldingen op mijn ${S.desktop ? "Mac" : "computer"}</label>
          <p class="muted small" id="n-perm">${
            perm === "denied"
              ? "Meldingen zijn geblokkeerd. Zet ze aan in Systeeminstellingen → Berichtgeving → Tradingdesk."
              : perm === "unsupported"
              ? "Meldingen worden hier niet ondersteund."
              : cfg.desktop && perm === "granted"
              ? "Je krijgt een melding zodra er een nieuwe setup is."
              : ""
          }</p>
          <button class="btn small" id="n-test">Testmelding sturen</button>
          <h3>Hoe werkt het?</h3>
          <ol class="steps small">
            <li>Range: begin tot einde van de laatste push of dump, mid op 50%. De koers moet daarna in de range blijven en terugkomen.</li>
            <li>Setup: een candle sluit buiten de range (deviatie) en daarna weer binnen (reclaim). <strong>Reclaim</strong> = wacht op retest, <strong>Trigger</strong> = retest houdt.</li>
            <li>Geen melding bij een te diepe deviatie (stop te ver van TP1), een R:R onder 1, of als de koers al bij de mid is.</li>
            <li>Gescand wordt zolang de app open is (mag geminimaliseerd).</li>
          </ol>
          <p class="muted small">Dit is een hulpmiddel, geen advies: controleer de range, de mid en je checklist altijd zelf.</p>
        </section>
      </div>

      <section class="panel">
        <h2>Scan-overzicht <span class="muted small">— klik om de range in de grafiek te zien</span></h2>
        ${cfg.pairs.length ? `<table class="table clickable"><thead><tr><th>Pair</th><th>TF</th><th>Resultaat</th></tr></thead><tbody>${scanRows}</tbody></table>` : '<p class="muted">Kies hierboven minstens één pair en timeframe.</p>'}
      </section>`;

    // events
    root.querySelector("#n-scan").addEventListener("click", () => N.scan());
    const seen = root.querySelector("#n-seen");
    if (seen) seen.addEventListener("click", () => N.markSeen());
    root.querySelectorAll("[data-pair]").forEach((cb) =>
      cb.addEventListener("change", () => {
        const pairs = new Map(N.getConfig().pairs.map((p) => [p.symbol, { ...p, tfs: [...p.tfs] }]));
        const sym = cb.dataset.pair;
        const p = pairs.get(sym) || { symbol: sym, tfs: [] };
        p.tfs = cb.checked ? [...new Set([...p.tfs, cb.dataset.tf])] : p.tfs.filter((t) => t !== cb.dataset.tf);
        p.tfs.sort((a, b) => TFS.indexOf(a) - TFS.indexOf(b));
        if (p.tfs.length) pairs.set(sym, p);
        else pairs.delete(sym);
        N.setConfig({ pairs: [...pairs.values()] });
      })
    );
    root.querySelector("#n-add").addEventListener("submit", (e) => {
      e.preventDefault();
      const sym = root.querySelector("#n-add-input").value.trim().toUpperCase().replace(/\s+/g, "");
      if (!sym) return;
      const src = M.source(sym);
      if (!src) return alert("Onbekend pair. Gebruik bijv. BINANCE:BTCUSDT of NASDAQ:AAPL.");
      const wl2 = S.getWatchlist();
      if (!wl2.some((w) => w.symbol === sym)) S.setWatchlist([...wl2, { symbol: sym, market: src.type === "binance" ? "crypto" : "stock" }]);
      const pairs = N.getConfig().pairs.filter((p) => p.symbol !== sym);
      N.setConfig({ pairs: [...pairs, { symbol: sym, tfs: ["1h", "4h"] }] });
      N.scan();
    });
    root.querySelector("#n-enabled").addEventListener("change", (e) => {
      N.setConfig({ enabled: e.target.checked });
      if (e.target.checked) N.scan();
    });
    root.querySelector("#n-interval").addEventListener("change", (e) => N.setConfig({ interval: +e.target.value }));
    root.querySelector("#n-desktop").addEventListener("change", async (e) => {
      if (e.target.checked) {
        const p = await N.requestPermission();
        if (p !== "granted") {
          e.target.checked = false;
          root.querySelector("#n-perm").textContent =
            p === "denied" ? "Meldingen zijn geblokkeerd. Zet ze aan in Systeeminstellingen → Berichtgeving." : "Geen toestemming voor meldingen gekregen.";
          return;
        }
      }
      N.setConfig({ desktop: e.target.checked });
    });
    root.querySelector("#n-test").addEventListener("click", async () => {
      const p = await N.requestPermission();
      if (p !== "granted") return alert("Sta eerst meldingen toe (vink ‘Meldingen op mijn Mac’ aan).");
      new Notification("BTCUSDT – Long – 4H", { body: "Testmelding: zo ziet een melding van de Notifier eruit." });
    });

    unsub = N.onChange(() => {
      if (location.hash.startsWith("#/notifier") && !/^#\/notifier\/./.test(location.hash)) renderMain(root);
    });
  }

  // ---------------- detail: melding of range ----------------
  async function renderDetail(root, sig, symbol, tf) {
    teardown();
    if (sig) N.markSeen(sig.id);
    const sym = sig ? sig.symbol : symbol;
    const frame = sig ? sig.tf : tf;
    const head = sig ? N.title(sig) : `${shortSym(sym)} – range – ${N.tfLabel(frame)}`;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <a class="back" href="#/notifier">← Notifier</a>
          <h1>${esc(head)} ${sig ? statusBadge(sig.status) : ""}</h1>
          <div class="muted">${sig ? esc(N.describe(sig)) : "Automatisch gevonden range op basis van de laatste push of dump."}</div>
        </div>
        <div class="row gap" id="d-actions"></div>
      </div>
      <div class="detail-grid">
        <section class="panel span2"><div id="d-chart" class="range-chart"></div>
          <p class="muted small">Grafiek: TradingView Lightweight Charts™, koersdata van ${esc((M.source(sym) || {}).label || "—")}. Stippellijnen = range high, mid en range low, vanaf het begin van de push.</p>
        </section>
        <section class="panel" id="d-levels"></section>
        <section class="panel" id="d-range"></section>
        <section class="panel span2" id="d-history"></section>
      </div>`;

    let res;
    try {
      res = await TD.rangeChart.render(root.querySelector("#d-chart"), sym, frame, sig ? { analysis: { range: sig.range, signal: sig } } : {});
      cleanup = res.cleanup;
    } catch (e) {
      root.querySelector("#d-chart").innerHTML = `<p class="neg pad">${esc(e.message)}</p>`;
      return;
    }
    const range = res.range;
    const signal = res.signal;
    const lv = (label, v, extra = "") => `<dt>${label}</dt><dd>${v === null || v === undefined ? "—" : num(v, 8)}${extra}</dd>`;

    root.querySelector("#d-levels").innerHTML = signal
      ? `<h2>Setup</h2><dl class="dl">
          <dt>Richting</dt><dd><span class="dir ${signal.direction === "Long" ? "pos" : "neg"}">${esc(signal.direction)}</span></dd>
          ${lv("Entry", signal.entry, signal.retestTime ? " <span class='muted'>(slot na retest)</span>" : " <span class='muted'>(limit op de retest)</span>")}
          ${lv("Stoploss", signal.stopLoss, " <span class='muted'>(voorbij de deviatie)</span>")}
          ${lv("TP1 (mid)", signal.tp1, ` <span class='muted'>(${signal.rr1.toFixed(2)}R)</span>`)}
          ${lv("TP2", signal.tp2, ` <span class='muted'>(${signal.rr2.toFixed(2)}R)</span>`)}
          ${signal.depth != null ? `<dt>Deviatie-diepte</dt><dd>${Math.round(signal.depth * 100)}% van de range</dd>` : ""}
        </dl>`
      : `<h2>Setup</h2><p class="muted">${range ? "Op dit moment geen deviatie + reclaim bij deze range." : "Geen geldige range gevonden: de markt trendt of is uitgebroken."}</p>`;

    root.querySelector("#d-range").innerHTML = range
      ? `<h2>Range</h2><dl class="dl">
          ${lv("Range high", range.high)}${lv("Mid", range.mid)}${lv("Range low", range.low)}
          <dt>Getekend vanaf</dt><dd>${range.kind === "push" ? "push omhoog" : "dump omlaag"}, ${date(range.startTime * 1000, true)}</dd>
          <dt>Verdeling</dt><dd>${Math.round(range.distribution.lower * 100)}% onder / ${Math.round(range.distribution.upper * 100)}% boven de mid</dd>
        </dl>`
      : "";

    const actions = root.querySelector("#d-actions");
    const E = TD.rangeEngine;

    // Advies maken en doorsturen naar Advise.
    async function makeAdvice(btn, base, opts) {
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Advies maken…";
      try {
        const item = await TD.advise.fromSignal(base, { candles: res.candles, ...opts });
        location.hash = "#/advise/" + encodeURIComponent(item.id);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = label;
        alert("Advies maken mislukt: " + err.message);
      }
    }

    if (range) {
      const tradeQ = (g) =>
        new URLSearchParams({
          ticker: sym, direction: g.direction, setup: "Reclaim", trigger: "Deviatie + reclaim + retest", rangeTf: N.tfLabel(frame),
          rangeHigh: +range.high.toPrecision(10), rangeLow: +range.low.toPrecision(10), entry: +g.entry.toPrecision(10),
          stopLoss: +g.stopLoss.toPrecision(10), tp1: +g.tp1.toPrecision(10), tp2: +g.tp2.toPrecision(10),
        });
      // "Get advise": voor de huidige setup, of een plan (Long bij range low / Short bij range high).
      actions.innerHTML = `
        <div class="menu-wrap">
          <button class="btn primary" id="d-advise" aria-haspopup="true">Get advise ▾</button>
          <div class="menu" id="d-menu" hidden>
            ${signal ? `<button data-adv="current">Huidige setup: ${esc(signal.direction)} <span class="muted">(${esc(signal.status === "trigger" ? "trigger" : signal.status === "reclaim" ? "reclaim" : signal.status)})</span></button>` : ""}
            <button data-adv="Long">Plan: Long bij de range low</button>
            <button data-adv="Short">Plan: Short bij de range high</button>
          </div>
        </div>
        ${signal ? `<a class="btn" href="#/trades/new?${tradeQ(signal)}">Trade plaatsen</a>` : ""}`;
      const menu = actions.querySelector("#d-menu");
      const btn = actions.querySelector("#d-advise");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.hidden = !menu.hidden;
      });
      document.addEventListener("click", () => (menu.hidden = true), { once: true });
      menu.querySelectorAll("[data-adv]").forEach((b) =>
        b.addEventListener("click", () => {
          menu.hidden = true;
          const kind = b.dataset.adv;
          if (kind === "current") return makeAdvice(btn, sig || { symbol: sym, tf: frame, ...signal, range, id: null });
          const plan = E.planSetup(range, kind);
          makeAdvice(btn, { symbol: sym, tf: frame, ...plan, range, id: null });
        })
      );

      // Historische setups in deze data, met wat er daarna gebeurde.
      const hist = E.findHistory(res.candles);
      const box = root.querySelector("#d-history");
      const outTxt = { sl: '<span class="badge neg">SL geraakt</span>', tp1: '<span class="badge pos">TP1 + BE</span>', tp2: '<span class="badge pos">TP2 geraakt</span>', open: '<span class="badge muted">Nog open</span>' };
      box.innerHTML = `<h2>Historische setups <span class="muted small">— zoals de Notifier ze destijds had gezien</span></h2>
        ${
          hist.length
            ? `<table class="table"><thead><tr><th>Moment</th><th>Richting</th><th>Status toen</th><th class="num">Entry</th><th class="num">SL</th><th class="num">TP1</th><th class="num">R:R</th><th>Daarna</th><th></th></tr></thead><tbody>
              ${hist
                .map(
                  (h, i) => `<tr>
                  <td>${date(h.atTime * 1000, true)}</td>
                  <td><span class="dir ${h.signal.direction === "Long" ? "pos" : "neg"}">${esc(h.signal.direction)}</span></td>
                  <td>${statusBadge(h.signal.status)}</td>
                  <td class="num">${num(h.signal.entry, 6)}</td><td class="num">${num(h.signal.stopLoss, 6)}</td><td class="num">${num(h.signal.tp1, 6)}</td>
                  <td class="num">${h.signal.rr1.toFixed(1)}</td>
                  <td>${outTxt[h.outcome.result]}</td>
                  <td><button class="btn small" data-hist="${i}">Get advise</button></td></tr>`
                )
                .join("")}</tbody></table>
              <p class="muted small">${hist.filter((h) => h.outcome.result === "tp1" || h.outcome.result === "tp2").length} van ${hist.filter((h) => h.outcome.result !== "open").length} afgeronde setups haalden TP1 vóór de stop. Het advies van een historische setup kijkt alleen naar de candles van vóór dat moment.</p>`
            : `<p class="muted">In de geladen periode (laatste 300 candles) zijn geen deviatie + reclaim-setups gevonden.</p>`
        }`;
      box.querySelectorAll("[data-hist]").forEach((b) =>
        b.addEventListener("click", () => {
          const h = hist[+b.dataset.hist];
          makeAdvice(b, { symbol: sym, tf: frame, ...h.signal, range: h.range, id: null }, { asOf: h.atTime });
        })
      );
    }
    actions.insertAdjacentHTML("beforeend", `<a class="btn" href="#/markt/${encodeURIComponent(sym)}">Open in Markt</a>`);
  }

  function render(root, params, query) {
    if (params.id === "range") return renderDetail(root, null, query.get("symbol"), query.get("tf") || "4h");
    if (params.id) {
      const sig = N.getSignal(params.id);
      if (!sig) {
        teardown();
        root.innerHTML = `<div class="panel empty">Deze melding bestaat niet meer. <a href="#/notifier">Terug naar de Notifier</a></div>`;
        return;
      }
      return renderDetail(root, sig);
    }
    return renderMain(root);
  }

  TD.views = TD.views || {};
  TD.views.notifier = { render, teardown };
})(window.TD);
