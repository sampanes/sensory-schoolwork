/*
 * Runs every tests/*.test.ts with Node's built-in test runner:
 *
 *   npm test
 *
 * Each test file is bundled first with esbuild (already installed for Vite),
 * because the source uses extensionless imports, JSON imports and
 * import.meta.env, none of which plain Node can load. Packages stay external,
 * so a test never drags TensorFlow into its bundle.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDir = path.join(root, "tests");
const outDir = path.join(root, "node_modules", ".cache", "tests");

const entries = readdirSync(testDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => path.join(testDir, name));

if (entries.length === 0) {
  console.error("No tests/*.test.ts files found.");
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });

await build({
  entryPoints: entries,
  outdir: outDir,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  packages: "external",
  logLevel: "warning",
  define: {
    "import.meta.env": JSON.stringify({ BASE_URL: "/" }),
    __BUILD_STAMP__: JSON.stringify("test"),
  },
});

const bundles = entries.map((entry) => path.join(outDir, path.basename(entry).replace(/\.ts$/, ".mjs")));
const result = spawnSync(process.execPath, ["--test", ...bundles], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
