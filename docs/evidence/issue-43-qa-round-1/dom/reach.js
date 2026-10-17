(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => { const b = el.getBoundingClientRect(); if (b.width === 0 || b.height === 0) return false; let n = el; while (n) { if (n.hidden) return false; n = n.parentElement; } return true; };
  const targets = ['.rail button', '.composer-dock button', '.composer-dock textarea', '.sidebar button', '.right-panel button'];
  const report = { checked: 0, unreachable: [] };
  for (const sel of targets) {
    const els = Array.from(document.querySelectorAll(sel)).filter(visible);
    for (const el of els) {
      try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
      await sleep(25);
      const b = el.getBoundingClientRect();
      const cx = Math.min(Math.max(b.left + b.width / 2, 0.5), window.innerWidth - 0.5);
      const cy = Math.min(Math.max(b.top + b.height / 2, 0.5), window.innerHeight - 0.5);
      const hit = document.elementFromPoint(cx, cy);
      report.checked++;
      const label = (el.getAttribute('aria-label') || (el.textContent || '').trim()).slice(0, 40);
      if (!hit || !(hit === el || el.contains(hit))) {
        report.unreachable.push({ sel, label, hit: hit ? String(hit.className).slice(0, 40) : 'none', inViewport: b.top >= -1 && b.bottom <= window.innerHeight + 1 });
      }
    }
  }
  return report;
})()
