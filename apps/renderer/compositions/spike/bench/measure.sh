#!/bin/sh
# Runs inside the spike container: renders the composition once and reports wall time, CPU and
# memory, read from the container's own cgroup (v2).
#   sh /work/bench/measure.sh <name> [hyperframes render flags...]
set -u
name=$1
shift
cg=/sys/fs/cgroup
out=/out
rm -f /tmp/done /tmp/anon.max

# Peak anonymous memory: what Chrome, Node and FFmpeg actually hold, page cache left out.
(
  m=0
  while [ ! -f /tmp/done ]; do
    a=$(awk '$1=="anon"{print $2}' "$cg/memory.stat" 2>/dev/null)
    if [ "${a:-0}" -gt "$m" ]; then
      m=$a
      echo "$m" >/tmp/anon.max
    fi
    sleep 0.5
  done
) &
sampler=$!

cpu0=$(awk '$1=="usage_usec"{print $2}' "$cg/cpu.stat" 2>/dev/null)
t0=$(date +%s%N)
hyperframes render /work --workers 1 -o "$out/$name.mp4" "$@" >"$out/$name.log" 2>&1
rc=$?
t1=$(date +%s%N)
cpu1=$(awk '$1=="usage_usec"{print $2}' "$cg/cpu.stat" 2>/dev/null)
touch /tmp/done
wait "$sampler" 2>/dev/null

peak=$(cat "$cg/memory.peak" 2>/dev/null || echo 0)
anon=$(cat /tmp/anon.max 2>/dev/null || echo 0)
oom=$(awk '$1=="oom_kill"{print $2}' "$cg/memory.events" 2>/dev/null)
probe=$(ffprobe -v error -show_entries format=size,bit_rate -of default=nw=1:nk=1 "$out/$name.mp4" 2>/dev/null | tr '\n' ' ')
summary=$(grep -m1 ' capture · ' "$out/$name.log" | sed 's/^ *//')
lowmem=$(grep -m1 -o '"lowMemoryMode":[a-z]*' "$out/$name.log")

awk -v n="$name" -v rc="$rc" -v t0="$t0" -v t1="$t1" -v c0="${cpu0:-0}" -v c1="${cpu1:-0}" \
  -v pk="$peak" -v an="$anon" -v oom="${oom:-NA}" -v pr="$probe" 'BEGIN {
    w = (t1 - t0) / 1e9; c = (c1 - c0) / 1e6; split(pr, p, " ")
    printf "%s rc=%s wall=%.1fs cpu=%.1fs (%.0f%% de 1 vCPU) peak_cgroup=%.0fMB peak_anon=%.0fMB oom_kill=%s mp4=%.1fMB %.0fkbps\n",
      n, rc, w, c, (w > 0 ? c / w * 100 : 0), pk / 1048576, an / 1048576, oom, p[1] / 1048576, p[2] / 1000
  }'
echo "  ${summary:-sin resumen de captura} · ${lowmem:-lowMemoryMode:?}"
exit $rc
