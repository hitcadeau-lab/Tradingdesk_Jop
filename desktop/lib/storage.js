// Opslag van alle Tradingdesk-data in één JSON-bestand, bij voorkeur in iCloud Drive.
// Schrijven gebeurt atomair (eerst naar .tmp, dan hernoemen) en elke dag komt er een back-up bij.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const FILE = "tradingdesk-data.json";
const KEEP_BACKUPS = 30;

// iCloud Drive staat op de Mac in ~/Library/Mobile Documents/com~apple~CloudDocs.
function defaultDataDir(home = os.homedir()) {
  const icloud = path.join(home, "Library", "Mobile Documents", "com~apple~CloudDocs");
  if (fs.existsSync(icloud)) return { dir: path.join(icloud, "Tradingdesk"), icloud: true };
  return { dir: path.join(home, "Documents", "Tradingdesk"), icloud: false };
}

// iCloud kan een bestand "uit de cloud" laten staan (alleen een .icloud-placeholder).
// Dan vragen we macOS het eerst te downloaden.
function ensureDownloaded(file) {
  if (fs.existsSync(file)) return;
  const placeholder = path.join(path.dirname(file), "." + path.basename(file) + ".icloud");
  if (!fs.existsSync(placeholder)) return;
  try {
    execFileSync("brctl", ["download", file], { timeout: 5000 });
  } catch {
    /* brctl niet beschikbaar: dan wachten we gewoon even */
  }
  const until = Date.now() + 15000;
  while (!fs.existsSync(file) && Date.now() < until) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
}

function createStorage(dir) {
  const file = path.join(dir, FILE);
  const backupDir = path.join(dir, "backups");

  function read() {
    fs.mkdirSync(dir, { recursive: true });
    ensureDownloaded(file);
    if (!fs.existsSync(file)) return {};
    const text = fs.readFileSync(file, "utf8");
    try {
      const data = JSON.parse(text);
      return data && typeof data === "object" && data.store && typeof data.store === "object" ? data.store : {};
    } catch (e) {
      // Kapot bestand: bewaar het apart en begin niet stilletjes opnieuw.
      const broken = file.replace(/\.json$/, `-kapot-${Date.now()}.json`);
      fs.copyFileSync(file, broken);
      throw new Error(`Het databestand kon niet gelezen worden. Een kopie staat in ${broken}. Zet een back-up terug uit ${backupDir}.`);
    }
  }

  function write(store) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + ".tmp";
    const payload = JSON.stringify({ app: "Tradingdesk", savedAt: new Date().toISOString(), store }, null, 1);
    fs.writeFileSync(tmp, payload, "utf8");
    fs.renameSync(tmp, file);
  }

  // Eén back-up per dag (bij het starten), de oudste worden opgeruimd.
  function dailyBackup(now = new Date()) {
    if (!fs.existsSync(file)) return null;
    fs.mkdirSync(backupDir, { recursive: true });
    const day = now.toISOString().slice(0, 10);
    const target = path.join(backupDir, `tradingdesk-data-${day}.json`);
    if (!fs.existsSync(target)) fs.copyFileSync(file, target);
    const all = fs
      .readdirSync(backupDir)
      .filter((f) => /^tradingdesk-data-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) fs.rmSync(path.join(backupDir, old));
    return target;
  }

  return { dir, file, backupDir, read, write, dailyBackup };
}

// Staat er al Tradingdesk-data in een map? (voor het wisselen van opslagmap)
function inspectDir(dir) {
  const file = path.join(dir, FILE);
  ensureDownloaded(file);
  if (!fs.existsSync(file)) return { hasData: false, trades: 0 };
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    const trades = d && d.store && Array.isArray(d.store["td.trades"]) ? d.store["td.trades"].length : 0;
    return { hasData: true, trades };
  } catch {
    return { hasData: true, trades: 0, broken: true };
  }
}

// Ligt een map in iCloud Drive?
function isICloud(dir, home = os.homedir()) {
  const icloud = path.join(home, "Library", "Mobile Documents") + path.sep;
  return (path.resolve(dir) + path.sep).startsWith(icloud);
}

module.exports = { defaultDataDir, createStorage, inspectDir, isICloud, FILE, KEEP_BACKUPS };
