// Alleen actief in de Mac-app: update-melding, en het paneel "App & opslag" in Portfolio.
(function (TD) {
  const d = window.tdDesktop;
  const { esc } = TD.util;

  function banner(r) {
    let el = document.getElementById("update-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "update-banner";
      el.className = "update-banner";
      document.querySelector(".topbar").after(el);
    }
    if (r.status === "web-update") {
      el.innerHTML = `<span><strong>Update beschikbaar: versie ${esc(r.version)}</strong>${r.notes ? " · " + esc(r.notes) : ""}</span>
        <span class="row gap"><button class="btn primary small" id="upd-install">Installeer update</button>
        <button class="btn small" id="upd-later">Later</button></span>`;
      el.querySelector("#upd-install").addEventListener("click", async (e) => {
        e.target.disabled = true;
        e.target.textContent = "Bezig met installeren…";
        try {
          await d.applyUpdate(); // de app herlaadt zichzelf met de nieuwe versie
        } catch (err) {
          el.innerHTML = `<span class="neg">Installeren mislukt: ${esc(err.message)}</span><button class="btn small" id="upd-later">Sluiten</button>`;
          el.querySelector("#upd-later").addEventListener("click", () => el.remove());
        }
      });
    } else if (r.status === "needs-dmg") {
      el.innerHTML = `<span><strong>Nieuwe app-versie ${esc(r.version)}</strong>: deze update vraagt een nieuwe installatie (.dmg).</span>
        <span class="row gap"><button class="btn primary small" id="upd-dmg">Download</button><button class="btn small" id="upd-later">Later</button></span>`;
      el.querySelector("#upd-dmg").addEventListener("click", () => d.openReleases());
    }
    const later = el.querySelector("#upd-later");
    if (later) later.addEventListener("click", () => el.remove());
  }

  // Paneel voor de Portfolio-pagina.
  function panelHTML() {
    if (!d) return "";
    const i = TD.store.desktopInfo() || {};
    return `<section class="panel" id="app-panel">
      <h2>App & opslag</h2>
      <dl class="dl">
        <dt>Versie</dt><dd>${esc(TD.VERSION)}${i.source === "update" ? ' <span class="muted">(bijgewerkt via update)</span>' : ""}</dd>
        <dt>Databestand</dt><dd class="wrap">${esc(i.dataFile || "—")} ${i.icloud ? '<span class="badge pos">iCloud</span>' : '<span class="badge warn">niet in iCloud</span>'}</dd>
        <dt>Back-ups</dt><dd class="wrap">${esc(i.backupDir || "—")} <span class="muted">(één per dag, laatste 30)</span></dd>
      </dl>
      <div class="row gap">
        <button class="btn small" id="app-reveal">Toon in Finder</button>
        <button class="btn small" id="app-check">Controleer op updates</button>
        <span class="muted small" id="app-check-out"></span>
      </div>
    </section>`;
  }

  function bindPanel(root) {
    if (!d) return;
    const reveal = root.querySelector("#app-reveal");
    if (!reveal) return;
    reveal.addEventListener("click", () => d.revealData());
    root.querySelector("#app-check").addEventListener("click", async () => {
      const out = root.querySelector("#app-check-out");
      out.textContent = "Controleren…";
      const r = await d.checkUpdate();
      if (r.status === "up-to-date") out.textContent = `Je hebt de nieuwste versie (${TD.VERSION}).`;
      else if (r.status === "web-update" || r.status === "needs-dmg") {
        out.textContent = "";
        banner(r);
      } else out.textContent = r.message || "Controleren mislukt.";
    });
  }

  if (d) {
    document.documentElement.classList.add("is-desktop");
    d.onUpdateAvailable(banner);
  }

  TD.desktopUI = { panelHTML, bindPanel };
})(window.TD);
