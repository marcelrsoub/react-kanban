import esbuild from "esbuild";
import process from "process";

const isProduction = process.argv.includes("production");
const isLibrary = process.argv.includes("library");

if (isLibrary) {
  await esbuild.build({
    entryPoints: ["src/board/index.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    sourcemap: true,
    outfile: "dist/board/index.mjs",
    external: ["react", "react-dom", "@dnd-kit/react", "@dnd-kit/helpers"]
  });
  process.exit(0);
}

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
