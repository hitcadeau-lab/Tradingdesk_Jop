// Portfolio: Performance Dashboard + Equity Curve + Breakdown by Pair + Journal
// (zelfde opbouw als het TradingWizard Journal in Excel). Elke trade is klikbaar.
(function (TD) {
  const { esc, money, pct, num, r, date, shortSym, signClass, download } = TD.util;
  const S = TD.store;

  // Echt Kraken-saldo naast je journal (alleen als je account gekoppeld is, in de Mac-app).
  async function paintKraken(root, p) {
    const KA = TD.krakenAccount;
    const box = root.querySelector("#kr-portfolio");
    if (!box || !KA || !KA.available()) return;
    try {
      const st = await KA.status();
      if (!st.connected) return;
      const d = await KA.summary();
      if (!d.hasFlex || !root.contains(box)) return;
      const usd = (v) => (+v || 0).toLocaleString("nl-NL", { style: "currency", currency: "USD" });
      const diff = d.balance - p.balance;
      const target = KA.alignedStart(d.balance);
      box.innerHTML = `<section class="panel kr-strip">
        <div class="kpis small">
          <div class="kpi"><span>Saldo Kraken (echt)</span><strong>${usd(d.balance)}</strong><em>equity ${usd(d.equity)} · bijgewerkt ${esc(TD.util.stamp(d.at))}</em></div>
          <div class="kpi"><span>Verschil met journal</span><strong class="${Math.abs(diff) < 0.01 ? "" : signClass(diff)}">${Math.abs(diff) < 0.01 ? "gelijk" : usd(diff)}</strong><em>journal ${money(p.balance)}</em></div>
        </div>
        ${Math.abs(diff) >= 0.01 ? `<button class="btn small" id="kr-pf-align">Startkapitaal op ${usd(target)} zetten (journal = Kraken)</button> <span class="muted small">Verschil door fees, funding, een storting of papier-trades in je journal.</span>` : ""}
      </section>`;
      const b = box.querySelector("#kr-pf-align");
      if (b)
        b.addEventListener("click", () => {
          if (!confirm(`Startkapitaal op ${usd(target)} zetten? Je journal-saldo wordt dan gelijk aan je Kraken-saldo.`)) return;
          S.setSettings({ startingCapital: target, currency: "$" });
          render(root);
        });
    } catch (e) {
      box.innerHTML = `<p class="muted small">Kraken-saldo niet beschikbaar: ${esc(e.message)}</p>`;
    }
  }

  // ---------- Resultaat per oordeel ----------
  // Legt je eigen gesloten trades naast het oordeel bij het plaatsen (Speelbaar, Twijfel, Niet spelen).
  // Zo zie je of je beter verdient als je je aan de regels houdt.
  function assessmentOf(t) {
    let a = t.assessment;
    if ((!a || a.v !== 2) && t.snapshot && TD.tradeReview) {
      try {
        a = TD.tradeReview.assessTrade(t);
        if (a) S.saveTrade({ ...S.getTrade(t.id), assessment: a }); // eenmalig berekenen en bewaren
      } catch {
        a = null;
      }
    }
    return a && a.verdict ? a : null;
  }
  const GOAL = 30; // pas vanaf zo'n 30 trades per groep zegt het verschil echt iets
  function verdictSection(p, trades) {
    const closed = trades.filter((t) => t.status === "closed" && t.outcome !== "Cancelled" && t.pnl !== "" && t.pnl !== null && t.pnl !== undefined);
    const groupOf = (t) => {
      const a = assessmentOf(t);
      if (!a) return "none";
      return a.verdict.key === "play" ? "play" : a.verdict.key === "doubt" ? "doubt" : "skip";
    };
    const G = { play: [], doubt: [], skip: [], none: [] };
    for (const t of closed) G[groupOf(t)].push(t);
    const stat = (list) => {
      const rs = list.map((t) => p.rows.get(t.id)?.r).filter((v) => v !== null && v !== undefined && isFinite(v));
      const wins = list.filter((t) => +t.pnl > 0).length;
      return {
        n: list.length, wins, losses: list.length - wins,
        winrate: list.length ? wins / list.length : null,
        avgR: rs.length ? rs.reduce((x, v) => x + v, 0) / rs.length : null,
        totalR: rs.reduce((x, v) => x + v, 0),
        pnl: list.reduce((x, t) => x + (+t.pnl || 0), 0),
      };
    };
    const st = { play: stat(G.play), doubt: stat(G.doubt), skip: stat(G.skip), none: stat(G.none) };
    const rows = [
      ["play", `<span class="badge pos">Speelbaar</span>`, "Alles klopte volgens de regels"],
      ["doubt", `<span class="badge warn">Twijfel</span>`, "Geen fout, wel aandachtspunten"],
      ["skip", `<span class="badge neg">Niet spelen</span>`, "Een of meer regels niet in orde"],
      ["none", `<span class="badge muted">Geen oordeel</span>`, "Zonder marktbeeld van het moment van plaatsen"],
    ].filter(([k]) => k !== "none" || st.none.n);
    const S2 = st.play, rest = stat([...G.doubt, ...G.skip]);
    // Conclusie in gewone taal; voorzichtig zolang een groep nog geen GOAL trades heeft.
    const early = Math.min(S2.n, rest.n) < GOAL ? `Eerste teken (nog maar ${Math.min(S2.n, rest.n)} trades in de kleinste groep, dus nog niet zeker): ` : "Je regels werken: ";
    let msg;
    if (S2.n + rest.n === 0)
      msg = { tone: "info", text: `Nog geen gesloten trades met een oordeel. Elke trade die je plaatst krijgt een oordeel; na het sluiten zie je hier of de regels je geld opleveren.` };
    else if (S2.n < 10 || rest.n < 10)
      msg = { tone: "info", text: `Nog te weinig trades om iets te concluderen: ${S2.n} Speelbaar en ${rest.n} Twijfel/Niet spelen. Pas na zo'n ${GOAL} per groep zegt het verschil echt iets. Blijf je trades netjes vastleggen.` };
    else if (S2.avgR - rest.avgR >= 0.2)
      msg = { tone: "pos", text: `${early}Speelbaar-trades leveren gemiddeld ${r(S2.avgR)} per trade op, tegenover ${r(rest.avgR)} bij Twijfel/Niet spelen. Speel alleen nog de setups die alle checks halen.` };
    else if (rest.avgR - S2.avgR >= 0.2)
      msg = { tone: "warn", text: `${early.startsWith('Je regels') ? 'Opvallend: je ' : early + 'je '}Twijfel/Niet spelen-trades deden het beter (${r(rest.avgR)}) dan Speelbaar (${r(S2.avgR)}). Kijk welke checks je vaak oranje of rood had: misschien zijn ze te streng, of was het geluk.` };
    else msg = { tone: "info", text: `Nog geen duidelijk verschil: Speelbaar ${r(S2.avgR)} per trade, Twijfel/Niet spelen ${r(rest.avgR)}. Ga door tot je meer trades hebt.` };
    const bar = (n) => `<div class="goal-bar" title="${n} van ${GOAL} trades"><span style="width:${Math.min(100, (n / GOAL) * 100)}%"></span></div><em class="muted small">${Math.min(n, GOAL)}/${GOAL}</em>`;
    return `<section class="panel">
      <h2>Resultaat per oordeel <span class="muted small">— houd je je aan de regels, verdien je dan meer?</span></h2>
      <div class="table-wrap"><table class="table"><thead><tr><th>Oordeel bij plaatsen</th><th>Wat betekent dat</th><th class="num">Trades</th><th class="num">Wins / Losses</th><th class="num">Win rate</th><th class="num">Gem. R</th><th class="num">Totaal R</th><th class="num">Net PnL</th><th>Genoeg trades?</th></tr></thead><tbody>
        ${rows
          .map(([k, label, what]) => {
            const x = st[k];
            return `<tr><td>${label}</td><td class="muted small">${what}</td><td class="num">${x.n}</td><td class="num">${x.n ? `${x.wins} / ${x.losses}` : "—"}</td>
              <td class="num">${x.winrate !== null ? pct(x.winrate) : "—"}</td><td class="num ${signClass(x.avgR)}">${x.avgR !== null ? r(x.avgR) : "—"}</td>
              <td class="num ${signClass(x.totalR)}">${x.n ? r(x.totalR) : "—"}</td><td class="num ${signClass(x.pnl)}">${x.n ? money(x.pnl) : "—"}</td>
              <td>${k === "none" ? "" : `<div class="row gap">${bar(x.n)}</div>`}</td></tr>`;
          })
          .join("")}
      </tbody></table></div>
      <div class="review-lesson ${msg.tone}" style="margin-top:12px">${msg.text}</div>
      <p class="muted small">Gem. R: hoeveel keer je risico je gemiddeld won of verloor per trade. +0,5R betekent: bij €10 risico gemiddeld €5 winst per trade. Het oordeel is hetzelfde als in Advise, gemaakt met de grafiek van het moment dat je de trade plaatste.</p>
    </section>`;
  }

  function render(root) {
    const p = S.computePortfolio();
    const trades = S.getTrades();
    const journal = trades
      .slice()
      .sort((a, b) => (a.exitDate || a.entryDate || "").localeCompare(b.exitDate || b.entryDate || ""));
    const kpi = (label, value, cls = "", sub = "") =>
      `<div class="kpi"><span>${label}</span><strong class="${cls}">${value}</strong>${sub ? `<em>${sub}</em>` : ""}</div>`;

    root.innerHTML = `
      <div class="page-head">
        <h1>Portfolio</h1>
        <div class="row gap">
          <button class="btn" id="exp-csv">Exporteer naar Excel (CSV)</button>
          <a class="btn" href="#/instellingen">Startkapitaal, valuta & back-ups</a>
        </div>
      </div>

      <div class="kpis">
        ${kpi("Startkapitaal", money(p.startingCapital))}
        ${kpi("Huidig saldo", money(p.balance), signClass(p.netPnl))}
        ${kpi("Net PnL", money(p.netPnl), signClass(p.netPnl))}
        ${kpi("Totaal rendement", pct(p.totalReturn, 2), signClass(p.totalReturn))}
        ${kpi("Trades genomen", p.taken, "", `${p.open.length} open`)}
        ${kpi("Wins / Losses", `${p.wins} / ${p.losses}`)}
        ${kpi("Win rate", pct(p.winRate))}
        ${kpi("Expectancy", r(p.expectancy), signClass(p.expectancy), "gem. R per trade")}
        ${kpi("Profit factor", num(p.profitFactor))}
        ${kpi("Gem. winst", money(p.avgWin), "pos")}
        ${kpi("Gem. verlies", money(p.avgLoss), "neg")}
        ${kpi("Max drawdown", pct(p.maxDrawdown, 2), p.maxDrawdown < 0 ? "neg" : "")}
        ${kpi("Beste trade", money(p.best), signClass(p.best))}
        ${kpi("Slechtste trade", money(p.worst), signClass(p.worst))}
        ${kpi("Plan adherence", pct(p.planAdherence), "", "“Followed plan?” = Yes")}
        ${kpi("Open risico", money(p.openRisk), "", "som van risico open trades")}
        ${kpi(
          "Fees betaald",
          money(-p.fees),
          p.fees > 0 ? "neg" : "",
          p.fees > 0
            ? `gem. ${money(p.avgFee)} per trade${p.feeShare !== null ? ` · ${pct(p.feeShare)} van je winst vóór fees` : ""}${p.openFees > 0 ? ` · ${money(p.openFees)} in open posities` : ""}`
            : "papier-trades automatisch, andere trades vul je in bij het sluiten"
        )}
      </div>
      <div id="kr-portfolio"></div>

      <section class="panel">
        <h2>Equity curve <span class="muted small">— klik op een punt om de trade te openen</span></h2>
        ${TD.charts.equitySVG(p.curve, p.startingCapital)}
      </section>

      <div class="two-col">
        <section class="panel">
          <h2>Open posities</h2>
          ${
            p.open.length
              ? `<table class="table clickable"><thead><tr><th>Ticker</th><th>Richting</th><th>Entry</th><th>SL</th><th class="num">R/R</th><th class="num">Risico</th></tr></thead><tbody>
              ${p.open
                .map(
                  (t) => `<tr data-href="#/trades/${t.id}"><td><strong>${esc(shortSym(t.ticker))}</strong></td>
                  <td><span class="dir ${t.direction === "Long" ? "pos" : "neg"}">${esc(t.direction)}</span></td>
                  <td>${num(t.entry, 8)}</td><td>${num(t.stopLoss, 8)}</td><td class="num">${r(S.totalRR(t))}</td>
                  <td class="num">${money(S.riskAmount(t, p))}</td></tr>`
                )
                .join("")}</tbody></table>`
              : `<p class="muted">Geen open posities.</p>`
          }
        </section>
        <section class="panel">
          <h2>Breakdown per pair</h2>
          ${
            p.byPair.length
              ? `<table class="table clickable"><thead><tr><th>Pair</th><th class="num">Trades</th><th class="num">Wins</th><th class="num">Losses</th><th class="num">Win rate</th><th class="num">Net PnL</th></tr></thead><tbody>
              ${p.byPair
                .map(
                  (b) => `<tr data-href="#/trades?ticker=${encodeURIComponent(b.ticker)}"><td><strong>${esc(shortSym(b.ticker))}</strong></td>
                  <td class="num">${b.trades}</td><td class="num">${b.wins}</td><td class="num">${b.losses}</td>
                  <td class="num">${b.wins + b.losses ? pct(b.wins / (b.wins + b.losses)) : "—"}</td>
                  <td class="num ${signClass(b.pnl)}">${money(b.pnl)}</td></tr>`
                )
                .join("")}</tbody></table>`
              : `<p class="muted">Nog geen gesloten trades.</p>`
          }
        </section>
      </div>

      ${verdictSection(p, trades)}

      <section class="panel">
        <h2>Journal</h2>
        ${
          journal.length
            ? `<div class="table-wrap"><table class="table clickable"><thead><tr>
            <th>#</th><th>Datum</th><th>Pair</th><th>Richting</th><th>Setup</th><th>Uitkomst</th><th>Plan?</th>
            <th class="num">Risk %</th><th class="num">Start</th><th class="num">PnL</th><th class="num">Eind</th>
            <th class="num">Fees</th><th class="num">Return</th><th class="num">R</th><th>Checks</th><th>Les</th></tr></thead><tbody>
            ${journal
              .map((t, i) => {
                const row = p.rows.get(t.id);
                return `<tr data-href="#/trades/${t.id}">
                  <td>${i + 1}</td><td>${date(t.exitDate || t.entryDate)}</td><td><strong>${esc(shortSym(t.ticker))}</strong></td>
                  <td>${esc(t.direction)}</td><td>${esc(t.setup)}</td><td>${TD.views.trades.statusBadge(t)}</td>
                  <td>${esc(t.followedPlan || "—")}</td><td class="num">${num(t.riskPct)}%</td>
                  <td class="num">${row ? money(row.startBalance) : "—"}</td>
                  <td class="num ${signClass(+t.pnl)}">${t.status === "closed" ? money(+t.pnl) : "—"}</td>
                  <td class="num">${row ? money(row.endBalance) : "—"}</td>
                  <td class="num muted">${S.tradeFees(t) !== null ? money(-S.tradeFees(t)) : "—"}</td>
                  <td class="num ${signClass(row?.returnPct)}">${row ? pct(row.returnPct, 2) : "—"}</td>
                  <td class="num ${signClass(row?.r)}">${row ? r(row.r) : "—"}</td>
                  <td>${TD.views.trades.scoreBadge(t)}</td>
                  <td class="lesson-cell">${esc(t.lesson || "")}</td></tr>`;
              })
              .join("")}</tbody></table></div>`
            : `<div class="empty">Nog geen trades. <a href="#/trades/new">Plaats je eerste trade</a>.</div>`
        }
      </section>

      ${projection(p)}`;

    paintKraken(root, p);

    root.querySelector("#exp-csv").addEventListener("click", () =>
      download(`tradingdesk-journal-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + S.exportCSV(), "text/csv")
    );

    const pf = root.querySelector("#proj-form");
    pf.addEventListener("input", () => {
      root.querySelector("#proj-out").innerHTML = projectionTable(readProj(pf));
    });
  }

  // ---------- Compound Projection (tabblad uit de Excel) ----------
  function readProj(f) {
    return {
      start: +f.pstart.value || 0,
      risk: (+f.prisk.value || 0) / 100,
      win: +f.pwin.value || 0,
      winrate: Math.min(100, Math.max(0, +f.pwr.value || 0)) / 100,
      n: Math.min(500, Math.max(1, +f.pn.value || 1)),
      target: +f.ptarget.value || 0,
    };
  }

  function projectionTable(o) {
    // Verdeel wins en losses gelijkmatig over de reeks (bijv. 50% → W L W L ...).
    let bal = o.start;
    let reached = null;
    let acc = 0;
    const rows = [];
    for (let i = 1; i <= o.n; i++) {
      acc += o.winrate;
      const win = acc >= 1 - 1e-9;
      if (win) acc -= 1;
      const risk = bal * o.risk;
      const pnl = win ? risk * o.win : -risk;
      bal += pnl;
      if (reached === null && o.target && bal >= o.target) reached = i;
      rows.push({ i, win, pnl, bal });
    }
    const show = rows.length > 12 ? [...rows.slice(0, 6), null, ...rows.slice(-5)] : rows;
    return `
      <div class="kpis small">
        <div class="kpi"><span>Eindsaldo</span><strong class="${signClass(bal - o.start)}">${money(bal)}</strong></div>
        <div class="kpi"><span>Rendement</span><strong class="${signClass(bal - o.start)}">${pct(o.start ? bal / o.start - 1 : 0)}</strong></div>
        <div class="kpi"><span>Target bereikt</span><strong>${reached ? "na trade " + reached : "niet binnen " + o.n}</strong></div>
      </div>
      <table class="table"><thead><tr><th>#</th><th>Uitkomst</th><th class="num">PnL</th><th class="num">Saldo</th></tr></thead><tbody>
      ${show
        .map((x) =>
          x
            ? `<tr><td>${x.i}</td><td>${x.win ? '<span class="badge pos">Win</span>' : '<span class="badge neg">Loss</span>'}</td><td class="num ${signClass(x.pnl)}">${money(x.pnl)}</td><td class="num">${money(x.bal)}</td></tr>`
            : `<tr><td colspan="4" class="muted">…</td></tr>`
        )
        .join("")}</tbody></table>`;
  }

  function projection(p) {
    const o = { start: Math.round(p.balance * 100) / 100, risk: 0.02, win: 3, winrate: 0.5, n: 50, target: 100000 };
    return `<section class="panel">
      <h2>Compound projection <span class="muted small">— vooruitblik, geen voorspelling</span></h2>
      <form id="proj-form" class="grid g6" onsubmit="return false">
        <label>Startsaldo<input name="pstart" type="number" step="any" value="${o.start}"></label>
        <label>Risico % per trade<input name="prisk" type="number" step="0.1" value="${o.risk * 100}"></label>
        <label>Winst per win (R)<input name="pwin" type="number" step="0.1" value="${o.win}"></label>
        <label>Win rate %<input name="pwr" type="number" step="1" value="${o.winrate * 100}"></label>
        <label>Aantal trades<input name="pn" type="number" step="1" value="${o.n}"></label>
        <label>Target saldo<input name="ptarget" type="number" step="any" value="${o.target}"></label>
      </form>
      <div id="proj-out">${projectionTable(o)}</div>
    </section>`;
  }

  TD.views = TD.views || {};
  TD.views.portfolio = { render };
})(window.TD);
