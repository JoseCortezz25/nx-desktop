#!/usr/bin/env bash
set -u
OUT=/tmp/opencode/sweep
mkdir -p "$OUT"
probe() { cat /tmp/opencode/probe.js | agent-browser eval --stdin 2>/dev/null; }
run_state() { # $1 W $2 H $3 label $4 sidebar(0/1) $5 panel(0/1)
  local W=$1 H=$2 L=$3 S=$4 P=$5
  agent-browser set viewport "$W" "$H" >/dev/null 2>&1
  agent-browser reload >/dev/null 2>&1
  agent-browser wait --load networkidle >/dev/null 2>&1
  [ "$S" = "1" ] && agent-browser click ".rail button[aria-label='Alternar barra lateral']" >/dev/null 2>&1
  [ "$P" = "1" ] && agent-browser click ".rail button[aria-label='Alternar panel derecho']" >/dev/null 2>&1
  agent-browser wait 350 >/dev/null 2>&1
  probe > "$OUT/${W}x${H}-${L}.json"
  echo "done ${W}x${H} ${L}"
}
for size in "900 700" "1000 720" "1200 800" "1440 900"; do
  set -- $size; W=$1; H=$2
  run_state "$W" "$H" s0p0 0 0
  run_state "$W" "$H" s1p0 1 0
  run_state "$W" "$H" s0p1 0 1
  run_state "$W" "$H" s1p1 1 1
done
