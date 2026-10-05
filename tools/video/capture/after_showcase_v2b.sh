#!/bin/bash
# Light chain: after the showcase v2 chain (after_mech_v2b.sh, pid 501872) exits → sc_lights_out_ear_v2, pg_win_links,
# verify/register, events diff vs the old Lights Out take, luma check.
cd /home/nitheesh/AI_things/HACKTHONS/QURIOSITY-WORK
S=videos/capture/_showcase_v2b_report.log; : > $S
tail --pid=501872 -f /dev/null
export NP_AGENT=capture
reg() { python3 -c "import json;p='tools/video/edl/shot_sources.json';d=json.load(open(p));d['$1']='videos/capture/$1.mkv';json.dump(d,open(p,'w'),indent=1)"; }
verify() { C=videos/capture/$1
  if [ -f $C.mkv ] && [ -s $C.meta.json ]; then
    echo "$1 packets=$(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 $C.mkv) $(python3 -c "import json;m=json.load(open('$C.meta.json'));print('meta', m['frames'], m['size'], 'warnings', m.get('warnings'), 'marks', [(k.get('name'),k.get('frame',k.get('from'))) for k in m['marks']])") sheet=$(ls videos/review/capture_$1_sheet.png 2>/dev/null)" >> $S
    reg $1
  else echo "$1 MISSING" >> $S; fi; }
for id in sc_lights_out_ear_v2 pg_win_links; do
  node tools/video/capture/run.mjs tools/video/capture/shots/todo_showcase_v2.mjs --only $id --jobs 1 >> $S.capture 2>&1; echo "exit $id $?" >> $S
  verify $id
done
echo "== diff sc_lights_out_ear -> sc_lights_out_ear_v2" >> $S
python3 tools/video/capture/difftake.py videos/capture/sc_lights_out_ear videos/capture/sc_lights_out_ear_v2 >> $S 2>&1
echo "== luma (YAVG per second, 0-255) sc_lights_out_ear_v2 vs old" >> $S
for id in sc_lights_out_ear sc_lights_out_ear_v2; do
  echo "$id: $(tools/video/safe-run.sh -- ffmpeg -v error -i videos/capture/$id.mkv -vf "fps=1,scale=480:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null - 2>/dev/null | grep -o 'YAVG=[0-9.]*' | cut -d= -f2 | xargs printf '%.0f ')" >> $S
done
echo "== showcase v2b done $(date +%T)" >> $S
