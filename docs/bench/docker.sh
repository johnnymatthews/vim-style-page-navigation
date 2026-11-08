#!/usr/bin/env sh
# Runs bench.ts in the pinned Playwright image with fixed CPU and memory, so a
# baseline recorded on one machine holds on another. Arguments go to bench.ts.
#
#   docs/bench/docker.sh --baseline
#   docs/bench/docker.sh --check
set -eu
cd "$(dirname "$0")/../.."

if [ ! -d .output/chrome-mv3 ]; then
  echo "docs/bench/docker.sh: .output/chrome-mv3 is missing; run npm run build first" >&2
  exit 2
fi

image=jk-nav-bench
docker build --quiet -t "$image" -f docs/bench/Dockerfile . >/dev/null

exec docker run --rm \
  --cpus="${BENCH_CPUS:-2}" --memory="${BENCH_MEMORY:-4g}" --shm-size=1g \
  -e BENCH_CONTAINER=1 \
  -e BENCH_COMMIT="$(git describe --always --dirty)" \
  -v "$PWD/.output/chrome-mv3:/work/.output/chrome-mv3:ro" \
  -v "$PWD/docs/bench:/work/docs/bench" \
  "$image" node docs/bench/bench.ts "$@"
