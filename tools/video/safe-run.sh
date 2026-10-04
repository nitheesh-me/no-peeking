#!/usr/bin/env bash
# Run a video-pipeline job inside the shared npvideo.slice memory pool.
#
#   tools/video/safe-run.sh [--mem 8G] [--cpu 1600%] [--heavy] -- <command...>
#
# Policy (set by the user): the machine keeps a 4 GB reserve for the system; jobs get everything else.
#   - All jobs share ONE pool (npvideo.slice: MemoryMax = total RAM − 4 GB, soft MemoryHigh 3 GB below that).
#     Only if ALL jobs together would eat into the system's 4 GB does the kernel step in, and only inside the pool.
#   - --mem is an optional per-job ceiling (default: none, the job may use whatever the pool has free).
#   - Admission: if --mem is given and that much memory isn't available yet (beyond the 4 GB reserve),
#     the job WAITS (polling, up to 30 min) instead of failing.
#   - --heavy (REQUIRED for headless-Chromium renders and 4K ffmpeg encodes): takes one of 3 render slots, so at
#     most 3 heavy renders run at once machine-wide (software GL is CPU-bound; more in parallel only starves the desktop).
#   - The pool as a whole is capped at 16 of 22 cores with low CPU/IO priority; the desktop (session.slice) has
#     3 GB of protected memory and top CPU priority.
set -euo pipefail
MEM=""; CPU="800%"; HEAVY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --heavy) HEAVY=1; shift;;
    --mem) MEM="$2"; shift 2;;
    --cpu) CPU="$2"; shift 2;;
    --) shift; break;;
    *) break;;
  esac
done
to_mb() { local v="$1"; case "$v" in *G) echo $(( ${v%G} * 1024 ));; *M) echo "${v%M}";; *) echo "$v";; esac; }
RESERVE_MB=4096
systemctl --user start npvideo.slice 2>/dev/null || true
if [[ -n "$MEM" ]]; then
  NEED=$(to_mb "$MEM")
  for i in $(seq 1 900); do
    AVAIL=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
    (( AVAIL - RESERVE_MB >= NEED )) && break
    (( i == 1 )) && echo "safe-run: waiting for ${NEED} MB (available beyond reserve: $((AVAIL - RESERVE_MB)) MB)…" >&2
    sleep 2
  done
  PROPS=(-p MemoryMax="$MEM")
else
  PROPS=()
fi
RUN=(systemd-run --user --scope -q --slice=npvideo.slice "${PROPS[@]}" -p CPUQuota="$CPU" -- nice -n 5 "$@")
if (( HEAVY )); then
  # 3 render slots: try each slot lock without waiting; if all busy, wait on a random slot
  DIR="$(dirname "$0")"
  for slot in 1 2 3; do
    exec 9>"$DIR/.render-slot-$slot.lock"
    if flock -n 9; then exec "${RUN[@]}"; fi
  done
  echo "safe-run: all 3 render slots busy, waiting…" >&2
  exec 9>"$DIR/.render-slot-$(( RANDOM % 3 + 1 )).lock"; flock 9; exec "${RUN[@]}"
fi
exec "${RUN[@]}"
