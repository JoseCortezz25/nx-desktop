#!/usr/bin/env bash
# Visual state captures + agent-browser pixel diffs (interactive states the kit
# script cannot reach: it navigates and screenshots but never clicks).
set -u
S=qa40
OUT=/tmp/opencode/qa40
REPO=/home/ajosecortes/.fabrica/workspaces/nx-desktop/issue-40-qa
T="$OUT/visual.txt"
: > "$T"

ab() { agent-browser --session "$S" "$@"; }
log() { printf '%s\n' "$*" | tee -a "$T"; }
js() { cat <<'EOF' | ab eval --stdin 2>&1
$1
EOF
}
state() {
cat <<'EOF' | ab eval --stdin 2>&1 | tr -d '\n' | tee -a "$T"
(() => ({home: !!document.querySelector('.home-view'), conv: !!document.querySelector('.conversation-view'), sidebarOpen: !!document.querySelector('.sidebar'), panelOpen: document.querySelector('.right-panel') ? !document.querySelector('.right-panel').hasAttribute('hidden') : false}))()
EOF
echo | tee -a "$T"
}
probe() {
cat <<'EOF' | ab eval --stdin 2>&1 | tr -d '\n '
(() => ({sidebarOpen: !!document.querySelector('.sidebar'), panelOpen: document.querySelector('.right-panel') ? !document.querySelector('.right-panel').hasAttribute('hidden') : false}))()
EOF
}
ensure() { # $1 = home|conv, $2 = sidebar open|closed, $3 = panel open|closed
  local want_view="$1" want_side="$2" want_panel="$3"
  if [ "$want_view" = home ]; then ab click 'button[aria-label="Inicio"]' >/dev/null 2>&1; sleep 0.3; fi
  local st; st=$(probe)
  case "$st" in *'"sidebarOpen":true'*) local side=true;; *) local side=false;; esac
  case "$st" in *'"panelOpen":true'*) local panel=true;; *) local panel=false;; esac
  if [ "$want_side" = open ] && [ "$side" = false ]; then ab click 'button[aria-label="Alternar barra lateral"]' >/dev/null 2>&1; fi
  if [ "$want_side" = closed ] && [ "$side" = true ]; then ab click 'button[aria-label="Alternar barra lateral"]' >/dev/null 2>&1; fi
  sleep 0.4
  if [ "$want_panel" = open ] && [ "$panel" = false ]; then ab click 'button[aria-label="Alternar panel derecho"]' >/dev/null 2>&1; fi
  if [ "$want_panel" = closed ] && [ "$panel" = true ]; then ab click 'button[aria-label="Alternar panel derecho"]' >/dev/null 2>&1; fi
  sleep 0.4
}

log "=== V1. Home, rail + sidebar + right panel open, 1440x900 ==="
ensure home open open
log "state: $(state)"
ab screenshot "$OUT/vis1-home-all-open.png" >/dev/null 2>&1
log "-- diff vs docs/captures/issue-4/03-sidebar-and-right-panel-open.png (issue #4 app baseline, panel was 520px):"
ab diff screenshot --baseline "$REPO/docs/captures/issue-4/03-sidebar-and-right-panel-open.png" --output "$OUT/diff1-home-all-open-vs-issue4-03.png" 2>&1 | tee -a "$T"

log ""
log "=== V2. Home, rail + sidebar open, right panel closed ==="
ensure home open closed
log "state: $(state)"
ab screenshot "$OUT/vis2-home-sidebar-open.png" >/dev/null 2>&1
log "-- diff vs docs/captures/issue-4/02-sidebar-open.png (issue #4 app baseline):"
ab diff screenshot --baseline "$REPO/docs/captures/issue-4/02-sidebar-open.png" --output "$OUT/diff2-home-sidebar-open-vs-issue4-02.png" 2>&1 | tee -a "$T"

log ""
log "=== V3. Conversation + sidebar open, right panel closed ==="
ab click '.sidebar__content .conversation-row__title' >/dev/null 2>&1; sleep 0.4
ensure conv open closed
log "state: $(state)"
ab screenshot "$OUT/vis3-conversation-sidebar-open.png" >/dev/null 2>&1
log "-- diff vs wireframe 11 render (ref-11-chat-conversation-sidebar.png, 1440x900, low-fidelity structural reference):"
ab diff screenshot --baseline "$OUT/ref-11-chat-conversation-sidebar.png" --output "$OUT/diff3-conversation-sidebar-vs-wireframe11.png" 2>&1 | tee -a "$T"

log ""
log "=== V4. Conversation + rail + sidebar + right panel open (every region), 1440x900 ==="
ensure conv open open
log "state: $(state)"
ab screenshot "$OUT/vis4-conversation-all-open.png" >/dev/null 2>&1
log "-- diff vs wireframe 03 render (ref-03-chat-sitemap-doc.png, conversation + document panel + sidebar, 1440x900, low-fidelity structural reference; wireframe leaves the panel width flexible):"
ab diff screenshot --baseline "$OUT/ref-03-chat-sitemap-doc.png" --output "$OUT/diff4-conversation-all-open-vs-wireframe03.png" 2>&1 | tee -a "$T"

log "VISUAL DONE"
