#!/usr/bin/env bash
# QA round 1 for issue #40 / PR #44 — functional flow on the running dev app.
# Every step prints a JSON block so the transcript is machine-checkable.
set -u
S=qa40
OUT=/tmp/opencode/qa40
T="$OUT/transcript.txt"
: > "$T"

ab() { agent-browser --session "$S" "$@"; }
log() { printf '%s\n' "$*" | tee -a "$T"; }
rule() { printf '\n===== %s =====\n' "$1" | tee -a "$T"; }

measure() {
cat <<'EOF' | ab eval --stdin 2>&1 | tee -a "$T"
(() => {
  const r = (el) => { if(!el) return null; const b = el.getBoundingClientRect(); return {left:Math.round(b.left), top:Math.round(b.top), right:Math.round(b.right), bottom:Math.round(b.bottom), width:Math.round(b.width), height:Math.round(b.height)}; };
  const q = (s) => document.querySelector(s);
  const mp = q('.main-pane');
  const bar = q('.composer-bar');
  const send = q('button[aria-label="Enviar"]');
  const mpR = mp ? mp.getBoundingClientRect() : null;
  const sendR = send ? send.getBoundingClientRect() : null;
  const vis = (el) => { if(!el) return false; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width>0 && b.height>0 && cs.visibility!=='hidden' && cs.display!=='none'; };
  const sidebar = q('.sidebar');
  const panel = q('.right-panel');
  const tabs = Array.from(document.querySelectorAll('.file-tab-strip [role="tab"], .file-tab__label, [role="tab"]')).map(t => t.textContent.trim());
  return {
    viewport: {w: window.innerWidth, h: window.innerHeight},
    titleBar: r(q('.title-bar')),
    rail: r(q('.rail')),
    sidebar: r(sidebar),
    sidebarVisible: vis(sidebar),
    mainPane: r(mp),
    rightPanel: r(panel),
    rightPanelHidden: panel ? panel.hasAttribute('hidden') : null,
    rightPanelVisible: vis(panel),
    composerBar: r(bar),
    send: r(send),
    sendVisible: vis(send),
    sendDisabled: send ? send.disabled : null,
    sendInsideMainPane: (mpR && sendR) ? (sendR.left >= mpR.left - 0.5 && sendR.right <= mpR.right + 0.5) : null,
    mainPaneOverflow: mp ? {scrollWidth: mp.scrollWidth, clientWidth: mp.clientWidth, overflowX: getComputedStyle(mp).overflowX} : null,
    composerBarOverflow: bar ? {scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth} : null,
    homeView: !!q('.home-view'),
    homeHeading: q('.home-view__title') ? q('.home-view__title').textContent : null,
    conversationTitle: q('.conversation-view__title') ? q('.conversation-view__title').textContent : null,
    hasConversationRegion: !!q('.conversation-view'),
    activeConversationRows: Array.from(document.querySelectorAll('.conversation-row__title')).filter(n => n.closest('button') && n.closest('button').getAttribute('aria-current')==='page').map(n=>n.textContent),
    draftValue: (q('textarea') ? q('textarea').value : null),
    tabCount: document.querySelectorAll('.file-tab-strip [role="tab"]').length,
    tabLabels: tabs,
    viewerPath: q('.file-viewer__path, [class*="breadcrumb"]') ? q('.file-viewer__path, [class*="breadcrumb"]').textContent : null,
    hasViewer: !!q('.file-viewer')
  };
})()
EOF
}

rule "A. Home, all toggleable regions closed"
ab screenshot "$OUT/A-home-closed.png" >/dev/null 2>&1
measure

rule "B. Open sidebar (title bar toggle)"
ab click 'button[aria-label="Alternar barra lateral"]' >/dev/null 2>&1
sleep 0.4
ab screenshot "$OUT/B-home-sidebar-open.png" >/dev/null 2>&1
measure

rule "C. Open conversation 'Composer selection chain' from the sidebar"
ab click '.sidebar__content .conversation-row__title' >/dev/null 2>&1
sleep 0.4
ab screenshot "$OUT/C-conversation-sidebar-open.png" >/dev/null 2>&1
measure

rule "D. Rail 'Inicio' returns Home and clears the conversation"
ab click 'button[aria-label="Inicio"]' >/dev/null 2>&1
sleep 0.4
ab screenshot "$OUT/D-home-after-rail-inicio.png" >/dev/null 2>&1
measure

rule "E. Open conversation again, then sidebar 'Nuevo chat' returns Home"
ab click '.sidebar__content .conversation-row__title' >/dev/null 2>&1
sleep 0.4
ab click '.sidebar__new-chat button' >/dev/null 2>&1
sleep 0.4
ab screenshot "$OUT/E-home-after-nuevo-chat.png" >/dev/null 2>&1
measure

rule "F. Draft typed on Home survives Home -> Conversation -> Home"
ab click 'textarea' >/dev/null 2>&1
ab fill 'textarea' 'draft survives switch qa40' >/dev/null 2>&1
sleep 0.3
log '-- draft after typing on Home:'
cat <<'EOF' | ab eval --stdin 2>&1 | tee -a "$T"
document.querySelector('textarea').value
EOF
ab click '.sidebar__content .conversation-row__title' >/dev/null 2>&1
sleep 0.4
log '-- draft inside the conversation view:'
cat <<'EOF' | ab eval --stdin 2>&1 | tee -a "$T"
document.querySelector('textarea').value
EOF
ab click 'button[aria-label="Inicio"]' >/dev/null 2>&1
sleep 0.4
log '-- draft back on Home:'
cat <<'EOF' | ab eval --stdin 2>&1 | tee -a "$T"
document.querySelector('textarea').value
EOF
ab screenshot "$OUT/F-home-draft-persisted.png" >/dev/null 2>&1

rule "G. 1440x900, sidebar + right panel open, conversation view"
ab click '.sidebar__content .conversation-row__title' >/dev/null 2>&1
sleep 0.4
ab click 'button[aria-label="Alternar panel derecho"]' >/dev/null 2>&1
sleep 0.4
ab screenshot "$OUT/G-conversation-all-regions-open.png" >/dev/null 2>&1
measure

rule "H. Send control is operable with every region open"
ab click 'textarea' >/dev/null 2>&1
ab fill 'textarea' 'send me from qa40' >/dev/null 2>&1
sleep 0.3
log '-- draft before send:'
cat <<'EOF' | ab eval --stdin 2>&1 | tee -a "$T"
document.querySelector('textarea').value
EOF
log '-- is Enviar enabled at 1440x900 with all regions open:'
cat <<'EOF' | ab eval --stdin 2>&1 | tee -a "$T"
(() => { const b = document.querySelector('button[aria-label="Enviar"]'); const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); const at = document.elementFromPoint(Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)); return {disabled: b.disabled, visible: r.width>0 && r.height>0 && cs.visibility!=='hidden', topElementAtCentre: at ? (at.getAttribute('aria-label') || at.tagName) : null, isHitByEnviar: at ? (at.closest('button[aria-label="Enviar"]') !== null) : false}; })()
EOF
ab click 'button[aria-label="Enviar"]' >/dev/null 2>&1
sleep 0.3
log '-- draft after clicking Enviar (empty proves the submit rule ran):'
cat <<'EOF' | ab eval --stdin 2>&1 | tee -a "$T"
document.querySelector('textarea').value
EOF
ab screenshot "$OUT/H-after-send.png" >/dev/null 2>&1

rule "I. A file chip reveals the right panel with that file"
log '-- close the right panel first (so a chip click must reveal it):'
ab click 'button[aria-label="Alternar panel derecho"]' >/dev/null 2>&1
sleep 0.3
cat <<'EOF' | ab eval --stdin 2>&1 | tee -a "$T"
(() => { const p = document.querySelector('.right-panel'); const t = document.querySelector('button[aria-label="Alternar panel derecho"]'); return {panelHidden: p.hasAttribute('hidden'), toggleAriaPressed: t.getAttribute('aria-pressed')}; })()
EOF
log '-- click the chip for src/shared/domain/selection-chain.ts:'
ab click 'button[aria-label="Abrir src/shared/domain/selection-chain.ts"]' >/dev/null 2>&1
sleep 0.4
ab screenshot "$OUT/I-chip-revealed-panel.png" >/dev/null 2>&1
cat <<'EOF' | ab eval --stdin 2>&1 | tee -a "$T"
(() => { const p = document.querySelector('.right-panel'); const t = document.querySelector('button[aria-label="Alternar panel derecho"]'); const vis = (el)=>{const b=el.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(el).visibility!=='hidden';}; return {panelHidden: p.hasAttribute('hidden'), panelVisible: vis(p), toggleAriaPressed: t.getAttribute('aria-pressed'), tabs: Array.from(document.querySelectorAll('.file-tab-strip [role="tab"]')).map(x=>x.textContent.trim()), hasViewer: !!document.querySelector('.file-viewer')}; })()
EOF

rule "J. Two open tabs survive a panel close/reopen"
ab click 'button[aria-label="Abrir src/features/providers/hooks/use-composer-selection.ts"]' >/dev/null 2>&1
sleep 0.4
log '-- two tabs after the second chip:'
cat <<'EOF' | ab eval --stdin 2>&1 | tee -a "$T"
(() => ({tabs: Array.from(document.querySelectorAll('.file-tab-strip [role="tab"]')).map(x=>x.textContent.trim()), activeTab: document.querySelector('.file-tab-strip [role="tab"][aria-selected="true"]') ? document.querySelector('.file-tab-strip [role="tab"][aria-selected="true"]').textContent.trim() : null}))()
EOF
ab screenshot "$OUT/J-two-tabs.png" >/dev/null 2>&1
log '-- close the panel with the panel close control:'
ab click 'button[aria-label="Cerrar panel"]' >/dev/null 2>&1
sleep 0.3
cat <<'EOF' | ab eval --stdin 2>&1 | tee -a "$T"
(() => { const p = document.querySelector('.right-panel'); return {panelHidden: p.hasAttribute('hidden'), tabsStillMounted: document.querySelectorAll('.file-tab-strip [role="tab"]').length}; })()
EOF
ab screenshot "$OUT/K-panel-closed.png" >/dev/null 2>&1
log '-- reopen the panel:'
ab click 'button[aria-label="Alternar panel derecho"]' >/dev/null 2>&1
sleep 0.4
ab screenshot "$OUT/L-panel-reopened.png" >/dev/null 2>&1
cat <<'EOF' | ab eval --stdin 2>&1 | tee -a "$T"
(() => { const p = document.querySelector('.right-panel'); return {panelHidden: p.hasAttribute('hidden'), tabs: Array.from(document.querySelectorAll('.file-tab-strip [role="tab"]')).map(x=>x.textContent.trim()), activeTab: document.querySelector('.file-tab-strip [role="tab"][aria-selected="true"]') ? document.querySelector('.file-tab-strip [role="tab"][aria-selected="true"]').textContent.trim() : null, hasViewer: !!document.querySelector('.file-viewer')}; })()
EOF

rule "M. Panel-closed geometry at 1440x900"
ab click 'button[aria-label="Alternar panel derecho"]' >/dev/null 2>&1
sleep 0.3
ab screenshot "$OUT/M-conversation-sidebar-open-panel-closed.png" >/dev/null 2>&1
measure

rule "N. Console + page errors"
log '-- console:'
ab console --clear 2>&1 | tee -a "$T"
log '-- page errors:'
ab errors --clear 2>&1 | tee -a "$T"

log "FLOW DONE"
