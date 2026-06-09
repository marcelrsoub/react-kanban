import esbuild from "esbuild";
import process from "process";

const isProduction = process.argv.includes("production");
const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  sourcemap: isProduction ? false : "inline",
  minify: isProduction,
  outfile: "main.js",
  external: ["obsidian", "electron"],
  define: {
    "process.env.NODE_ENV": JSON.stringify(isProduction ? "production" : "development")
  }
});

if (isProduction) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
  console.log("Watching for changes...");
}
