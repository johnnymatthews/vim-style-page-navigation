# Fixed environment for the benchmark baseline. The image tag must match the
# @playwright/test version in package-lock.json, or Playwright will not find
# its Chromium build. docs/bench/docker.sh builds and runs it.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# docker.sh mounts .output/chrome-mv3 and docs/bench here at run time.
CMD ["node", "docs/bench/bench.ts", "--check"]
