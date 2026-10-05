#!/bin/bash
# Light chain: after the mechanic v2 queue (pid 447703) exits → me_23_night_v2 → verify/register v2 takes →
# showcase v2 captures (one shot at a time; each run.mjs chunk takes the single heavy slot via safe-run).
cd /home/nitheesh/AI_things/HACKTHONS/QURIOSITY-WORK
L=videos/capture/_mech_v2_report.log; : > $L
tail --pid=447703 -f /dev/null
export NP_AGENT=capture
reg() { python3 -c "import json;p='tools/video/edl/shot_sources.json';d=json.load(open(p));d['$1']='videos/capture/$1.mkv';json.dump(d,open(p,'w'),indent=1)"; }
verify() { C=videos/capture/$1
  if [ -f $C.mkv ] && [ -s $C.meta.json ]; then
    echo "$1 packets=$(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 $C.mkv) $(python3 -c "import json;m=json.load(open('$C.meta.json'));print('meta', m['frames'], 'warnings', m.get('warnings'), 'marks', [(k.get('name'),k.get('frame',k.get('from'))) for k in m['marks']])") sheet=$(ls videos/review/capture_$1_sheet.png 2>/dev/null)" >> $2
    reg $1
  else echo "$1 MISSING" >> $2; fi; }
node tools/video/capture/run.mjs tools/video/capture/shots/todo_mechanic_v2.mjs --only me_23_night_v2 --jobs 1 >> $L.capture 2>&1; echo "exit me_23_night_v2 $?" >> $L
echo "== diff me_23_night -> me_23_night_v2" >> $L; python3 tools/video/capture/difftake.py videos/capture/me_23_night videos/capture/me_23_night_v2 >> $L 2>&1
echo "== diff me_23_xray -> me_23_xray_v2" >> $L; python3 tools/video/capture/difftake.py videos/capture/me_23_xray videos/capture/me_23_xray_v2 >> $L 2>&1
for id in me_23_xray_v2 me_31_phase_v2 me_23_decoder me_23_night_v2; do verify $id $L; done
echo "== mechanic done $(date +%T)" >> $L
S=videos/capture/_showcase_v2_report.log; : > $S
for id in sc_run_3-3 sc_run_4-1 sc_map_flip_solve sc_night_shift sc_notebook_4k sc_threshold_4k; do
  node tools/video/capture/run.mjs tools/video/capture/shots/todo_showcase_v2.mjs --only $id --jobs 1 >> $S.capture 2>&1; echo "exit $id $?" >> $S
  verify $id $S
done
echo "== showcase done $(date +%T)" >> $S
