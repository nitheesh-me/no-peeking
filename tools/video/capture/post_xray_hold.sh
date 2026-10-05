#!/bin/bash
# After the pg_split_23_xray re-take exits: move the NEW take to pg_split_23_xray_hold, restore the signed-off
# take from _old_pg_split_23_xray, verify, register. (Rule: never overwrite a shot id a signed-off video uses.)
set -u
cd /home/nitheesh/AI_things/HACKTHONS/QURIOSITY-WORK
C=videos/capture; OLD=$C/_old_pg_split_23_xray
for ext in mkv events.json layout.json meta.json camera.json; do
  [ -f $C/pg_split_23_xray.$ext ] && mv $C/pg_split_23_xray.$ext $C/pg_split_23_xray_hold.$ext
done
[ -f videos/review/capture_pg_split_23_xray_sheet.png ] && [ $C/pg_split_23_xray_hold.mkv -nt $OLD/pg_split_23_xray.mkv ] && cp videos/review/capture_pg_split_23_xray_sheet.png videos/review/capture_pg_split_23_xray_hold_sheet.png
for f in $OLD/*; do cp -p "$f" $C/; done
echo "== restore check"; for f in $OLD/*; do cmp -s "$f" $C/$(basename $f) && echo "identical $(basename $f)" || echo "DIFFERS $(basename $f)"; done
echo "packets restored: $(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 $C/pg_split_23_xray.mkv)"
[ -f $C/pg_split_23_xray_hold.mkv ] && echo "hold packets: $(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 $C/pg_split_23_xray_hold.mkv) meta: $(python3 -c "import json;m=json.load(open('$C/pg_split_23_xray_hold.meta.json'));print(m['frames'], [ (k.get('name'),k.get('frame',k.get('from'))) for k in m['marks']])")"
python3 - <<'PY'
import json; p='tools/video/edl/shot_sources.json'; d=json.load(open(p))
d['pg_split_23_xray']='videos/capture/pg_split_23_xray.mkv'
import os
if os.path.exists('videos/capture/pg_split_23_xray_hold.mkv'): d['pg_split_23_xray_hold']='videos/capture/pg_split_23_xray_hold.mkv'
json.dump(d, open(p,'w'), indent=1); print('registered')
PY
echo "me_encode: $(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 $C/me_encode.mkv 2>/dev/null) meta: $(python3 -c "import json;m=json.load(open('$C/me_encode.meta.json'));print(m['frames'], [ (k.get('name'),k.get('frame',k.get('from'))) for k in m['marks']])" 2>&1)"
