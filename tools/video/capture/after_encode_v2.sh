#!/bin/bash
# Queue after the me_encode / pg_split_23_xray_hold chain: mechanic v2 takes (Critic plan review).
# Each run.mjs chunk takes the single heavy slot via safe-run; this script itself is light.
cd /home/nitheesh/AI_things/HACKTHONS/QURIOSITY-WORK
L=videos/capture/_mech_v2.log; : > $L
export NP_AGENT=capture
F=tools/video/capture/shots/todo_mechanic_v2.mjs
echo "== preview me_23_decoder $(date +%T)" >> $L
tools/video/safe-run.sh --heavy -- node tools/video/capture/run.mjs $F --only me_23_decoder --preview --out videos/capture/preview >> $L 2>&1
grep -h '"warnings"' -A3 videos/capture/preview/me_23_decoder.meta.json >> $L 2>/dev/null
for id in me_23_decoder me_31_phase_v2 me_23_xray_v2; do
  echo "== capture $id $(date +%T)" >> $L
  node tools/video/capture/run.mjs $F --only $id --jobs 1 >> $L 2>&1; echo "exit $id $?" >> $L
done
echo "== all done $(date +%T)" >> $L
