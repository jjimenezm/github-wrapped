#!/usr/bin/env bash
# Video render benchmark, on the production server with every service up. Builds a throwaway image
# with HyperFrames, then renders the composition in a fresh container (no network, 2 GB without
# swap) so its cgroup measures that render alone. By default it runs the production settings
# (`looks`, BeginFrame capture, one worker); ALL=1 adds the two low-memory profiles of the spike.
# Results: $OUT/summary.txt (and one .log and .mp4 per render).
#
#   bash bench/run.sh [composition-dir]      # default ../wrap; needs docker (or sudo)
#   VARS=vars.json bash bench/run.sh         # render a wrap's variables instead of the demo
#
# The composition needs its vendor/ folder (pnpm --filter @wrapped/renderer composition:vendor);
# it is copied with its symlinks resolved, so the fonts come along.
set -uo pipefail

BENCH=$(cd "$(dirname "$0")" && pwd)
COMP=$(cd "${1:-$BENCH/../wrap}" && pwd)
OUT=${OUT:-/tmp/hf-bench/out}
IMG=hf-bench:0.9.16
LIMIT=${LIMIT:-2g}
NET=none
WORK="$OUT/work"
mkdir -p "$OUT" && chmod 777 "$OUT"
S="$OUT/summary.txt"
: >"$S"
log() { echo "$*" | tee -a "$S"; }

if [ ! -f "$COMP/vendor/gsap.min.js" ] || [ ! -f "$COMP/vendor/art.iife.js" ]; then
  echo "ABORT: $COMP/vendor is incomplete; run: pnpm --filter @wrapped/renderer composition:vendor"
  exit 1
fi
rm -rf "$WORK" && cp -RL "$COMP" "$WORK" && rm -rf "$WORK/.hyperframes"
VARFLAGS=()
if [ -n "${VARS:-}" ]; then
  cp "$VARS" "$WORK/vars.json"
  VARFLAGS=(--variables-file /work/vars.json --strict-variables)
fi
chmod -R a+rwX "$WORK" "$BENCH"

log "== host $(date -u +%FT%TZ)"
log "$(uname -m) · kernel $(uname -r) · $(nproc) vCPU ·$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2)"
log "$(awk '/^(MemTotal|MemAvailable|SwapTotal|SwapFree):/{printf "%s %.0fMB  ", $1, $2/1024}' /proc/meminfo)"
log "cgroup $(stat -fc %T /sys/fs/cgroup) · docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?')"
log "composition $(basename "$COMP") · variables ${VARS:-defaults}"
if [ "$(uname -m)" != x86_64 ]; then log "ABORT: Chrome for Testing no publica linux-arm64"; exit 1; fi
log "== servicios antes"
docker stats --no-stream --format '{{.Name}} {{.MemUsage}} cpu {{.CPUPerc}}' | sort | tee -a "$S"

log "== build $IMG"
t0=$(date +%s)
if ! docker build --progress=plain -t "$IMG" "$BENCH" >"$OUT/build.log" 2>&1; then
  log "BUILD FALLÓ"
  tail -30 "$OUT/build.log" | tee -a "$S"
  exit 1
fi
log "build ok en $(($(date +%s) - t0))s · imagen $(docker image inspect "$IMG" --format '{{.Size}}' | awk '{printf "%.0fMB", $1/1048576}')"
docker run --rm "$IMG" sh -c 'echo "hyperframes $(hyperframes --version) · $(ffmpeg -version | head -1 | cut -d" " -f1-3) · $(hyperframes browser path)"' 2>&1 | tail -1 | tee -a "$S"

mb() { # docker stats MemUsage ("812.4MiB / 2GiB") -> MB
  awk '{v=$1; u=v; gsub(/[0-9.]/,"",u); gsub(/[A-Za-z]/,"",v);
        if (u=="GiB") v*=1024; else if (u=="KiB") v/=1024; else if (u=="B") v/=1048576; print int(v)}'
}

run() {
  local name=$1
  shift
  local c="hf-$name" min_avail=999999 max_swap=0 max_ws=0 i=0 a sw ws code
  docker rm -f "$c" >/dev/null 2>&1
  log "== render $name ($*) · red $NET · límite $LIMIT"
  if ! docker run -d --name "$c" --network "$NET" -m "$LIMIT" --memory-swap "$LIMIT" --shm-size 512m \
    -v "$WORK:/work" -v "$BENCH:/bench:ro" -v "$OUT:/out" "$IMG" sh /bench/measure.sh "$name" "$@" >/dev/null; then
    log "  no arrancó"
    return
  fi
  while [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" = true ]; do
    a=$(awk '/^MemAvailable:/{print int($2/1024)}' /proc/meminfo)
    sw=$(awk '/^SwapTotal:/{t=$2} /^SwapFree:/{f=$2} END{print int((t-f)/1024)}' /proc/meminfo)
    ws=$(docker stats --no-stream --format '{{.MemUsage}}' "$c" 2>/dev/null | mb)
    [ "$a" -lt "$min_avail" ] && min_avail=$a
    [ "$sw" -gt "$max_swap" ] && max_swap=$sw
    [ "${ws:-0}" -gt "$max_ws" ] && max_ws=$ws
    i=$((i + 1))
    if [ "$i" -eq 15 ]; then
      docker stats --no-stream --format '{{.Name}} {{.MemUsage}} cpu {{.CPUPerc}}' | sort >"$OUT/stats-during-$name.txt"
    fi
    sleep 1
  done
  code=$(docker inspect -f '{{.State.ExitCode}}' "$c" 2>/dev/null)
  docker logs "$c" 2>&1 | tail -2 | tee -a "$S"
  log "  host: MemAvailable mín ${min_avail}MB · swap usado máx ${max_swap}MB · docker stats sin caché máx ${max_ws}MB"
  docker rm "$c" >/dev/null 2>&1
  if [ "$code" != 0 ]; then
    tail -15 "$OUT/$name.log" | tee -a "$S"
    if [ "$NET" = none ] && grep -q -E 'ENOTFOUND|EAI_AGAIN|fetch failed|ERR_NAME' "$OUT/$name.log"; then
      log "  (pidió red: se repite con red; el render de producción no debería necesitarla)"
      NET=bridge
      run "$name" "$@"
    fi
  fi
}

run looks-beginframe --quality looks --no-low-memory-mode "${VARFLAGS[@]}"
if [ "${ALL:-0}" = 1 ]; then
  run standard --quality standard "${VARFLAGS[@]}"
  run looks --quality looks "${VARFLAGS[@]}"
fi

log "== servicios durante el render (a los ~15 s)"
cat "$OUT/stats-during-looks-beginframe.txt" 2>/dev/null | tee -a "$S"
log "== listo · MP4 y logs en $OUT"
