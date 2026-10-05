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
#   - --heavy (REQUIRED for headless-Chromium renders and 4K ffmpeg encodes): takes one of 2 render slots, so at
#     most 2 heavy renders run at once machine-wide (software GL is CPU-bound; more in parallel only starves the desktop).
#   - The pool as a whole is capped at 10 of 22 cores with low CPU/IO priority; the desktop (session.slice) has
#     3 GB of protected memory and top CPU priority.
set -euo pipefail
MEM=""; CPU="1600%"; HEAVY=0
# Crash #7 (01:14): load jumped 7 -> 16 (159 tasks) as a render fanned out; a CPU *quota* lets the pool burst over all
# 22 cores for part of every 100 ms period, then throttles: sharp power spikes. Jobs are now PINNED to the 8 E-cores
# (cpu12-19, max 3.8 GHz): steady, lower draw, and the P-cores stay free for the desktop. Override with NP_CPUS.
# 2026-10-05 (user: "we can bump to 15 threads"): widened to 16 CPUs = the 8 E-cores + 4 P-cores with their
# hyperthreads (cpu3,4 = core 12; cpu6-11 = cores 20/24/28). cpu0,1,2,5 (P-cores 8/16) and the LP cores 20-21 stay
# free for the desktop. Quota = the pinned set, so no burst-then-throttle pulses. Revert: NP_CPUS=12-19.
CPUS="${NP_CPUS:-3,4,6-19}"
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
    if (( i == 1 )); then
      echo "safe-run: waiting for ${NEED} MB (available beyond reserve: $((AVAIL - RESERVE_MB)) MB)…" >&2
      MQID="queue:mem-$(basename "${1:-job}")-$$"
      python3 "$(dirname "$0")/progress/progress.py" queued "$MQID" "Queued: $(basename "${1:-job}")" "waiting for ${NEED} MB of free memory" $$ || true
    fi
    sleep 2
  done
  [[ -n "${MQID:-}" ]] && { python3 "$(dirname "$0")/progress/progress.py" clear "$MQID" || true; }
  PROPS=(-p MemoryMax="$MEM")
else
  PROPS=()
fi
# Block suspend/idle-sleep while any job runs: crash #5 (17:40) was a resume-from-suspend hang mid-render.
RUN=(systemd-inhibit --what=sleep:idle --who=npvideo --why="video job running" --mode=block
     systemd-run --user --scope -q --slice=npvideo.slice "${PROPS[@]}" -p CPUQuota="$CPU" -- taskset -c "$CPUS" nice -n 5 "$@")
# Disk guard (2026-10-05, /home at 97 %): a heavy job that runs the disk full leaves half-written 4K files. Refuse to
# start one with less than NP_MIN_FREE_GB (default 8) free on the videos filesystem; nested jobs are checked too.
if (( HEAVY )) || [[ -n "${NP_RENDER_SLOT:-}" ]]; then
  FREE_GB=$(df --output=avail -BG "$(dirname "$0")/../../videos" 2>/dev/null | tail -1 | tr -dc 0-9)
  if [[ -n "$FREE_GB" ]] && (( FREE_GB < ${NP_MIN_FREE_GB:-8} )); then
    echo "safe-run: only ${FREE_GB} GB free on the videos disk (< ${NP_MIN_FREE_GB:-8} GB): refusing a heavy job. Free space and retry." >&2
    exit 75
  fi
fi
if (( HEAVY )) && [[ -n "${NP_RENDER_SLOT:-}" ]]; then
  HEAVY=0  # a parent job already holds a render slot; its children run inside it (no nested slot = no self-deadlock)
fi
if (( HEAVY )); then
  # Render slots: take whichever frees first. A queued job shows on the progress board.
  DIR="$(dirname "$0")"
  # NP_RENDER_SLOTS (default 1 since crash #6 at 20:11, cause unknown; was 2) = heavy jobs allowed at once, machine-wide
  try_slots() {
    for slot in $(seq 1 "${NP_RENDER_SLOTS:-1}"); do
      exec 9>"$DIR/.render-slot-$slot.lock"
      if flock -n 9; then export NP_RENDER_SLOT=$slot; return 0; fi
      exec 9>&-
    done
    return 1
  }
  if ! try_slots; then
    echo "safe-run: both render slots busy, queued (shown on the progress board)…" >&2
    QID="queue:$(basename "${1:-job}")-$$"
    python3 "$DIR/progress/progress.py" queued "$QID" "Queued: $(basename "${1:-job}") ${*:2:3}" "waiting for a render slot (${NP_RENDER_SLOTS:-1} max)" $$ || true
    until try_slots; do sleep 3; done
    python3 "$DIR/progress/progress.py" clear "$QID" || true
  fi
  exec "${RUN[@]}"
fi
exec "${RUN[@]}"
