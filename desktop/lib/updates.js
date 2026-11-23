// Updates van de app-inhoud (index.html, css, js) zonder de app opnieuw te installeren.
// Elke GitHub-release bevat latest.json:
//   { "version": "1.1.0", "minShell": 1, "web": "web-1.1.0.zip", "dmg": "Tradingdesk-1.1.0-mac.dmg", "notes": "..." }
// De app-schil (Electron) heeft een eigen shellVersion; is minShell hoger, dan moet je de nieuwe .dmg installeren.
const fs = require("fs");
const path = require("path");

function parse(v) {
  const m = String(v || "").trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? m.slice(1).map(Number) : null;
}

// -1 als a < b, 0 als gelijk, 1 als a > b. Ongeldige versies tellen als 0.0.0.
function compare(a, b) {
  const pa = parse(a) || [0, 0, 0];
  const pb = parse(b) || [0, 0, 0];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

// Welke web-versie moet de app laden: de ingebouwde, of een gedownloade die nieuwer is?
function pickWebDir({ builtinDir, builtinVersion, updatesDir, shellVersion }) {
  const fallback = { dir: builtinDir, version: builtinVersion, source: "builtin" };
  const metaFile = path.join(updatesDir, "current.json");
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    const dir = path.join(updatesDir, meta.version);
    if (
      parse(meta.version) &&
      compare(meta.version, builtinVersion) > 0 &&
      (meta.minShell || 1) <= shellVersion &&
      fs.existsSync(path.join(dir, "index.html"))
    ) {
      return { dir, version: meta.version, source: "update" };
    }
  } catch {
    /* geen of ongeldige update: ingebouwde versie gebruiken */
  }
  return fallback;
}

// Beoordeel een latest.json ten opzichte van wat er nu draait.
function evaluate(latest, { currentVersion, shellVersion }) {
  if (!latest || !parse(latest.version)) return { status: "invalid" };
  if (compare(latest.version, currentVersion) <= 0) return { status: "up-to-date", version: latest.version };
  if ((latest.minShell || 1) > shellVersion) return { status: "needs-dmg", version: latest.version, notes: latest.notes || "" };
  return { status: "web-update", version: latest.version, notes: latest.notes || "" };
}

module.exports = { parse, compare, pickWebDir, evaluate };
