// Instellingen: trading-standaarden, opslag (map wijzigen, back-ups), app & updates, Leerschool.
(function (TD) {
  const { esc, download } = TD.util;
  const S = TD.store;

  // ---------- Exchange (Kraken Futures, papier-modus) ----------
  function exchangeHTML() {
    if (!TD.paper) return "";
    const s = TD.paper.summary();
    const usd = (v) => v.toLocaleString("nl-NL", { style: "currency", currency: "USD" });
    return `<section class="panel settings" id="ex-panel">
      <h2>Exchange <span class="badge open">Kraken Futures</span></h2>
      <label class="inline">Modus
        <select id="ex-mode">
          <option value="off" ${s.enabled ? "" : "selected"}>Uit (alleen journal)</option>
          <option value="paper" ${s.enabled ? "selected" : ""}>Papier-modus (echte koersen, nepgeld)</option>
        </select>
      </label>
      <p class="muted small">In papier-modus kun je bij een nieuwe trade een order bij Kraken Futures simuleren: limit- of markt-entry, stop loss, 50% op TP1 met de stop naar break-even, en de rest op TP2. Alles op de echte Kraken-koersen, met Kraken-fees (0,02% maker, 0,05% taker) en de EU-retailmarges (max 10x). Je journal wordt automatisch bijgewerkt als de trade dicht is.</p>
      ${
        s.enabled
          ? `<div class="kpis small">
          <div class="kpi"><span>Papier-saldo</span><strong>${usd(s.balance)}</strong><em>start ${usd(s.startBalance)}</em></div>
          <div class="kpi"><span>Equity</span><strong class="${s.unrealized >= 0 ? "pos" : "neg"}">${usd(s.equity)}</strong><em>incl. ${usd(s.unrealized)} open</em></div>
          <div class="kpi"><span>Vrije marge</span><strong>${usd(s.available)}</strong><em>${usd(s.usedMargin)} in gebruik</em></div>
          <div class="kpi"><span>Trades</span><strong>${s.open} open</strong><em>${s.pending} wachtend · ${s.closed} gesloten</em></div>
        </div>
        ${
          +S.getSettings().startingCapital !== +s.startBalance || S.getSettings().currency !== "$"
            ? `<div class="ex-align">
          <p class="warn-text small">Je journal rekent met een startkapitaal van ${esc(S.getSettings().currency)}${esc(S.getSettings().startingCapital)}, je papier-account met US$ ${esc(s.startBalance)}. Zet ze gelijk, zodat risico, positiegrootte en R in je journal kloppen met je papier-trades.</p>
          <button class="btn small" id="ex-align">Journal-startkapitaal op US$ ${esc(s.startBalance)} zetten</button>
        </div>`
            : ""
        }
        <div class="grid g4">
          <label>Standaard leverage<select id="ex-lev">${[1, 2, 3, 5, 10].map((l) => `<option value="${l}" ${+s.leverage === l ? "selected" : ""}>${l}x</option>`).join("")}</select></label>
          <label>Startsaldo (USD)<input type="number" id="ex-start" min="100" step="100" value="${esc(s.startBalance)}"></label>
        </div>
        <div class="row gap" style="margin-top:10px">
          <button class="btn small" id="ex-reset">Papier-account resetten</button>
          <span class="muted small" id="ex-out"></span>
        </div>`
          : ""
      }
      <p class="muted small">Stap 2 en 3 (je echte Kraken-account koppelen) komen later. Er wordt nu nooit een echte order geplaatst.</p>
    </section>`;
  }

  function bindExchange(root) {
    const mode = root.querySelector("#ex-mode");
    if (!mode) return;
    mode.addEventListener("change", () => {
      TD.paper.setConfig({ enabled: mode.value === "paper" });
      render(root);
    });
    const align = root.querySelector("#ex-align");
    if (align)
      align.addEventListener("click", () => {
        S.setSettings({ startingCapital: TD.paper.account().startBalance, currency: "$" });
        render(root);
      });
    const lev = root.querySelector("#ex-lev");
    if (lev) lev.addEventListener("change", () => TD.paper.setConfig({ leverage: +lev.value }));
    const reset = root.querySelector("#ex-reset");
    if (reset)
      reset.addEventListener("click", () => {
        const start = Math.max(100, +root.querySelector("#ex-start").value || 10000);
        if (!confirm(`Papier-account resetten naar ${start} USD? De papier-geschiedenis wordt gewist (je journal blijft staan).`)) return;
        try {
          TD.paper.reset(start);
          render(root);
        } catch (e) {
          root.querySelector("#ex-out").textContent = e.message;
        }
      });
  }

  function render(root) {
    const s = S.getSettings();
    const d = S.desktop;
    const i = S.desktopInfo() || {};
    const canMove = d && typeof d.chooseDataDir === "function";
    const school = S.getSchool();

    root.innerHTML = `
      <div class="page-head"><h1>Instellingen</h1></div>

      <section class="panel settings">
        <h2>Trading</h2>
        <div class="grid g4">
          <label>Startkapitaal<input type="number" id="set-capital" step="any" min="0" value="${esc(s.startingCapital)}"></label>
          <label>Valuta<select id="set-currency">${["$", "€", "USDT "].map((c) => `<option ${c === s.currency ? "selected" : ""}>${c}</option>`).join("")}</select></label>
          <label>Standaard risico % per trade<input type="number" id="set-risk" step="0.1" min="0" value="${esc(s.defaultRisk)}"></label>
        </div>
        <p class="muted small">Het startkapitaal is de basis van je saldo, rendement en equity curve in Portfolio. Het standaard risico wordt ingevuld bij elke nieuwe trade.</p>
        <p class="saved small" id="trading-saved" hidden>Opgeslagen</p>
      </section>

      ${exchangeHTML()}

      <section class="panel settings">
        <h2>Opslag</h2>
        ${
          d
            ? `<dl class="dl">
                <dt>Databestand</dt><dd class="wrap">${esc(i.dataFile || "—")} ${i.icloud ? '<span class="badge pos">iCloud</span>' : '<span class="badge warn">niet in iCloud</span>'}</dd>
                <dt>Back-ups</dt><dd class="wrap">${esc(i.backupDir || "—")} <span class="muted">(één per dag, laatste 30)</span></dd>
              </dl>
              <div class="row gap">
                <button class="btn small" id="st-reveal">Toon in Finder</button>
                <button class="btn small" id="st-backups">Open back-upmap</button>
                ${canMove ? `<button class="btn small primary" id="st-move">Map wijzigen…</button>` : ""}
                ${canMove && i.customDir ? `<button class="btn small" id="st-default">Terug naar standaardmap</button>` : ""}
              </div>
              ${
                canMove
                  ? `<div id="move-box" class="move-box" hidden></div>`
                  : `<p class="muted small">Een andere map kiezen kan vanaf app-versie 1.1.0. Installeer de nieuwste .dmg om dit te gebruiken.</p>`
              }`
            : `<p class="muted">In de browser worden je trades in deze browser bewaard (localStorage). Maak regelmatig een back-up.</p>`
        }
        <h3>Back-up</h3>
        <div class="row gap">
          <button class="btn small" id="st-export">Back-up maken (.json)</button>
          <label class="btn small">Back-up terugzetten<input type="file" id="st-import" accept="application/json,.json" hidden></label>
          <button class="btn small" id="st-csv">Exporteer journal naar Excel (CSV)</button>
        </div>
      </section>

      <section class="panel settings">
        <h2>App</h2>
        <dl class="dl">
          <dt>Versie</dt><dd>${esc(TD.VERSION)}${i.source === "update" ? ' <span class="muted">(bijgewerkt via update)</span>' : ""}</dd>
          ${d ? `<dt>App-schil</dt><dd>${esc(i.shellVersion)}</dd>` : ""}
        </dl>
        ${
          d
            ? `<div class="row gap"><button class="btn small" id="st-check">Controleer op updates</button><span class="muted small" id="st-check-out"></span></div>`
            : `<p class="muted small">Updates met één klik werken in de Mac-app.</p>`
        }
      </section>

      ${
        TD.demo && TD.demo.isPreview()
          ? `<section class="panel settings demo-panel">
        <h2>Voorbeelddata <span class="badge warn">alleen in de preview</span></h2>
        <p class="muted small">Oefentrades op echte koersen van de afgelopen dagen, met TP's, een stop loss en break-even die echt geraakt zijn, plus een setup-melding. Zo kun je Meldingen, Trades en Portfolio uitproberen.</p>
        <div class="row gap">
          <button class="btn small primary" id="demo-load">Voorbeelddata laden</button>
          <button class="btn small" id="demo-clear" ${TD.demo.hasDemo() ? "" : "disabled"}>Voorbeelddata verwijderen</button>
          <span class="muted small" id="demo-out"></span>
        </div>
      </section>`
          : ""
      }

      <section class="panel settings">
        <h2>Leerschool</h2>
        <p>${school.answered} opdrachten beantwoord, ${school.answered ? Math.round((school.correct / school.answered) * 100) : 0}% goed, beste reeks ${school.best}.</p>
        <button class="btn small danger" id="st-reset-school">Score resetten</button>
      </section>`;

    bindExchange(root);

    // ---- trading ----
    const savedNote = root.querySelector("#trading-saved");
    const saveTrading = () => {
      S.setSettings({
        startingCapital: +root.querySelector("#set-capital").value || 0,
        currency: root.querySelector("#set-currency").value,
        defaultRisk: Math.max(0, +root.querySelector("#set-risk").value || 0),
      });
      savedNote.hidden = false;
      clearTimeout(saveTrading.t);
      saveTrading.t = setTimeout(() => (savedNote.hidden = true), 1500);
    };
    ["#set-capital", "#set-currency", "#set-risk"].forEach((sel) => root.querySelector(sel).addEventListener("change", saveTrading));

    // ---- opslag ----
    if (d) {
      root.querySelector("#st-reveal").addEventListener("click", () => d.revealData());
      root.querySelector("#st-backups").addEventListener("click", () => (d.revealBackups ? d.revealBackups() : d.revealData()));
    }
    if (canMove) {
      const box = root.querySelector("#move-box");
      root.querySelector("#st-move").addEventListener("click", async () => {
        const pick = await d.chooseDataDir();
        if (!pick) return;
        box.hidden = false;
        box.innerHTML = `
          <p><strong>Nieuwe map:</strong> ${esc(pick.dir)} ${pick.icloud ? '<span class="badge pos">iCloud</span>' : '<span class="badge warn">niet in iCloud</span>'}</p>
          ${
            pick.hasData
              ? `<p>In deze map staat al Tradingdesk-data${pick.trades ? ` (${pick.trades} trades)` : ""}. Wil je die gebruiken? Je huidige data blijft in de oude map staan.</p>
                 <div class="row gap"><button class="btn small primary" data-mode="use">Gebruik de data in die map</button><button class="btn small" data-cancel>Annuleren</button></div>`
              : `<p>Je huidige data (${S.getTrades().length} trades, instellingen en watchlist) wordt naar deze map gekopieerd. De oude map blijft als reservekopie staan.</p>
                 <div class="row gap"><button class="btn small primary" data-mode="move">Data verplaatsen naar deze map</button><button class="btn small" data-cancel>Annuleren</button></div>`
          }
          ${pick.icloud ? "" : '<p class="muted small">Let op: buiten iCloud Drive wordt je data niet automatisch door Apple geback-upt.</p>'}`;
        box.querySelector("[data-cancel]").addEventListener("click", () => (box.hidden = true));
        box.querySelector("[data-mode]").addEventListener("click", async (e) => {
          await apply(pick.dir, e.target.dataset.mode, box);
        });
      });
      const def = root.querySelector("#st-default");
      if (def)
        def.addEventListener("click", () => {
          box.hidden = false;
          box.innerHTML = `<p>Terug naar de standaardmap: <strong>${esc(i.defaultDir)}</strong>.</p>
            <div class="row gap"><button class="btn small primary" data-mode="move">Data meenemen</button><button class="btn small" data-mode="use">Gebruik de data die daar al staat</button><button class="btn small" data-cancel>Annuleren</button></div>`;
          box.querySelector("[data-cancel]").addEventListener("click", () => (box.hidden = true));
          box.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => apply(null, b.dataset.mode, box)));
        });
    }

    async function apply(dir, mode, box) {
      try {
        await d.setDataDir(dir, mode);
        location.reload(); // herladen met de data uit de nieuwe map
      } catch (err) {
        box.insertAdjacentHTML("beforeend", `<p class="error">${esc(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""))}</p>`);
      }
    }

    // ---- back-up ----
    const stamp = () => new Date().toISOString().slice(0, 10);
    root.querySelector("#st-export").addEventListener("click", () => download(`tradingdesk-backup-${stamp()}.json`, S.exportJSON(), "application/json"));
    root.querySelector("#st-csv").addEventListener("click", () => download(`tradingdesk-journal-${stamp()}.csv`, "﻿" + S.exportCSV(), "text/csv"));
    root.querySelector("#st-import").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (!confirm("Dit vervangt al je huidige trades door die uit de back-up. Doorgaan?")) return;
      try {
        const n = S.importJSON(await f.text());
        alert(`${n} trades teruggezet.`);
        TD.app.rerender();
      } catch (err) {
        alert("Terugzetten mislukt: " + err.message);
      }
    });

    // ---- updates ----
    const check = root.querySelector("#st-check");
    if (check)
      check.addEventListener("click", async () => {
        const out = root.querySelector("#st-check-out");
        out.textContent = "Controleren…";
        const r = await d.checkUpdate();
        if (r.status === "up-to-date") out.textContent = `Je hebt de nieuwste versie (${TD.VERSION}).`;
        else if (r.status === "web-update" || r.status === "needs-dmg") {
          out.textContent = "";
          TD.desktopUI.banner(r);
        } else out.textContent = r.message || "Controleren mislukt.";
      });

    // ---- voorbeelddata (preview) ----
    const dl = root.querySelector("#demo-load");
    if (dl) {
      dl.addEventListener("click", async () => {
        const out = root.querySelector("#demo-out");
        dl.disabled = true;
        if (TD.demo.hasDemo()) TD.demo.clear();
        out.textContent = "Koersen ophalen en oefentrades maken…";
        try {
          const n = await TD.demo.load();
          out.textContent = `${n} oefentrades geladen. Kijk bij de bel rechtsboven, Trades en Portfolio.`;
        } catch (e) {
          out.textContent = "Laden mislukt: " + e.message;
        }
        dl.disabled = false;
        root.querySelector("#demo-clear").disabled = !TD.demo.hasDemo();
      });
      root.querySelector("#demo-clear").addEventListener("click", () => {
        const n = TD.demo.clear();
        root.querySelector("#demo-out").textContent = `${n} oefentrades en hun meldingen verwijderd.`;
        root.querySelector("#demo-clear").disabled = true;
      });
    }

    // ---- leerschool ----
    root.querySelector("#st-reset-school").addEventListener("click", () => {
      if (confirm("Je Leerschool-score resetten?")) {
        S.resetSchool();
        render(root);
      }
    });
  }

  TD.views = TD.views || {};
  TD.views.instellingen = { render };
})(window.TD);
