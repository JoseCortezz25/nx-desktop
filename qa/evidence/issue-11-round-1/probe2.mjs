import { spawn } from "node:child_process";
const CHROME =
  "/home/ajosecortes/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const PORT = 9335;
const APP = "http://localhost:1420/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);
async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (r.ok) {
        const t = await r.json();
        const p = t.find((x) => x.type === "page");
        if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error("no target");
}
const ws = new WebSocket(await target());
await new Promise((res, rej) => {
  ws.addEventListener("open", res);
  ws.addEventListener("error", rej);
});
let id = 0;
const pend = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    const { resolve, reject } = pend.get(m.id);
    pend.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    pend.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
async function ev(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails)
    throw new Error(JSON.stringify(r.exceptionDetails.exception?.description));
  return r.result.value;
}

const SCAN = `(() => {
  const rootEl = document.getElementById('root');
  const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'));
  const start = key ? rootEl[key] : null;
  const results = [];
  const visited = { n: 0 };
  const walk = (f, depth) => {
    while (f) {
      visited.n++;
      const t = f.type;
      const nm = typeof t === 'function' ? (t.displayName || t.name) : (typeof t === 'string' ? t : (t && t.render ? (t.render.displayName || t.render.name) : null));
      const props = f.memoizedProps;
      if (props && typeof props === 'object' && props.openFileRequest && typeof props.openFileRequest.path === 'string') {
        results.push({ via: 'prop.openFileRequest', component: nm, value: JSON.stringify(props.openFileRequest) });
      }
      if (typeof t === 'function') {
        let h = f.memoizedState, i = 0;
        while (h && i < 120) {
          const v = h.memoizedState;
          if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.path === 'string') {
            results.push({ via: 'hookState', component: nm, value: JSON.stringify(v), keys: Object.keys(v) });
          }
          h = h.next; i++;
        }
        if (nm === 'AppShell') {
          results.push({ via: 'AppShell-hook-dump', component: nm, hasAlternate: !!f.alternate, hooks: (() => {
            const out = []; let h2 = f.memoizedState, j = 0;
            while (h2 && j < 120) { const v = h2.memoizedState; out.push({ idx: j, type: v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v), json: (() => { try { return JSON.stringify(v); } catch { return '<unserializable>'; } })(), ctor: v && v.constructor ? v.constructor.name : null }); h2 = h2.next; j++; }
            return out;
          })() });
        }
      }
      if (f.child) walk(f.child, depth + 1);
      f = f.sibling;
    }
  };
  walk(start, 0);
  return { visited: visited.n, results };
})()`;

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: APP });
  await sleep(1800);
  await ev(
    `document.querySelector('[aria-label="Alternar barra lateral"]').click(); true`,
  );
  await sleep(400);
  await ev(
    `[...document.querySelectorAll('.conversation-row__title')].find(e=>e.textContent==='Composer selection chain').closest('button').click(); true`,
  );
  await sleep(700);

  const out = {};
  out.before = await ev(SCAN);
  await ev(
    `[...document.querySelectorAll('.file-chip')].find(c=>c.getAttribute('aria-label')==='Abrir src/shared/domain/selection-chain.ts').click(); true`,
  );
  await sleep(600);
  out.afterChip1 = await ev(SCAN);
  await ev(
    `[...document.querySelectorAll('.file-chip')].find(c=>c.getAttribute('aria-label')==='Abrir src/features/providers/hooks/use-composer-selection.ts').click(); true`,
  );
  await sleep(600);
  out.afterChip2 = await ev(SCAN);

  // Provider popover structure (to fix the Codex click).
  await ev(
    `document.querySelector('[aria-label="Alternar barra lateral"]').click(); true`,
  );
  await sleep(300);
  await ev(
    `document.querySelector('[aria-label^="Proveedor:"]').click(); true`,
  );
  await sleep(400);
  out.providerPopover = await ev(`(() => {
    const opts = [...document.querySelectorAll('[role="option"]')].map((o) => ({ label: o.getAttribute('aria-label'), text: o.textContent }));
    const trigger = document.querySelector('[aria-label^="Proveedor:"]');
    return { optionCount: opts.length, options: opts, triggerExpanded: trigger ? trigger.getAttribute('aria-expanded') : null };
  })()`);
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.log("ERR", e);
}
ws.close();
chrome.kill("SIGKILL");
