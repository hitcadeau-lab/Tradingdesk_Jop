// JSON ophalen van bronnen die de browser zelf niet mag lezen (CORS):
//  - Mac-app: via de app-schil (window.tdDesktop.fetchJSON)
//  - Preview: via de doorgeefserver van preview-server.py (/proxy?url=...)
//  - Anders: gewoon fetch (werkt alleen als de bron CORS toestaat)
window.TD = window.TD || {};
(function (TD) {
  const isPreview = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.protocol.startsWith("http");

  async function json(url) {
    if (window.tdDesktop && window.tdDesktop.fetchJSON) {
      try {
        return await window.tdDesktop.fetchJSON(url);
      } catch (e) {
        throw new Error(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
      }
    }
    const res = isPreview() ? await fetch("/proxy?url=" + encodeURIComponent(url)) : await fetch(url);
    // Oude preview zonder doorgeefserver: /proxy bestaat dan niet.
    if (isPreview() && (res.status === 404 || res.status === 501) && !(res.headers.get("content-type") || "").includes("json"))
      throw new Error("De preview-server is verouderd. Stop de preview (Ctrl+C) en start hem opnieuw met ./preview.sh.");
    if (!res.ok) throw new Error(`Koersdata niet beschikbaar (${res.status}).`);
    return res.json();
  }

  // Kan deze omgeving bronnen zonder CORS lezen?
  function canProxy() {
    return !!((window.tdDesktop && window.tdDesktop.fetchJSON) || isPreview());
  }

  TD.net = { json, canProxy };
})(window.TD);
