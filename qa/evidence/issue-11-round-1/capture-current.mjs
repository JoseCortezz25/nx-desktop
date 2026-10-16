// QA round 2 — issue #11 / PR #38. Drives the running app over raw CDP
// (headless Chromium from the Playwright cache; no browser MCP in this env).
//
// Produces: current captures for the conversation region in BOTH sidebar states
// @1440x900, plus the *observed* open-file payload read from the running shell's
// React state (no shipped source touched), the collapse round trip, the
// actions/meta affordances, the composer-draft behaviour across the view switch,
// and a long-content overflow probe (DOM-only, page reloaded afterwards).
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const CHROME =
  "/home/ajosecortes/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const PORT = 9334;
const APP = "http://localhost:1420/";
const OUT = "/tmp/opencode/qa/issue-11";
const SHOTS = `${OUT}/shots`;
mkdirSync(SHOTS, { recursive: true });

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

async function getPageTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (res.ok) {
        const targets = await res.json();
        const page = targets.find((t) => t.type === "page");
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error("chromium page target never appeared");
}

const wsUrl = await getPageTarget();
const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", () => resolve());
  ws.addEventListener("error", () => reject(new Error("ws error")));
});

let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      "evaluate failed: " +
        JSON.stringify(
          result.exceptionDetails.exception?.description ??
            result.exceptionDetails,
        ),
    );
  }
  return result.result.value;
}

async function shotViewport(name) {
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const file = `${SHOTS}/${name}`;
  writeFileSync(file, Buffer.from(data, "base64"));
  return file;
}

async function shotClip(name, selector) {
  const rect = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`);
  if (!rect) throw new Error("clip target not found: " + selector);
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: {
      x: Math.max(0, Math.floor(rect.x)),
      y: Math.max(0, Math.floor(rect.y)),
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      scale: 1,
    },
  });
  const file = `${SHOTS}/${name}`;
  writeFileSync(file, Buffer.from(data, "base64"));
  return { file, rect };
}

// --- The payload reader: a React DOM node keeps the fiber instance from node
// creation, so any single-fiber walk can land on the *alternate* and read the
// previous commit's state. This reads both the fiber and its alternate — from
// the container root and that root's alternate — and reconciles the candidates
// against the DOM's own active-chip marking (the user-visible truth). Read-only.
const READ_PAYLOAD = `(() => {
  const safe = (v) => { try { return v === null ? null : JSON.parse(JSON.stringify(v)); } catch { return '<unserializable>'; } };
  const rootEl = document.getElementById('root');
  const cKey = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'));
  const containerRoot = cKey ? rootEl[cKey] : null;
  const starts = [];
  if (containerRoot) starts.push({ root: 'container-current', f: containerRoot });
  if (containerRoot && containerRoot.alternate) starts.push({ root: 'container-alternate', f: containerRoot.alternate });

  const candidates = [];
  const cmProps = [];
  const cvProps = [];
  for (const { root, f: start } of starts) {
    const walk = (f) => {
      while (f) {
        const t = f.type;
        const nm = typeof t === 'function' ? (t.displayName || t.name) : null;
        if (nm === 'AppShell' || nm === 'ConversationMessages' || nm === 'ConversationView') {
          for (const [tag, fib] of [['fiber', f], ['alternate', f.alternate]]) {
            if (!fib) continue;
            if (nm === 'AppShell') {
              let h = fib.memoizedState, i = 0;
              while (h && i < 120) {
                if (i === 2) candidates.push({ source: root + '/' + tag, value: safe(h.memoizedState) });
                h = h.next; i++;
              }
            } else if (fib.memoizedProps && 'openFileRequest' in fib.memoizedProps) {
              const p = fib.memoizedProps.openFileRequest;
              (nm === 'ConversationMessages' ? cmProps : cvProps).push({ source: root + '/' + tag, value: p === null ? null : safe(p) });
            }
          }
        }
        if (f.child) walk(f.child);
        f = f.sibling;
      }
    };
    walk(start);
  }

  const domActive = [...document.querySelectorAll('.file-chip--active')].map((c) => c.getAttribute('aria-label'));
  const domActivePaths = domActive.map((l) => (l || '').replace(/^Abrir /, ''));
  const settled = candidates.find((c) => c.value && typeof c.value.path === 'string' && domActivePaths.includes(c.value.path)) || candidates.find((c) => c.value && typeof c.value.path === 'string') || null;
  return {
    appShellOpenFileCandidates: candidates,
    conversationMessagesOpenFileProp: cmProps,
    conversationViewOpenFileProp: cvProps,
    domActiveChipLabels: domActive,
    settledOpenFileRequest: settled ? settled.value : null,
    settledKeys: settled ? Object.keys(settled.value) : null,
    settledSource: settled ? settled.source : null,
  };
})()`;

const MEASURE = `(() => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) };
  };
  const overflow = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return { scrollW: el.scrollWidth, clientW: el.clientWidth, overflowX: el.scrollWidth > el.clientWidth + 1 };
  };
  const chips = [...document.querySelectorAll('.file-chip')].map((c) => {
    const b = c.getBoundingClientRect();
    return { label: c.getAttribute('aria-label'), text: c.querySelector('.file-chip__path').textContent, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), right: Math.round(b.right), active: c.classList.contains('file-chip--active') };
  });
  const chipTops = [...new Set(chips.map((c) => c.y))];
  const footers = [...document.querySelectorAll('.conversation-message__footer')].map((f) => {
    const b = f.getBoundingClientRect();
    return { h: Math.round(b.height), children: f.children.length };
  });
  const actions = [...document.querySelectorAll('.message-actions')].map((a) => ({ buttons: a.querySelectorAll('button').length, labels: [...a.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')) }));
  const metas = [...document.querySelectorAll('.message-meta')].map((m) => ({ labels: [...m.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')), time: m.querySelector('.message-meta__time')?.textContent }));
  return {
    innerW: window.innerWidth, innerH: window.innerHeight,
    sidebarPresent: !!document.querySelector('.sidebar'),
    sidebar: r('.sidebar'),
    rail: r('.rail'),
    mainPane: r('.main-pane'),
    conversationView: r('.conversation-view'),
    header: r('.conversation-view__header'),
    title: r('.conversation-view__title'),
    scrollBox: r('.conversation-view__scroll'),
    messagesColumn: r('.conversation-messages'),
    composerWrap: r('.conversation-view__composer'),
    counts: {
      messages: document.querySelectorAll('.conversation-message').length,
      groups: document.querySelectorAll('.tool-activity-group').length,
      chips: document.querySelectorAll('.file-chip').length,
      actions: document.querySelectorAll('.message-actions').length,
      metas: document.querySelectorAll('.message-meta').length,
      groupRows: document.querySelectorAll('.tool-activity-group__rows').length,
    },
    regionAriaLabel: document.querySelector('.conversation-view')?.getAttribute('aria-label') ?? null,
    chips, chipRows: chipTops.length,
    overflow: {
      conversationView: overflow('.conversation-view'),
      messagesColumn: overflow('.conversation-messages'),
      scrollBox: overflow('.conversation-view__scroll'),
      header: overflow('.conversation-view__header'),
    },
    footers, actions, metas,
  };
})()`;

const report = {};

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

  report.viewport = await evaluate(
    `({ innerW: window.innerWidth, innerH: window.innerHeight, dpr: window.devicePixelRatio })`,
  );

  // ------------------------------------------------------------------
  // STEP A — composer-draft probe, part 1: on HOME, type a draft and change
  // the provider, so we can tell a lost draft from a lost (or kept) selection.
  // ------------------------------------------------------------------
  report.draft = {};

  report.draft.homeBefore = await evaluate(`(() => {
    const ta = document.querySelector('textarea[aria-label="Mensaje"]');
    const providerTrigger = document.querySelector('[aria-label^="Proveedor:"]');
    return {
      onHome: !!document.querySelector('.home-view'),
      composerPresent: !!document.querySelector('.composer'),
      textareaValue: ta ? ta.value : null,
      providerTrigger: providerTrigger ? providerTrigger.getAttribute('aria-label') : null,
    };
  })()`);

  // Change provider to Codex through the real popover (proves the selection is
  // hoisted in the shell, not local to the composer).
  await evaluate(
    `document.querySelector('[aria-label^="Proveedor:"]').click(); true`,
  );
  await sleep(300);
  const codexClicked = await evaluate(`(() => {
    const opt = document.querySelector('[role="option"][aria-label="Codex"]');
    if (!opt) return 'no-codex-option';
    opt.click();
    return 'clicked';
  })()`);
  await sleep(400);
  report.draft.providerSwitch = {
    clicked: codexClicked,
    providerTriggerAfter: await evaluate(
      `document.querySelector('[aria-label^="Proveedor:"]').getAttribute('aria-label')`,
    ),
  };

  // Type the draft into the focused textarea via real key input.
  await evaluate(
    `document.querySelector('textarea[aria-label="Mensaje"]').focus(); true`,
  );
  await send("Input.insertText", { text: "QA-DRAFT-MARKER-do-not-lose-me" });
  await sleep(400);
  report.draft.homeAfterTyping = await evaluate(`(() => {
    const ta = document.querySelector('textarea[aria-label="Mensaje"]');
    return { textareaValue: ta ? ta.value : null };
  })()`);
  report.draft.homeShot = await shotViewport("draft-01-home-with-draft.png");

  // ------------------------------------------------------------------
  // STEP B — open the sidebar, then open the conversation. This is the
  // HomeView -> ConversationView switch the verifier named.
  // ------------------------------------------------------------------
  await evaluate(
    `document.querySelector('[aria-label="Alternar barra lateral"]').click(); true`,
  );
  await sleep(400);
  const opened = await evaluate(`(() => {
    const title = [...document.querySelectorAll('.conversation-row__title')]
      .find((el) => el.textContent === 'Composer selection chain');
    if (!title) return 'no-row';
    title.closest('button').click();
    return 'clicked';
  })()`);
  await sleep(700);

  report.draft.openedConversation = opened;
  report.draft.afterSwitch = await evaluate(`(() => {
    const ta = document.querySelector('textarea[aria-label="Mensaje"]');
    const providerTrigger = document.querySelector('[aria-label^="Proveedor:"]');
    return {
      onConversation: !!document.querySelector('.conversation-view'),
      composerRemounted: !!document.querySelector('.conversation-view__composer .composer'),
      textareaValue: ta ? ta.value : null,
      providerTrigger: providerTrigger ? providerTrigger.getAttribute('aria-label') : null,
    };
  })()`);
  report.draft.afterSwitchShot = await shotViewport(
    "draft-02-conversation-after-switch.png",
  );

  // Is a round trip back to Home reachable through a shipped control at all?
  report.draft.backToHome = await evaluate(`(() => {
    const home = document.querySelector('[aria-label="Inicio"]');
    const newChat = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Nuevo chat');
    const probe = (el) => {
      if (!el) return 'absent';
      // A React handler makes React attach a props object to the DOM node.
      const k = Object.keys(el).find((key) => key.startsWith('__reactProps$'));
      const props = k ? el[k] : null;
      return { hasReactProps: !!props, hasOnClick: !!(props && props.onClick) };
    };
    return { homeControl: probe(home), newChatControl: probe(newChat) };
  })()`);

  // ------------------------------------------------------------------
  // STEP C — sidebar-OPEN state: measure + capture + assert the region.
  // ------------------------------------------------------------------
  report.stateOpen = await evaluate(MEASURE);
  report.stateOpen.captureRegion = await shotClip(
    "current-01-open-region.png",
    ".conversation-view",
  );
  report.stateOpen.captureViewport = await shotViewport(
    "current-02-open-viewport.png",
  );

  // ------------------------------------------------------------------
  // STEP D — the emitted open-file payload, observed in the running app.
  // ------------------------------------------------------------------
  report.payload = {};
  report.payload.beforeAnyClick = await evaluate(READ_PAYLOAD);

  const chipLabels = await evaluate(
    `[...document.querySelectorAll('.file-chip')].map((c) => c.getAttribute('aria-label'))`,
  );
  report.payload.chipsRendered = chipLabels;

  const firstChip = "Abrir src/shared/domain/selection-chain.ts";
  await evaluate(`(() => {
    const chip = [...document.querySelectorAll('.file-chip')]
      .find((c) => c.getAttribute('aria-label') === ${JSON.stringify(firstChip)});
    chip.click();
    return true;
  })()`);
  await sleep(350);
  const chip1ReadA = await evaluate(READ_PAYLOAD);
  await sleep(700);
  const chip1ReadB = await evaluate(READ_PAYLOAD);
  await sleep(800);
  const chip1ReadC = await evaluate(READ_PAYLOAD);
  report.payload.afterClickChip1 = {
    clickedChipLabel: firstChip,
    readAt350ms: chip1ReadA,
    readAt1050ms: chip1ReadB,
    readAt1850ms: chip1ReadC,
    activeChips: await evaluate(
      `[...document.querySelectorAll('.file-chip--active')].map((c) => c.getAttribute('aria-label'))`,
    ),
    capture: await shotClip(
      "current-03-open-chip1-active.png",
      ".conversation-messages",
    ),
  };

  const secondChip =
    "Abrir src/features/providers/hooks/use-composer-selection.ts";
  await evaluate(`(() => {
    const chip = [...document.querySelectorAll('.file-chip')]
      .find((c) => c.getAttribute('aria-label') === ${JSON.stringify(secondChip)});
    chip.click();
    return true;
  })()`);
  await sleep(500);
  report.payload.afterClickChip2 = {
    clickedChipLabel: secondChip,
    read: await evaluate(READ_PAYLOAD),
    activeChips: await evaluate(
      `[...document.querySelectorAll('.file-chip--active')].map((c) => c.getAttribute('aria-label'))`,
    ),
  };

  // ------------------------------------------------------------------
  // STEP E — collapse / expand the first tool-activity group.
  // ------------------------------------------------------------------
  const readGroup = `(() => {
    const g = document.querySelector('.tool-activity-group');
    const btn = g.querySelector(':scope > .button');
    return {
      headerLabel: btn.getAttribute('aria-label'),
      ariaExpanded: btn.getAttribute('aria-expanded'),
      rowsVisible: g.querySelectorAll('.tool-activity-row').length,
      allGroupsRowsBoxes: document.querySelectorAll('.tool-activity-group__rows').length,
    };
  })()`;

  report.collapse = {};
  report.collapse.before = await evaluate(readGroup);
  await evaluate(
    `document.querySelector('.tool-activity-group > .button').click(); true`,
  );
  await sleep(300);
  report.collapse.collapsed = await evaluate(readGroup);
  report.collapse.collapsedShot = await shotClip(
    "current-04-open-group-collapsed.png",
    ".conversation-view__scroll",
  );

  // Scroll the conversation and confirm the collapsed state survives the scroll.
  await evaluate(`(() => {
    const s = document.querySelector('.conversation-view__scroll');
    s.scrollTop = s.scrollHeight;
    return s.scrollTop;
  })()`);
  await sleep(300);
  report.collapse.afterScroll = await evaluate(readGroup);
  await evaluate(`(() => {
    const s = document.querySelector('.conversation-view__scroll');
    s.scrollTop = 0;
  })()`);
  await sleep(200);

  await evaluate(
    `document.querySelector('.tool-activity-group > .button').click(); true`,
  );
  await sleep(300);
  report.collapse.expandedAgain = await evaluate(readGroup);

  // ------------------------------------------------------------------
  // STEP F — the actions row and the timestamp/edit affordances.
  // ------------------------------------------------------------------
  report.affordances = await evaluate(`(() => {
    const cursorOf = (el) => (el ? getComputedStyle(el).cursor : null);
    const firstAction = document.querySelector('.message-actions button');
    const firstTime = document.querySelector('.message-meta .button--text, .message-meta button');
    const editBtn = document.querySelector('[aria-label="Editar mensaje"]');
    const actionButtons = [...document.querySelectorAll('.message-actions button')].map((b) => b.getAttribute('aria-label'));
    const timeButtons = [...document.querySelectorAll('.message-meta__time')].map((t) => t.textContent);
    return {
      actionButtonsPerRow: [...document.querySelectorAll('.message-actions')].map((a) => a.querySelectorAll('button').length),
      actionButtons,
      timestampButtons: [...document.querySelectorAll('.message-meta button')].map((b) => b.getAttribute('aria-label')).filter((l) => l && l.startsWith('Enviado a las')),
      timeVisible: timeButtons,
      editButtons: document.querySelectorAll('[aria-label="Editar mensaje"]').length,
      cursorAction: cursorOf(firstAction),
      cursorTimestamp: cursorOf(firstTime),
      cursorEdit: cursorOf(editBtn),
      timestampTagName: firstTime ? firstTime.tagName : null,
      timestampDisabled: firstTime ? firstTime.disabled : null,
    };
  })()`);

  // ------------------------------------------------------------------
  // STEP G — sidebar-CLOSED state: measure + capture.
  // ------------------------------------------------------------------
  await evaluate(
    `document.querySelector('[aria-label="Alternar barra lateral"]').click(); true`,
  );
  await sleep(500);
  report.stateClosed = await evaluate(MEASURE);
  report.stateClosed.captureRegion = await shotClip(
    "current-05-closed-region.png",
    ".conversation-view",
  );
  report.stateClosed.captureViewport = await shotViewport(
    "current-06-closed-viewport.png",
  );

  // The open-file request is shell state, so it should survive the sidebar toggle.
  report.stateClosed.payloadStillMarked = await evaluate(
    `[...document.querySelectorAll('.file-chip--active')].map((c) => c.getAttribute('aria-label'))`,
  );

  // ------------------------------------------------------------------
  // STEP H — long-content overflow probe (DOM-only; the page is reloaded after).
  // ------------------------------------------------------------------
  report.longContent = await evaluate(`(() => {
    const probe = (sel, text) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      el.textContent = text;
      const b = el.getBoundingClientRect();
      const parent = el.parentElement.getBoundingClientRect();
      return {
        scrollW: el.scrollWidth, clientW: el.clientWidth,
        overflowX: el.scrollWidth > el.clientWidth + 1,
        rectRight: Math.round(b.right), parentRight: Math.round(parent.right),
        spillsParent: b.right > parent.right + 1,
        height: Math.round(b.height),
        whiteSpace: getComputedStyle(el).whiteSpace,
        overflow: getComputedStyle(el).overflow,
        textOverflow: getComputedStyle(el).textOverflow,
      };
    };
    const longPath = 'src/features/some/deeply/nested/very-long-path/that/keeps/going/and/going/and/going/ComponentNameWithAVeryLongName.tsx';
    const longTitle = 'A very long conversation title that should test whether the header truncates, wraps, or overflows past the boundary of the pane it lives in';
    const longWord = 'A'.repeat(400);
    return {
      chipPath: probe('.file-chip__path', longPath),
      title: probe('.conversation-view__title', longTitle),
      messageWordBreak: probe('.conversation-message--assistant .conversation-message__text', longWord + ' tail words here'),
    };
  })()`);
  report.longContent.capture = await shotClip(
    "current-07-closed-longcontent.png",
    ".conversation-view",
  );

  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = String(error && error.stack ? error.stack : error);
}

ws.close();
chrome.kill("SIGKILL");

writeFileSync(
  `${OUT}/observations.json`,
  JSON.stringify(report, null, 2),
  "utf8",
);
console.log(JSON.stringify(report, null, 2));
