import { mkdir, copyFile, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { publicFiles } from "../server/static.js";

// Explicit browser-only artifact: never package server code, env files or test outputs.
export async function packageStatic(destination = "dist") {
  let existing = [];
  try {
    existing = await readdir(destination, {
      recursive: true,
      withFileTypes: true,
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const { resolve, relative } = await import("node:path");
  for (const entry of existing.filter((e) => !e.isDirectory())) {
    const file = relative(
      resolve(destination),
      resolve(entry.parentPath, entry.name),
    ).replaceAll("\\", "/");
    if (![...publicFiles, ".nojekyll"].includes(file))
      throw new Error(
        "Static output contains unexpected files; use a fresh output directory",
      );
  }
  for (const file of [...publicFiles, ".nojekyll"]) {
    const source = await readFile(file, "utf8");
    if (/JEV_API_KEY|api\.typesafe\.ai|Bearer\s/.test(source))
      throw new Error(`Server-only content in public file: ${file}`);
    const target = join(destination, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(file, target);
  }
}
await packageStatic();
console.log("Static browser allowlist packaged in dist/");
