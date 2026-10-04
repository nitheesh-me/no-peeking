#!/bin/bash
# Proof that the cinema code changes nothing without ?cinema: pixel-compare a production build of git HEAD
# against a build of the working tree, over deterministic virtual-time stills of several screens.
#   tools/video/safe-run.sh --heavy -- tools/video/capture/check_default_off.sh <work-dir>
set -u
R=$(cd "$(dirname "$0")/../../.." && pwd)
W=${1:?work dir}; mkdir -p "$W/cmp"
cd "$R"
if [ ! -d "$W/build-head" ]; then
  git worktree add --detach "$W/head" HEAD >/dev/null && ln -sf "$R/node_modules" "$W/head/node_modules"
  (cd "$W/head" && npx vite build --outDir "$W/build-head" --emptyOutDir >/dev/null); git worktree remove --force "$W/head"
fi
[ -d "$W/build-new" ] || npx vite build --outDir "$W/build-new" --emptyOutDir >/dev/null
[ -d "$W/build-head/audio" ] || cp -r "$W/build-new/audio" "$W/build-head/" 2>/dev/null
(cd "$W/build-head" && exec python3 -m http.server 4421 --bind 127.0.0.1 >/dev/null 2>&1) & P1=$!
(cd "$W/build-new" && exec python3 -m http.server 4422 --bind 127.0.0.1 >/dev/null 2>&1) & P2=$!
sleep 1
run() { n=$1; shift; for b in head:4421 new:4422; do CAP_BASE=http://127.0.0.1:${b#*:}/ node tools/video/capture/still.mjs "$W/cmp/$n-${b%:*}.png" "$@" >/dev/null || echo "fail $n $b"; done; }
run title '#title' '' 2
run map '#map' '' 2
run l23 '#level/2-3' '' 2.5
run l23night '#level/2-3' '' 1 "document.querySelector('.dialogue')?.click(); __np.closeDialogue?.(); __np.runNight('zero',[{kind:'flip',t:'q2'}])" 9
run l13 '#level/1-3' '' 3
run codex '#codex' '' 2
run codexq '#codex' '' 1 "document.querySelector('.codex-entry[data-id=qubble]').click()" 1.5
run credits '#credits' '' 12
run l42 '#level/4-2' '' 2
kill $P1 $P2
python3 - "$W/cmp" <<'PY'
import sys, glob, os
from PIL import Image; import numpy as np
d = sys.argv[1]; bad = 0
for f in sorted(glob.glob(d + '/*-head.png')):
    g = f.replace('-head.png', '-new.png'); a = np.asarray(Image.open(f).convert('RGB'), int); b = np.asarray(Image.open(g).convert('RGB'), int)
    n = int((np.abs(a - b).sum(2) > 0).sum()); bad += n > 0
    print(os.path.basename(f)[:-9].ljust(10), 'IDENTICAL' if n == 0 else f'DIFF {n} px')
print('RESULT:', 'all identical' if not bad else f'{bad} differ')
PY
