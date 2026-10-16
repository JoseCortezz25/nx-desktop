import { spawn } from "node:child_process";
const CHROME =
  "/home/ajosecortes/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const PORT = 9336;
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
  out.structural = await ev(`(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
    const s = document.querySelector('.conversation-view__scroll');
    const act = document.querySelector('.message-actions');
    const groupBtn = document.querySelector('.tool-activity-group > .button');
    return {
      rail: r('.rail'),
      header: r('.conversation-view__header'),
      scrollBox: { clientH: s.clientHeight, scrollH: s.scrollHeight, scrollable: s.scrollHeight > s.clientHeight + 1 },
      messagesColumnH: r('.conversation-messages')?.h,
      actionsRowH: act ? Math.round(act.getBoundingClientRect().height) : null,
      groupBtnChevronPath: groupBtn.querySelector('svg path')?.getAttribute('d') ?? null,
      groupBtnFullText: groupBtn.textContent,
    };
  })()`);

  // Extreme title overflow probe (DOM-only).
  out.extremeTitle = await ev(`(() => {
    const h = document.querySelector('.conversation-view__header');
    const t = document.querySelector('.conversation-view__title');
    const before = { headerH: Math.round(h.getBoundingClientRect().height), titleH: Math.round(t.getBoundingClientRect().height) };
    t.textContent = 'TitleWithoutAnySpacesToForceAwkwardWrapping'.repeat(20);
    const b = t.getBoundingClientRect(), hb = h.getBoundingClientRect();
    const scroll = document.querySelector('.conversation-view__scroll').getBoundingClientRect();
    return {
      before,
      after: {
        titleH: Math.round(b.height),
        titleRight: Math.round(b.right),
        headerRight: Math.round(hb.right),
        headerH: Math.round(hb.height),
        spillsHeaderBottom: b.bottom > hb.bottom + 1,
        overlapsScrollTop: b.bottom > scroll.top + 1,
        scrollW: t.scrollWidth, clientW: t.clientWidth,
      },
    };
  })()`);
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.log("ERR", e);
}
ws.close();
chrome.kill("SIGKILL");
