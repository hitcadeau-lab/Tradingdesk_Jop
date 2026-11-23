// Alleen actief in de Mac-app: de melding bovenaan als er een update is.
// (Opslag en updates beheer je verder via Instellingen.)
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
      el.innerHTML = `<span><strong>Nieuwe app-versie ${esc(r.version)}</strong>: deze update vraagt een nieuwe installatie (.dmg). Je data blijft staan.</span>
        <span class="row gap"><button class="btn primary small" id="upd-dmg">Download</button><button class="btn small" id="upd-later">Later</button></span>`;
      el.querySelector("#upd-dmg").addEventListener("click", () => d.openReleases());
    }
    const later = el.querySelector("#upd-later");
    if (later) later.addEventListener("click", () => el.remove());
  }

  if (d) {
    document.documentElement.classList.add("is-desktop");
    d.onUpdateAvailable(banner);
  }

  TD.desktopUI = { banner };
})(window.TD);
