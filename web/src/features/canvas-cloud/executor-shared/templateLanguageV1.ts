import { parseStrictJson } from "./strictJson.js";
import language from "./template-language-v1.contract.json" with { type: "json" };

const OMIT = Symbol("adapter-profile-omit");
const allowedFunctions = language.functions as Record<string, number[]>;
const allowedReferences: readonly string[] = language.references;

export const TEMPLATE_LANGUAGE_VERSION = language.version;
export type TemplateFailurePhase = "VALIDATION" | "EVALUATION";
export class TemplateLanguageError extends Error {
  constructor(readonly phase: TemplateFailurePhase, readonly reason: string, readonly field: string, message: string) {
    super(`${message} at ${field}`);
    this.name = "TemplateLanguageError";
  }
  get path() { return this.field; }
}
function fail(phase: TemplateFailurePhase, reason: string, field: string, message: string): never {
  throw new TemplateLanguageError(phase, reason, field, message);
}

export interface TemplateContext {
  model: { upstreamId: string; protocolOptions: Record<string, unknown> };
  request: Record<string, unknown>;
  media: {
    images: Array<Record<string, unknown>>;
    videos: Array<Record<string, unknown>>;
    audios: Array<Record<string, unknown>>;
  };
}

export function validateTemplate(template: unknown, location = "template", localNames: ReadonlySet<string> = new Set(), depth = 0): void {
  if (depth > language.limits.depth) fail("VALIDATION", "MAX_DEPTH_EXCEEDED", location, "Template exceeds maximum depth");
  if (Array.isArray(template)) {
    if (template.length > language.limits.arrayItems) fail("VALIDATION", "ARRAY_TOO_LARGE", location, "Template array is too large");
    template.forEach((child, index) => validateTemplate(child, `${location}[${index}]`, localNames, depth + 1));
    return;
  }
  if (!template || typeof template !== "object") return;
  const record = template as Record<string, unknown>;
  const expressionKeys = Object.keys(record).filter((key) => key.startsWith("$"));
  if (!expressionKeys.length) {
    Object.entries(record).forEach(([key, child]) => validateTemplate(child, `${location}.${key}`, localNames, depth + 1));
    return;
  }
  if (expressionKeys.length !== 1) fail("VALIDATION", "EXPRESSION_INVALID", location, "Template expression must have one operator");
  const operator = expressionKeys[0]!;
  const companions: Record<string, readonly string[]> = { $ref: [], $call: ["args"], $default: [], $if: ["then", "else"], $map: [], $merge: [], $omit: [] };
  if (!(operator in companions) || Object.keys(record).some((key) => key !== operator && !companions[operator]!.includes(key))) {
    fail("VALIDATION", "EXPRESSION_INVALID", location, "Template expression has unsupported fields");
  }
  if ("$ref" in record) {
    if (typeof record.$ref !== "string" || !isAllowedReference(record.$ref, localNames)) fail("VALIDATION", "UNSUPPORTED_REFERENCE", location, "Unsupported template reference");
    return;
  }
  if ("$call" in record) {
    if (typeof record.$call !== "string" || !(record.$call in allowedFunctions)) fail("VALIDATION", "UNSUPPORTED_FUNCTION", location, "Unsupported template function");
    const signature = allowedFunctions[record.$call]!;
    if (!Array.isArray(record.args) || record.args.length < signature[0]! || record.args.length > signature[1]!) fail("VALIDATION", "INVALID_ARGUMENTS", location, "Template function args are invalid");
    record.args.forEach((child, index) => validateTemplate(child, `${location}.args[${index}]`, localNames, depth + 1));
    return;
  }
  if ("$default" in record || "$merge" in record) {
    const value = "$default" in record ? record.$default : record.$merge;
    if (!Array.isArray(value) || !value.length || value.length > language.limits.listItems) fail("VALIDATION", "EXPRESSION_INVALID", location, "Template list expression is invalid");
    value.forEach((child, index) => validateTemplate(child, `${location}.${operator}[${index}]`, localNames, depth + 1));
    return;
  }
  if ("$if" in record) {
    if (!("then" in record) || !("else" in record)) fail("VALIDATION", "EXPRESSION_INVALID", location, "Template condition requires then and else");
    validateTemplate(record.$if, `${location}.$if`, localNames, depth + 1);
    validateTemplate(record.then, `${location}.then`, localNames, depth + 1);
    validateTemplate(record.else, `${location}.else`, localNames, depth + 1);
    return;
  }
  if ("$map" in record) {
    if (!record.$map || typeof record.$map !== "object" || Array.isArray(record.$map)) fail("VALIDATION", "EXPRESSION_INVALID", location, "Template map is invalid");
    const map = record.$map as Record<string, unknown>;
    if (Object.keys(map).sort().join(",") !== "as,from,template" || typeof map.as !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(map.as)) fail("VALIDATION", "EXPRESSION_INVALID", location, "Template map alias is invalid");
    validateTemplate(map.from, `${location}.$map.from`, localNames, depth + 1);
    validateTemplate(map.template, `${location}.$map.template`, new Set([...localNames, map.as]), depth + 1);
    return;
  }
  if ("$omit" in record) {
    if (record.$omit !== true) fail("VALIDATION", "EXPRESSION_INVALID", location, "Template omit expression is invalid");
    return;
  }
  fail("VALIDATION", "EXPRESSION_INVALID", location, "Unsupported template expression");
}

export function evaluateTemplate(template: unknown, context: TemplateContext, location = "template") {
  validateTemplate(template, location);
  const result = evaluate(template, context, {}, 0, location);
  return result === OMIT ? undefined : result;
}

function evaluate(template: unknown, context: TemplateContext, locals: Record<string, unknown>, depth: number, field: string): unknown | typeof OMIT {
  if (depth > language.limits.depth) fail("EVALUATION", "MAX_DEPTH_EXCEEDED", field, "Template evaluation exceeds maximum depth");
  if (Array.isArray(template)) {
    return template.map((child, index) => evaluate(child, context, locals, depth + 1, `${field}[${index}]`)).filter((child) => child !== OMIT);
  }
  if (!template || typeof template !== "object") return template;
  const record = template as Record<string, unknown>;
  if ("$ref" in record) return readReference(String(record.$ref), context, locals);
  if ("$call" in record) {
    const args = (record.args as unknown[]).map((child, index) => evaluate(child, context, locals, depth + 1, `${field}.args[${index}]`)).filter((child) => child !== OMIT);
    return callFunction(String(record.$call), args, field);
  }
  if ("$default" in record) {
    for (const [index, child] of (record.$default as unknown[]).entries()) {
      const value = evaluate(child, context, locals, depth + 1, `${field}.$default[${index}]`);
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return undefined;
  }
  if ("$if" in record) {
    const condition = evaluate(record.$if, context, locals, depth + 1, `${field}.$if`);
    const present = condition !== undefined && condition !== null && condition !== "";
    return evaluate(present ? record.then : record.else, context, locals, depth + 1, `${field}.${present ? "then" : "else"}`);
  }
  if ("$map" in record) {
    const map = record.$map as Record<string, unknown>;
    const source = evaluate(map.from, context, locals, depth + 1, `${field}.$map.from`);
    if (source === undefined || source === null) return [];
    if (!Array.isArray(source)) fail("EVALUATION", "MAP_REQUIRES_ARRAY", `${field}.$map.from`, "Template $map source must resolve to an array");
    if (source.length > language.limits.arrayItems) fail("EVALUATION", "MAP_TOO_MANY_ITEMS", `${field}.$map.from`, "Template $map source exceeds maximum items");
    return source.map((item, index) => evaluate(map.template, context, { ...locals, [String(map.as)]: item }, depth + 1, `${field}.$map.template[${index}]`)).filter((child) => child !== OMIT);
  }
  if ("$merge" in record) {
    const output: Record<string, unknown> = {};
    for (const [index, child] of (record.$merge as unknown[]).entries()) {
      const value = evaluate(child, context, locals, depth + 1, `${field}.$merge[${index}]`);
      if (value === undefined || value === null || value === OMIT) continue;
      if (!value || typeof value !== "object" || Array.isArray(value)) fail("EVALUATION", "MERGE_REQUIRES_OBJECT", `${field}.$merge[${index}]`, "Template $merge values must be objects");
      Object.assign(output, value);
    }
    return output;
  }
  if ("$omit" in record) return OMIT;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    const value = evaluate(child, context, locals, depth + 1, `${field}.${key}`);
    if (value !== OMIT && value !== undefined) output[key] = value;
  }
  return output;
}

function isAllowedReference(reference: string, localNames: ReadonlySet<string>) {
  const [root] = reference.split(".");
  if (root !== undefined && localNames.has(root)) return true;
  if (root === "item") return false;
  if (allowedReferences.some((allowed) => reference === allowed || reference.startsWith(`${allowed}.`))) return true;
  return false;
}

function readReference(reference: string, context: TemplateContext, locals: Record<string, unknown>) {
  const segments = reference.split(".");
  let current: unknown = Object.prototype.hasOwnProperty.call(locals, segments[0]!) ? locals[segments.shift()!] : context;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function callFunction(name: string, args: unknown[], field: string) {
  const first = args[0];
  if (name === "mediaUrlByRole" || name === "mediaUrlsByRole") {
    if (!Array.isArray(first) || typeof args[1] !== "string" || !args[1].trim()) fail("EVALUATION", "MEDIA_ARGUMENT_INVALID", field, `${name} expects a media array and role`);
    const urls = first.flatMap((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) fail("EVALUATION", "MEDIA_ITEM_INVALID", field, `${name} expects media objects`);
      const media = item as Record<string, unknown>;
      if (typeof media.role !== "string" || !media.role.trim()) fail("EVALUATION", "MEDIA_ITEM_INVALID", field, `${name} expects media objects`);
      if (media.role !== args[1]) return [];
      if (typeof media.url !== "string" || !media.url.trim()) fail("EVALUATION", "MEDIA_URL_INVALID", field, `${name} expects a media URL`);
      return [media.url];
    });
    if (name === "mediaUrlsByRole") return urls;
    if (urls.length > 1) fail("EVALUATION", "MEDIA_ROLE_AMBIGUOUS", field, "mediaUrlByRole found multiple media for role");
    return urls[0];
  }
  if (name === "lowercase") return first === undefined || first === null ? first : String(first).toLowerCase();
  if (name === "uppercase") return first === undefined || first === null ? first : String(first).toUpperCase();
  if (name === "trim") return first === undefined || first === null ? first : String(first).trim();
  if (name === "number") {
    const value = Number(first);
    if (!Number.isFinite(value)) fail("EVALUATION", "NUMBER_CONVERSION_FAILED", field, "Template number conversion failed");
    return value;
  }
  if (name === "integer") {
    const value = Number(first);
    if (!Number.isSafeInteger(value)) fail("EVALUATION", "INTEGER_CONVERSION_FAILED", field, "Template integer conversion failed");
    return value;
  }
  if (name === "boolean") {
    if (first === true || first === false) return first;
    if (first === "true" || first === 1 || first === "1") return true;
    if (first === "false" || first === 0 || first === "0") return false;
    fail("EVALUATION", "BOOLEAN_CONVERSION_FAILED", field, "Template boolean conversion failed");
  }
  if (name === "json") {
    if (typeof first !== "string") fail("EVALUATION", "JSON_CONVERSION_FAILED", field, "Template json expects a string");
    try {
      return parseStrictJson(first, { maxBytes: language.limits.jsonBytes, maxDepth: language.limits.jsonDepth, maxKeys: language.limits.jsonKeys, maxArrayItems: language.limits.arrayItems, maxStringLength: language.limits.jsonStringLength });
    } catch {
      fail("EVALUATION", "JSON_CONVERSION_FAILED", field, "Template JSON conversion failed");
    }
  }
  if (name === "join") {
    if (!Array.isArray(first)) fail("EVALUATION", "JOIN_REQUIRES_ARRAY", field, "Template join expects an array");
    return first.map(String).join(args[1] === undefined ? "," : String(args[1]));
  }
  if (name === "concat") {
    if (args.some((value) => !Array.isArray(value))) fail("EVALUATION", "CONCAT_REQUIRES_ARRAYS", field, "Template concat expects arrays");
    return args.flatMap((value) => value as unknown[]);
  }
  if (name === "coalesce") return args.find((value) => value !== undefined && value !== null && value !== "");
  if (name === "omitEmpty") {
    if (first === undefined || first === null || first === "" || Array.isArray(first) && !first.length) return OMIT;
    return first;
  }
  if (name === "orientationForRatio") {
    const match = String(first || "").trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!match) fail("EVALUATION", "ORIENTATION_RATIO_INVALID", field, "Template orientationForRatio expects a positive W:H ratio");
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!(width > 0) || !(height > 0)) fail("EVALUATION", "ORIENTATION_RATIO_INVALID", field, "Template orientationForRatio expects a positive W:H ratio");
    return width < height ? "portrait" : "landscape";
  }
  fail("EVALUATION", "UNSUPPORTED_FUNCTION", field, "Unsupported template function");
}
