// Tooltip voor elk element met data-tip: direct zichtbaar bij hover of focus,
// en altijd binnen het venster (ook in tabellen en panelen die afsnijden).
window.TD = window.TD || {};
(function () {
  let tip = null, cur = null;
  function show(el) {
    const text = el.getAttribute("data-tip");
    if (!text) return;
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "tooltip";
      tip.setAttribute("role", "tooltip");
      document.body.appendChild(tip);
    }
    cur = el;
    tip.textContent = text;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight, m = 8;
    let left = Math.min(Math.max(m, r.left), window.innerWidth - w - m);
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - m) top = Math.max(m, r.top - h - 8);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hide() {
    if (tip) tip.hidden = true;
    cur = null;
  }
  const target = (e) => e.target && e.target.closest && e.target.closest("[data-tip]");
  document.addEventListener("mouseover", (e) => {
    const el = target(e);
    if (el && el !== cur) show(el);
    else if (!el && cur) hide();
  });
  document.addEventListener("focusin", (e) => {
    const el = target(e);
    if (el) show(el);
  });
  document.addEventListener("focusout", hide);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("hashchange", hide);
})();
