const esbuild = require("esbuild");
const path = require("path");

const watch = process.argv.includes("--watch");
const rootDir = path.join(__dirname, "..");

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
