#!/usr/bin/env bash
# Editor's trailer text cards (Critic fix 3 + the X-ray honesty tag), rendered with the Motion Designer's own
# `card` scene (same letter-collapse type, paper text, ink outline, glow) as alpha fill+matte pairs.
# Run as ONE heavy job:  tools/video/safe-run.sh --heavy -- bash tools/video/assemble/hook_cards.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
OUT=videos/final/work/motion_ext
R() { node tools/video/motion/render.mjs card_cantlook_alpha --out "$OUT" --name "$1" --p "$2"; }
R hook_look_alpha  '{"text":"Look… and it'"'"'s gone.","frames":140,"y":240,"size":132,"maxW":1500,"start":2,"reveal":14}'
R hook_its2_alpha  '{"text":"It'"'"'s #2.","frames":100,"y":150,"size":96,"maxW":1000,"start":2,"reveal":14}'
R hook_fix_alpha   '{"text":"Fix it. Never look.","frames":128,"y":150,"size":84,"maxW":1000,"start":2,"reveal":14}'
R tag_xray_alpha   '{"text":"X-ray · simulator view","frames":96,"y":64,"size":40,"maxW":700,"start":2,"reveal":12}'
