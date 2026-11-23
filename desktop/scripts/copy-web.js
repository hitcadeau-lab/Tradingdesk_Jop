// Kopieert de webapp (index.html, css/, js/) uit de hoofdmap naar desktop/web/,
// zodat de Mac-app een ingebouwde versie heeft. Draait voor `npm start` en `npm run dist`.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const out = path.resolve(__dirname, "..", "web");
const items = ["index.html", "css", "js"];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of items) {
  fs.cpSync(path.join(root, item), path.join(out, item), { recursive: true });
}

// Controleer dat de versies gelijk zijn, zodat updates correct vergeleken worden.
const pkg = require("../package.json");
const versionFile = fs.readFileSync(path.join(root, "js", "version.js"), "utf8");
const m = versionFile.match(/VERSION\s*=\s*"([^"]+)"/);
if (!m || m[1] !== pkg.version) {
  console.error(`Versie klopt niet: js/version.js = ${m && m[1]}, desktop/package.json = ${pkg.version}`);
  process.exit(1);
}
console.log(`Webapp ${pkg.version} gekopieerd naar ${out}`);
