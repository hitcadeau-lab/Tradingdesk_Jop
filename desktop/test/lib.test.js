// Tests voor opslag en updates (draaien zonder Electron: `npm test`).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createStorage, defaultDataDir, KEEP_BACKUPS } = require("../lib/storage");
const { compare, pickWebDir, evaluate } = require("../lib/updates");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "td-test-"));

test("versies vergelijken", () => {
  assert.equal(compare("1.0.0", "1.0.1"), -1);
  assert.equal(compare("1.10.0", "1.9.9"), 1);
  assert.equal(compare("v2.0.0", "2.0.0"), 0);
  assert.equal(compare("onzin", "0.0.1"), -1);
});

test("latest.json beoordelen", () => {
  const cur = { currentVersion: "1.0.0", shellVersion: 1 };
  assert.equal(evaluate({ version: "1.0.0" }, cur).status, "up-to-date");
  assert.equal(evaluate({ version: "0.9.0" }, cur).status, "up-to-date");
  assert.equal(evaluate({ version: "1.1.0", minShell: 1 }, cur).status, "web-update");
  assert.equal(evaluate({ version: "2.0.0", minShell: 2 }, cur).status, "needs-dmg");
  assert.equal(evaluate({ version: "x" }, cur).status, "invalid");
});

test("juiste web-versie kiezen", () => {
  const updatesDir = tmp();
  const base = { builtinDir: "/app/web", builtinVersion: "1.0.0", updatesDir, shellVersion: 1 };
  assert.equal(pickWebDir(base).source, "builtin");
  fs.mkdirSync(path.join(updatesDir, "1.2.0"));
  fs.writeFileSync(path.join(updatesDir, "1.2.0", "index.html"), "<p>");
  fs.writeFileSync(path.join(updatesDir, "current.json"), JSON.stringify({ version: "1.2.0", minShell: 1 }));
  assert.deepEqual(pickWebDir(base), { dir: path.join(updatesDir, "1.2.0"), version: "1.2.0", source: "update" });
  // Ingebouwde versie nieuwer dan de download (na herinstallatie van een nieuwe .dmg)
  assert.equal(pickWebDir({ ...base, builtinVersion: "1.3.0" }).source, "builtin");
  // Download vraagt een nieuwere app-schil
  fs.writeFileSync(path.join(updatesDir, "current.json"), JSON.stringify({ version: "1.2.0", minShell: 2 }));
  assert.equal(pickWebDir(base).source, "builtin");
});

test("opslaan en teruglezen", () => {
  const s = createStorage(path.join(tmp(), "Tradingdesk"));
  assert.deepEqual(s.read(), {});
  const store = { "td.trades": [{ id: "t1", ticker: "BINANCE:BTCUSDT" }], "td.settings": { startingCapital: 1000 } };
  s.write(store);
  assert.deepEqual(s.read(), store);
  assert.ok(!fs.existsSync(s.file + ".tmp"));
});

test("kapot bestand wordt niet overschreven", () => {
  const s = createStorage(tmp());
  fs.writeFileSync(s.file, "{kapot");
  assert.throws(() => s.read(), /kon niet gelezen worden/);
  assert.equal(fs.readFileSync(s.file, "utf8"), "{kapot");
  assert.ok(fs.readdirSync(s.dir).some((f) => f.includes("-kapot-")));
});

test("dagelijkse back-ups, maximaal 30", () => {
  const s = createStorage(tmp());
  s.write({ a: 1 });
  for (let i = 0; i < KEEP_BACKUPS + 5; i++) s.dailyBackup(new Date(Date.UTC(2026, 0, 1 + i)));
  const files = fs.readdirSync(s.backupDir);
  assert.equal(files.length, KEEP_BACKUPS);
  assert.ok(files.includes("tradingdesk-data-2026-02-04.json"));
  assert.ok(!files.includes("tradingdesk-data-2026-01-01.json"));
});

test("iCloud-map als die bestaat, anders Documenten", () => {
  const home = tmp();
  assert.equal(defaultDataDir(home).icloud, false);
  assert.equal(defaultDataDir(home).dir, path.join(home, "Documents", "Tradingdesk"));
  fs.mkdirSync(path.join(home, "Library", "Mobile Documents", "com~apple~CloudDocs"), { recursive: true });
  assert.equal(defaultDataDir(home).icloud, true);
  assert.equal(defaultDataDir(home).dir, path.join(home, "Library", "Mobile Documents", "com~apple~CloudDocs", "Tradingdesk"));
});

test("map inspecteren en iCloud herkennen", () => {
  const { inspectDir, isICloud } = require("../lib/storage");
  const dir = tmp();
  assert.deepEqual(inspectDir(dir), { hasData: false, trades: 0 });
  createStorage(dir).write({ "td.trades": [{ id: 1 }, { id: 2 }] });
  assert.deepEqual(inspectDir(dir), { hasData: true, trades: 2 });
  assert.equal(isICloud("/Users/jop/Library/Mobile Documents/com~apple~CloudDocs/Trading", "/Users/jop"), true);
  assert.equal(isICloud("/Users/jop/Documents/Trading", "/Users/jop"), false);
});

// Kraken Futures: handtekening gelijk aan de Python-voorbeeldcode uit de Kraken-documentatie.
const krakenAuth = require("../lib/kraken-auth");
test("Kraken-handtekening volgens de documentatie", () => {
  const secret = Buffer.from([...Array(64).keys()]).toString("base64");
  assert.strictEqual(
    krakenAuth.sign("/derivatives/api/v3/accounts", "", "1700000000000", secret),
    "JTYYxznkCAFxb32G4rngnIEw5+qLj22qQ5OP7STP8jSIrbuRtriSbK+76RN+NQKlUMsL7Y59gc7eZclMTGfZiw=="
  );
  assert.strictEqual(
    krakenAuth.sign("/derivatives/api/v3/fills", "lastFillTime=2024-01-01T00:00:00.000Z", "1700000000001", secret),
    "emCyGW3HRuE8xmNQMupN4g+Mje5CFaFm+RWalgzAfJ2hZ3kK/mS9lDJCtDexHr9X/iRJLu0CabjtqYKDA/0Ogg=="
  );
});
test("Kraken: alleen lees-verzoeken, nonce stijgt, keys gecontroleerd", () => {
  for (const p of Object.values(krakenAuth.READ_ENDPOINTS)) assert.ok(!/sendorder|editorder|cancel|withdraw|transfer/i.test(p));
  const a = +krakenAuth.nextNonce(), b = +krakenAuth.nextNonce();
  assert.ok(b > a);
  assert.throws(() => krakenAuth.checkCreds("kort", "x"));
  const ok = krakenAuth.checkCreds("  " + "k".repeat(56) + " ", Buffer.alloc(64, 7).toString("base64"));
  assert.strictEqual(ok.key.length, 56);
  assert.strictEqual(krakenAuth.hint("abcdefghijkl"), "abcd…ijkl");
});
