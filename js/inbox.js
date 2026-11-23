// Meldingen-centrum: één lijst met alle meldingen (trade-levels en Notifier-setups),
// met gelezen/ongelezen, verwijderen en macOS-meldingen.
(function (TD) {
  const S = TD.store;
  const KEY = "td.inbox";
  const KEY_CONF = "td.alerts";
  const MAX = 300;
  const listeners = new Set();

  function all() {
    const a = S._load(KEY, []);
    return Array.isArray(a) ? a : [];
  }
  function save(list) {
    S._save(KEY, list.slice(0, MAX));
    emit();
  }
  function getConfig() {
    return { trades: true, desktop: false, intervalMin: 2, ...(S._load(KEY_CONF, null) || {}) };
  }
  function setConfig(patch) {
    S._save(KEY_CONF, { ...getConfig(), ...patch });
    emit();
  }

  // item: { key (uniek, voorkomt dubbele meldingen), kind ("tp"|"sl"|"be"|"setup"), title, body, link, at }
  function add(item) {
    const list = all();
    if (item.key && list.some((x) => x.key === item.key)) return null;
    const n = { id: "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), read: false, ...item };
    list.unshift(n);
    save(list);
    if (!item.silent) desktop(n);
    return n;
  }

  function desktop(n) {
    if (!getConfig().desktop || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const notif = new Notification(n.title, { body: n.body || "", tag: n.key || n.id });
      notif.onclick = () => {
        window.focus();
        markRead(n.id, true);
        if (n.link) location.hash = n.link;
      };
    } catch {
      /* meldingen niet beschikbaar */
    }
  }

  function markRead(id, read = true) {
    const list = all();
    const n = list.find((x) => x.id === id);
    if (!n || n.read === read) return;
    n.read = read;
    save(list);
  }
  function markAllRead() {
    const list = all();
    if (!list.some((x) => !x.read)) return;
    list.forEach((x) => (x.read = true));
    save(list);
  }
  function remove(id) {
    save(all().filter((x) => x.id !== id));
  }
  function removeRead() {
    save(all().filter((x) => !x.read));
  }
  function unreadCount() {
    return all().filter((x) => !x.read).length;
  }

  async function requestPermission() {
    if (typeof Notification === "undefined") return "unsupported";
    if (Notification.permission === "granted") return "granted";
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function emit() {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        /* negeren */
      }
    }
  }

  TD.inbox = { all, add, markRead, markAllRead, remove, removeRead, unreadCount, getConfig, setConfig, requestPermission, onChange };
})(window.TD);
