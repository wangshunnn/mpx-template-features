// @ts-check
const path = require("node:path");
const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: {
      "dist/client": "client/out/extension.js",
      "dist/server": "server/out/server.js",
    },
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outdir: ".",
    external: ["vscode"],
    logLevel: "warning",
    tsconfig: "./tsconfig.json",
    plugins: [
      esbuildProblemMatcherPlugin,
      {
        name: "resolve-vue-compiler-sfc-module",
        setup(build) {
          build.onResolve({ filter: /^@vue\/compiler-sfc$/ }, () => {
            return {
              path: path.resolve("node_modules/@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js"),
              // namespace: "esm-stub",
            };
          });
        },
      },
    ],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[esbuild] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location == null) return;
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log("[esbuild] build finished");
    });
  },
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
