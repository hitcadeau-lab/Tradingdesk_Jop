// Kleine hulpfuncties: HTML-escaping, opmaak van getallen en datums.
window.TD = window.TD || {};

(function (TD) {
  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function money(v, cur) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    const c = cur ?? TD.store.getSettings().currency;
    const sign = v < 0 ? "-" : "";
    return sign + c + Math.abs(v).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function pct(v, digits = 1) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return (v * 100).toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + "%";
  }

  function num(v, digits = 2) {
    if (v === null || v === undefined || v === "" || isNaN(v)) return "—";
    if (!isFinite(v)) return "∞";
    return (+v).toLocaleString("nl-NL", { maximumFractionDigits: digits });
  }

  function r(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return (v >= 0 ? "" : "-") + Math.abs(v).toFixed(2) + "R";
  }

  function date(v, withTime) {
    if (!v) return "—";
    const d = new Date(v);
    if (isNaN(d)) return v;
    return d.toLocaleString("nl-NL", withTime
      ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short", year: "numeric" });
  }

  // "BINANCE:BTCUSDT" -> "BTCUSDT"
  function shortSym(s) {
    return String(s || "").split(":").pop();
  }

  function signClass(v) {
    return v > 0 ? "pos" : v < 0 ? "neg" : "";
  }

  // Huidige datum/tijd in het formaat van <input type="datetime-local">.
  function nowLocal() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  // Verklein een geüploade afbeelding zodat hij in de browseropslag past.
  function compressImage(file, maxSize = 1280, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  TD.util = { esc, money, pct, num, r, date, shortSym, signClass, nowLocal, download, compressImage };
})(window.TD);
