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
  const de = document.documentElement;
  return {
    url: location.href,
    viewport: {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio,
    },
    boxes: [
      ["window", rect(q(".window"))],
      ["titlebar", rect(q(".titlebar"))],
      ["body", rect(q(".body"))],
      ["rail", rect(q(".rail"))],
      ["sidebar", rect(q(".sidebar"))],
      ["main", rect(q(".main"))],
    ],
    docOverflow: {
      scrollWidth: de.scrollWidth,
      scrollHeight: de.scrollHeight,
      clientWidth: de.clientWidth,
      clientHeight: de.clientHeight,
    },
    titlebarHeight: q(".titlebar")
      ? getComputedStyle(q(".titlebar")).height
      : null,
    railIcons: q(".rail") ? q(".rail").querySelectorAll(".icon").length : null,
  };
})();
