# syntax=docker/dockerfile:1
# Throwaway image for the video render benchmark: Node 22, HyperFrames, its pinned chrome-headless-shell
# and a pinned static FFmpeg, on the same Debian base as the renderer image. Built on the server by
# run.sh; nothing here ships.
FROM node:22-bookworm-slim

# chrome-headless-shell's shared libraries (the set HyperFrames' reference Dockerfile installs),
# fallback fonts and tini. The composition embeds Geist itself.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates wget xz-utils tini \
      fonts-dejavu-core fonts-liberation \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libdrm2 \
      libfontconfig1 libfreetype6 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 \
      libpangocairo-1.0-0 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 \
      libxshmfence1 \
  && rm -rf /var/lib/apt/lists/*

# FFmpeg 8.0.1, the static build and checksum HyperFrames pins (amd64).
ARG FFMPEG_URL=https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-02-28-12-59/ffmpeg-n8.0.1-66-g27b8d1a017-linux64-gpl-8.0.tar.xz
ARG FFMPEG_SHA256=26d2ecd0cefba99f9d1ea92252a3a4f743a58df4c1c3cf9f8bbaaa40b1fca5b0
RUN wget -q -O /tmp/ffmpeg.tar.xz "$FFMPEG_URL" \
  && echo "$FFMPEG_SHA256  /tmp/ffmpeg.tar.xz" | sha256sum -c - \
  && tar -xJf /tmp/ffmpeg.tar.xz -C /usr/local/bin --strip-components=2 --wildcards '*/bin/ffmpeg' '*/bin/ffprobe' \
  && rm /tmp/ffmpeg.tar.xz

ENV HYPERFRAMES_NO_TELEMETRY=1 \
    HYPERFRAMES_NO_UPDATE_CHECK=1
RUN npm install --global hyperframes@0.9.16 && npm cache clean --force

# The Chrome build HyperFrames pins, downloaded once into the image (renders run without network).
USER node
RUN hyperframes browser ensure && hyperframes browser path
WORKDIR /work
ENTRYPOINT ["tini", "--"]
