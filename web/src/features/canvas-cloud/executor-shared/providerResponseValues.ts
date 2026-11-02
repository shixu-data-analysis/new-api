// How the Executor reads an upstream response: task IDs and statuses by JSON Pointer, results by the Profile's mapped
// pointers and then its restricted output paths. The Cloud admin page in Pinned New API checks a pasted response with a
// byte-identical copy, checked by canvas-workspace/scripts/verify-template-language-v1.mjs, so a path it accepts is one
// a task reads.
import { dotted } from "./providerRequestValues.js";

type JsonObject = Record<string, unknown>;

export function pointer(value: unknown, path: string): unknown {
  if (path === "") return value;
  if (!path.startsWith("/")) return undefined;
  return path.slice(1).split("/").reduce<unknown>((current, part) => current && typeof current === "object" ? (current as JsonObject)[part.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined, value);
}

/** Where an operation's response holds the task ID: a submit answer by its own mapping when it has one, else the poll mapping. */
export function operationTaskIdMapping(profile: JsonObject, role: "prepareAsset" | "pollAsset" | "submit" | "submitWithImages" | "poll"): unknown {
  if (role === "submit" || role === "submitWithImages") return dotted(profile, "map.submitResponse.taskId") ?? dotted(profile, "map.response.taskId");
  return dotted(profile, "map.response.taskId");
}

/** The first configured pointer that finds a value, and the pointer that found it. */
export function pointerMatch(value: unknown, candidate: unknown): { value: unknown; path: string } | undefined {
  const paths = Array.isArray(candidate) ? candidate : [candidate];
  for (const path of paths) if (typeof path === "string") { const found = pointer(value, path); if (found !== undefined && found !== null) return { value: found, path }; }
  return undefined;
}

export function firstPointer(value: unknown, candidate: unknown): unknown {
  return pointerMatch(value, candidate)?.value;
}

/** Values a restricted JSON path reads: `a.b`, `a[0]`, and `a[]` for every item of a list. Null for a path the Executor refuses. */
export function restrictedJsonPath(root: unknown, path: string): unknown[] | null {
  if (!path || path.length > 2_000 || path.includes("..") || /[?()*@:]/.test(path)) return null;
  const segments: Array<{ type: "property"; key: string } | { type: "index"; index: number } | { type: "expand" }> = [];
  let offset = 0;
  while (offset < path.length) {
    if (path[offset] === ".") { offset += 1; continue; }
    if (path[offset] === "[") {
      const end = path.indexOf("]", offset + 1);
      if (end < 0) return null;
      const value = path.slice(offset + 1, end);
      if (value === "") segments.push({ type: "expand" });
      else if (/^(?:0|[1-9]\d*)$/.test(value)) segments.push({ type: "index", index: Number(value) });
      else return null;
      offset = end + 1;
      continue;
    }
    const match = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(path.slice(offset));
    if (!match) return null;
    segments.push({ type: "property", key: match[0] });
    offset += match[0].length;
  }
  if (!segments.length || segments.length > 64) return null;
  let values: unknown[] = [root];
  for (const segment of segments) {
    const next: unknown[] = [];
    for (const value of values) {
      if (segment.type === "property") {
        if (value && typeof value === "object" && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, segment.key)) next.push((value as JsonObject)[segment.key]);
      } else if (segment.type === "index") {
        if (Array.isArray(value) && segment.index < value.length) next.push(value[segment.index]);
      } else if (Array.isArray(value)) next.push(...value);
    }
    values = next;
    if (!values.length) break;
  }
  return values;
}

/**
 * The results of a response: the first mapped pointer that holds any, else the first output path that reads any. The
 * path that read them is returned; an output path the Executor refuses stops the search as `unsupportedPath`.
 */
export function outputMatch(response: JsonObject, profile: JsonObject): { values: unknown[]; path?: string; unsupportedPath?: string } {
  const mappedPaths = dotted(profile, "map.response.outputs");
  const candidates = Array.isArray(mappedPaths) ? mappedPaths : [mappedPaths];
  const paths = dotted(profile, "advanced.response.outputPaths");
  for (const path of candidates) if (typeof path === "string") {
    const mapped = pointer(response, path);
    if (mapped === undefined || mapped === null || mapped === "" || (Array.isArray(mapped) && !mapped.length)) continue;
    return { values: Array.isArray(mapped) ? mapped : [mapped], path };
  }
  if (Array.isArray(paths)) for (const path of paths) if (typeof path === "string") {
    const read = restrictedJsonPath(response, path);
    if (!read) return { values: [], unsupportedPath: path };
    const values = read.filter((value) => value !== undefined && value !== null && value !== "");
    if (values.length) return { values, path };
  }
  return { values: [] };
}

/**
 * The failure reason a response states at the Profile's error paths: the first path that holds text. A path the
 * Executor refuses reads nothing here, since a failure is still reported without its reason.
 */
export function errorMessageMatch(response: unknown, paths: unknown): { value: string; path: string } | undefined {
  if (!Array.isArray(paths)) return undefined;
  for (const path of paths) if (typeof path === "string") {
    const found = restrictedJsonPath(response, path)?.find((value) => typeof value === "string" && value.trim());
    if (typeof found === "string") return { value: found, path };
  }
  return undefined;
}
