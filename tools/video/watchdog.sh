#!/usr/bin/env bash
# Last-resort guard: if MemAvailable < 1500 MB (the npvideo.slice pool already keeps 4 GB for the system; this is a last resort), kill Playwright-bundled browsers and ffmpeg renders only
# (never the user's own Chrome or other apps). Logs to videos/watchdog.log.
LOG="$(cd "$(dirname "$0")/../.." && pwd)/videos/watchdog.log"
echo "watchdog up $(date)" >> "$LOG"
while true; do
  A=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
  if [ "$A" -lt 1500 ]; then
    echo "$(date +%T) LOW MEM ${A}MB" >> "$LOG"
    for d in /proc/[0-9]*; do
      exe=$(readlink "$d/exe" 2>/dev/null) || continue
      case "$exe" in
        *ms-playwright*|/usr/bin/ffmpeg) kill -9 "${d#/proc/}" 2>/dev/null && echo "  killed ${d#/proc/} $exe" >> "$LOG" ;;
      esac
    done
    sleep 5
  fi
  sleep 2
done
