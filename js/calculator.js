// Rekenmachine (zwevend paneel). Rekent veilig, zonder eval: + − × ÷, haakjes, procenten
// en een komma of punt als decimaalteken. Toetsenbord werkt (Enter = uitkomst, Esc = sluiten).
window.TD = window.TD || {};
(function (TD) {
  // ---------- rekenen ----------
  function tokenize(src) {
    const s = String(src).replace(/×|x|\*/gi, "*").replace(/÷|:/g, "/").replace(/−/g, "-").replace(/\s+/g, "");
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/[0-9.,]/.test(ch)) {
        let j = i;
        while (j < s.length && /[0-9.,]/.test(s[j])) j++;
        let num = s.slice(i, j);
        // 1.234,56 (NL) → 1234.56 ; 1,5 → 1.5 ; 1.5 → 1.5
        if (num.includes(",") && num.includes(".")) num = num.replace(/\./g, "").replace(",", ".");
        else num = num.replace(",", ".");
        if (!/^\d*\.?\d+$|^\d+\.$/.test(num)) throw new Error("Ongeldig getal");
        out.push({ t: "n", v: parseFloat(num) });
        i = j;
      } else if ("+-*/()%^".includes(ch)) {
        out.push({ t: ch });
        i++;
      } else throw new Error(`Onbekend teken: ${ch}`);
    }
    return out;
  }
  // expr = term (('+'|'-') term)* ; term = power (('*'|'/') power)* ; power = unary ('^' power)?
  // unary = '-' unary | postfix ; postfix = atom '%'* ; atom = number | '(' expr ')'
  function evaluate(src) {
    const tk = tokenize(src);
    let p = 0;
    const peek = () => tk[p] && tk[p].t;
    const eat = (t) => {
      if (peek() !== t) throw new Error("Onvolledige som");
      p++;
    };
    function atom() {
      const k = tk[p];
      if (!k) throw new Error("Onvolledige som");
      if (k.t === "n") {
        p++;
        return k.v;
      }
      if (k.t === "(") {
        p++;
        const v = expr();
        eat(")");
        return v;
      }
      throw new Error("Onvolledige som");
    }
    function postfix() {
      let v = atom();
      while (peek() === "%") {
        p++;
        v /= 100;
      }
      return v;
    }
    function unary() {
      if (peek() === "-") {
        p++;
        return -unary();
      }
      if (peek() === "+") {
        p++;
        return unary();
      }
      return postfix();
    }
    function power() {
      const b = unary();
      if (peek() === "^") {
        p++;
        return Math.pow(b, power());
      }
      return b;
    }
    function term() {
      let v = power();
      while (peek() === "*" || peek() === "/") {
        const op = tk[p++].t;
        const r = power();
        if (op === "/" && r === 0) throw new Error("Delen door nul");
        v = op === "*" ? v * r : v / r;
      }
      return v;
    }
    function expr() {
      let v = term();
      while (peek() === "+" || peek() === "-") {
        const op = tk[p++].t;
        const r = term();
        v = op === "+" ? v + r : v - r;
      }
      return v;
    }
    if (!tk.length) throw new Error("Leeg");
    const v = expr();
    if (p !== tk.length) throw new Error("Onvolledige som");
    if (!isFinite(v)) throw new Error("Geen getal");
    return v;
  }
  const fmt = (v) => (+v.toPrecision(12)).toLocaleString("nl-NL", { maximumFractionDigits: 10 });

  // ---------- paneel ----------
  let panel = null;
  const history = [];
  function build() {
    panel = document.createElement("div");
    panel.className = "calc-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Rekenmachine");
    const keys = ["(", ")", "%", "C", "7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ",", "⌫", "+"];
    panel.innerHTML = `
      <div class="calc-head"><strong>Rekenmachine</strong><button type="button" class="icon" data-c="close" aria-label="Sluiten" title="Sluiten (Esc)">×</button></div>
      <input type="text" class="calc-in" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="bijv. 10000 × 1% ÷ (64000 − 62720)">
      <div class="calc-out" aria-live="polite">&nbsp;</div>
      <div class="calc-keys">${keys.map((k) => `<button type="button" data-k="${k}" class="${/[÷×−+%()]/.test(k) ? "op" : k === "C" || k === "⌫" ? "fn" : ""}">${k}</button>`).join("")}
        <button type="button" data-k="=" class="eq">=</button></div>
      <ol class="calc-hist"></ol>
      <p class="muted small">Tip: typ gewoon je som. Komma of punt mag; <code>%</code> betekent ÷100.</p>`;
    document.body.appendChild(panel);
    const input = panel.querySelector(".calc-in");
    const out = panel.querySelector(".calc-out");
    const hist = panel.querySelector(".calc-hist");
    const live = () => {
      try {
        out.textContent = input.value.trim() ? "= " + fmt(evaluate(input.value)) : " ";
        out.classList.remove("err");
      } catch {
        out.textContent = " ";
      }
    };
    const run = () => {
      if (!input.value.trim()) return;
      try {
        const v = evaluate(input.value);
        history.unshift(`${input.value} = ${fmt(v)}`);
        history.splice(6);
        hist.innerHTML = history.map((h) => `<li>${TD.util.esc(h)}</li>`).join("");
        input.value = fmt(v).replace(/\./g, "");
        out.textContent = " ";
      } catch (e) {
        out.textContent = e.message;
        out.classList.add("err");
      }
      input.focus();
    };
    panel.querySelectorAll("[data-k]").forEach((b) =>
      b.addEventListener("click", () => {
        const k = b.dataset.k;
        if (k === "=") return run();
        if (k === "C") input.value = "";
        else if (k === "⌫") input.value = input.value.slice(0, -1);
        else input.value += k;
        live();
        input.focus();
      })
    );
    input.addEventListener("input", live);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        run();
      }
      if (e.key === "Escape") close();
      e.stopPropagation();
    });
    panel.querySelector("[data-c=close]").addEventListener("click", close);
    hist.addEventListener("click", (e) => {
      const li = e.target.closest("li");
      if (li) {
        input.value = li.textContent.split(" = ").pop().replace(/\./g, "");
        live();
        input.focus();
      }
    });
  }
  function open() {
    if (!panel) build();
    panel.hidden = false;
    panel.querySelector(".calc-in").focus();
  }
  function close() {
    if (panel) panel.hidden = true;
  }
  function toggle() {
    if (panel && !panel.hidden) close();
    else open();
  }
  window.addEventListener("hashchange", () => {
    if (!location.hash.startsWith("#/leerschool")) close();
  });

  TD.calculator = { open, close, toggle, evaluate };
})(window.TD);
