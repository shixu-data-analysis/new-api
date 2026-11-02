/** Catalog-driven request validation shared by browser and server runtimes. */
export const REQUEST_VALIDATOR_VERSION = "1.8.0";
export const REQUEST_VALIDATOR_VECTORS_SHA256 = "cb35d1a472ceafc6b2db3f62d3049345a7f66e971f99c928e7d45f645f8d2472";

export const CatalogRequestIssueCode = Object.freeze({
  PROMPT_TOO_LONG: "PROMPT_TOO_LONG",
  PROMPT_TOO_SHORT: "PROMPT_TOO_SHORT",
  REFERENCE_COUNT_BELOW_MINIMUM: "REFERENCE_COUNT_BELOW_MINIMUM",
  REFERENCE_COUNT_EXCEEDS_MAXIMUM: "REFERENCE_COUNT_EXCEEDS_MAXIMUM",
  TOTAL_REFERENCE_COUNT_EXCEEDS_MAXIMUM: "TOTAL_REFERENCE_COUNT_EXCEEDS_MAXIMUM",
  REFERENCE_COMBINATION_UNSUPPORTED: "REFERENCE_COMBINATION_UNSUPPORTED",
  MEDIA_FORMAT_UNSUPPORTED: "MEDIA_FORMAT_UNSUPPORTED",
  MEDIA_FILE_TOO_LARGE: "MEDIA_FILE_TOO_LARGE",
  MEDIA_TOTAL_SIZE_EXCEEDED: "MEDIA_TOTAL_SIZE_EXCEEDED",
  MEDIA_DURATION_OUT_OF_RANGE: "MEDIA_DURATION_OUT_OF_RANGE",
  MEDIA_TOTAL_DURATION_EXCEEDED: "MEDIA_TOTAL_DURATION_EXCEEDED",
  MEDIA_WIDTH_OUT_OF_RANGE: "MEDIA_WIDTH_OUT_OF_RANGE",
  MEDIA_HEIGHT_OUT_OF_RANGE: "MEDIA_HEIGHT_OUT_OF_RANGE",
  MEDIA_SHORT_EDGE_OUT_OF_RANGE: "MEDIA_SHORT_EDGE_OUT_OF_RANGE",
  MEDIA_ASPECT_RATIO_OUT_OF_RANGE: "MEDIA_ASPECT_RATIO_OUT_OF_RANGE",
  MEDIA_FRAME_RATE_OUT_OF_RANGE: "MEDIA_FRAME_RATE_OUT_OF_RANGE",
  PARAMETER_VALUE_UNSUPPORTED: "PARAMETER_VALUE_UNSUPPORTED",
  REQUIRED_MEDIA_METADATA_MISSING: "REQUIRED_MEDIA_METADATA_MISSING",
});

// These are the catalog fields that the shared request validator actually interprets.
// Keeping the schema allowlist derived from this contract prevents catalog-only rules.
export const REQUEST_VALIDATOR_PARAM_SCHEMA_FIELDS = Object.freeze([
  "aspectRatios", "qualities", "apiQualities", "backgroundModes", "backgroundInput", "minBatchSize", "maxBatchSize", "durationRange", "durationRangeByQuality", "supportsAudioGeneration", "options",
  "minOutputTokens",
]);
export const REQUEST_VALIDATOR_DURATION_FIELDS = Object.freeze(["min", "max", "step"]);
export const REQUEST_VALIDATOR_OPTION_FIELDS = Object.freeze(["key", "label", "type", "values"]);
export const REQUEST_VALIDATOR_OPTION_VALUE_FIELDS = Object.freeze(["value", "label"]);
export const REQUEST_VALIDATOR_OPTION_TYPES = Object.freeze(["enum", "boolean"]);
export const REQUEST_VALIDATOR_REFERENCE_LIMIT_FIELDS = Object.freeze([
  "minImageReferences", "maxImageReferences", "maxVideoReferences", "maxAudioReferences", "maxTotalReferences", "maxImagesWithResults", "minPromptCharacters", "maxPromptCharacters",
  "supportsTextToVideo", "supportsImageToVideo", "supportsStartEndFrames", "supportsImageReference", "supportsVideoReference", "supportsAudioReference",
  "requiresImageInputWithVideo", "requiresVisualInputWithAudio",
]);
export const REQUEST_VALIDATOR_MEDIA_CONSTRAINT_FIELDS = Object.freeze([
  "formats", "minDurationMs", "maxDurationMs", "maxTotalDurationMs", "maxFileSizeBytes", "maxTotalFileSizeBytes",
  "minShortEdgePx", "maxShortEdgePx", "minWidthPx", "maxWidthPx", "minHeightPx", "maxHeightPx", "minAspectRatio", "maxAspectRatio", "minFrameRate", "maxFrameRate",
]);

// The canvas draws, and the admin form accepts, a ratio only when both sides are positive numbers.
export function isAspectRatio(value) {
  const match = typeof value === "string" ? /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(value) : null;
  return match !== null && Number(match[1]) > 0 && Number(match[2]) > 0;
}

// Cloud compares state values as exact text and treats an unmatched value as still running, so a forgotten comma
// ("queued pending") or a value in two groups would poll until the task times out.
export function profileStatesIssue(states) {
  const groupOf = new Map();
  for (const [group, values] of Object.entries(object(states))) {
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (typeof value !== "string") continue;
      if (/\s/.test(value)) return `states.${group} value "${value}" must not contain whitespace`;
      const other = groupOf.get(value);
      if (other !== undefined && other !== group) return `states value "${value}" must not be in both ${other} and ${group}`;
      groupOf.set(value, group);
    }
  }
  return undefined;
}

const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const positiveInteger = (value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const nonNegativeInteger = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, stable(entry)]));
  return value;
}

function issueValue(value) {
  return typeof value === "string" || typeof value === "number" ? value : JSON.stringify(stable(value)) ?? String(value);
}

function add(issues, code, field, details = {}) { issues.push({ code, field, ...details }); }

function addMissingMetadata(issues, field, details) {
  const duplicate = issues.some((issue) => issue.code === CatalogRequestIssueCode.REQUIRED_MEDIA_METADATA_MISSING
    && issue.field === field
    && issue.assetId === details.assetId
    && issue.assetIndex === details.assetIndex);
  if (!duplicate) add(issues, CatalogRequestIssueCode.REQUIRED_MEDIA_METADATA_MISSING, field, details);
}

export function resolveCatalogRequest({ interaction, parameterBindings, request } = {}) {
  const capability = object(interaction);
  const bindings = object(parameterBindings);
  const submitted = object(request);
  const issues = [];
  for (const [field, expected] of Object.entries(bindings)) {
    if (has(submitted, field) && JSON.stringify(stable(submitted[field])) !== JSON.stringify(stable(expected))) {
      add(issues, CatalogRequestIssueCode.PARAMETER_VALUE_UNSUPPORTED, field, { actual: issueValue(submitted[field]), allowed: [issueValue(expected)] });
    }
  }
  return { request: { ...object(capability.defaultParams), ...bindings, ...submitted }, issues };
}

function metadataFromRequest(request, issues) {
  const ids = request.inputAssetIds;
  const raw = request.inputAssetMetadata;
  if (ids === undefined && raw === undefined) return [];
  if (!Array.isArray(ids)) {
    if (Array.isArray(raw)) for (const [assetIndex, entry] of raw.entries()) addMissingMetadata(issues, "inputAssetIds", { assetIndex, ...(typeof entry?.inputAssetId === "string" ? { assetId: entry.inputAssetId } : {}) });
    else addMissingMetadata(issues, "inputAssetIds", {});
    return [];
  }
  const seenIds = new Set();
  for (const [assetIndex, assetId] of ids.entries()) {
    if (typeof assetId !== "string" || !assetId) addMissingMetadata(issues, "inputAssetIds", { assetIndex, ...(typeof assetId === "string" ? { assetId } : {}) });
    else if (seenIds.has(assetId)) addMissingMetadata(issues, "inputAssetIds", { assetId, assetIndex });
    else seenIds.add(assetId);
  }
  if (ids.some((id) => typeof id !== "string" || !id) || seenIds.size !== ids.length) return [];
  if (!Array.isArray(raw)) {
    for (const assetId of ids) addMissingMetadata(issues, "inputAssetMetadata", { assetId });
    return [];
  }

  const entries = raw.map((entry, assetIndex) => ({ value: object(entry), assetIndex }));
  const metadataIds = new Map();
  for (const { value, assetIndex } of entries) {
    const assetId = value.inputAssetId;
    if (typeof assetId !== "string" || !ids.includes(assetId)) addMissingMetadata(issues, "inputAssetId", { assetIndex, ...(typeof assetId === "string" ? { assetId } : {}) });
    else if (metadataIds.has(assetId)) addMissingMetadata(issues, "inputAssetId", { assetId, assetIndex });
    else metadataIds.set(assetId, assetIndex);
  }

  return ids.flatMap((assetId) => {
    const matches = entries.filter(({ value }) => value.inputAssetId === assetId);
    if (matches.length !== 1) {
      addMissingMetadata(issues, "inputAssetMetadata", { assetId });
      return [];
    }
    const { value } = matches[0];
    const details = { assetId };
    let complete = true;
    if (!["IMAGE", "VIDEO", "AUDIO"].includes(value.mediaType)) {
      addMissingMetadata(issues, "mediaType", details);
      complete = false;
    }
    if (!complete) return [];
    return [{ ...value, ...details, ...(typeof value.mimeType === "string" ? { mimeType: value.mimeType.toLowerCase() } : {}) }];
  });
}

function mediaRules(interaction) {
  const direct = object(interaction.mediaConstraints);
  const result = {};
  for (const kind of Object.keys(direct)) result[kind] = { ...object(direct[kind]) };
  return result;
}

/** The duration range of one quality: a quality-specific range overrides only the bounds it names, e.g. 720P capped at 12 seconds. */
export function durationRangeForQuality(paramSchema, quality) {
  const schema = object(paramSchema);
  const byQuality = object(schema.durationRangeByQuality);
  return { ...object(schema.durationRange), ...(typeof quality === "string" && has(byQuality, quality) ? object(byQuality[quality]) : {}) };
}

function checkParameters(interaction, request, issues) {
  const schema = object(interaction.paramSchema);
  for (const [field, allowedField] of [["aspectRatio", "aspectRatios"], ["quality", "qualities"], ["apiQuality", "apiQualities"], ["background", "backgroundModes"]]) {
    if (has(request, field) && Array.isArray(schema[allowedField]) && !schema[allowedField].includes(request[field])) add(issues, CatalogRequestIssueCode.PARAMETER_VALUE_UNSUPPORTED, field, { actual: request[field], allowed: schema[allowedField] });
  }
  // minBatchSize equal to maxBatchSize fixes the result count (e.g. one upstream call always returns four images).
  const hasMaxBatch = nonNegativeInteger(schema.maxBatchSize);
  const hasMinBatch = positiveInteger(schema.minBatchSize);
  if (has(request, "batchSize") && (hasMaxBatch || hasMinBatch)) {
    const tooLarge = hasMaxBatch && (!positiveInteger(request.batchSize) || request.batchSize > schema.maxBatchSize);
    const tooSmall = hasMinBatch && (!positiveInteger(request.batchSize) || request.batchSize < schema.minBatchSize);
    if (tooLarge || tooSmall) add(issues, CatalogRequestIssueCode.PARAMETER_VALUE_UNSUPPORTED, "batchSize", { actual: request.batchSize, ...(hasMinBatch ? { minimum: schema.minBatchSize } : {}), ...(hasMaxBatch ? { maximum: schema.maxBatchSize } : {}) });
  }
  if (has(request, "durationSeconds")) {
    const range = durationRangeForQuality(schema, request.quality);
    const min = positiveInteger(range.min) ? range.min : undefined;
    const max = positiveInteger(range.max) ? range.max : undefined;
    const step = positiveInteger(range.step) ? range.step : 1;
    if (!positiveInteger(request.durationSeconds) || (min !== undefined && request.durationSeconds < min) || (max !== undefined && request.durationSeconds > max) || (min !== undefined && (request.durationSeconds - min) % step !== 0)) add(issues, CatalogRequestIssueCode.PARAMETER_VALUE_UNSUPPORTED, "durationSeconds", { actual: request.durationSeconds, ...(min === undefined ? {} : { minimum: min }), ...(max === undefined ? {} : { maximum: max }) });
  }
  // A text request's own output limit must leave a reasoning model room to answer (minOutputTokens). A limit above the
  // model maximum is left to the Provider, which refuses it.
  if (positiveInteger(schema.minOutputTokens)) {
    const raw = rawParamsObject(request.rawParams);
    for (const [field, value] of [["maxTokens", request.maxTokens], ["rawParams.maxTokens", raw.maxTokens], ["rawParams.max_tokens", raw.max_tokens], ["rawParams.max_output_tokens", raw.max_output_tokens]]) {
      if (typeof value === "number" && value < schema.minOutputTokens) add(issues, CatalogRequestIssueCode.PARAMETER_VALUE_UNSUPPORTED, field, { actual: value, minimum: schema.minOutputTokens });
    }
  }
}

// Model-specific options travel in rawParams (a JSON object or its string form); their defaults live in defaultParams.
function checkOptions(schema, request, issues) {
  if (!Array.isArray(schema.options) || schema.options.length === 0) return;
  const raw = rawParamsObject(request.rawParams);
  for (const option of schema.options) {
    const key = typeof option?.key === "string" ? option.key : undefined;
    if (!key || !has(raw, key)) continue;
    const actual = raw[key];
    if (option.type === "boolean") {
      if (typeof actual !== "boolean") add(issues, CatalogRequestIssueCode.PARAMETER_VALUE_UNSUPPORTED, `rawParams.${key}`, { actual: issueValue(actual), allowed: ["true", "false"] });
    } else if (option.type === "enum") {
      const allowed = Array.isArray(option.values) ? option.values.map((entry) => entry?.value) : [];
      if (!allowed.includes(actual)) add(issues, CatalogRequestIssueCode.PARAMETER_VALUE_UNSUPPORTED, `rawParams.${key}`, { actual: issueValue(actual), allowed });
    }
  }
}

function rawParamsObject(value) {
  if (typeof value !== "string") return object(value);
  try { return object(JSON.parse(value)); } catch { return {}; }
}

function rangeIssue(issues, code, field, value, rules, details) {
  const suffix = field[0].toUpperCase() + field.slice(1);
  const minimum = rules[`min${suffix}`];
  const maximum = rules[`max${suffix}`];
  if ((minimum !== undefined || maximum !== undefined) && typeof value !== "number") return;
  else if ((minimum !== undefined && value < minimum) || (maximum !== undefined && value > maximum)) add(issues, code, field, { ...details, actual: value, ...(minimum === undefined ? {} : { minimum }), ...(maximum === undefined ? {} : { maximum }) });
}

function derivedRangeIssue(issues, code, field, value, rules, details, entry) {
  const suffix = field[0].toUpperCase() + field.slice(1);
  if (rules[`min${suffix}`] === undefined && rules[`max${suffix}`] === undefined) return;
  if (typeof entry.widthPx !== "number" || typeof entry.heightPx !== "number") return;
  rangeIssue(issues, code, field, value, rules, details);
}

function checkMedia(interaction, metadata, issues, mode) {
  const limits = object(interaction.referenceLimits);
  const groups = { image: [], video: [], audio: [] };
  for (const entry of metadata) groups[entry.mediaType === "IMAGE" ? "image" : entry.mediaType === "VIDEO" ? "video" : "audio"].push(entry);
  const imageCount = groups.image.length;
  if (mode === "text-to-video" && metadata.length > 0) add(issues, CatalogRequestIssueCode.REFERENCE_COMBINATION_UNSUPPORTED, "mode", { actual: mode });
  if (mode === "image-to-video") {
    if (limits.supportsImageToVideo !== true) add(issues, CatalogRequestIssueCode.REFERENCE_COMBINATION_UNSUPPORTED, "mode", { actual: mode });
    else if (imageCount !== 1 || groups.video.length > 0 || groups.audio.length > 0) add(issues, CatalogRequestIssueCode.REFERENCE_COMBINATION_UNSUPPORTED, "mode", { actual: mode });
  }
  if (mode === "first-last-frame") {
    if (limits.supportsStartEndFrames !== true) add(issues, CatalogRequestIssueCode.REFERENCE_COMBINATION_UNSUPPORTED, "mode", { actual: mode });
    else if (imageCount !== 2 || groups.video.length > 0 || groups.audio.length > 0) add(issues, CatalogRequestIssueCode.REFERENCE_COMBINATION_UNSUPPORTED, "mode", { actual: mode });
  }
  const referenceFlags = [["image", "supportsImageReference"], ["video", "supportsVideoReference"], ["audio", "supportsAudioReference"]];
  if (mode === "image-reference" && !referenceFlags.some(([, flag]) => limits[flag] === true)) add(issues, CatalogRequestIssueCode.REFERENCE_COMBINATION_UNSUPPORTED, "mode", { actual: mode });
  for (const [kind, flag] of referenceFlags) {
    const unsupported = mode === "image-reference" ? limits[flag] !== true : mode === undefined && limits[flag] === false;
    if (unsupported && groups[kind].length > 0) add(issues, CatalogRequestIssueCode.REFERENCE_COMBINATION_UNSUPPORTED, "inputAssetIds", { mediaKind: kind });
  }
  if (mode === "text-to-video" && limits.supportsTextToVideo === false) add(issues, CatalogRequestIssueCode.REFERENCE_COMBINATION_UNSUPPORTED, "mode", { actual: mode });
  if (mode === "first-last-frame" && limits.supportsStartEndFrames === true) {
    const roles = metadata.map((entry) => entry.inputRole).filter((value) => value !== undefined);
    if (roles.length !== 2 || !roles.includes("first-frame") || !roles.includes("last-frame")) add(issues, CatalogRequestIssueCode.REFERENCE_COMBINATION_UNSUPPORTED, "inputRole", { mediaKind: "image" });
  }
  for (const [kind, limit] of [["image", "maxImageReferences"], ["video", "maxVideoReferences"], ["audio", "maxAudioReferences"]]) if (nonNegativeInteger(limits[limit]) && groups[kind].length > limits[limit]) add(issues, CatalogRequestIssueCode.REFERENCE_COUNT_EXCEEDS_MAXIMUM, "inputAssetIds", { mediaKind: kind, actual: groups[kind].length, maximum: limits[limit] });
  if (nonNegativeInteger(limits.minImageReferences) && groups.image.length < limits.minImageReferences) add(issues, CatalogRequestIssueCode.REFERENCE_COUNT_BELOW_MINIMUM, "inputAssetIds", { mediaKind: "image", actual: groups.image.length, minimum: limits.minImageReferences });
  if (nonNegativeInteger(limits.maxTotalReferences) && metadata.length > limits.maxTotalReferences) add(issues, CatalogRequestIssueCode.TOTAL_REFERENCE_COUNT_EXCEEDS_MAXIMUM, "inputAssetIds", { actual: metadata.length, maximum: limits.maxTotalReferences });
  if (limits.requiresImageInputWithVideo === true && groups.video.length > 0 && groups.image.length === 0) add(issues, CatalogRequestIssueCode.REFERENCE_COMBINATION_UNSUPPORTED, "inputAssetIds", { mediaKind: "video" });
  if (limits.requiresVisualInputWithAudio === true && groups.audio.length > 0 && groups.image.length + groups.video.length === 0) add(issues, CatalogRequestIssueCode.REFERENCE_COMBINATION_UNSUPPORTED, "inputAssetIds", { mediaKind: "audio" });
  const constraints = mediaRules(interaction);
  for (const kind of ["image", "video", "audio"]) {
    const rules = object(constraints[kind]);
    for (const entry of groups[kind]) {
      const details = { mediaKind: kind, ...(entry.assetId ? { assetId: entry.assetId } : { assetIndex: entry.assetIndex }) };
      if (Array.isArray(rules.formats) && typeof entry.mimeType === "string" && !rules.formats.includes(entry.mimeType)) add(issues, CatalogRequestIssueCode.MEDIA_FORMAT_UNSUPPORTED, "mimeType", { ...details, actual: entry.mimeType, allowed: rules.formats });
      if (positiveInteger(rules.maxFileSizeBytes) && entry.fileSizeBytes > rules.maxFileSizeBytes) add(issues, CatalogRequestIssueCode.MEDIA_FILE_TOO_LARGE, "fileSizeBytes", { ...details, actual: entry.fileSizeBytes, maximum: rules.maxFileSizeBytes });
      rangeIssue(issues, CatalogRequestIssueCode.MEDIA_DURATION_OUT_OF_RANGE, "durationMs", entry.durationMs, rules, details);
      rangeIssue(issues, CatalogRequestIssueCode.MEDIA_WIDTH_OUT_OF_RANGE, "widthPx", entry.widthPx, rules, details);
      rangeIssue(issues, CatalogRequestIssueCode.MEDIA_HEIGHT_OUT_OF_RANGE, "heightPx", entry.heightPx, rules, details);
      const shortEdge = typeof entry.widthPx === "number" && typeof entry.heightPx === "number" ? Math.min(entry.widthPx, entry.heightPx) : undefined;
      derivedRangeIssue(issues, CatalogRequestIssueCode.MEDIA_SHORT_EDGE_OUT_OF_RANGE, "shortEdgePx", shortEdge, rules, details, entry);
      const aspectRatio = typeof entry.widthPx === "number" && typeof entry.heightPx === "number" ? entry.widthPx / entry.heightPx : undefined;
      derivedRangeIssue(issues, CatalogRequestIssueCode.MEDIA_ASPECT_RATIO_OUT_OF_RANGE, "aspectRatio", aspectRatio, rules, details, entry);
      rangeIssue(issues, CatalogRequestIssueCode.MEDIA_FRAME_RATE_OUT_OF_RANGE, "frameRate", entry.frameRate, rules, details);
    }
    const totalSize = groups[kind].reduce((sum, entry) => sum + entry.fileSizeBytes, 0);
    if (positiveInteger(rules.maxTotalFileSizeBytes) && totalSize > rules.maxTotalFileSizeBytes) add(issues, CatalogRequestIssueCode.MEDIA_TOTAL_SIZE_EXCEEDED, "fileSizeBytes", { mediaKind: kind, actual: totalSize, maximum: rules.maxTotalFileSizeBytes });
    const totalDuration = groups[kind].reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0);
    if (positiveInteger(rules.maxTotalDurationMs) && totalDuration > rules.maxTotalDurationMs) add(issues, CatalogRequestIssueCode.MEDIA_TOTAL_DURATION_EXCEEDED, "durationMs", { mediaKind: kind, actual: totalDuration, maximum: rules.maxTotalDurationMs });
  }
}

function checkImageCombinations(interaction, value, metadata, issues) {
  const schema = object(interaction.paramSchema);
  const images = metadata.filter((entry) => entry.mediaType === "IMAGE");
  // Only one input image with an alpha channel can produce a transparent result. A browser may not know the channel, so
  // an unknown value passes here; Cloud passes only what its probe verified.
  if (value.background === "transparent" && schema.backgroundInput === "singleAlphaImage" && (images.length !== 1 || images[0].hasAlpha === false)) {
    add(issues, CatalogRequestIssueCode.PARAMETER_VALUE_UNSUPPORTED, "background", { actual: "transparent" });
  }
  // An upstream limit a model declares, per call: reference images plus the results of that call. Split calls make one each.
  const limit = object(interaction.referenceLimits).maxImagesWithResults;
  if (!positiveInteger(limit)) return;
  const resultsPerCall = object(interaction.defaultParams).multiResultMode === "fanout" || !positiveInteger(value.batchSize) ? 1 : value.batchSize;
  const total = images.length + resultsPerCall;
  if (total > limit) add(issues, CatalogRequestIssueCode.TOTAL_REFERENCE_COUNT_EXCEEDS_MAXIMUM, "maxImagesWithResults", { actual: total, maximum: limit });
}

function checkRequestParameters(capability, value, issues) {
  checkParameters(capability, value, issues);
  checkOptions(object(capability.paramSchema), value, issues);
  if (value.generateAudio === true && object(capability.paramSchema).supportsAudioGeneration === false) add(issues, CatalogRequestIssueCode.PARAMETER_VALUE_UNSUPPORTED, "generateAudio", { actual: "true", allowed: ["false"] });
}

/** A customer request that takes the defaults meets the same rules, so a default outside them could never be used. */
export function defaultParamsIssues(interaction) {
  const issues = [];
  checkRequestParameters(object(interaction), object(object(interaction).defaultParams), issues);
  return issues;
}

export function validateCatalogRequest({ model, interaction, request = {} } = {}) {
  const capability = interaction ?? object(object(model).release).publicInteraction;
  const value = object(request);
  const issues = [];
  if (!capability || typeof capability !== "object") return { ok: true, issues, validatorVersion: REQUEST_VALIDATOR_VERSION };
  const limits = object(capability.referenceLimits);
  if (nonNegativeInteger(limits.maxPromptCharacters) && typeof value.prompt === "string" && Array.from(value.prompt).length > limits.maxPromptCharacters) add(issues, CatalogRequestIssueCode.PROMPT_TOO_LONG, "prompt", { actual: Array.from(value.prompt).length, maximum: limits.maxPromptCharacters });
  // A provided prompt must carry enough non-whitespace text; an omitted prompt is left to the caller that composes it.
  if (nonNegativeInteger(limits.minPromptCharacters) && limits.minPromptCharacters > 0 && typeof value.prompt === "string" && Array.from(value.prompt.trim()).length < limits.minPromptCharacters) add(issues, CatalogRequestIssueCode.PROMPT_TOO_SHORT, "prompt", { actual: Array.from(value.prompt.trim()).length, minimum: limits.minPromptCharacters });
  checkRequestParameters(capability, value, issues);
  const metadata = metadataFromRequest(value, issues);
  checkMedia(capability, metadata, issues, value.mode);
  checkImageCombinations(capability, value, metadata, issues);
  return { ok: issues.length === 0, issues, validatorVersion: REQUEST_VALIDATOR_VERSION };
}

// Adapter Profile request options shared by the Catalog validation script, the Cloud import and Executor, and the App
// Profile compiler. Each caller decides which Profile kinds may declare a prompt reference format.
export const PROMPT_REFERENCE_FORMAT_KINDS = Object.freeze(["image.generate", "video.generate"]);
const PROMPT_REFERENCE_MEDIA = Object.freeze(["image", "video", "audio"]);
// Headers the Cloud Executor sets itself, and transport-control or hop-by-hop headers that would change the target host
// or the transport.
const RESERVED_REQUEST_HEADERS = new Set([
  "accept", "content-type", "authorization",
  "host", "content-length", "transfer-encoding", "connection", "keep-alive", "upgrade", "te", "trailer", "expect", "proxy-authorization", "proxy-connection", "cookie",
]);

function isPromptReferenceTemplate(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 32) return false;
  const parts = value.split("{n}");
  return parts.length === 2 && !/[{}\p{Cc}]/u.test(parts.join(""));
}

export function isPromptReferenceFormat(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === PROMPT_REFERENCE_MEDIA.length && PROMPT_REFERENCE_MEDIA.every((media) => keys.includes(media) && isPromptReferenceTemplate(value[media]));
}

// Whitespace collapsing is independent of the reference format: image and video prompts collapse by default, and a
// Profile may turn it off with false.
export const PROMPT_WHITESPACE_KINDS = Object.freeze(["image.generate", "video.generate"]);
export function collapsePromptWhitespaceIssue(value, kind) {
  if (typeof value !== "boolean") return "collapsePromptWhitespace must be a boolean";
  if (!PROMPT_WHITESPACE_KINDS.includes(kind)) return "collapsePromptWhitespace is only allowed for image.generate and video.generate Profiles";
  return undefined;
}

export function credentialHeaderName(securitySchemes, schemeName) {
  if (typeof schemeName !== "string") return undefined;
  const scheme = object(object(securitySchemes)[schemeName]);
  return scheme.type === "apiKey" && scheme.in === "header" && typeof scheme.name === "string" ? scheme.name : undefined;
}

export function idempotencyHeaderIssue(value, workflow, credentialHeader) {
  if (typeof value !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(value)) return "idempotencyHeader must be a header name of 1-64 letters, digits or hyphens";
  const name = value.toLowerCase();
  if (RESERVED_REQUEST_HEADERS.has(name)) return `idempotencyHeader must not be the reserved header ${value}`;
  if (typeof credentialHeader === "string" && credentialHeader.toLowerCase() === name) return "idempotencyHeader must not be the credential header of the security scheme";
  if (workflow !== "async") return "idempotencyHeader is only allowed for the async workflow";
  return undefined;
}

// Token usage estimates shared by the Cloud quote and the Canvas Web price, so the points a customer sees before
// submitting equal the points Cloud holds (IMAGE-TOKEN-BILLING-001). The Catalog declares the estimate; code only
// implements these generic methods and never infers a model's numbers from its name.
// total and totalWithVideoInput are the whole usage of an upstream that reports only one count and prices it by whether
// the request has a video input (a Seedance video task, VIDEO-TOKEN-BILLING-001): a request bills one of them.
export const TOKEN_USAGE_CATEGORIES = Object.freeze(["input", "output", "cacheRead", "cacheWrite", "imageInput", "total", "totalWithVideoInput"]);
export const PROMPT_TOKENIZERS = Object.freeze(["openai", "claude", "gemini"]);
export const IMAGE_OUTPUT_ESTIMATE_METHODS = Object.freeze(["openai-image-grid", "lookup-table"]);
export const IMAGE_REFERENCE_ESTIMATE_METHODS = Object.freeze(["per-input-image"]);
export const VIDEO_ESTIMATE_METHODS = Object.freeze(["video-pixel-seconds"]);

// The weighted character estimator of the pinned New API (2026-09-06), in hundredths of a Token per character class.
const PROMPT_TOKENIZER_WEIGHTS = Object.freeze({
  gemini: { word: 115, number: 280, cjk: 68, symbol: 38, math: 105, url: 120, at: 250, emoji: 108, newline: 115, space: 20 },
  claude: { word: 113, number: 163, cjk: 121, symbol: 40, math: 452, url: 126, at: 282, emoji: 260, newline: 89, space: 39 },
  openai: { word: 102, number: 155, cjk: 85, symbol: 40, math: 268, url: 100, at: 200, emoji: 212, newline: 50, space: 42 },
});
const MATH_SYMBOLS = new Set([..."∑∫∂√∞≤≥≠≈±×÷∈∉∋∌⊂⊃⊆⊇∪∩∧∨¬∀∃∄∅∆∇∝∟∠∡∢°′″‴⁺⁻⁼⁽⁾ⁿ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎²³¹⁴⁵⁶⁷⁸⁹⁰"]);

export function estimatePromptTokens(tokenizer, text) {
  const weights = PROMPT_TOKENIZER_WEIGHTS[tokenizer];
  if (!weights) throw new Error(`Unknown prompt tokenizer: ${String(tokenizer)}`);
  if (typeof text !== "string" || text === "") return "0";
  let weighted = 0;
  let previous = "NONE";
  for (const character of text) {
    const point = character.codePointAt(0);
    if (/^\p{White_Space}$/u.test(character)) {
      previous = "NONE";
      weighted += character === "\n" || character === "\t" ? weights.newline : weights.space;
    } else if (/^\p{Script=Han}$/u.test(character) || (point >= 0x3040 && point <= 0x30ff) || (point >= 0xac00 && point <= 0xd7a3)) {
      previous = "NONE"; weighted += weights.cjk;
    } else if ((point >= 0x1f300 && point <= 0x1f9ff) || (point >= 0x2600 && point <= 0x26ff) || (point >= 0x2700 && point <= 0x27bf) || (point >= 0x1fa00 && point <= 0x1faff)) {
      previous = "NONE"; weighted += weights.emoji;
    } else if (/^[\p{L}\p{N}]$/u.test(character)) {
      const current = /^\p{N}$/u.test(character) ? "NUMBER" : "LETTER";
      if (previous !== current) weighted += current === "NUMBER" ? weights.number : weights.word;
      previous = current;
    } else {
      previous = "NONE";
      if (MATH_SYMBOLS.has(character) || (point >= 0x2200 && point <= 0x22ff) || (point >= 0x2a00 && point <= 0x2aff) || (point >= 0x1d400 && point <= 0x1d7ff)) weighted += weights.math;
      else if (character === "@") weighted += weights.at;
      else if ("/:?&=;#%".includes(character)) weighted += weights.url;
      else weighted += weights.symbol;
    }
  }
  return Math.ceil(weighted / 100).toString();
}

// Text models pick the weights from the upstream model ID, as New API does. Image models declare their tokenizer
// instead, because the Canvas Web price never sees the upstream model ID.
export function estimateTokensByModel(model, text) {
  const lower = String(model).toLowerCase();
  return estimatePromptTokens(lower.includes("gemini") ? "gemini" : lower.includes("claude") ? "claude" : "openai", text);
}

/**
 * Output Tokens of one GPT Image picture by the official OpenAI calculator (image generation guide, "Cost and latency"):
 * u = round(base × short / long) with ties to even, then ceil(base × u × (2,000,000 + width × height) / 4,000,000).
 * Integer arithmetic only, so every runtime gets the same count.
 */
export function openAiImageOutputTokens(width, height, base) {
  if (![width, height, base].every(positiveInteger)) throw new Error("Image width, height and quality base must be positive integers");
  const long = BigInt(Math.max(width, height));
  const short = BigInt(Math.min(width, height));
  const scaled = BigInt(base) * short;
  let units = scaled / long;
  const twiceRemainder = 2n * (scaled - units * long);
  if (twiceRemainder > long || (twiceRemainder === long && units % 2n === 1n)) units += 1n;
  const numerator = BigInt(base) * units * (2_000_000n + BigInt(width) * BigInt(height));
  return ((numerator + 3_999_999n) / 4_000_000n).toString();
}

function imageSize(defaults, aspectRatio, quality) {
  const size = object(object(defaults.sizeMap)[aspectRatio])[quality];
  const match = typeof size === "string" ? /^(\d+)x(\d+)$/.exec(size) : null;
  if (!match) throw new Error(`The size map declares no size for ${String(aspectRatio)} at ${String(quality)}`);
  return [Number(match[1]), Number(match[2])];
}

function perImageOutputTokens(estimate, defaults, request) {
  const output = object(estimate.output);
  const quality = request.quality ?? defaults.quality;
  if (output.method === "openai-image-grid") {
    const apiQuality = request.apiQuality ?? defaults.apiQuality;
    const base = object(output.qualityBases)[apiQuality];
    if (!positiveInteger(base)) throw new Error(`The usage estimate declares no quality base for ${String(apiQuality)}`);
    const [width, height] = imageSize(defaults, request.aspectRatio ?? defaults.aspectRatio, quality);
    return BigInt(openAiImageOutputTokens(width, height, base));
  }
  if (output.method === "lookup-table") {
    const tokens = object(output.tokens)[quality];
    if (!positiveInteger(tokens)) throw new Error(`The usage estimate declares no output Tokens for ${String(quality)}`);
    const margin = output.marginTokens ?? 0;
    if (!nonNegativeInteger(margin)) throw new Error("The usage estimate margin must be a nonnegative integer");
    return BigInt(tokens) + BigInt(margin);
  }
  throw new Error(`Unknown image output estimate method: ${String(output.method)}`);
}

/**
 * The Token usage held for one image request: (output + prompt + reference images) per picture, times the picture
 * count, since the upstream charges the input once for every picture. Counts are strings keyed by Token category.
 */
export function estimateImageTokenUsage({ interaction, request = {}, imageReferenceCount = 0 } = {}) {
  const schema = object(object(interaction).paramSchema);
  const defaults = object(object(interaction).defaultParams);
  const estimate = object(schema.usageEstimate);
  const categories = Array.isArray(schema.tokenUsageCategories) ? schema.tokenUsageCategories : [];
  const value = object(request);
  if (!nonNegativeInteger(imageReferenceCount)) throw new Error("The reference image count must be a nonnegative integer");
  const batchSize = value.batchSize ?? defaults.batchSize ?? 1;
  if (!positiveInteger(batchSize)) throw new Error("batchSize must be a positive integer");
  const prompt = object(estimate.prompt);
  const reference = object(estimate.referenceImage);
  if (reference.method !== undefined && !IMAGE_REFERENCE_ESTIMATE_METHODS.includes(reference.method)) throw new Error(`Unknown reference image estimate method: ${String(reference.method)}`);
  if (imageReferenceCount > 0 && !positiveInteger(reference.tokens)) throw new Error("The usage estimate declares no Tokens per reference image");
  const referenceCategory = reference.category ?? "input";
  for (const category of ["input", "output", ...(imageReferenceCount > 0 ? [referenceCategory] : [])]) {
    if (!categories.includes(category)) throw new Error(`The model declares no ${category} Token category`);
  }
  const perImage = { input: BigInt(estimatePromptTokens(prompt.tokenizer, value.prompt)), output: perImageOutputTokens(estimate, defaults, value) };
  if (imageReferenceCount > 0) perImage[referenceCategory] = (perImage[referenceCategory] ?? 0n) + BigInt(reference.tokens) * BigInt(imageReferenceCount);
  const count = BigInt(batchSize);
  return Object.fromEntries(Object.entries(perImage).map(([category, tokens]) => [category, (tokens * count).toString()]));
}

function videoPixels(estimate, quality, aspectRatio) {
  const size = object(object(estimate.pixels)[quality])[aspectRatio];
  const match = typeof size === "string" ? /^(\d+)x(\d+)$/.exec(size) : null;
  if (!match) throw new Error(`The usage estimate declares no pixels for ${String(quality)} at ${String(aspectRatio)}`);
  return [BigInt(match[1]), BigInt(match[2])];
}

function minimumInputRatio(value) {
  if (value === undefined) return [0n, 1n];
  const match = typeof value === "string" ? /^([1-9]\d*)\/([1-9]\d*)$/.exec(value) : null;
  if (!match) throw new Error("minInputVideoRatio must be a fraction such as 2/3");
  return [BigInt(match[1]), BigInt(match[2])];
}

const ceilDivide = (numerator, denominator) => (numerator + denominator - 1n) / denominator;

/**
 * The Token usage held for one video request (video-pixel-seconds, Seedance): for every result
 * floor(frames × width × height / pixelsPerToken), frames = (input video seconds + output seconds) × framesPerSecond +
 * extraFrames. The input video seconds are the reference videos' total, rounded up to whole seconds and at least
 * ceil(output seconds × minInputVideoRatio); a reference video whose duration is unknown (null) counts the model's
 * maximum total video duration. Reference images and audio are free. A request with a reference video counts in
 * totalWithVideoInput when the model declares it, otherwise in total. Counts are strings keyed by Token category.
 */
export function estimateVideoTokenUsage({ interaction, request = {}, inputVideoDurationsMs = [] } = {}) {
  const schema = object(object(interaction).paramSchema);
  const defaults = object(object(interaction).defaultParams);
  const estimate = object(schema.usageEstimate);
  if (!VIDEO_ESTIMATE_METHODS.includes(estimate.method)) throw new Error(`Unknown video estimate method: ${String(estimate.method)}`);
  const categories = Array.isArray(schema.tokenUsageCategories) ? schema.tokenUsageCategories : [];
  if (!categories.includes("total")) throw new Error("The model declares no total Token category");
  for (const [field, test] of [["framesPerSecond", positiveInteger], ["extraFrames", nonNegativeInteger], ["pixelsPerToken", positiveInteger]]) {
    if (!test(estimate[field])) throw new Error(`The usage estimate ${field} is invalid`);
  }
  const value = object(request);
  const batchSize = value.batchSize ?? defaults.batchSize ?? 1;
  if (!positiveInteger(batchSize)) throw new Error("batchSize must be a positive integer");
  const outputSeconds = value.durationSeconds ?? defaults.durationSeconds;
  if (!positiveInteger(outputSeconds)) throw new Error("durationSeconds must be a positive integer");
  const [width, height] = videoPixels(estimate, value.quality ?? defaults.quality, value.aspectRatio ?? defaults.aspectRatio);
  if (!Array.isArray(inputVideoDurationsMs) || inputVideoDurationsMs.some((duration) => duration !== null && !nonNegativeInteger(duration))) {
    throw new Error("Input video durations must be nonnegative integer milliseconds or null when unknown");
  }
  let inputSeconds = 0n;
  if (inputVideoDurationsMs.length > 0) {
    const maximum = object(object(object(interaction).mediaConstraints).video).maxTotalDurationMs;
    if (inputVideoDurationsMs.includes(null) && !positiveInteger(maximum)) throw new Error("An unknown input video duration needs mediaConstraints.video.maxTotalDurationMs");
    const totalMs = inputVideoDurationsMs.includes(null) ? BigInt(maximum) : inputVideoDurationsMs.reduce((sum, duration) => sum + BigInt(duration), 0n);
    const [numerator, denominator] = minimumInputRatio(estimate.minInputVideoRatio);
    const minimum = ceilDivide(BigInt(outputSeconds) * numerator, denominator);
    const seconds = ceilDivide(totalMs, 1000n);
    inputSeconds = seconds > minimum ? seconds : minimum;
  }
  const frames = (inputSeconds + BigInt(outputSeconds)) * BigInt(estimate.framesPerSecond) + BigInt(estimate.extraFrames);
  const perResult = frames * width * height / BigInt(estimate.pixelsPerToken);
  const category = inputVideoDurationsMs.length > 0 && categories.includes("totalWithVideoInput") ? "totalWithVideoInput" : "total";
  return { [category]: (perResult * BigInt(batchSize)).toString() };
}

/**
 * Why a Token-billed video model cannot be held, or undefined: every quality × aspect ratio × duration it offers must
 * estimate without and, when it accepts reference videos, with a reference video of unknown duration.
 */
export function videoTokenEstimateIssue(interaction) {
  const schema = object(object(interaction).paramSchema);
  const defaults = object(object(interaction).defaultParams);
  const acceptsVideo = positiveInteger(object(object(interaction).referenceLimits).maxVideoReferences);
  const range = object(schema.durationRange);
  const durations = positiveInteger(range.min) && positiveInteger(range.max)
    ? Array.from({ length: Math.floor((range.max - range.min) / (range.step ?? 1)) + 1 }, (_, index) => range.min + index * (range.step ?? 1))
    : [defaults.durationSeconds];
  const choices = (values, fallback) => (Array.isArray(values) ? values : [fallback]);
  for (const quality of choices(schema.qualities, defaults.quality)) {
    for (const aspectRatio of choices(schema.aspectRatios, defaults.aspectRatio)) {
      for (const durationSeconds of durations) {
        for (const inputVideoDurationsMs of acceptsVideo ? [[], [null]] : [[]]) {
          try {
            estimateVideoTokenUsage({ interaction, request: { quality, aspectRatio, durationSeconds }, inputVideoDurationsMs });
          } catch (error) {
            return `usageEstimate cannot estimate ${[quality, aspectRatio, `${durationSeconds}s`, inputVideoDurationsMs.length ? "with video input" : ""].filter(Boolean).join(" / ")}: ${error.message}`;
          }
        }
      }
    }
  }
  return undefined;
}

const TOKEN_RATE_SCALE = 100_000_000n;
const TOKEN_POINTS_DENOMINATOR = TOKEN_RATE_SCALE * 1_000_000n * 100n;

function scaledTokenRate(value, category) {
  const match = typeof value === "string" ? /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/.exec(value) : null;
  if (!match) throw new Error(`The ${category} Token rate must be a decimal with at most 8 places`);
  return BigInt(match[1]) * TOKEN_RATE_SCALE + BigInt((match[2] ?? "").padEnd(8, "0"));
}

/**
 * Points for Token usage at rates in points per million Tokens and a multiplier in hundredths: every category is
 * summed exactly and the total is rounded up once, so any positive usage costs at least 1 point.
 */
export function tokenUsagePoints(usage, rates, multiplierHundredths = 100n) {
  let numerator = 0n;
  for (const [category, count] of Object.entries(object(usage))) {
    const tokens = BigInt(count);
    if (tokens < 0n) throw new Error(`The ${category} Token count must be nonnegative`);
    if (tokens === 0n) continue;
    if (object(rates)[category] === undefined) throw new Error(`Token usage category ${category} is unsupported by the published rate`);
    numerator += tokens * scaledTokenRate(rates[category], category);
  }
  numerator *= BigInt(multiplierHundredths);
  return ((numerator + TOKEN_POINTS_DENOMINATOR - 1n) / TOKEN_POINTS_DENOMINATOR).toString();
}

/** Splits a whole amount over positions as evenly as possible; the remainder adds one each from the first position. */
export function splitEvenly(total, count) {
  if (!positiveInteger(count)) throw new Error("The position count must be a positive integer");
  const amount = BigInt(total);
  if (amount < 0n) throw new Error("The amount to split must be nonnegative");
  const parts = BigInt(count);
  const base = amount / parts;
  const remainder = amount % parts;
  return Array.from({ length: count }, (_, index) => (base + (BigInt(index) < remainder ? 1n : 0n)).toString());
}

/**
 * Why a Token-billed image model cannot be held, or undefined: every aspect ratio × quality × API quality it offers
 * must estimate, with as many references as it accepts. The Catalog check and the Cloud import both run it.
 */
export function imageTokenEstimateIssue(interaction) {
  const schema = object(object(interaction).paramSchema);
  const defaults = object(object(interaction).defaultParams);
  const maxReferences = nonNegativeInteger(object(object(interaction).referenceLimits).maxImageReferences) ? object(interaction).referenceLimits.maxImageReferences : 0;
  if (maxReferences > 0 && object(schema.usageEstimate).referenceImage === undefined) return "the model accepts reference images but its usageEstimate declares no referenceImage";
  const choices = (values, fallback) => (Array.isArray(values) ? values : [fallback]);
  for (const aspectRatio of choices(schema.aspectRatios, defaults.aspectRatio)) {
    for (const quality of choices(schema.qualities, defaults.quality)) {
      for (const apiQuality of choices(schema.apiQualities, defaults.apiQuality)) {
        try {
          estimateImageTokenUsage({ interaction, request: { aspectRatio, quality, apiQuality, prompt: "x" }, imageReferenceCount: maxReferences });
        } catch (error) {
          return `usageEstimate cannot estimate ${[aspectRatio, quality, apiQuality].filter(Boolean).join(" / ")}: ${error.message}`;
        }
      }
    }
  }
  return undefined;
}
