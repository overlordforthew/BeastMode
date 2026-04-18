const esbuild = require("esbuild");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const watch = process.argv.includes("--watch");
const rootDir = path.join(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const appBundlePath = path.join(publicDir, "app.js");
const serviceWorkerPath = path.join(publicDir, "sw.js");

async function fileHash(filePath) {
  const contents = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(contents).digest("hex");
}

async function updateServiceWorkerCacheVersion() {
  const bundleHash = (await fileHash(appBundlePath)).slice(0, 12);
  const version = `beastmode-${bundleHash}`;
  const source = await fs.readFile(serviceWorkerPath, "utf8");
  const versionPattern = /const CACHE_VERSION = ['"][^'"]+['"];/;

  if (!versionPattern.test(source)) {
    throw new Error("Could not update CACHE_VERSION in public/sw.js");
  }

  const nextSource = source.replace(versionPattern, `const CACHE_VERSION = '${version}';`);

  if (nextSource !== source) {
    await fs.writeFile(serviceWorkerPath, nextSource);
  }
  console.log(`Service worker cache version: ${version}`);
}

const serviceWorkerCachePlugin = {
  name: "service-worker-cache-version",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) return;
      await updateServiceWorkerCacheVersion();
    });
  },
};

const buildOptions = {
  absWorkingDir: rootDir,
  entryPoints: ["src/main.jsx"],
  outfile: "public/app.js",
  bundle: true,
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  legalComments: "none",
  target: ["es2020"],
  platform: "browser",
  format: "iife",
  jsx: "transform",
  loader: {
    ".js": "jsx",
    ".jsx": "jsx",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production"),
  },
  plugins: [serviceWorkerCachePlugin],
  logLevel: "info",
};

async function main() {
  if (!watch) {
    await esbuild.build(buildOptions);
    return;
  }

  const context = await esbuild.context(buildOptions);
  await context.watch();
  console.log("Watching BeastMode web bundle...");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
