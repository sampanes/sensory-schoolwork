import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * The build stamp shown in the UI. Derived from git rather than typed by hand,
 * because the point of showing it is to answer "is the page I am looking at
 * built from the latest commit?" -- and a hand-maintained string cannot answer
 * that. If it is forgotten during a change, the old value stays on screen and
 * a failed deploy looks exactly like a successful one.
 *
 * Compare what the page shows against `git rev-parse --short HEAD`. A trailing
 * "+" means the build had uncommitted changes, so it is a local build.
 */
function buildStamp() {
  const git = (args: string) =>
    execSync(`git ${args}`, { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  try {
    const sha = git("rev-parse --short HEAD");
    const date = git("log -1 --format=%cd --date=format:%Y-%m-%d");
    const dirty = git("status --porcelain") ? "+" : "";
    return `${sha}${dirty} ${date}`;
  } catch {
    // No git available (tarball export, or a shallow image without .git).
    return "unknown build";
  }
}

export default defineConfig({
  base: process.env.VITE_BASE_URL ?? "/",
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp()),
  },
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
