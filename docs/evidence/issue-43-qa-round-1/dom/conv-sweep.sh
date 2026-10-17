#!/usr/bin/env bash
set -u
OUT=/tmp/opencode/sweep
mkdir -p "$OUT"
probe() { cat /tmp/opencode/probe.js | agent-browser eval --stdin 2>/dev/null; }
tog() { agent-browser click ".rail button[aria-label='$1']" >/dev/null 2>&1; agent-browser wait 300 >/dev/null 2>&1; }
for size in "900 700" "1000 720" "1200 800" "1440 900"; do
  set -- $size; W=$1; H=$2
  agent-browser set viewport "$W" "$H" >/dev/null 2>&1
  agent-browser reload >/dev/null 2>&1; agent-browser wait --load networkidle >/dev/null 2>&1
  tog "Alternar barra lateral"
  agent-browser find text "Composer selection chain" click >/dev/null 2>&1
  agent-browser wait 400 >/dev/null 2>&1
  # now conversation open, sidebar open
  tog "Alternar panel derecho"      # s1p1
  probe > "$OUT/${W}x${H}-conv-s1p1.json"
  tog "Alternar barra lateral"      # s0p1
  probe > "$OUT/${W}x${H}-conv-s0p1.json"
  tog "Alternar panel derecho"      # s0p0
  probe > "$OUT/${W}x${H}-conv-s0p0.json"
  tog "Alternar barra lateral"      # s1p0
  probe > "$OUT/${W}x${H}-conv-s1p0.json"
  echo "done conv ${W}x${H}"
done
