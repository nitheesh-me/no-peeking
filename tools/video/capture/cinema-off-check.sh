#!/usr/bin/env bash
# Proof that the cinema code changes nothing by default: builds HEAD (git worktree) and the working tree, then
# renders the same deterministic scenes (virtual time, seeded random, no ?cinema flag) from both builds and
# compares the pixels. Run it under the wrapper (it starts one browser at a time):
#   tools/video/safe-run.sh --heavy -- tools/video/capture/cinema-off-check.sh [base-ref=HEAD]
set -euo pipefail
R="$(cd "$(dirname "$0")/../../.." && pwd)"
REF="${1:-HEAD}"
W="$R/videos/capture/_cinema_off"
rm -rf "$W"; mkdir -p "$W/shots"
git -C "$R" worktree add --detach "$W/ref" "$REF" >/dev/null
trap 'git -C "$R" worktree remove --force "$W/ref" >/dev/null 2>&1 || true; kill ${P1:-} ${P2:-} 2>/dev/null || true' EXIT
ln -s "$R/node_modules" "$W/ref/node_modules"
(cd "$W/ref" && npx vite build --outDir "$W/build-ref" --emptyOutDir >/dev/null)
(cd "$R" && npx vite build --outDir "$W/build-new" --emptyOutDir >/dev/null)
# assets ignored by git (audio) exist only in the working tree's public/: give the ref build the same files
for d in "$W/build-new"/*/; do n=$(basename "$d"); [[ -e "$W/build-ref/$n" ]] || cp -r "$d" "$W/build-ref/"; done
(cd "$W/build-ref" && exec python3 -m http.server 4421 --bind 127.0.0.1 >/dev/null 2>&1) & P1=$!
(cd "$W/build-new" && exec python3 -m http.server 4422 --bind 127.0.0.1 >/dev/null 2>&1) & P2=$!
sleep 1
run() { n=$1; shift; for b in ref:4421 new:4422; do CAP_BASE=http://127.0.0.1:${b#*:}/ node "$R/tools/video/capture/still.mjs" "$W/shots/$n-${b%:*}.png" "$@" >/dev/null || echo "render failed: $n ${b%:*}"; done; }
run title '#title' '' 2
run map '#map' '' 2
run level23 '#level/2-3' '' 2.5
run level23-night '#level/2-3' '' 1 "for (let i=0;i<8;i++) document.querySelector('.dialogue')?.click(); __np.runNight('zero',[{kind:'flip',t:'q2'}])" 9
run level13 '#level/1-3' '' 3
run level42 '#level/4-2' '' 2
run codex '#codex' '' 2
run codex-qubble '#codex' '' 1 "document.querySelector('.codex-entry[data-id=qubble]').click()" 1.5
run credits '#credits' '' 12
python3 - "$W/shots" <<'PY'
import sys, glob, os
from PIL import Image
import numpy as np
bad = 0
for f in sorted(glob.glob(sys.argv[1] + '/*-ref.png')):
    g = f.replace('-ref.png', '-new.png')
    a = np.asarray(Image.open(f).convert('RGB'), int); b = np.asarray(Image.open(g).convert('RGB'), int)
    d = int((np.abs(a - b).sum(2) > 0).sum())
    bad += d > 0
    print(f"{os.path.basename(f)[:-8]:16s} {'IDENTICAL' if d == 0 else f'DIFFERS ({d} px)'}")
print('RESULT:', 'all identical' if not bad else f'{bad} scene(s) differ')
sys.exit(1 if bad else 0)
PY
