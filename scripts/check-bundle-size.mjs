import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const DIST = "dist/assets";
const MAX_MAIN_GZIP_KB = 150;
const MAX_VENDOR_THREE_GZIP_KB = 800;

if (!existsSync(DIST)) {
  console.error(`ERROR: ${DIST} not found. Run "npm run build" first.`);
  process.exit(1);
}

function gzipKb(filePath) {
  return gzipSync(readFileSync(filePath)).length / 1024;
}

function findChunk(prefix) {
  const files = readdirSync(DIST).filter((f) => f.startsWith(prefix) && f.endsWith(".js"));
  if (files.length === 0) return null;
  return files.sort((a, b) => statSync(join(DIST, b)).size - statSync(join(DIST, a)).size)[0];
}

let failed = false;

// --- main chunk ---
const main = findChunk("index-");
if (!main) {
  console.error(`No index-*.js chunk in ${DIST}`);
  process.exit(1);
}
const mainKb = gzipKb(join(DIST, main));
console.log(`Main chunk ${main}: ${mainKb.toFixed(1)} KB gzip (budget ${MAX_MAIN_GZIP_KB} KB)`);
if (mainKb > MAX_MAIN_GZIP_KB) {
  console.error(`  FAIL: main chunk ${mainKb.toFixed(1)} KB > ${MAX_MAIN_GZIP_KB} KB budget`);
  failed = true;
}

// --- vendor-three chunk ---
const three = findChunk("vendor-three-");
if (three) {
  const threeKb = gzipKb(join(DIST, three));
  console.log(
    `Vendor-three chunk ${three}: ${threeKb.toFixed(1)} KB gzip (budget ${MAX_VENDOR_THREE_GZIP_KB} KB)`,
  );
  if (threeKb > MAX_VENDOR_THREE_GZIP_KB) {
    console.error(
      `  FAIL: vendor-three ${threeKb.toFixed(1)} KB > ${MAX_VENDOR_THREE_GZIP_KB} KB budget`,
    );
    failed = true;
  }
} else {
  console.log("vendor-three chunk not found (skipping three.js budget check)");
}

if (failed) process.exit(1);
console.log("Bundle size check passed.");
