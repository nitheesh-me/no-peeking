#!/usr/bin/env bash
# Render motion jobs through the shared-pool wrapper (docs/VIDEO_RESOURCES.md), one at a time; the --heavy wrapper owns concurrency (3 render slots machine-wide).
# Usage: tools/video/motion/render_all.sh [job …]   (default: all jobs in jobs.mjs)
set -uo pipefail
cd "$(dirname "$0")/../../.."
JOBS=("$@")
if [ ${#JOBS[@]} -eq 0 ]; then mapfile -t JOBS < <(node tools/video/motion/render.mjs --list | awk '{print $1}'); fi
printf '%s\n' "${JOBS[@]}" | xargs -I{} sh -c 'tools/video/safe-run.sh --heavy -- node tools/video/motion/render.mjs {} || echo "FAILED {}"'
