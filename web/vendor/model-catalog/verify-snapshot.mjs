import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--release")) throw new Error("Unknown verifier argument");
const release = args.includes("--release");
const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "snapshot.json"), "utf8"));
const expectedFiles = ["index.mjs", "package.json", "src/display-rules/index.d.ts", "src/display-rules/index.mjs", "src/request-validator/catalog-definitions.d.ts", "src/request-validator/catalog-definitions.mjs", "src/request-validator/index.d.ts", "src/request-validator/index.mjs", "test-vectors.mjs", "tests/request-validator-vectors.json", "verify-snapshot.mjs"].sort();
const expectedManifestKeys = ["schemaVersion", "generated", "sourceRepository", "sourceCommit", "validatorVersion", "vectorsSha256", "generatorSha256", "runtimeSha256", "files"].sort();
const actualManifestKeys = Object.keys(manifest).sort();
if (JSON.stringify(actualManifestKeys) !== JSON.stringify(expectedManifestKeys)) throw new Error("Generated validator snapshot manifest keys are invalid");
if (manifest.schemaVersion !== 1 || manifest.generated !== true || manifest.sourceRepository !== "pixmiao/pixmiao-catalog") throw new Error("Generated validator snapshot identity is invalid");
if (JSON.stringify(Object.keys(manifest.files ?? {}).sort()) !== JSON.stringify(expectedFiles)) throw new Error("Generated validator snapshot file set is invalid");
if (!/^[0-9a-f]{64}$/.test(manifest.generatorSha256 ?? "")) throw new Error("Generated validator snapshot generator identity is invalid");
if (manifest.runtimeSha256 !== manifest.files["src/request-validator/index.mjs"] || manifest.vectorsSha256 !== manifest.files["tests/request-validator-vectors.json"]) throw new Error("Generated validator snapshot identity does not match its file digests");
if (release && !/^[0-9a-f]{40}$/.test(manifest.sourceCommit)) throw new Error("Release verification requires a full source commit SHA");
const expectedDirectories = new Set(["", "src", "src/display-rules", "src/request-validator", "tests"]);
const actualFiles = [];
async function walk(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = relative ? path.posix.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (!expectedDirectories.has(child)) throw new Error(`Generated validator snapshot contains unexpected directory: ${child}`);
      await walk(path.join(directory, entry.name), child);
    } else if (entry.isFile()) actualFiles.push(child);
    else throw new Error(`Generated validator snapshot contains unsupported entry: ${child}`);
  }
}
await walk(root);
const expectedOutputFiles = [...expectedFiles, "snapshot.json"].sort();
if (JSON.stringify(actualFiles.sort()) !== JSON.stringify(expectedOutputFiles)) throw new Error("Generated validator snapshot directory contains unexpected or missing files");
for (const [relative, expected] of Object.entries(manifest.files)) {
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error(`Generated validator snapshot digest is invalid: ${relative}`);
  const actual = createHash("sha256").update(await readFile(path.join(root, relative))).digest("hex");
  if (actual !== expected) throw new Error(`Generated validator snapshot mismatch: ${relative}`);
}
console.log(JSON.stringify({ status: "VALID", release, sourceCommit: manifest.sourceCommit, validatorVersion: manifest.validatorVersion, vectorsSha256: manifest.vectorsSha256, runtimeSha256: manifest.runtimeSha256 }));
