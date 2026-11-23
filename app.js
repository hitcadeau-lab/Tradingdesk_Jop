// Tradingdesk: watchlist + TradingView grafiek en technische analyse.

const STORAGE_KEY = "tradingdesk.watchlist";
const SELECTED_KEY = "tradingdesk.selected";
const INTERVAL_KEY = "tradingdesk.interval";
const DEFAULT_LIST = ["NASDAQ:AAPL", "NASDAQ:NVDA", "EURONEXT:ASML"];

// Interval van de grafiek vertaald naar de interval-waarden van de TA-widget.
const TA_INTERVAL = {
  "5": "5m", "15": "15m", "60": "1h", "240": "4h", "D": "1D", "W": "1W", "M": "1M",
};

const els = {
  list: document.getElementById("list"),
  form: document.getElementById("add-form"),
  input: document.getElementById("add-input"),
  error: document.getElementById("add-error"),
  current: document.getElementById("current-symbol"),
  interval: document.getElementById("interval"),
  chart: document.getElementById("chart"),
  ta: document.getElementById("ta"),
};

// localStorage kan ontbreken (privévenster); de app werkt dan zonder onthouden.
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* niet erg */
  }
}

let watchlist = load(STORAGE_KEY, DEFAULT_LIST);
if (!Array.isArray(watchlist)) watchlist = [...DEFAULT_LIST];
let selected = load(SELECTED_KEY, watchlist[0] || null);
if (!watchlist.includes(selected)) selected = watchlist[0] || null;
let interval = load(INTERVAL_KEY, "D");
if (!(interval in TA_INTERVAL)) interval = "D";
els.interval.value = interval;

function normalize(input) {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

function renderList() {
  els.list.innerHTML = "";
  if (watchlist.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nog geen aandelen. Voeg er hierboven een toe.";
    els.list.appendChild(li);
    return;
  }
  for (const symbol of watchlist) {
    const li = document.createElement("li");
    li.className = symbol === selected ? "active" : "";
    li.title = "Toon " + symbol;

    const name = document.createElement("span");
    name.textContent = symbol;

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.title = "Verwijder " + symbol;
    remove.addEventListener("click", (e) => {
      e.stopPropagation();
      removeSymbol(symbol);
    });

    li.append(name, remove);
    li.addEventListener("click", () => select(symbol));
    els.list.appendChild(li);
  }
}

function renderChart() {
  els.chart.innerHTML = "";
  if (!selected) return;
  if (typeof TradingView === "undefined") {
    els.chart.textContent = "TradingView kon niet laden. Controleer je internetverbinding.";
    return;
  }
  new TradingView.widget({
    container_id: "chart",
    symbol: selected,
    interval,
    autosize: true,
    timezone: "Europe/Amsterdam",
    theme: "dark",
    style: "1",
    locale: "nl_NL",
    allow_symbol_change: false,
    hide_side_toolbar: false,
    withdateranges: true,
    studies: ["Volume@tv-basicstudies"],
  });
}

function renderTA() {
  els.ta.innerHTML = "";
  if (!selected) return;
  // De TA-widget leest zijn instellingen uit de inhoud van zijn eigen script-tag.
  const holder = document.createElement("div");
  holder.className = "tradingview-widget-container__widget";
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";
  script.async = true;
  script.textContent = JSON.stringify({
    symbol: selected,
    interval: TA_INTERVAL[interval],
    width: "100%",
    height: "100%",
    isTransparent: true,
    colorTheme: "dark",
    showIntervalTabs: true,
    displayMode: "single",
    locale: "nl_NL",
  });
  els.ta.className = "widget tradingview-widget-container";
  els.ta.append(holder, script);
}

function renderAll() {
  els.current.textContent = selected || "—";
  renderList();
  renderChart();
  renderTA();
}

function select(symbol) {
  if (symbol === selected) return;
  selected = symbol;
  save(SELECTED_KEY, selected);
  renderAll();
}

function removeSymbol(symbol) {
  watchlist = watchlist.filter((s) => s !== symbol);
  save(STORAGE_KEY, watchlist);
  if (selected === symbol) {
    selected = watchlist[0] || null;
    save(SELECTED_KEY, selected);
  }
  renderAll();
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const symbol = normalize(els.input.value);
  els.error.hidden = true;
  if (!symbol) return;
  if (!/^([A-Z0-9_]+:)?[A-Z0-9._!-]+$/.test(symbol)) {
    els.error.textContent = "Ongeldige ticker. Gebruik bijv. AAPL of NASDAQ:AAPL.";
    els.error.hidden = false;
    return;
  }
  if (watchlist.includes(symbol)) {
    els.error.textContent = symbol + " staat al in je watchlist.";
    els.error.hidden = false;
    return;
  }
  watchlist.push(symbol);
  save(STORAGE_KEY, watchlist);
  els.input.value = "";
  selected = symbol;
  save(SELECTED_KEY, selected);
  renderAll();
});

els.interval.addEventListener("change", () => {
  interval = els.interval.value;
  save(INTERVAL_KEY, interval);
  renderChart();
  renderTA();
});

renderAll();
