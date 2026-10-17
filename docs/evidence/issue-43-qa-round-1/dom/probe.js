(() => {
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) };
  };
  const cs = (el, p) => (el ? getComputedStyle(el).getPropertyValue(p) : null);
  const shell = document.querySelector('.window-shell');
  const rail = document.querySelector('.rail');
  const sidebar = document.querySelector('.sidebar');
  const panel = document.querySelector('.right-panel');
  const dock = document.querySelector('.composer-dock');
  const send = document.querySelector('button[aria-label="Enviar"]');
  const toggles = Array.from(document.querySelectorAll('.rail button')).map((b) => ({ label: b.getAttribute('aria-label') || (b.textContent || '').trim(), pressed: b.getAttribute('aria-pressed') }));
  const region = (el) => {
    if (!el) return null;
    if (el.closest('.rail')) return 'rail';
    if (el.closest('.sidebar')) return 'sidebar';
    if (el.closest('.right-panel')) return 'right-panel';
    if (el.closest('.composer-dock')) return 'composer';
    if (el.closest('.main-pane')) return 'main-pane';
    return 'other';
  };
  const isAncestor = (a, b) => { let n = b; while (n) { if (n === a) return true; n = n.parentElement; } return false; };
  const visible = (el) => {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return false;
    let n = el;
    while (n) { if (n.hidden) return false; n = n.parentElement; }
    return true;
  };
  const scrollAncestor = (el) => {
    let n = el.parentElement;
    while (n && n !== document.body && n !== document.documentElement) {
      const s = getComputedStyle(n);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
      n = n.parentElement;
    }
    return null;
  };
  const interactive = Array.from(document.querySelectorAll('button, a[href], input, textarea, select, [role="button"]')).filter(visible);
  const covered = []; const clipped = []; const scrolledOut = []; const outside = [];
  for (const el of interactive) {
    const b = el.getBoundingClientRect();
    const label = (el.getAttribute('aria-label') || (el.textContent || '').trim()).slice(0, 44);
    const sc = scrollAncestor(el);
    if (sc) {
      const sr = sc.getBoundingClientRect();
      const cyy = b.top + b.height / 2;
      if (cyy < sr.top || cyy > sr.bottom) { scrolledOut.push({ region: region(el), label, scroller: String(sc.className).slice(0, 40) }); continue; }
    }
    const cx = Math.min(Math.max(b.left + b.width / 2, 0.5), window.innerWidth - 0.5);
    const cy = Math.min(Math.max(b.top + b.height / 2, 0.5), window.innerHeight - 0.5);
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) { outside.push({ region: region(el), label }); continue; }
    if (hit === el || el.contains(hit)) continue;
    if (isAncestor(hit, el)) { clipped.push({ region: region(el), label, by: hit.className ? String(hit.className).slice(0, 40) : hit.tagName }); continue; }
    covered.push({ region: region(el), label, hit: hit.className ? String(hit.className).slice(0, 44) : hit.tagName });
  }
  let sendHit = null;
  let sendInViewport = null;
  if (send) {
    const b = send.getBoundingClientRect();
    sendInViewport = b.left >= 0 && b.top >= 0 && b.right <= window.innerWidth && b.bottom <= window.innerHeight;
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    sendHit = hit === send || send.contains(hit) ? 'self' : (hit ? 'other:' + (hit.className || hit.tagName) : 'none');
  }
  const sc = (el) => (el ? { oy: getComputedStyle(el).overflowY, sy: el.scrollTop, sh: el.scrollHeight, ch: el.clientHeight } : null);
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    shell: r(shell),
    shellClass: shell ? shell.className : null,
    docOverflow: { x: document.documentElement.scrollWidth - document.documentElement.clientWidth, y: document.documentElement.scrollHeight - document.documentElement.clientHeight },
    rail: r(rail),
    sidebar: { present: !!sidebar, overlay: sidebar ? sidebar.classList.contains('sidebar--overlay') : null, position: cs(sidebar, 'position'), z: cs(sidebar, 'z-index'), rect: r(sidebar), content: sidebar ? sc(sidebar.querySelector('.sidebar__content')) : null },
    rightPanel: { present: !!panel, hidden: panel ? panel.hidden : null, overlay: panel ? panel.classList.contains('right-panel--overlay') : null, position: cs(panel, 'position'), z: cs(panel, 'z-index'), rect: r(panel) },
    dock: { rect: r(dock), z: cs(dock, 'z-index') },
    composerClearance: getComputedStyle(document.documentElement).getPropertyValue('--composer-clearance').trim(),
    send: { rect: r(send), inViewport: sendInViewport, hit: sendHit },
    toggles,
    activeElement: document.activeElement ? (document.activeElement.getAttribute('aria-label') || document.activeElement.className || document.activeElement.tagName) : null,
    covered, clipped, scrolledOut, outsideViewport: outside
  };
})()
