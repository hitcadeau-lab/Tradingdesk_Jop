// Tradingdesk voor macOS (Electron).
// - Laadt de webapp (ingebouwd of een nieuwere gedownloade versie).
// - Bewaart alle data in iCloud Drive/Tradingdesk/tradingdesk-data.json (met dagelijkse back-ups).
// - Controleert GitHub Releases op updates en installeert nieuwe app-inhoud met één klik.
const { app, BrowserWindow, ipcMain, shell, dialog, net } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { defaultDataDir, createStorage } = require("./lib/storage");
const { pickWebDir, evaluate } = require("./lib/updates");
const pkg = require("./package.json");

const REPO = pkg.tradingdesk.repo;
const SHELL_VERSION = pkg.tradingdesk.shellVersion;
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
// TD_UPDATE_API en TD_HOME zijn alleen voor tests (lokale update-server, tijdelijke thuismap).
const API_LATEST = process.env.TD_UPDATE_API || `https://api.github.com/repos/${REPO}/releases/latest`;

let win = null;
let storage = null;
let cache = {};
let web = null;
let lastCheck = null;

function updatesDir() {
  return path.join(app.getPath("userData"), "web-updates");
}

function currentWeb() {
  return pickWebDir({
    builtinDir: path.join(__dirname, "web"),
    builtinVersion: pkg.version,
    updatesDir: updatesDir(),
    shellVersion: SHELL_VERSION,
  });
}

function info() {
  return {
    version: web.version,
    source: web.source,
    shellVersion: SHELL_VERSION,
    appVersion: pkg.version,
    dataFile: storage.file,
    backupDir: storage.backupDir,
    icloud: storage.icloud,
    releasesUrl: RELEASES_URL,
  };
}

// ---------- opslag ----------
function initStorage() {
  const { dir, icloud } = defaultDataDir(process.env.TD_HOME || undefined);
  storage = createStorage(dir);
  storage.icloud = icloud;
  try {
    storage.dailyBackup();
    cache = storage.read();
  } catch (e) {
    dialog.showErrorBox("Tradingdesk: data niet gelezen", e.message);
    cache = {};
    storage.readOnly = true; // niets overschrijven tot het probleem is opgelost
  }
}

function persist(store) {
  if (storage.readOnly) return false;
  cache = store && typeof store === "object" ? store : {};
  storage.write(cache);
  return true;
}

// ---------- updates ----------
async function fetchJSON(url) {
  const res = await net.fetch(url, { headers: { "User-Agent": "Tradingdesk-App", Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub antwoordde met ${res.status}`);
  return res.json();
}

async function checkForUpdate() {
  try {
    const release = await fetchJSON(API_LATEST);
    const asset = (name) => (release.assets || []).find((a) => a.name === name);
    const latestAsset = asset("latest.json");
    if (!latestAsset) return (lastCheck = { status: "invalid", message: "Deze release heeft geen latest.json." });
    const latest = await fetchJSON(latestAsset.browser_download_url);
    const result = evaluate(latest, { currentVersion: web.version, shellVersion: SHELL_VERSION });
    const webAsset = latest.web && asset(latest.web);
    lastCheck = { ...result, webUrl: webAsset && webAsset.browser_download_url, minShell: latest.minShell || 1, releaseUrl: release.html_url };
    return lastCheck;
  } catch (e) {
    return (lastCheck = {
      status: "error",
      message: /404/.test(e.message)
        ? "Nog geen release gevonden. Is de repository openbaar en is er al een release gebouwd?"
        : `Controleren mislukt: ${e.message}`,
    });
  }
}

function unzip(zipFile, dest) {
  if (process.platform === "darwin") execFileSync("ditto", ["-x", "-k", zipFile, dest]);
  else execFileSync("unzip", ["-q", "-o", zipFile, "-d", dest]);
}

async function applyUpdate() {
  const check = lastCheck && lastCheck.status === "web-update" ? lastCheck : await checkForUpdate();
  if (check.status !== "web-update" || !check.webUrl) throw new Error("Er is geen update om te installeren.");
  const res = await net.fetch(check.webUrl, { headers: { "User-Agent": "Tradingdesk-App" } });
  if (!res.ok) throw new Error(`Downloaden mislukt (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmpZip = path.join(os.tmpdir(), `tradingdesk-web-${check.version}.zip`);
  fs.writeFileSync(tmpZip, buf);
  const dest = path.join(updatesDir(), check.version);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  unzip(tmpZip, dest);
  fs.rmSync(tmpZip, { force: true });
  // Controleer dat de download compleet is en de juiste versie bevat.
  const versionFile = path.join(dest, "js", "version.js");
  if (!fs.existsSync(path.join(dest, "index.html")) || !fs.existsSync(versionFile) || !fs.readFileSync(versionFile, "utf8").includes(`"${check.version}"`)) {
    fs.rmSync(dest, { recursive: true, force: true });
    throw new Error("De gedownloade update is onvolledig. Probeer het later opnieuw.");
  }
  fs.writeFileSync(path.join(updatesDir(), "current.json"), JSON.stringify({ version: check.version, minShell: check.minShell, installedAt: new Date().toISOString() }));
  // Oude gedownloade versies opruimen.
  for (const d of fs.readdirSync(updatesDir())) {
    if (d !== check.version && d !== "current.json") fs.rmSync(path.join(updatesDir(), d), { recursive: true, force: true });
  }
  web = currentWeb();
  setTimeout(() => win && win.loadFile(path.join(web.dir, "index.html")), 300);
  return { version: web.version };
}

// ---------- venster ----------
function createWindow() {
  web = currentWeb();
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: "Tradingdesk",
    backgroundColor: "#0f1115",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(web.dir, "index.html"));

  // Lukt een gedownloade versie niet, val dan terug op de ingebouwde.
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    if (web.source === "update" && url.startsWith("file:")) {
      fs.rmSync(path.join(updatesDir(), "current.json"), { force: true });
      web = currentWeb();
      win.loadFile(path.join(web.dir, "index.html"));
    }
  });

  // Externe links (TradingView, GitHub) openen in je gewone browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file:")) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  // Automatisch op updates controleren, kort na het starten.
  win.webContents.once("did-finish-load", () => {
    setTimeout(async () => {
      const r = await checkForUpdate();
      if (win && (r.status === "web-update" || r.status === "needs-dmg")) win.webContents.send("td:update-available", r);
    }, 4000);
  });
}

// ---------- IPC (de brug naar de webapp, zie preload.js) ----------
ipcMain.on("td:load", (e) => {
  e.returnValue = { store: cache, info: info() };
});
ipcMain.handle("td:save", (_e, store) => persist(store));
ipcMain.on("td:save-sync", (e, store) => {
  try {
    e.returnValue = persist(store);
  } catch {
    e.returnValue = false;
  }
});
ipcMain.handle("td:info", () => info());
ipcMain.handle("td:reveal", () => shell.showItemInFolder(storage.file));
ipcMain.handle("td:open-releases", () => shell.openExternal((lastCheck && lastCheck.releaseUrl) || RELEASES_URL));
ipcMain.handle("td:check-update", () => checkForUpdate());
ipcMain.handle("td:apply-update", () => applyUpdate());
ipcMain.handle("td:save-file", async (_e, { name, content }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath("downloads"), name) });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, content, "utf8");
  return r.filePath;
});

app.setName("Tradingdesk");
app.whenReady().then(() => {
  initStorage();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
