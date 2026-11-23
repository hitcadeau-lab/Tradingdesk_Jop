// Meldingen: alle meldingen (trade-levels en Notifier-setups) op één plek,
// met gelezen/ongelezen, verwijderen en instellingen voor TP/SL-meldingen.
(function (TD) {
  const { esc, stamp } = TD.util;
  const I = TD.inbox;
  let filter = "all";
  let unsub = null;

  const ICON = { tp: "▲", sl: "✕", be: "＝", setup: "◆", fill: "●" };
  const KIND = { tp: "Take profit", sl: "Stop loss", be: "Break-even", setup: "Setup", fill: "Order" };

  // "Trade sluiten" bij trade-meldingen zolang de trade nog open staat.
  function closeBtn(n) {
    if (!n.tradeId || !["tp", "sl", "be"].includes(n.kind)) return "";
    const t = TD.store.getTrade(n.tradeId);
    if (!t) return "";
    if (t.broker) return t.status === "open" ? `<a class="btn small" href="#/trades/${esc(t.id)}" data-open="${esc(n.id)}">Bekijk positie</a>` : `<span class="badge muted">Gesloten</span>`;
    if (t.status !== "open") return `<span class="badge muted">Gesloten</span>`;
    return `<a class="btn small primary" href="${esc(TD.tradeAlerts.closeLink(t))}" data-open="${esc(n.id)}">Trade sluiten</a>`;
  }

  function teardown() {
    if (unsub) unsub();
    unsub = null;
  }

  function render(root) {
    teardown();
    const cfg = I.getConfig();
    const items = I.all();
    const list = filter === "unread" ? items.filter((x) => !x.read) : items;
    const unread = items.filter((x) => !x.read).length;
    const perm = typeof Notification === "undefined" ? "unsupported" : Notification.permission;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Meldingen</h1>
          <div class="muted small">${unread} ongelezen · ${items.length} totaal</div>
        </div>
        <div class="row gap">
          <span class="view-toggle" role="group" aria-label="Filter">
            <button type="button" data-filter="all" class="${filter === "all" ? "active" : ""}">Alle</button>
            <button type="button" data-filter="unread" class="${filter === "unread" ? "active" : ""}">Ongelezen${unread ? ` (${unread})` : ""}</button>
          </span>
          <button class="btn small" id="m-allread" ${unread ? "" : "disabled"}>Alles gelezen</button>
          <button class="btn small" id="m-delread" ${items.some((x) => x.read) ? "" : "disabled"}>Gelezen verwijderen</button>
        </div>
      </div>

      <section class="panel inbox">
        ${
          list.length
            ? `<ul class="inbox-list">${list
                .map(
                  (n) => `<li class="inbox-item ${n.kind} ${n.read ? "read" : "unread"}" data-id="${esc(n.id)}">
                  <span class="inbox-icon" aria-hidden="true">${ICON[n.kind] || "•"}</span>
                  <a class="inbox-body" href="${esc(n.link || "#/meldingen")}" data-open="${esc(n.id)}">
                    <span class="inbox-title">${!n.read ? '<span class="dot" aria-label="ongelezen"></span>' : ""}${esc(n.title)}</span>
                    <span class="inbox-text">${esc(n.body || "")}</span>
                    <span class="inbox-meta">${esc(KIND[n.kind] || "")} · ${esc(stamp(n.at))}</span>
                  </a>
                  <span class="inbox-actions">
                    ${closeBtn(n)}
                    <button class="btn small" data-toggle="${esc(n.id)}" title="${n.read ? "Markeer als ongelezen" : "Markeer als gelezen"}">${n.read ? "Ongelezen" : "Gelezen"}</button>
                    <button class="icon" data-del="${esc(n.id)}" title="Verwijderen" aria-label="Verwijderen">×</button>
                  </span>
                </li>`
                )
                .join("")}</ul>`
            : `<div class="empty">${filter === "unread" ? "Geen ongelezen meldingen." : "Nog geen meldingen. Je krijgt hier een melding als een open trade een TP, de stop loss of break-even raakt, en bij nieuwe setups uit de Notifier."}</div>`
        }
      </section>

      <section class="panel settings">
        <h2>Instellingen</h2>
        <label class="chk"><input type="checkbox" id="m-trades" ${cfg.trades ? "checked" : ""}> Meldingen bij TP, stop loss en break-even van mijn open trades</label>
        <label class="inline">Controleer elke
          <select id="m-interval">${[1, 2, 5, 15].map((m) => `<option value="${m}" ${+cfg.intervalMin === m ? "selected" : ""}>${m} min</option>`).join("")}</select>
        </label>
        <label class="chk"><input type="checkbox" id="m-desktop" ${cfg.desktop ? "checked" : ""} ${perm === "unsupported" ? "disabled" : ""}> Ook als melding op mijn ${TD.store.desktop ? "Mac" : "computer"}</label>
        <p class="muted small" id="m-perm">${perm === "denied" ? "Meldingen zijn geblokkeerd. Zet ze aan in Systeeminstellingen → Berichtgeving → Tradingdesk." : ""}</p>
        <p class="muted small">De app kijkt naar 15-minuten-candles vanaf je entry, zolang de app open is. Raakt één candle zowel je stop als een TP, dan meldt de app de stop (voorzichtigste aanname). Setups uit de Notifier komen hier ook; de macOS-melding daarvan stel je in bij de Notifier.</p>
      </section>`;

    // events
    root.querySelectorAll("[data-filter]").forEach((b) =>
      b.addEventListener("click", () => {
        filter = b.dataset.filter;
        render(root);
      })
    );
    root.querySelector("#m-allread").addEventListener("click", () => I.markAllRead());
    root.querySelector("#m-delread").addEventListener("click", () => {
      if (confirm("Alle gelezen meldingen verwijderen?")) I.removeRead();
    });
    root.querySelectorAll("[data-toggle]").forEach((b) =>
      b.addEventListener("click", () => {
        const n = I.all().find((x) => x.id === b.dataset.toggle);
        if (n) I.markRead(n.id, !n.read);
      })
    );
    root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => I.remove(b.dataset.del)));
    root.querySelectorAll("[data-open]").forEach((a) => a.addEventListener("click", () => I.markRead(a.dataset.open, true)));
    root.querySelector("#m-trades").addEventListener("change", (e) => {
      I.setConfig({ trades: e.target.checked });
      if (e.target.checked) TD.tradeAlerts.check();
    });
    root.querySelector("#m-interval").addEventListener("change", (e) => {
      I.setConfig({ intervalMin: +e.target.value });
      TD.tradeAlerts.start();
    });
    root.querySelector("#m-desktop").addEventListener("change", async (e) => {
      if (e.target.checked) {
        const p = await I.requestPermission();
        if (p !== "granted") {
          e.target.checked = false;
          root.querySelector("#m-perm").textContent = "Geen toestemming voor meldingen. Zet ze aan in Systeeminstellingen → Berichtgeving.";
          return;
        }
      }
      I.setConfig({ desktop: e.target.checked });
    });

    unsub = I.onChange(() => {
      if (location.hash.startsWith("#/meldingen")) render(root);
    });
  }

  TD.views = TD.views || {};
  TD.views.meldingen = { render, teardown };
})(window.TD);
