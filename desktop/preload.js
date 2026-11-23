// Veilige brug tussen de webapp en de Mac-app. De webapp ziet alleen window.tdDesktop.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tdDesktop", {
  // Synchroon bij het starten, zodat de app meteen met je data rendert.
  load: () => ipcRenderer.sendSync("td:load"),
  save: (store) => ipcRenderer.invoke("td:save", store),
  saveSync: (store) => ipcRenderer.sendSync("td:save-sync", store),
  info: () => ipcRenderer.invoke("td:info"),
  revealData: () => ipcRenderer.invoke("td:reveal"),
  openReleases: () => ipcRenderer.invoke("td:open-releases"),
  checkUpdate: () => ipcRenderer.invoke("td:check-update"),
  applyUpdate: () => ipcRenderer.invoke("td:apply-update"),
  saveFile: (name, content) => ipcRenderer.invoke("td:save-file", { name, content }),
  // Sinds app-schil 2: opslagmap wijzigen.
  chooseDataDir: () => ipcRenderer.invoke("td:choose-dir"),
  setDataDir: (dir, mode) => ipcRenderer.invoke("td:set-data-dir", { dir, mode }),
  revealBackups: () => ipcRenderer.invoke("td:reveal-backups"),
  // Sinds app-schil 3: koersdata (aandelen, Yahoo Finance) voor de Notifier.
  fetchJSON: (url) => ipcRenderer.invoke("td:fetch-json", url),
  onUpdateAvailable: (cb) => ipcRenderer.on("td:update-available", (_e, data) => cb(data)),
});
