#!/bin/bash
# After the v2 queue (me_23_xray_v2, me_31_phase_v2, me_23_decoder) exits: capture me_23_night_v2, diff it against
# me_23_night, verify every v2 take and register them. Light script; run.mjs chunks take the heavy slot.
cd /home/nitheesh/AI_things/HACKTHONS/QURIOSITY-WORK
L=videos/capture/_mech_v2_report.log; : > $L
tail --pid=447703 -f /dev/null
export NP_AGENT=capture
node tools/video/capture/run.mjs tools/video/capture/shots/todo_mechanic_v2.mjs --only me_23_night_v2 --jobs 1 >> $L.capture 2>&1; echo "exit me_23_night_v2 $?" >> $L
echo "== diff me_23_night -> me_23_night_v2" >> $L
python3 tools/video/capture/difftake.py videos/capture/me_23_night videos/capture/me_23_night_v2 >> $L 2>&1
for id in me_23_xray_v2 me_31_phase_v2 me_23_decoder me_23_night_v2; do
  C=videos/capture/$id
  if [ -f $C.mkv ] && [ -s $C.meta.json ]; then
    echo "$id packets=$(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 $C.mkv) $(python3 -c "import json;m=json.load(open('$C.meta.json'));print('meta', m['frames'], 'warnings', m.get('warnings'), 'marks', [(k.get('name'),k.get('frame',k.get('from'))) for k in m['marks']])") sheet=$(ls videos/review/capture_${id}_sheet.png 2>/dev/null)" >> $L
    python3 -c "import json;p='tools/video/edl/shot_sources.json';d=json.load(open(p));d['$id']='videos/capture/$id.mkv';json.dump(d,open(p,'w'),indent=1)"
  else echo "$id MISSING" >> $L; fi
done
echo "== diff me_23_xray -> me_23_xray_v2" >> $L; python3 tools/video/capture/difftake.py videos/capture/me_23_xray videos/capture/me_23_xray_v2 >> $L 2>&1
echo "== done $(date +%T)" >> $L
