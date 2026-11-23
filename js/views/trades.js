// Trades: overzicht, nieuwe trade / bewerken (met de Trade Entry Checklist uit de PDF)
// en de detailpagina van één trade.
(function (TD) {
  const { esc, money, pct, num, r, date, shortSym, signClass, nowLocal, compressImage } = TD.util;
  const S = TD.store;

  function statusBadge(t) {
    if (t.status === "open") return `<span class="badge open">Open</span>`;
    if (t.outcome === "Cancelled") return `<span class="badge muted">Cancelled</span>`;
    const cls = t.outcome === "Stop Loss" ? "neg" : "pos";
    return `<span class="badge ${cls}">${esc(t.outcome || "Gesloten")}</span>`;
  }

  function scoreBadge(t) {
    const sc = S.checklistScore(t);
    const cls = sc.passed === sc.total ? "pos" : sc.passed >= sc.total - 2 ? "warn" : "neg";
    return `<span class="badge ${cls}" title="Groene checks">${sc.passed}/${sc.total}</span>`;
  }

  // ---------------- Overzicht ----------------
  function renderList(root, params, query) {
    const p = S.computePortfolio();
    const all = S.getTrades();
    const f = {
      status: query.get("status") || "",
      ticker: query.get("ticker") || "",
      setup: query.get("setup") || "",
    };
    const tickers = [...new Set(all.map((t) => t.ticker))].sort();
    const list = all
      .filter((t) => !f.status || t.status === f.status)
      .filter((t) => !f.ticker || t.ticker === f.ticker)
      .filter((t) => !f.setup || t.setup === f.setup)
      .sort((a, b) => (b.entryDate || "").localeCompare(a.entryDate || ""));

    const sel = (name, label, opts) =>
      `<label class="inline">${label}<select data-filter="${name}"><option value="">Alle</option>${opts
        .map((o) => `<option value="${esc(o.v ?? o)}" ${f[name] === (o.v ?? o) ? "selected" : ""}>${esc(o.l ?? o)}</option>`)
        .join("")}</select></label>`;

    root.innerHTML = `
      <div class="page-head">
        <h1>Trades</h1>
        <a class="btn primary" href="#/trades/new">+ Nieuwe trade</a>
      </div>
      <div class="filters">
        ${sel("status", "Status", [{ v: "open", l: "Open" }, { v: "closed", l: "Gesloten" }])}
        ${sel("ticker", "Ticker", tickers)}
        ${sel("setup", "Setup", S.OPTIONS.setup)}
        <span class="muted">${list.length} trade${list.length === 1 ? "" : "s"}</span>
      </div>
      <div class="panel">
      ${
        list.length
          ? `<table class="table clickable"><thead><tr>
            <th>Datum</th><th>Ticker</th><th>Richting</th><th>Setup</th><th>Type</th><th>Checks</th>
            <th>Status</th><th class="num">R/R plan</th><th class="num">R</th><th class="num">PnL</th></tr></thead><tbody>
            ${list
              .map((t) => {
                const row = p.rows.get(t.id);
                return `<tr data-href="#/trades/${t.id}">
                  <td>${date(t.entryDate)}</td><td><strong>${esc(shortSym(t.ticker))}</strong></td>
                  <td><span class="dir ${t.direction === "Long" ? "pos" : "neg"}">${esc(t.direction)}</span></td>
                  <td>${esc(t.setup)}</td><td>${esc(t.tradeType)}</td><td>${scoreBadge(t)}</td>
                  <td>${statusBadge(t)}</td><td class="num">${r(S.totalRR(t))}</td>
                  <td class="num">${row ? r(row.r) : "—"}</td>
                  <td class="num ${signClass(+t.pnl)}">${t.status === "closed" ? money(+t.pnl) : "—"}</td></tr>`;
              })
              .join("")}
            </tbody></table>`
          : `<div class="empty">Nog geen trades${f.status || f.ticker || f.setup ? " met deze filters" : ""}. <a href="#/trades/new">Plaats je eerste trade</a>.</div>`
      }
      </div>`;

    root.querySelectorAll("[data-filter]").forEach((s) =>
      s.addEventListener("change", () => {
        const q = new URLSearchParams();
        root.querySelectorAll("[data-filter]").forEach((x) => x.value && q.set(x.dataset.filter, x.value));
        location.hash = "#/trades" + (q.toString() ? "?" + q : "");
      })
    );
  }

  // ---------------- Formulier ----------------
  function renderForm(root, params, query) {
    const editing = params.id ? S.getTrade(params.id) : null;
    if (params.id && !editing) return notFound(root);
    const wl = S.getWatchlist();
    const t = editing
      ? JSON.parse(JSON.stringify(editing))
      : {
          ticker: query.get("ticker") || "",
          direction: query.get("direction") || "Long",
          tradeType: "Day trade",
          setup: query.get("setup") || "Reversal",
          // Vooraf ingevuld vanuit een Notifier-melding:
          rangeTf: query.get("rangeTf") || "",
          trigger: query.get("trigger") || "",
          ...Object.fromEntries(
            ["rangeHigh", "rangeLow", "entry", "stopLoss", "tp1", "tp2"].filter((k) => query.get(k) !== null).map((k) => [k, +query.get(k)])
          ),
          entryDate: nowLocal(),
          riskPct: S.getSettings().defaultRisk,
          status: "open",
          checklist: {},
        };
    if (!t.checklist) t.checklist = {};
    const focusClose = query.get("close") === "1";
    if (focusClose && t.status === "open") {
      t.status = "closed";
      t.exitDate = t.exitDate || nowLocal();
    }

    const opt = (list, val) =>
      list.map((o) => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("");

    const checklistHTML = S.CHECKLIST.map((item, i) => {
      const a = t.checklist[item.key] || {};
      const control =
        item.type === "multi"
          ? `<div class="multi">${item.options
              .map(
                (o) =>
                  `<label class="chk"><input type="checkbox" data-cl="${item.key}" value="${esc(o)}" ${
                    (a.values || []).includes(o) ? "checked" : ""
                  }> ${esc(o)}</label>`
              )
              .join("")}</div>`
          : `<select data-cl="${item.key}"><option value="">— kies —</option>${opt(item.options, a.value)}</select>`;
      return `<div class="cl-item" data-item="${item.key}">
          <div class="cl-status" aria-hidden="true"></div>
          <div class="cl-body">
            <div class="cl-q">${i + 1}. ${esc(item.q)} ${item.hint ? `<span class="muted">(${esc(item.hint)})</span>` : ""}</div>
            <div class="cl-ctrl">${control}
              <input type="text" class="cl-note" data-note="${item.key}" placeholder="Toelichting (optioneel)" value="${esc(a.note || "")}">
            </div>
          </div>
        </div>`;
    }).join("");

    root.innerHTML = `
      <div class="page-head">
        <h1>${editing ? "Trade bewerken" : "Nieuwe trade"}</h1>
        <a class="btn" href="${editing ? "#/trades/" + editing.id : "#/trades"}">Annuleren</a>
      </div>
      <form id="trade-form" class="trade-form" autocomplete="off">
        <section class="panel">
          <h2>Trade Entry Checklist <span id="cl-score" class="badge"></span></h2>
          <p class="muted small">Groen = check in orde, rood = let op. Alle 8 groen? Dan is het een A+ trade volgens je eigen regels.</p>
          <div class="checklist">${checklistHTML}</div>
        </section>

        <section class="panel">
          <h2>Trade</h2>
          <div class="grid g4">
            <label>Pair / ticker
              <input name="ticker" list="tick-options" required value="${esc(t.ticker)}" placeholder="BINANCE:BTCUSDT">
              <datalist id="tick-options">${wl.map((w) => `<option value="${esc(w.symbol)}">`).join("")}</datalist>
            </label>
            <label>Richting<select name="direction">${opt(S.OPTIONS.direction, t.direction)}</select></label>
            <label>Trade type<select name="tradeType">${opt(S.OPTIONS.tradeType, t.tradeType)}</select></label>
            <label>Setup / range<select name="setup">${opt(S.OPTIONS.setup, t.setup)}</select></label>
            <label>Entry datum<input type="datetime-local" name="entryDate" value="${esc(t.entryDate || "")}" required></label>
            <label>Risico % van saldo<input type="number" step="0.01" min="0" name="riskPct" value="${esc(t.riskPct ?? "")}"></label>
          </div>
        </section>

        <section class="panel">
          <h2>Range <span class="muted small">— het frame van je trade</span></h2>
          <div class="grid g4">
            <label>Range timeframe (leading)<select name="rangeTf"><option value="">— kies —</option>${opt(S.OPTIONS.rangeTf, t.rangeTf)}</select></label>
            <label>Range high<input type="number" step="any" name="rangeHigh" value="${esc(t.rangeHigh ?? "")}" placeholder="einde van de push"></label>
            <label>Range low<input type="number" step="any" name="rangeLow" value="${esc(t.rangeLow ?? "")}" placeholder="begin van de push"></label>
            <label>Mid range (50%)<input type="text" id="mid-out" readonly tabindex="-1" placeholder="automatisch"></label>
            <label>Trigger<select name="trigger"><option value="">— kies —</option>${opt(S.OPTIONS.trigger, t.trigger)}</select></label>
            <label class="span3">Range-notities<input type="text" name="rangeNotes" value="${esc(t.rangeNotes || "")}" placeholder="bijv. 80/20 verdeling, veel deviaties boven, grote SFP onder de low"></label>
          </div>
          <div class="row gap" style="margin-top:10px">
            <button type="button" class="btn small" id="fill-tps">TP1 = mid, TP2 = andere kant van de range</button>
            <span class="muted small" id="range-warn"></span>
          </div>
        </section>

        <section class="panel">
          <h2>Trade Details</h2>
          <div class="details-grid">
            <div class="grid g2">
              <label>Entry<input type="number" step="any" name="entry" value="${esc(t.entry ?? "")}" required></label>
              <label>Stoploss<input type="number" step="any" name="stopLoss" value="${esc(t.stopLoss ?? "")}" required></label>
              <label>TP 1<input type="number" step="any" name="tp1" value="${esc(t.tp1 ?? "")}"></label>
              <label>TP 2<input type="number" step="any" name="tp2" value="${esc(t.tp2 ?? "")}"></label>
              <label>TP 3<input type="number" step="any" name="tp3" value="${esc(t.tp3 ?? "")}"></label>
              <div class="calc" id="calc"></div>
            </div>
            <div class="drawing">
              <div class="label">Trade drawing</div>
              <div id="drawing-drop" class="drop" tabindex="0">
                ${t.drawing ? `<img src="${t.drawing}" alt="Trade drawing">` : `<span>Sleep een screenshot hierheen, plak met Cmd+V, of klik om te kiezen</span>`}
              </div>
              <input type="file" id="drawing-file" accept="image/*" hidden>
              <div class="row gap">
                <button type="button" class="btn small" id="drawing-clear" ${t.drawing ? "" : "hidden"}>Afbeelding verwijderen</button>
              </div>
              <label>Chart — Range (link)<input type="url" name="chartRange" value="${esc(t.chartRange || "")}" placeholder="https://www.tradingview.com/x/..."></label>
              <label>Chart — Trigger (link)<input type="url" name="chartTrigger" value="${esc(t.chartTrigger || "")}" placeholder="https://www.tradingview.com/x/..."></label>
            </div>
          </div>
        </section>

        <section class="panel">
          <h2>Status & resultaat</h2>
          <div class="grid g4">
            <label>Status
              <select name="status">
                <option value="open" ${t.status === "open" ? "selected" : ""}>Open</option>
                <option value="closed" ${t.status === "closed" ? "selected" : ""}>Gesloten</option>
              </select>
            </label>
          </div>
          <div id="close-fields" class="grid g4" ${t.status === "closed" ? "" : "hidden"}>
            <label>Exit datum<input type="datetime-local" name="exitDate" value="${esc(t.exitDate || "")}"></label>
            <label>Uitkomst<select name="outcome"><option value="">— kies —</option>${opt(S.OPTIONS.outcome, t.outcome)}</select></label>
            <label>PnL (${esc(S.getSettings().currency)})
              <span class="row gap"><input type="number" step="any" name="pnl" value="${esc(t.pnl ?? "")}">
              <button type="button" class="btn small" id="use-suggest" title="Bereken PnL uit uitkomst en R">Voorstel</button></span>
              <span class="muted small" id="pnl-suggest"></span>
            </label>
            <label>Plan gevolgd?<select name="followedPlan"><option value="">— kies —</option>${opt(S.OPTIONS.followedPlan, t.followedPlan)}</select></label>
            <label class="span4">Les / key takeaway<textarea name="lesson" rows="3">${esc(t.lesson || "")}</textarea></label>
          </div>
        </section>

        <div class="form-actions">
          <button type="submit" class="btn primary">${editing ? "Opslaan" : "Trade plaatsen"}</button>
          <a class="btn" href="${editing ? "#/trades/" + editing.id : "#/trades"}">Annuleren</a>
        </div>
      </form>`;

    const form = root.querySelector("#trade-form");
    let drawing = t.drawing || null;

    // ----- checklist live status -----
    function readChecklist() {
      const cl = {};
      for (const item of S.CHECKLIST) {
        const note = form.querySelector(`[data-note="${item.key}"]`).value.trim();
        if (item.type === "multi") {
          const values = [...form.querySelectorAll(`[data-cl="${item.key}"]:checked`)].map((x) => x.value);
          cl[item.key] = { values, note };
        } else {
          cl[item.key] = { value: form.querySelector(`[data-cl="${item.key}"]`).value, note };
        }
      }
      return cl;
    }
    function paintChecklist() {
      const cl = readChecklist();
      let passed = 0;
      for (const item of S.CHECKLIST) {
        const a = cl[item.key];
        const has = a.value || (a.values && a.values.length);
        const ok = S.checkPassed(item, a);
        if (ok) passed++;
        const el = form.querySelector(`[data-item="${item.key}"]`);
        el.classList.toggle("ok", ok);
        el.classList.toggle("bad", !!has && !ok);
      }
      const b = root.querySelector("#cl-score");
      b.textContent = `${passed}/${S.CHECKLIST.length}`;
      b.className = "badge " + (passed === S.CHECKLIST.length ? "pos" : passed >= S.CHECKLIST.length - 2 ? "warn" : "neg");
      return passed;
    }

    // ----- berekeningen -----
    function readTrade() {
      const fd = new FormData(form);
      const o = { ...t };
      for (const [k, v] of fd.entries()) o[k] = typeof v === "string" ? v.trim() : v;
      for (const k of ["entry", "stopLoss", "tp1", "tp2", "tp3", "riskPct", "pnl", "rangeHigh", "rangeLow"]) o[k] = o[k] === "" || o[k] === undefined ? null : +o[k];
      o.ticker = (o.ticker || "").toUpperCase().replace(/\s+/g, "");
      const w = wl.find((x) => x.symbol === o.ticker);
      o.market = w ? w.market : o.market || (/USDT?$|BTC$|PERP/.test(o.ticker) ? "crypto" : "stock");
      o.checklist = readChecklist();
      o.drawing = drawing;
      if (o.status !== "closed") {
        o.exitDate = "";
        o.outcome = "";
        o.pnl = null;
        o.followedPlan = "";
      }
      return o;
    }

    function paintCalc() {
      const o = readTrade();
      const p = S.computePortfolio();
      const risk = S.riskAmount(o, p);
      const size = S.positionSize(o, p);
      const tg = S.targets(o);
      const e = S.num(o.entry), sl = S.num(o.stopLoss);
      let warn = "";
      if (e !== null && sl !== null) {
        if (o.direction === "Long" && sl >= e) warn = "Bij een long moet de stoploss ónder de entry liggen.";
        if (o.direction === "Short" && sl <= e) warn = "Bij een short moet de stoploss bóven de entry liggen.";
      }
      root.querySelector("#calc").innerHTML = `
        ${tg.map((x) => `<div><span>${x.label}</span><strong class="${signClass(x.r)}">${r(x.r)}</strong></div>`).join("")}
        <div class="total"><span>Total R/R</span><strong>${r(S.totalRR(o))}</strong></div>
        <div><span>Risico</span><strong>${money(risk)}</strong></div>
        <div><span>Positiegrootte</span><strong>${size === null ? "—" : num(size, 4)} ${esc(shortSym(o.ticker).replace(/USDT?$/, "") || "")}</strong></div>
        <div><span>Tijd in trade</span><strong>${S.timeInTrade(o) || "—"}</strong></div>
        ${warn ? `<p class="error">${warn}</p>` : ""}`;
      // Range: mid automatisch, en waarschuwen als de range niet klopt.
      const mid = S.rangeMid(o);
      root.querySelector("#mid-out").value = mid === null ? "" : num(mid, 8);
      let rw = "";
      if (o.rangeHigh !== null && o.rangeLow !== null && o.rangeHigh <= o.rangeLow) rw = "Range high moet boven de range low liggen.";
      else if (mid !== null && e !== null) {
        const pos = (e - o.rangeLow) / (o.rangeHigh - o.rangeLow);
        if (pos > 0.35 && pos < 0.65) rw = "Let op: je entry ligt rond de mid. Daar heb je geen edge, triggers zoek je bij de randen.";
      }
      root.querySelector("#range-warn").textContent = rw;
      const sug = S.suggestedPnl(o, risk);
      root.querySelector("#pnl-suggest").textContent =
        o.status === "closed" && sug !== null ? `Voorstel: ${money(sug)} (50% op TP1, rest op BE/TP2)` : "";
      return sug;
    }

    form.addEventListener("input", () => {
      paintChecklist();
      paintCalc();
    });
    form.addEventListener("change", (e) => {
      if (e.target.name === "status") {
        const closed = e.target.value === "closed";
        root.querySelector("#close-fields").hidden = !closed;
        if (closed && !form.exitDate.value) form.exitDate.value = nowLocal();
      }
      paintChecklist();
      paintCalc();
    });
    root.querySelector("#fill-tps").addEventListener("click", () => {
      const o = readTrade();
      const mid = S.rangeMid(o);
      if (mid === null || o.rangeHigh <= o.rangeLow) return alert("Vul eerst een geldige range high en range low in.");
      form.tp1.value = +mid.toPrecision(10);
      form.tp2.value = o.direction === "Long" ? o.rangeHigh : o.rangeLow;
      paintCalc();
    });
    root.querySelector("#use-suggest").addEventListener("click", () => {
      const sug = paintCalc();
      if (sug === null) {
        alert("Kies eerst een uitkomst en vul entry, stoploss en TP's in.");
        return;
      }
      form.pnl.value = Math.round(sug * 100) / 100;
      paintCalc();
    });

    // ----- trade drawing (upload / slepen / plakken) -----
    const drop = root.querySelector("#drawing-drop");
    const file = root.querySelector("#drawing-file");
    const clear = root.querySelector("#drawing-clear");
    async function setImage(f) {
      if (!f || !f.type.startsWith("image/")) return;
      drawing = await compressImage(f);
      drop.innerHTML = `<img src="${drawing}" alt="Trade drawing">`;
      clear.hidden = false;
    }
    drop.addEventListener("click", () => file.click());
    drop.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && file.click());
    file.addEventListener("change", () => setImage(file.files[0]));
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      setImage(e.dataTransfer.files[0]);
    });
    root.addEventListener("paste", (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
      if (item) {
        e.preventDefault();
        setImage(item.getAsFile());
      }
    });
    clear.addEventListener("click", () => {
      drawing = null;
      drop.innerHTML = `<span>Sleep een screenshot hierheen, plak met Cmd+V, of klik om te kiezen</span>`;
      clear.hidden = true;
    });

    // ----- opslaan -----
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const o = readTrade();
      const passed = paintChecklist();
      if (passed < S.CHECKLIST.length && !editing) {
        if (!confirm(`Niet alle checks zijn groen (${passed}/${S.CHECKLIST.length}).\nWeet je zeker dat je deze trade wilt plaatsen?`)) return;
      }
      if (o.status === "closed") {
        if (!o.outcome) return alert("Kies een uitkomst om de trade te sluiten.");
        if (o.pnl === null && o.outcome !== "Cancelled") return alert("Vul de PnL in (of klik op Voorstel).");
        if (o.outcome === "Cancelled" && o.pnl === null) o.pnl = 0;
      }
      if (!wl.some((w) => w.symbol === o.ticker)) {
        wl.push({ symbol: o.ticker, market: o.market });
        S.setWatchlist(wl);
      }
      const saved = S.saveTrade(o);
      if (saved) location.hash = "#/trades/" + saved.id;
    });

    paintChecklist();
    paintCalc();
    if (focusClose) root.querySelector("#close-fields").scrollIntoView({ behavior: "smooth" });
  }

  // ---------------- Detail ----------------
  function renderDetail(root, params) {
    const t = S.getTrade(params.id);
    if (!t) return notFound(root);
    const p = S.computePortfolio();
    const row = p.rows.get(t.id);
    const sc = S.checklistScore(t);
    const risk = S.riskAmount(t, p);

    const cl = S.CHECKLIST.map((item, i) => {
      const a = (t.checklist || {})[item.key] || {};
      const ok = S.checkPassed(item, a);
      const ans = item.type === "multi" ? (a.values || []).join(", ") : a.value;
      return `<li class="${ok ? "ok" : ans ? "bad" : "none"}">
          <span class="mark">${ok ? "✓" : ans ? "✗" : "–"}</span>
          <div><div class="cl-q">${i + 1}. ${esc(item.q)}</div>
          <div class="cl-a">${ans ? esc(ans) : '<span class="muted">Niet ingevuld</span>'}${
            item.type === "multi" && ans
              ? ` <span class="muted">(${item.options.filter((o) => !(a.values || []).includes(o)).map(esc).join(", ") || "alles gezet"}${
                  item.options.every((o) => (a.values || []).includes(o)) ? "" : " ontbreekt"
                })</span>`
              : ""
          }${a.note ? `<div class="muted small">“${esc(a.note)}”</div>` : ""}</div></div></li>`;
    }).join("");

    const tg = S.targets(t);

    root.innerHTML = `
      <div class="page-head">
        <div>
          <a class="back" href="#/trades">← Alle trades</a>
          <h1>${esc(shortSym(t.ticker))} <span class="dir ${t.direction === "Long" ? "pos" : "neg"}">${esc(t.direction)}</span> ${statusBadge(t)}</h1>
          <div class="muted">${esc(t.setup)} · ${esc(t.tradeType)} · <a href="#/markt/${encodeURIComponent(t.ticker)}">${esc(t.ticker)} in Markt</a></div>
        </div>
        <div class="row gap">
          ${t.status === "open" ? `<a class="btn primary" href="#/trades/${t.id}/edit?close=1">Trade sluiten</a>` : ""}
          <a class="btn" href="#/trades/${t.id}/edit">Bewerken</a>
          <button class="btn danger" id="del">Verwijderen</button>
        </div>
      </div>

      <div class="kpis small">
        <div class="kpi"><span>PnL</span><strong class="${signClass(+t.pnl)}">${t.status === "closed" ? money(+t.pnl) : "—"}</strong></div>
        <div class="kpi"><span>R multiple</span><strong class="${signClass(row?.r)}">${row ? r(row.r) : "—"}</strong></div>
        <div class="kpi"><span>Return</span><strong class="${signClass(row?.returnPct)}">${row ? pct(row.returnPct, 2) : "—"}</strong></div>
        <div class="kpi"><span>Saldo na trade</span><strong>${row ? money(row.endBalance) : "—"}</strong></div>
        <div class="kpi"><span>Checks</span><strong>${scoreBadge(t)}</strong></div>
      </div>

      <div class="detail-grid">
        <section class="panel">
          <h2>Trade Entry Checklist <span class="badge ${sc.passed === sc.total ? "pos" : "warn"}">${sc.passed}/${sc.total} groen</span></h2>
          <ul class="cl-view">${cl}</ul>
        </section>

        <section class="panel">
          <h2>Trade</h2>
          <dl class="dl">
            <dt>Pair</dt><dd>${esc(t.ticker)}</dd>
            <dt>Trade type</dt><dd>${esc(t.tradeType)}</dd>
            <dt>Entry datum</dt><dd>${date(t.entryDate, true)}</dd>
            <dt>Exit datum</dt><dd>${date(t.exitDate, true)}</dd>
            <dt>Totale tijd in trade</dt><dd>${S.timeInTrade(t) || "—"}</dd>
            <dt>Risico</dt><dd>${num(t.riskPct)}% · ${money(risk)}</dd>
          </dl>
          <h2>Range</h2>
          <dl class="dl">
            <dt>Timeframe</dt><dd>${esc(t.rangeTf || "—")}</dd>
            <dt>Range high</dt><dd>${num(t.rangeHigh, 8)}</dd>
            <dt>Mid</dt><dd>${num(S.rangeMid(t), 8)}</dd>
            <dt>Range low</dt><dd>${num(t.rangeLow, 8)}</dd>
            <dt>Trigger</dt><dd>${esc(t.trigger || "—")}</dd>
            ${t.rangeNotes ? `<dt>Notities</dt><dd class="wrap">${esc(t.rangeNotes)}</dd>` : ""}
          </dl>
          <h2>Trade Details</h2>
          <dl class="dl">
            <dt>Entry</dt><dd>${num(t.entry, 8)}</dd>
            <dt>Stoploss</dt><dd>${num(t.stopLoss, 8)}</dd>
            ${tg.map((x) => `<dt>${x.label}</dt><dd>${num(x.price, 8)} <span class="muted">(${r(x.r)})</span></dd>`).join("")}
            <dt><strong>Total R/R</strong></dt><dd><strong>${r(S.totalRR(t))}</strong></dd>
            <dt>Positiegrootte</dt><dd>${num(S.positionSize(t, p), 4)}</dd>
          </dl>
        </section>

        <section class="panel span2">
          <h2>Trade drawing</h2>
          ${t.drawing ? `<a href="${t.drawing}" target="_blank" rel="noopener"><img class="drawing-img" src="${t.drawing}" alt="Trade drawing"></a>` : `<p class="muted">Geen afbeelding toegevoegd.</p>`}
          <div class="row gap">
            ${t.chartRange ? `<a class="btn small" href="${esc(t.chartRange)}" target="_blank" rel="noopener">Chart — Range ↗</a>` : ""}
            ${t.chartTrigger ? `<a class="btn small" href="${esc(t.chartTrigger)}" target="_blank" rel="noopener">Chart — Trigger ↗</a>` : ""}
          </div>
        </section>

        ${
          t.status === "closed"
            ? `<section class="panel span2">
          <h2>Resultaat</h2>
          <dl class="dl">
            <dt>Uitkomst</dt><dd>${esc(t.outcome)}</dd>
            <dt>Plan gevolgd?</dt><dd>${esc(t.followedPlan || "—")}</dd>
            <dt>Saldo voor → na</dt><dd>${row ? money(row.startBalance) + " → " + money(row.endBalance) : "—"}</dd>
          </dl>
          <h3>Les / key takeaway</h3>
          <p class="lesson">${t.lesson ? esc(t.lesson).replace(/\n/g, "<br>") : '<span class="muted">Geen les ingevuld.</span>'}</p>
        </section>`
            : ""
        }
      </div>`;

    root.querySelector("#del").addEventListener("click", () => {
      if (confirm("Deze trade definitief verwijderen?")) {
        S.deleteTrade(t.id);
        location.hash = "#/trades";
      }
    });
  }

  function notFound(root) {
    root.innerHTML = `<div class="panel empty">Deze trade bestaat niet (meer). <a href="#/trades">Terug naar trades</a></div>`;
  }

  TD.views = TD.views || {};
  TD.views.trades = { renderList, renderForm, renderDetail, statusBadge, scoreBadge };
})(window.TD);
