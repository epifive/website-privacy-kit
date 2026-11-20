// Bundles the embed runtime (src/widget/runtime) into public/w.js and the Hindi
// string chunk into public/w-hi.js (loaded on demand).
// Runs automatically before `next dev` / `next build` (predev / prebuild) and via `npm run widget:build`.

import { build, transform } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cssFile = resolve(root, "src/widget/runtime/widget.css");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

// Plan §7.2: w.js ≤ 10 KB gzip; the Hindi chunk ≤ 3 KB gzip.
export const BUDGETS = { "w.js": 10 * 1024, "w-hi.js": 3 * 1024 };
const ENTRIES = { "w.js": "src/widget/runtime/index.ts", "w-hi.js": "src/widget/runtime/i18n/hi.ts" };

const kb = (n) => (n / 1024).toFixed(2) + " KB";

/** Build both files; returns their raw and gzip sizes. Exits non-zero when a budget is exceeded. */
export async function buildWidget({ outDir = resolve(root, "public"), quiet = false } = {}) {
  const css = await transform(readFileSync(cssFile, "utf8"), { loader: "css", minify: true, target: ["chrome80", "safari13", "firefox78"] });
  const sizes = {};
  for (const [name, entry] of Object.entries(ENTRIES)) {
    const result = await build({
      entryPoints: [resolve(root, entry)],
      bundle: true,
      format: "iife",
      minify: true,
      target: "es2017",
      platform: "browser",
      sourcemap: false,
      legalComments: "none",
      charset: "utf8",
      write: false,
      banner: { js: "/*! EpiFive Website Privacy Kit */" },
      define: { __WPK_CSS__: JSON.stringify(css.code.trim()), __WPK_VERSION__: JSON.stringify(pkg.version) },
      logLevel: "warning",
    });
    const code = result.outputFiles[0].contents;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, name), code);
    const gz = gzipSync(code, { level: 9 }).length;
    sizes[name] = { raw: code.length, gzip: gz, budget: BUDGETS[name] };
    if (!quiet) console.log(`[widget] public/${name}  ${kb(code.length)} raw, ${kb(gz)} gzip (budget ${kb(BUDGETS[name])})`);
  }
  return sizes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const sizes = await buildWidget();
    const over = Object.entries(sizes).filter(([, s]) => s.gzip > s.budget);
    for (const [name, s] of over) console.error(`[widget] ${name} gzip size ${kb(s.gzip)} exceeds the ${kb(s.budget)} budget`);
    if (over.length) process.exit(1);
  } catch (err) {
    console.error("[widget] build failed:", err && err.message ? err.message : err);
    process.exit(1);
  }
}
