#!/usr/bin/env bash
# Crash recorder: every 5 s, append one line of temperatures, CPU frequency, load, memory and video-job count to
# videos/telemetry.log and fsync it, so after a hard freeze the last seconds before it are on disk.
# (sysstat only samples every 10 min and has no temperatures.)  Run: systemd-run --user --unit=np-telemetry tools/video/telemetry.sh
LOG="$(cd "$(dirname "$0")/../.." && pwd)/videos/telemetry.log"
echo "# $(date -Is) telemetry start: time pkgC cpuC acpiC wifiC MHz_max load1 memAvailMB npvideo_tasks ac" >> "$LOG"
while true; do
  t() { local z; z=$(grep -lx "$1" /sys/class/thermal/thermal_zone*/type 2>/dev/null | head -1); [[ -n "$z" ]] && echo $(( $(cat "${z%type}temp") / 1000 )) || echo -; }
  mhz=$(awk '/MHz/ {if ($4>m) m=$4} END {printf "%d", m}' /proc/cpuinfo)
  tasks=$(cat /sys/fs/cgroup/user.slice/user-$(id -u).slice/user@$(id -u).service/npvideo.slice/pids.current 2>/dev/null || echo -)
  ac=$(cat /sys/class/power_supply/AC*/online /sys/class/power_supply/ADP*/online 2>/dev/null | head -1)
  printf '%s %s %s %s %s %s %s %s %s %s\n' "$(date +%T)" "$(t x86_pkg_temp)" "$(t TCPU)" "$(t acpitz)" "$(t iwlwifi_1)" "$mhz" \
    "$(cut -d' ' -f1 /proc/loadavg)" "$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)" "$tasks" "${ac:--}" >> "$LOG"
  python3 -c "import os,sys; f=os.open(sys.argv[1], os.O_RDONLY); os.fsync(f)" "$LOG"
  sleep 5
done
