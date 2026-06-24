import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const DIST = "dist/assets";
const MAX_MAIN_GZIP_BYTES = 150 * 1024;

function findMainChunk() {
  const files = readdirSync(DIST).filter((f) => f.startsWith("index-") && f.endsWith(".js"));
  if (files.length === 0) {
    throw new Error(`No index-*.js chunk in ${DIST}`);
  }
  return files.sort((a, b) => statSync(join(DIST, b)).size - statSync(join(DIST, a)).size)[0];
}

const main = findMainChunk();
const path = join(DIST, main);
const gzip = gzipSync(readFileSync(path)).length;
const kb = (gzip / 1024).toFixed(1);

console.log(`Main chunk ${main}: ${kb} KB gzip (budget ${MAX_MAIN_GZIP_BYTES / 1024} KB)`);

if (gzip > MAX_MAIN_GZIP_BYTES) {
  console.error(`Bundle size exceeded: ${kb} KB > ${MAX_MAIN_GZIP_BYTES / 1024} KB`);
  process.exit(1);
}
