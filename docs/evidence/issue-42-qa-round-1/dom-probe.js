(() => {
  const q = (s) => document.querySelector(s);
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: +r.x.toFixed(2),
      y: +r.y.toFixed(2),
      w: +r.width.toFixed(2),
      h: +r.height.toFixed(2),
      right: +r.right.toFixed(2),
      bottom: +r.bottom.toFixed(2),
    };
  };
  const box = (el, name) => {
    if (!el) return { name, present: false };
    const c = getComputedStyle(el);
    return {
      name,
      present: true,
      rect: rect(el),
      display: c.display,
      visibility: c.visibility,
      position: c.position,
      overflowX: c.overflowX,
      overflowY: c.overflowY,
      hiddenAttr: el.hasAttribute("hidden"),
    };
  };
  const rail = q(".rail");
  const buttons = rail
    ? Array.from(rail.querySelectorAll("button")).map((b, i) => ({
        i,
        label: b.getAttribute("aria-label"),
        pressed: b.getAttribute("aria-pressed"),
        current: b.getAttribute("aria-current"),
        role: b.getAttribute("role"),
        cls: b.className,
      }))
    : [];
  const text = document.body.innerText;
  const forbidden = [
    "Archivo",
    "Edición",
    "Ver",
    "Ayuda",
    "Atrás",
    "Adelante",
    "Minimizar",
    "Maximizar",
    "Cerrar",
  ];
  const de = document.documentElement;
  return {
    url: location.href,
    viewport: {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio,
    },
    fakeChromeNodes: {
      ".title-bar": document.querySelectorAll(".title-bar").length,
      ".menu-bar": document.querySelectorAll(".menu-bar").length,
      ".window-controls": document.querySelectorAll(".window-controls").length,
      ".nav-history": document.querySelectorAll(".nav-history").length,
    },
    forbiddenTextPresent: forbidden.filter((t) => text.includes(t)),
    railButtonCount: buttons.length,
    railButtons: buttons,
    regionBoxes: [
      box(q(".window-shell"), "window-shell"),
      box(q(".window-shell__body"), "window-shell__body"),
      box(rail, "rail"),
      box(q(".sidebar"), "sidebar"),
      box(q(".main-pane"), "main-pane"),
      box(q(".right-panel"), "right-panel"),
    ],
    docOverflow: {
      scrollWidth: de.scrollWidth,
      scrollHeight: de.scrollHeight,
      clientWidth: de.clientWidth,
      clientHeight: de.clientHeight,
      bodyScrollWidth: document.body.scrollWidth,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
    },
    homeTitle: q(".home-view__title")
      ? q(".home-view__title").textContent
      : null,
    composerPresent: !!q(".composer"),
  };
})();
