/** Catalog definition rules shared by the repository check and Cloud. */
import { collapsePromptWhitespaceIssue, defaultParamsIssues, credentialHeaderName, idempotencyHeaderIssue, imageTokenEstimateIssue, isAspectRatio, isPromptReferenceFormat, profileStatesIssue, videoTokenEstimateIssue, VIDEO_ESTIMATE_METHODS, IMAGE_OUTPUT_ESTIMATE_METHODS, IMAGE_REFERENCE_ESTIMATE_METHODS, PROMPT_REFERENCE_FORMAT_KINDS, PROMPT_TOKENIZERS, REQUEST_VALIDATOR_DURATION_FIELDS, REQUEST_VALIDATOR_MEDIA_CONSTRAINT_FIELDS, REQUEST_VALIDATOR_OPTION_FIELDS, REQUEST_VALIDATOR_OPTION_TYPES, REQUEST_VALIDATOR_OPTION_VALUE_FIELDS, REQUEST_VALIDATOR_PARAM_SCHEMA_FIELDS, REQUEST_VALIDATOR_REFERENCE_LIMIT_FIELDS, TOKEN_USAGE_CATEGORIES, videoQualityShortEdge, videoUpscaleOperation } from "./index.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PROFILE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const CAPABILITIES = new Set(["chat.generate", "image.generate", "video.generate"]);
const WORKFLOWS = new Set(["sync", "async", "asset-async"]);
const SOURCE_KINDS = new Set(["official", "relay"]);
const HTTP_METHODS = new Set(["get", "post", "put", "delete"]);

function fail(message) {
  throw new Error(message);
}

function object(value, location) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${location} must be an object`);
  return value;
}

function array(value, location, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum) fail(`${location} must be an array with at least ${minimum} item(s)`);
  return value;
}

function string(value, location, maximum = 512) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) fail(`${location} must be a non-empty string of at most ${maximum} characters`);
  return value;
}

function exactKeys(value, allowed, location) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) fail(`${location} contains unknown field(s): ${unknown.join(", ")}`);
}

function identifier(value, location, maximum = 128) {
  const result = string(value, location, maximum);
  if (!ID.test(result)) fail(`${location} is not a valid identifier`);
  return result;
}

function unique(items, key, location) {
  const seen = new Set();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) fail(`Duplicate ${location}: ${value}`);
    seen.add(value);
  }
}

function safeRelative(value, location) {
  const result = string(value, location);
  if (result.includes("\\") || result.startsWith("/") || result.split("/").some((part) => !part || part === "." || part === "..")) {
    fail(`${location} must be a safe relative path`);
  }
  return result;
}


function scanForSecrets(value, location) {
  const text = JSON.stringify(value);
  const signatures = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bBearer\s+[A-Za-z0-9._~+\/-]{20,}\b/i,
  ];
  if (signatures.some((pattern) => pattern.test(text))) fail(`Possible plaintext credential detected in ${location}`);
}

function resolvePointer(document, reference, location) {
  if (!reference.startsWith("#/")) fail(`Remote or file OpenAPI reference is forbidden at ${location}: ${reference}`);
  let current = document;
  for (const raw of reference.slice(2).split("/")) {
    const segment = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!current || typeof current !== "object" || !Object.hasOwn(current, segment)) fail(`Unresolved OpenAPI reference at ${location}: ${reference}`);
    current = current[segment];
  }
  return current;
}

// Largest minLength any request schema sets on a prompt field; models on this contract must declare
// at least that minPromptCharacters so an empty prompt is rejected before points are frozen.
function promptMinLength(document) {
  let minimum = 0;
  const stack = [document];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    const prompt = current.properties?.prompt;
    if (prompt && Number.isInteger(prompt.minLength)) minimum = Math.max(minimum, prompt.minLength);
    stack.push(...Object.values(current));
  }
  return minimum;
}

function validateOpenApi(document, id, location) {
  if (typeof document.openapi !== "string" || !document.openapi.startsWith("3.1.")) fail(`${location} must use OpenAPI 3.1`);
  const info = object(document.info, `${location}.info`);
  const version = string(info.version, `${location}.info.version`, 64);
  const paths = object(document.paths, `${location}.paths`);
  const schemes = object(document.components?.securitySchemes ?? {}, `${location}.components.securitySchemes`);
  for (const [name, raw] of Object.entries(schemes)) {
    const scheme = object(raw, `${location}.components.securitySchemes.${name}`);
    const supported = (scheme.type === "http" && String(scheme.scheme).toLowerCase() === "bearer") ||
      (scheme.type === "apiKey" && ["header", "query"].includes(scheme.in) && typeof scheme.name === "string");
    if (!supported) fail(`Unsupported OpenAPI security scheme ${name} in ${location}`);
  }
  const operations = new Map();
  const stack = [document];
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current)) stack.push(...current);
    else if (current && typeof current === "object") {
      for (const [key, child] of Object.entries(current)) {
        if (key === "$ref") {
          if (typeof child !== "string") fail(`OpenAPI $ref must be a string in ${location}`);
          resolvePointer(document, child, location);
        } else stack.push(child);
      }
    }
  }
  for (const [endpoint, rawPathItem] of Object.entries(paths)) {
    if (!endpoint.startsWith("/") || endpoint.startsWith("//") || endpoint.includes("://")) fail(`Invalid provider-relative OpenAPI path: ${endpoint}`);
    const pathItem = object(rawPathItem, `${location}.paths.${endpoint}`);
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      const operation = object(rawOperation, `${location}.${method}.${endpoint}`);
      const operationId = string(operation.operationId, `${location}.${method}.${endpoint}.operationId`, 240);
      if (operations.has(operationId)) fail(`Duplicate OpenAPI operationId in ${location}: ${operationId}`);
      const security = operation.security ?? document.security ?? [];
      for (const requirement of Array.isArray(security) ? security : []) {
        for (const schemeName of Object.keys(object(requirement, `${location}.${operationId}.security`))) {
          if (!Object.hasOwn(schemes, schemeName)) fail(`Operation ${operationId} references missing security scheme ${schemeName}`);
        }
      }
      const body = operation.requestBody?.content?.["application/json"]?.schema;
      operations.set(operationId, { method: method.toUpperCase(), endpoint, requestSchema: body?.$ref ? resolvePointer(document, body.$ref, location) : body });
    }
  }
  if (!operations.size) fail(`${location} does not define a supported operation`);
  return { id, version, operations, schemes, promptMinLength: promptMinLength(document) };
}

function validateProfile(profile, location) {
  exactKeys(profile, ["schemaVersion", "templateLanguageVersion", "id", "version", "kind", "displayName", "description", "notes", "$comment", "annotations", "api", "workflow", "securityScheme", "operations", "map", "states", "advanced"], location);
  if (profile.schemaVersion !== 1) fail(`${location}.schemaVersion must be 1`);
  if (profile.templateLanguageVersion !== undefined && profile.templateLanguageVersion !== 1) fail(`${location}.templateLanguageVersion must be 1`);
  const id = string(profile.id, `${location}.id`, 160);
  if (!PROFILE_ID.test(id)) fail(`${location}.id is invalid`);
  const version = string(profile.version, `${location}.version`, 64);
  if (!SEMVER.test(version)) fail(`${location}.version must be semantic versioning`);
  if (!CAPABILITIES.has(profile.kind)) fail(`${location}.kind is unsupported`);
  if (!WORKFLOWS.has(profile.workflow)) fail(`${location}.workflow is unsupported`);
  const api = string(profile.api, `${location}.api`, 240);
  const separator = api.lastIndexOf("@");
  if (separator <= 0 || !SEMVER.test(api.slice(separator + 1))) fail(`${location}.api must be <id>@<semver>`);
  const operations = object(profile.operations, `${location}.operations`);
  exactKeys(operations, ["prepareAsset", "pollAsset", "submit", "submitWithImages", "poll"], `${location}.operations`);
  string(operations.submit, `${location}.operations.submit`, 240);
  for (const [key, value] of Object.entries(operations)) string(value, `${location}.operations.${key}`, 240);
  if (profile.workflow === "sync" && operations.poll) fail(`${location}: sync workflow must not define poll`);
  if (profile.workflow !== "sync" && !operations.poll) fail(`${location}: ${profile.workflow} workflow requires poll`);
  if (profile.workflow === "asset-async" && !operations.prepareAsset) fail(`${location}: asset-async workflow requires prepareAsset`);
  if (profile.workflow !== "sync") {
    const states = object(profile.states, `${location}.states`);
    for (const state of ["running", "succeeded", "failed"]) array(states[state], `${location}.states.${state}`, 1).forEach((item, index) => string(item, `${location}.states.${state}[${index}]`, 120));
    const responseMap = object(profile.map?.response, `${location}.map.response`);
    if (!responseMap.taskId || !responseMap.status) fail(`${location}.map.response requires taskId and status`);
  }
  const statesIssue = profileStatesIssue(profile.states);
  if (statesIssue) fail(`${location}.${statesIssue}`);
  if (profile.advanced !== undefined) exactKeys(object(profile.advanced, `${location}.advanced`), ["request", "media", "status", "response"], `${location}.advanced`);
  if (profile.advanced?.request !== undefined) validateRequestOptions(profile, object(profile.advanced.request, `${location}.advanced.request`), `${location}.advanced.request`);
  const pollIntervalMs = profile.advanced?.status === undefined ? undefined : object(profile.advanced.status, `${location}.advanced.status`).pollIntervalMs;
  // The Cloud Executor applies the same range when it imports the Bundle and when it runs a frozen Profile.
  if (pollIntervalMs !== undefined && (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1000 || pollIntervalMs > 3600000)) {
    fail(`${location}.advanced.status.pollIntervalMs must be an integer from 1000 to 3600000`);
  }
  return { ...profile, id, version, apiId: api.slice(0, separator), apiVersion: api.slice(separator + 1) };
}

// The rules are shared with the Cloud import and Executor and the App compiler through the request validator package.
function validateRequestOptions(profile, request, location) {
  if (Object.hasOwn(request, "promptTextPolicy")) fail(`${location}.promptTextPolicy is no longer supported; use promptReferenceFormat`);
  if (Object.hasOwn(request, "promptReferenceFormat")) {
    if (!PROMPT_REFERENCE_FORMAT_KINDS.includes(profile.kind)) fail(`${location}.promptReferenceFormat is only allowed for image.generate and video.generate Profiles`);
    if (!isPromptReferenceFormat(request.promptReferenceFormat)) fail(`${location}.promptReferenceFormat must declare image, video and audio templates of 1-32 characters with exactly one {n} and no other braces or control characters`);
  }
  // Independent of the reference format: the Cloud Executor collapses image and video prompt whitespace unless this is false.
  const whitespaceIssue = Object.hasOwn(request, "collapsePromptWhitespace") ? collapsePromptWhitespaceIssue(request.collapsePromptWhitespace, profile.kind) : undefined;
  if (whitespaceIssue) fail(`${location}.${whitespaceIssue}`);
  // The credential header is checked once the Profile's OpenAPI security schemes are known.
  const issue = Object.hasOwn(request, "idempotencyHeader") ? idempotencyHeaderIssue(request.idempotencyHeader, profile.workflow) : undefined;
  if (issue) fail(`${location}.${issue}`);
}

const MEDIA_KINDS = new Set(["image", "video", "audio"]);
const MEDIA_CONSTRAINT_FIELDS = [
  "formats", "minDurationMs", "maxDurationMs", "maxTotalDurationMs", "maxFileSizeBytes", "maxTotalFileSizeBytes",
  "minShortEdgePx", "maxShortEdgePx", "minWidthPx", "maxWidthPx", "minHeightPx", "maxHeightPx",
  "minAspectRatio", "maxAspectRatio", "minFrameRate", "maxFrameRate",
];
if (JSON.stringify(MEDIA_CONSTRAINT_FIELDS) !== JSON.stringify([...REQUEST_VALIDATOR_MEDIA_CONSTRAINT_FIELDS])) throw new Error("Catalog media schema and request validator fields drifted");
const REFERENCE_LIMIT_INTEGER_FIELDS = [
  "minImageReferences", "maxImageReferences", "maxVideoReferences", "maxAudioReferences", "maxTotalReferences", "maxImagesWithResults",
  "minPromptCharacters", "maxPromptCharacters",
];
const REFERENCE_LIMIT_BOOLEAN_FIELDS = [
  "supportsTextToVideo", "supportsImageToVideo", "supportsStartEndFrames", "supportsImageReference",
  "supportsVideoReference", "supportsAudioReference", "requiresImageInputWithVideo",
  "requiresVisualInputWithAudio",
];
const REFERENCE_LIMIT_FIELDS = [
  ...REFERENCE_LIMIT_INTEGER_FIELDS,
  ...REFERENCE_LIMIT_BOOLEAN_FIELDS,
  "imageOperations",
  "videoOperations",
];
const NON_VALIDATION_REFERENCE_FIELDS = ["imageOperations"];
if (REQUEST_VALIDATOR_REFERENCE_LIMIT_FIELDS.some((field) => !REFERENCE_LIMIT_FIELDS.includes(field))) throw new Error("Catalog reference schema is missing a shared validator field");
if (REFERENCE_LIMIT_FIELDS.some((field) => !REQUEST_VALIDATOR_REFERENCE_LIMIT_FIELDS.includes(field) && !NON_VALIDATION_REFERENCE_FIELDS.includes(field))) throw new Error("Catalog reference schema added an unsupported request validator field");
const IMAGE_OPERATION_FIELDS = ["camera-angle", "relight", "region-edit"];
// The compiler decides how the boxes reach the model, so an unknown one could not be compiled on the canvas.
const REGION_EDIT_COMPILERS = ["canvas.semantic.region-edit.bbox.v1", "canvas.semantic.region-edit.marked-image.v1"];
const IMAGE_OPERATION_MODES = new Set(["prompt", "native"]);
const VIDEO_OPERATION_FIELDS = ["upscale"];

function finiteNumber(value, location, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isSafeInteger(value)) || value < 0) {
    fail(`${location} must be a non-negative ${integer ? "safe integer" : "number"}`);
  }
}

function positiveNumber(value, location, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isSafeInteger(value)) || value <= 0) {
    fail(`${location} must be a positive ${integer ? "safe integer" : "number"}`);
  }
}

// Text models declare their Token limits and billed categories; Cloud computes each request's output limit from them.
// They are not request parameters, so the shared request validator does not read them. minOutputTokens, which it does
// read, is listed with its fields and allowed for text models only.
const TEXT_PARAM_SCHEMA_FIELDS = ["maxTokens", "contextTokens", "tokenUsageCategories"];
// Text input is text only in the current scope, so text models cannot declare image input. The total is for an upstream
// that reports one count only, which is a video task so far (VIDEO-TOKEN-BILLING-001).
const VIDEO_TOKEN_USAGE_CATEGORIES = ["total", "totalWithVideoInput"];
const TEXT_TOKEN_USAGE_CATEGORIES = TOKEN_USAGE_CATEGORIES.filter((category) => category !== "imageInput" && !VIDEO_TOKEN_USAGE_CATEGORIES.includes(category));
const IMAGE_TOKEN_USAGE_CATEGORIES = TOKEN_USAGE_CATEGORIES.filter((category) => !VIDEO_TOKEN_USAGE_CATEGORIES.includes(category));
// An image model billed by Token declares its categories and how the shared estimator predicts its usage; both or
// neither, since Cloud offers MILLION_TOKENS only when it can hold and settle the request.
const IMAGE_TOKEN_PARAM_SCHEMA_FIELDS = ["tokenUsageCategories", "usageEstimate"];
const VIDEO_TOKEN_PARAM_SCHEMA_FIELDS = ["tokenUsageCategories", "usageEstimate"];
// The usage formats Cloud reads; Token-billed models need their Profile to declare one.
const USAGE_PROTOCOLS = ["OPENAI_CHAT", "OPENAI_RESPONSES", "OPENAI_IMAGES", "ANTHROPIC", "GEMINI", "ARK_VIDEO_TASK"];

function validateTokenUsageCategories(raw, location, allowed) {
  const categories = array(raw, location, 1);
  categories.forEach((category, index) => {
    if (!allowed.includes(category)) fail(`${location}[${index}] must be one of ${allowed.join(", ")}`);
  });
  unique(categories, (category) => category, location);
  if (allowed.includes("input") && (!categories.includes("input") || !categories.includes("output"))) fail(`${location} must include input and output`);
  if (allowed.includes("total") && !categories.includes("total")) fail(`${location} must include total`);
  return categories;
}

function positiveIntegerMap(raw, location) {
  const values = object(raw, location);
  if (!Object.keys(values).length) fail(`${location} must not be empty`);
  for (const [key, value] of Object.entries(values)) if (!Number.isSafeInteger(value) || value < 1) fail(`${location}.${key} must be a positive integer`);
  return values;
}

function validateImageUsageEstimate(raw, location, categories) {
  const estimate = object(raw, location);
  exactKeys(estimate, ["prompt", "output", "referenceImage"], location);
  const prompt = object(estimate.prompt, `${location}.prompt`);
  exactKeys(prompt, ["tokenizer"], `${location}.prompt`);
  if (!PROMPT_TOKENIZERS.includes(prompt.tokenizer)) fail(`${location}.prompt.tokenizer must be one of ${PROMPT_TOKENIZERS.join(", ")}`);
  const output = object(estimate.output, `${location}.output`);
  if (!IMAGE_OUTPUT_ESTIMATE_METHODS.includes(output.method)) fail(`${location}.output.method must be one of ${IMAGE_OUTPUT_ESTIMATE_METHODS.join(", ")}`);
  if (output.method === "openai-image-grid") {
    exactKeys(output, ["method", "qualityBases"], `${location}.output`);
    positiveIntegerMap(output.qualityBases, `${location}.output.qualityBases`);
  } else {
    exactKeys(output, ["method", "tokens", "marginTokens"], `${location}.output`);
    positiveIntegerMap(output.tokens, `${location}.output.tokens`);
    if (output.marginTokens !== undefined && (!Number.isSafeInteger(output.marginTokens) || output.marginTokens < 0)) fail(`${location}.output.marginTokens must be a nonnegative integer`);
  }
  if (estimate.referenceImage === undefined) return;
  const reference = object(estimate.referenceImage, `${location}.referenceImage`);
  exactKeys(reference, ["method", "category", "tokens"], `${location}.referenceImage`);
  if (!IMAGE_REFERENCE_ESTIMATE_METHODS.includes(reference.method)) fail(`${location}.referenceImage.method must be one of ${IMAGE_REFERENCE_ESTIMATE_METHODS.join(", ")}`);
  if (!["input", "imageInput"].includes(reference.category) || !categories.includes(reference.category)) fail(`${location}.referenceImage.category must be input or imageInput and declared in tokenUsageCategories`);
  if (!Number.isSafeInteger(reference.tokens) || reference.tokens < 1) fail(`${location}.referenceImage.tokens must be a positive integer`);
}

function validateVideoUsageEstimate(raw, location, schema) {
  const estimate = object(raw, location);
  exactKeys(estimate, ["method", "framesPerSecond", "extraFrames", "pixelsPerToken", "minInputVideoRatio", "pixels"], location);
  if (!VIDEO_ESTIMATE_METHODS.includes(estimate.method)) fail(`${location}.method must be one of ${VIDEO_ESTIMATE_METHODS.join(", ")}`);
  for (const field of ["framesPerSecond", "pixelsPerToken"]) if (!Number.isSafeInteger(estimate[field]) || estimate[field] < 1) fail(`${location}.${field} must be a positive integer`);
  if (!Number.isSafeInteger(estimate.extraFrames) || estimate.extraFrames < 0) fail(`${location}.extraFrames must be a nonnegative integer`);
  if (estimate.minInputVideoRatio !== undefined && !/^[1-9]\d*\/[1-9]\d*$/.test(estimate.minInputVideoRatio)) fail(`${location}.minInputVideoRatio must be a fraction such as 2/3`);
  // Every resolution × aspect ratio is entered on its own (areas differ within one resolution), only for offered choices.
  const pixels = object(estimate.pixels, `${location}.pixels`);
  const qualities = Array.isArray(schema.qualities) ? schema.qualities : [];
  const ratios = Array.isArray(schema.aspectRatios) ? schema.aspectRatios : [];
  exactKeys(pixels, qualities, `${location}.pixels`);
  for (const [quality, sizes] of Object.entries(pixels)) {
    exactKeys(object(sizes, `${location}.pixels.${quality}`), ratios, `${location}.pixels.${quality}`);
    for (const [ratio, size] of Object.entries(sizes)) if (!/^[1-9]\d*x[1-9]\d*$/.test(size)) fail(`${location}.pixels.${quality}.${ratio} must be WIDTHxHEIGHT`);
  }
}

function validateTextParamSchema(schema, location) {
  if (!Number.isSafeInteger(schema.maxTokens) || schema.maxTokens < 1) fail(`${location}.maxTokens must be a positive integer`);
  if (!Number.isSafeInteger(schema.contextTokens) || schema.contextTokens < 1) fail(`${location}.contextTokens must be a positive integer`);
  if (schema.maxTokens > schema.contextTokens) fail(`${location}.maxTokens must not exceed contextTokens`);
  if (schema.minOutputTokens !== undefined) {
    if (!Number.isSafeInteger(schema.minOutputTokens) || schema.minOutputTokens < 1) fail(`${location}.minOutputTokens must be a positive integer`);
    if (schema.minOutputTokens > schema.maxTokens) fail(`${location}.minOutputTokens must not exceed maxTokens`);
  }
  validateTokenUsageCategories(schema.tokenUsageCategories, `${location}.tokenUsageCategories`, TEXT_TOKEN_USAGE_CATEGORIES);
}

// A Token-billed image or video model must be settleable and estimable for every choice it offers: its Profile reads a
// usage format and the shared estimate covers every choice (imageTokenEstimateIssue, videoTokenEstimateIssue).
function validateTokenBilledModel(productKey, capability, interaction, profile) {
  const protocol = profile.advanced?.response?.usageProtocol;
  if (!USAGE_PROTOCOLS.includes(protocol)) fail(`Model ${productKey} declares Token billing but Profile ${profile.id} declares no usageProtocol of ${USAGE_PROTOCOLS.join(", ")}`);
  const issue = capability === "video.generate" ? videoTokenEstimateIssue(interaction) : imageTokenEstimateIssue(interaction);
  if (issue) fail(`Model ${productKey} ${issue}`);
}

function validateParamSchema(raw, location, capability) {
  const schema = object(raw, location);
  const text = capability === "chat.generate";
  const image = capability === "image.generate";
  const video = capability === "video.generate";
  exactKeys(schema, [...REQUEST_VALIDATOR_PARAM_SCHEMA_FIELDS, ...(text ? TEXT_PARAM_SCHEMA_FIELDS : image ? IMAGE_TOKEN_PARAM_SCHEMA_FIELDS : video ? VIDEO_TOKEN_PARAM_SCHEMA_FIELDS : [])], location);
  if (text) validateTextParamSchema(schema, location);
  if ((image || video) && (schema.tokenUsageCategories !== undefined || schema.usageEstimate !== undefined)) {
    if (schema.tokenUsageCategories === undefined || schema.usageEstimate === undefined) fail(`${location} must declare tokenUsageCategories and usageEstimate together`);
    const categories = validateTokenUsageCategories(schema.tokenUsageCategories, `${location}.tokenUsageCategories`, image ? IMAGE_TOKEN_USAGE_CATEGORIES : VIDEO_TOKEN_USAGE_CATEGORIES);
    if (image) validateImageUsageEstimate(schema.usageEstimate, `${location}.usageEstimate`, categories);
    else validateVideoUsageEstimate(schema.usageEstimate, `${location}.usageEstimate`, schema);
  }

  else if (schema.minOutputTokens !== undefined) fail(`${location}.minOutputTokens is only valid for chat.generate`);
  for (const field of ["aspectRatios", "qualities", "apiQualities", "backgroundModes"]) {
    if (schema[field] === undefined) continue;
    const values = array(schema[field], `${location}.${field}`, 1);
    values.forEach((value, index) => string(value, `${location}.${field}[${index}]`, 128));
    unique(values, (value) => value, field === "backgroundModes" ? `background mode for ${location}` : `${location}.${field}`);
    if (field === "aspectRatios") {
      values.forEach((value, index) => { if (!isAspectRatio(value)) fail(`${location}.aspectRatios[${index}] must be WIDTH:HEIGHT with positive numbers`); });
    }
    if (field === "qualities") {
      values.forEach((value, index) => { if (value !== value.toUpperCase()) fail(`${location}.qualities[${index}] must not contain lowercase letters`); });
    }
  }
  if (schema.backgroundModes !== undefined && schema.backgroundModes.some((mode) => mode !== "transparent")) {
    fail(`${location}.backgroundModes supports only transparent`);
  }
  if (schema.backgroundInput !== undefined) {
    if (schema.backgroundInput !== "singleAlphaImage") fail(`${location}.backgroundInput supports only singleAlphaImage`);
    if (!schema.backgroundModes?.includes("transparent")) fail(`${location}.backgroundInput requires backgroundModes to include transparent`);
  }
  if (schema.maxBatchSize !== undefined) finiteNumber(schema.maxBatchSize, `${location}.maxBatchSize`, true);
  if (schema.minBatchSize !== undefined) {
    if (!Number.isSafeInteger(schema.minBatchSize) || schema.minBatchSize < 1) fail(`${location}.minBatchSize must be a positive integer`);
    if (schema.maxBatchSize !== undefined && schema.minBatchSize > schema.maxBatchSize) fail(`${location}.minBatchSize must not exceed maxBatchSize`);
  }
  if (schema.supportsAudioGeneration !== undefined && typeof schema.supportsAudioGeneration !== "boolean") {
    fail(`${location}.supportsAudioGeneration must be a boolean`);
  }
  if (schema.durationRange !== undefined) validateDurationRange(schema.durationRange, `${location}.durationRange`);
  if (schema.durationRangeByQuality !== undefined) {
    const byQuality = object(schema.durationRangeByQuality, `${location}.durationRangeByQuality`);
    if (Object.keys(byQuality).length === 0) fail(`${location}.durationRangeByQuality must not be empty`);
    if (schema.durationRange === undefined) fail(`${location}.durationRangeByQuality requires durationRange`);
    for (const [quality, override] of Object.entries(byQuality)) {
      const overrideLocation = `${location}.durationRangeByQuality.${quality}`;
      if (!Array.isArray(schema.qualities) || !schema.qualities.includes(quality)) fail(`${overrideLocation} must name one of qualities`);
      const range = validateDurationRange(override, overrideLocation);
      if (Object.keys(range).length === 0) fail(`${overrideLocation} must override min, max or step`);
      const effective = { ...schema.durationRange, ...range };
      if (effective.min !== undefined && effective.max !== undefined && effective.min > effective.max) fail(`${overrideLocation} min must not exceed max`);
    }
  }
  if (schema.durations !== undefined) {
    if (!video) fail(`${location}.durations is only for video models`);
    const durations = array(schema.durations, `${location}.durations`, 1);
    durations.forEach((value, index) => positiveNumber(value, `${location}.durations[${index}]`, true));
    if (durations.some((value, index) => index > 0 && value <= durations[index - 1])) fail(`${location}.durations must be ascending without repeats`);
    if (schema.durationRange !== undefined || schema.durationRangeByQuality !== undefined) fail(`${location}.durations must not be combined with durationRange or durationRangeByQuality`);
  }
  return schema;
}

// Option keys are sent to the Provider through rawParams, so they must not shadow the fixed
// generation parameters or the keys Cloud reserves for execution (its image path drops the
// internal ones from rawParams, which would silently lose the option).
const RESERVED_OPTION_KEYS = new Set([
  "prompt", "negativePrompt", "seed", "aspectRatio", "quality", "apiQuality", "durationSeconds", "batchSize", "generateAudio", "background",
  "multiResultMode", "fanoutConcurrency", "sizeMap", "size", "watermark", "camera_fixed", "maxTokens", "max_tokens", "max_output_tokens",
  "systemInstruction", "generationConfig", "executionMode", "adapterProfile", "rawParams",
  "requestMode", "referenceRequestMode", "generationPath", "submitPath", "editPath", "statusPath", "taskIdJsonPath", "statusJsonPath",
  "resultJsonPath", "requestPath", "imageFieldName", "imageInputFormat", "imageFieldShape", "includeN", "countParam", "includeSize",
  "sizeParam", "includeQuality", "qualityParam", "qualityMap", "aspectRatioParam", "upstreamDefaultQuality", "upstreamModelByQuality",
  "useBaseUrlOrigin", "maxImageReferences",
]);

// Cloud looks the size up by aspect ratio and quality, and a miss would send the provider a made-up value instead of failing.
function validateSizeMapShape(raw, location) {
  const sizeMap = object(raw, location);
  for (const [ratio, rawSizes] of Object.entries(sizeMap)) {
    for (const [quality, size] of Object.entries(object(rawSizes, `${location}.${ratio}`))) {
      if (typeof size !== "string") fail(`${location}.${ratio}.${quality} must be a string`);
    }
  }
}

function validateSizeMap(raw, qualities, aspectRatios, location) {
  const sizeMap = object(raw, location);
  for (const ratio of Object.keys(sizeMap)) {
    if (!aspectRatios.includes(ratio)) fail(`${location}.${ratio} is not one of aspectRatios`);
  }
  for (const ratio of aspectRatios) {
    const sizes = object(sizeMap[ratio], `${location}.${ratio}`);
    for (const quality of Object.keys(sizes)) {
      if (!qualities.includes(quality)) fail(`${location}.${ratio}.${quality} is not one of qualities`);
    }
    for (const quality of qualities) {
      if (typeof sizes[quality] !== "string" || !sizes[quality]) fail(`${location}.${ratio}.${quality} must be a non-empty string`);
    }
  }
}

function validateOptionShapes(raw, location) {
  const options = array(raw, location, 1);
  unique(options, (option) => option?.key, `${location} key`);
  options.forEach((rawOption, index) => {
    const optionLocation = `${location}[${index}]`;
    const option = object(rawOption, optionLocation);
    exactKeys(option, REQUEST_VALIDATOR_OPTION_FIELDS, optionLocation);
    const key = string(option.key, `${optionLocation}.key`, 40);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || RESERVED_OPTION_KEYS.has(key)) fail(`${optionLocation}.key must be a plain identifier that is not a reserved parameter`);
    string(option.label, `${optionLocation}.label`, 40);
    if (!REQUEST_VALIDATOR_OPTION_TYPES.includes(option.type)) fail(`${optionLocation}.type must be one of ${REQUEST_VALIDATOR_OPTION_TYPES.join(", ")}`);
    if (option.type === "boolean") {
      if (option.values !== undefined) fail(`${optionLocation}.values is only allowed for enum options`);
      return;
    }
    const values = array(option.values, `${optionLocation}.values`, 2);
    values.forEach((rawValue, valueIndex) => {
      const valueLocation = `${optionLocation}.values[${valueIndex}]`;
      const entry = object(rawValue, valueLocation);
      exactKeys(entry, REQUEST_VALIDATOR_OPTION_VALUE_FIELDS, valueLocation);
      string(entry.value, `${valueLocation}.value`, 128);
      string(entry.label, `${valueLocation}.label`, 40);
    });
    unique(values, (entry) => entry.value, `${optionLocation}.values`);
  });
  return options;
}

function validateOptionDefaults(options, defaultParams, location) {
  options.forEach((option, index) => {
    const optionLocation = `${location}[${index}]`;
    if (!Object.hasOwn(defaultParams, option.key)) fail(`${optionLocation} requires defaultParams.${option.key}`);
    if (option.type === "boolean") {
      if (typeof defaultParams[option.key] !== "boolean") fail(`${optionLocation} default must be a boolean`);
      return;
    }
    if (!option.values.some((entry) => entry.value === defaultParams[option.key])) fail(`${optionLocation} default must be one of its values`);
  });
}

function validateDurationRange(raw, location) {
  const durationRange = object(raw, location);
  exactKeys(durationRange, REQUEST_VALIDATOR_DURATION_FIELDS, location);
  for (const field of ["min", "max", "step"]) {
    if (durationRange[field] !== undefined) positiveNumber(durationRange[field], `${location}.${field}`, true);
  }
  if (durationRange.min !== undefined && durationRange.max !== undefined && durationRange.min > durationRange.max) {
    fail(`${location}.min must not exceed max`);
  }
  return durationRange;
}

function validateMediaConstraints(raw, location) {
  const constraints = object(raw, location);
  for (const [kind, rawConstraint] of Object.entries(constraints)) {
    if (!MEDIA_KINDS.has(kind)) fail(`${location} contains unknown media kind: ${kind}`);
    const constraint = object(rawConstraint, `${location}.${kind}`);
    exactKeys(constraint, MEDIA_CONSTRAINT_FIELDS, `${location}.${kind}`);
    if (constraint.formats !== undefined) {
      const formats = array(constraint.formats, `${location}.${kind}.formats`, 1);
      formats.forEach((format, index) => string(format, `${location}.${kind}.formats[${index}]`, 128));
      unique(formats, (format) => format, `${location}.${kind}.formats`);
    }
    for (const field of ["minDurationMs", "maxDurationMs", "maxTotalDurationMs", "maxFileSizeBytes", "maxTotalFileSizeBytes", "minWidthPx", "maxWidthPx", "minHeightPx", "maxHeightPx"]) {
      if (constraint[field] !== undefined) positiveNumber(constraint[field], `${location}.${kind}.${field}`, true);
    }
    for (const field of ["minShortEdgePx", "maxShortEdgePx"]) {
      if (constraint[field] !== undefined) positiveNumber(constraint[field], `${location}.${kind}.${field}`, true);
    }
    for (const field of ["minAspectRatio", "maxAspectRatio", "minFrameRate", "maxFrameRate"]) {
      if (constraint[field] !== undefined) positiveNumber(constraint[field], `${location}.${kind}.${field}`);
    }
    for (const [minimum, maximum] of [["minDurationMs", "maxDurationMs"], ["minWidthPx", "maxWidthPx"], ["minHeightPx", "maxHeightPx"], ["minShortEdgePx", "maxShortEdgePx"], ["minAspectRatio", "maxAspectRatio"], ["minFrameRate", "maxFrameRate"]]) {
      if (constraint[minimum] !== undefined && constraint[maximum] !== undefined && constraint[minimum] > constraint[maximum]) {
        fail(`${location}.${kind}.${minimum} must not exceed ${maximum}`);
      }
    }
  }
  return constraints;
}

// An upscale model only upscales: one source video in, no prompt, one result billed for the source's own seconds, and a
// target resolution it can compare with the source's short edge.
function validateVideoUpscaleModel(productKey, capability, interaction) {
  const limits = interaction.referenceLimits;
  const schema = interaction.paramSchema;
  const location = `Model ${productKey} declares videoOperations.upscale`;
  if (capability !== "video.generate") fail(`${location} but is not a video model`);
  if (limits.supportsVideoReference !== true || limits.maxVideoReferences !== 1) fail(`${location}; it must accept exactly one reference video`);
  for (const field of ["supportsTextToVideo", "supportsImageToVideo", "supportsStartEndFrames", "supportsImageReference", "supportsAudioReference"]) {
    if (limits[field] === true) fail(`${location}; it must not set ${field}`);
  }
  for (const field of ["maxImageReferences", "maxAudioReferences", "minPromptCharacters"]) {
    if (limits[field] !== undefined && limits[field] !== 0) fail(`${location}; ${field} must be 0`);
  }
  if (schema.maxBatchSize !== 1) fail(`${location}; paramSchema.maxBatchSize must be 1`);
  const qualities = array(schema.qualities, `${location}: paramSchema.qualities`, 1);
  const unknown = qualities.filter((quality) => videoQualityShortEdge(quality) === undefined);
  if (unknown.length) fail(`${location}; qualities ${unknown.join(", ")} have no resolution to compare with the source`);
  const range = object(schema.durationRange, `${location}: paramSchema.durationRange`);
  if (range.step !== undefined && range.step !== 1) fail(`${location}; durationRange.step must be 1, since it bills the source's own seconds`);
  // The seconds are the source's whatever the tier, so one range covers every tier.
  if (schema.durationRangeByQuality !== undefined) fail(`${location}; it must not set durationRangeByQuality`);
}

function validateReferenceLimits(raw, location) {
  const limits = object(raw, location);
  exactKeys(limits, REFERENCE_LIMIT_FIELDS, location);
  for (const field of REFERENCE_LIMIT_INTEGER_FIELDS) {
    if (limits[field] !== undefined) finiteNumber(limits[field], `${location}.${field}`, true);
  }
  for (const field of REFERENCE_LIMIT_BOOLEAN_FIELDS) {
    if (limits[field] !== undefined && typeof limits[field] !== "boolean") fail(`${location}.${field} must be a boolean`);
  }
  if (limits.imageOperations !== undefined) {
    const operations = object(limits.imageOperations, `${location}.imageOperations`);
    exactKeys(operations, IMAGE_OPERATION_FIELDS, `${location}.imageOperations`);
    for (const [operation, rawConfiguration] of Object.entries(operations)) {
      const configuration = object(rawConfiguration, `${location}.imageOperations.${operation}`);
      exactKeys(configuration, ["mode", "compiler"], `${location}.imageOperations.${operation}`);
      if (!IMAGE_OPERATION_MODES.has(configuration.mode)) fail(`${location}.imageOperations.${operation}.mode must be prompt or native`);
      if (configuration.mode === "prompt" || configuration.compiler !== undefined) {
        identifier(configuration.compiler, `${location}.imageOperations.${operation}.compiler`, 160);
      }
      if (operation === "region-edit" && (configuration.mode !== "prompt" || !REGION_EDIT_COMPILERS.includes(configuration.compiler))) {
        fail(`${location}.imageOperations.region-edit must use mode prompt and a compiler of ${REGION_EDIT_COMPILERS.join(", ")}`);
      }
    }
  }
  if (limits.videoOperations !== undefined) {
    const operations = object(limits.videoOperations, `${location}.videoOperations`);
    exactKeys(operations, VIDEO_OPERATION_FIELDS, `${location}.videoOperations`);
    if (operations.upscale !== undefined) {
      const upscale = object(operations.upscale, `${location}.videoOperations.upscale`);
      exactKeys(upscale, ["sameResolution"], `${location}.videoOperations.upscale`);
      if (typeof upscale.sameResolution !== "boolean") fail(`${location}.videoOperations.upscale.sameResolution must be a boolean`);
    }
  }
  if (limits.maxImagesWithResults !== undefined && limits.maxImagesWithResults < 1) fail(`${location}.maxImagesWithResults must be at least 1`);
  if (limits.minPromptCharacters !== undefined && limits.maxPromptCharacters !== undefined && limits.minPromptCharacters > limits.maxPromptCharacters) {
    fail(`${location}.minPromptCharacters must not exceed maxPromptCharacters`);
  }
  if (limits.minImageReferences !== undefined && limits.maxImageReferences !== undefined && limits.minImageReferences > limits.maxImageReferences) {
    fail(`${location}.minImageReferences must not exceed maxImageReferences`);
  }
  return limits;
}

/**
 * Cloud fills `{model}` with the upstream model ID. A query operation (poll, pollAsset) has exactly one other placeholder,
 * whatever its name, which takes the ID the Provider returned; submit and prepare operations have none. A poll path may
 * instead have none when the Profile sends the task ID in the query string (`advanced.request.pollQuery`, such as `?id=`).
 * Mirrors Cloud's bundle import check, so a path Cloud cannot fill is rejected here instead of after a customer submits.
 */
function operationPathIssue(endpoint, role, pollQuery = false) {
  const names = [...endpoint.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).filter((name) => name !== "model");
  if (role === "poll" || role === "pollAsset") {
    if (names.length === 1 || (role === "poll" && pollQuery && names.length === 0)) return null;
    return role === "poll"
      ? `poll path must have exactly one placeholder besides {model}, or none when the Profile sends the task ID in advanced.request.pollQuery; found ${names.length}: ${endpoint}`
      : `${role} path must have exactly one placeholder besides {model}, found ${names.length}: ${endpoint}`;
  }
  return names.length === 0 ? null : `${role} path must have no placeholder besides {model}, found {${names.join("}, {")}}: ${endpoint}`;
}

const MODEL_FIELDS = ["productKey", "displayName", "description", "capability", "release", "sourceKind"];

/**
 * The structure of one model definition: every field holds the kind of value the Catalog defines and every limit is
 * well formed. It leaves out what only a finished model needs (a valid product key and name, a Channel that exists, a
 * size for every aspect ratio and quality, defaults within the limits), so an admin form can take a model that is still
 * being written and mark what is missing. validateCatalogDefinitions runs it on every model first.
 */
function validateModelShape(raw, location) {
  const value = object(raw, location);
  exactKeys(value, MODEL_FIELDS, location);
  const name = typeof value.productKey === "string" && value.productKey.trim() ? `Model ${value.productKey}` : location;
  for (const field of ["productKey", "displayName", "description"]) {
    if (value[field] !== undefined && typeof value[field] !== "string") fail(`${name}.${field} must be a string`);
  }
  if (!CAPABILITIES.has(value.capability)) fail(`${name} has unsupported capability`);
  if (value.sourceKind !== undefined && !SOURCE_KINDS.has(value.sourceKind)) fail(`${name} has invalid sourceKind`);
  const release = object(value.release, `${name}.release`);
  exactKeys(release, ["channelId", "execution", "publicInteraction"], `${name}.release`);
  if (typeof release.channelId !== "string") fail(`${name}.release.channelId must be a string`);
  const execution = object(release.execution, `${name}.release.execution`);
  exactKeys(execution, ["providerModel"], `${name}.release.execution`);
  const providerModel = object(execution.providerModel, `${name}.release.execution.providerModel`);
  if (Object.hasOwn(providerModel, "modelId")) {
    exactKeys(providerModel, ["modelId"], `${name}.release.execution.providerModel`);
    if (typeof providerModel.modelId !== "string") fail(`${name}.release.execution.providerModel.modelId must be a string`);
  } else {
    exactKeys(providerModel, ["defaultQuality", "modelIdByQuality"], `${name}.release.execution.providerModel`);
    if (providerModel.defaultQuality !== undefined && typeof providerModel.defaultQuality !== "string") fail(`${name}.release.execution.providerModel.defaultQuality must be a string`);
    for (const [quality, id] of Object.entries(object(providerModel.modelIdByQuality, `${name}.modelIdByQuality`))) {
      if (typeof id !== "string") fail(`${name}.modelIdByQuality.${quality} must be a string`);
    }
  }
  const interaction = object(release.publicInteraction, `${name}.release.publicInteraction`);
  exactKeys(interaction, ["defaultParams", "paramSchema", "referenceLimits", "mediaConstraints"], `${name}.release.publicInteraction`);
  const defaultParams = object(interaction.defaultParams, `${name}.publicInteraction.defaultParams`);
  const paramSchema = validateParamSchema(interaction.paramSchema, `${name}.publicInteraction.paramSchema`, value.capability);
  if (defaultParams.sizeMap !== undefined) validateSizeMapShape(defaultParams.sizeMap, `${name}.publicInteraction.defaultParams.sizeMap`);
  validateReferenceLimits(interaction.referenceLimits, `${name}.publicInteraction.referenceLimits`);
  if (paramSchema.options !== undefined) validateOptionShapes(paramSchema.options, `${name}.publicInteraction.paramSchema.options`);
  if (interaction.mediaConstraints !== undefined) validateMediaConstraints(interaction.mediaConstraints, `${name}.publicInteraction.mediaConstraints`);
  for (const [section, sectionValue] of Object.entries(interaction)) {
    const data = object(sectionValue, `${name}.publicInteraction.${section}`);
    for (const forbidden of ["billingUnit", "billing_unit", "tokenRates", "token_rates"]) if (Object.hasOwn(data, forbidden)) fail(`${name} contains commercial pricing field ${forbidden}`);
  }
  return value;
}

/** The first structural problem of one model definition of models.json, or undefined; see validateModelShape. */
export function modelDefinitionIssue(model) {
  try {
    validateModelShape(model, "model");
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * The Catalog definition rules, on documents instead of a directory, so Cloud checks an admin draft and an export with
 * the same rules as `npm run validate`. `read` returns the parsed JSON document at a manifest path. `partial` allows a
 * Channel without models, which an admin draft may publish.
 */
export function validateCatalogDefinitions(read, options = {}) {
  const readDocument = (file) => {
    const safe = safeRelative(file, `path ${file}`);
    const parsed = read(safe);
    scanForSecrets(parsed, safe);
    return object(parsed, safe);
  };
  const manifest = readDocument("manifest.json");
  exactKeys(manifest, ["schemaVersion", "bundleId", "bundleVersion", "providers", "channels", "models", "openapiContracts", "adapterProfiles"], "manifest.json");
  if (manifest.schemaVersion !== 2) fail("manifest.json.schemaVersion must be 2");
  identifier(manifest.bundleId, "manifest.json.bundleId");
  string(manifest.bundleVersion, "manifest.json.bundleVersion", 64);
  if (options.tag && options.tag !== `catalog-v${manifest.bundleVersion}`) fail(`Release tag ${options.tag} must equal catalog-v${manifest.bundleVersion}`);
  const providerPath = safeRelative(manifest.providers, "manifest.json.providers");
  const channelPath = safeRelative(manifest.channels, "manifest.json.channels");
  const modelPath = safeRelative(manifest.models, "manifest.json.models");
  const openApiPaths = array(manifest.openapiContracts, "manifest.json.openapiContracts", 1).map((value, index) => safeRelative(value, `manifest.json.openapiContracts[${index}]`));
  const profilePaths = array(manifest.adapterProfiles, "manifest.json.adapterProfiles", 1).map((value, index) => safeRelative(value, `manifest.json.adapterProfiles[${index}]`));
  unique(openApiPaths, (value) => value, "OpenAPI source path");
  unique(profilePaths, (value) => value, "Profile source path");

  const providerDocument = readDocument(providerPath);
  exactKeys(providerDocument, ["schemaVersion", "providers"], providerPath);
  if (providerDocument.schemaVersion !== 2) fail(`${providerPath}.schemaVersion must be 2`);
  const providers = array(providerDocument.providers, `${providerPath}.providers`, 1).map((raw, index) => {
    const value = object(raw, `${providerPath}.providers[${index}]`);
    exactKeys(value, ["id", "internalName", "sourceKind", "baseUrl", "internalOnly", "trustPolicy", "credentialSchemes"], `${providerPath}.providers[${index}]`);
    const id = identifier(value.id, `${providerPath}.providers[${index}].id`, 64);
    string(value.internalName, `${providerPath}.providers[${index}].internalName`, 191);
    if (!SOURCE_KINDS.has(value.sourceKind)) fail(`Provider ${id} has invalid sourceKind`);
    let baseUrl;
    try { baseUrl = new URL(value.baseUrl); } catch { fail(`Provider ${id} has invalid baseUrl`); }
    if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password) fail(`Provider ${id} baseUrl must be HTTPS without embedded credentials`);
    if (value.internalOnly !== true) fail(`Provider ${id} must be internalOnly`);
    if (!["public-only", "allow-private-network"].includes(value.trustPolicy)) fail(`Provider ${id} has invalid trustPolicy`);
    const credentialSchemes = array(value.credentialSchemes, `Provider ${id}.credentialSchemes`, 1).map((item, itemIndex) => identifier(item, `Provider ${id}.credentialSchemes[${itemIndex}]`));
    unique(credentialSchemes, (item) => item, `credential scheme for Provider ${id}`);
    return { ...value, id, credentialSchemes };
  });
  unique(providers, (value) => value.id, "Provider id");
  const providerById = new Map(providers.map((value) => [value.id, value]));

  const profileEntries = profilePaths.map((file) => ({ file, profile: validateProfile(readDocument(file), file) }));
  unique(profileEntries, ({ profile }) => `${profile.id}@${profile.version}`, "Profile identity");
  const profileByKey = new Map(profileEntries.map(({ profile }) => [`${profile.id}@${profile.version}`, profile]));

  const openApis = openApiPaths.map((file) => {
    const match = /^(.+)\.openapi\.json$/.exec(file.split("/").at(-1));
    if (!match) fail(`OpenAPI file must use <id>.openapi.json: ${file}`);
    return validateOpenApi(readDocument(file), match[1], file);
  });
  unique(openApis, (value) => `${value.id}@${value.version}`, "OpenAPI identity");
  const openApiByKey = new Map(openApis.map((value) => [`${value.id}@${value.version}`, value]));
  for (const { file, profile } of profileEntries) {
    const api = openApiByKey.get(`${profile.apiId}@${profile.apiVersion}`);
    if (!api) fail(`${file} references missing OpenAPI ${profile.apiId}@${profile.apiVersion}`);
    for (const [role, operationId] of Object.entries(profile.operations)) {
      if (!api.operations.has(operationId)) fail(`${file} operation ${role} references missing operationId ${operationId}`);
      const pathIssue = operationPathIssue(api.operations.get(operationId).endpoint, role, profile.advanced?.request?.pollQuery !== undefined);
      if (pathIssue) fail(`${file} operation ${role} (${operationId}): ${pathIssue}`);
    }
    if (profile.securityScheme && !Object.hasOwn(api.schemes, profile.securityScheme)) fail(`${file} references missing security scheme ${profile.securityScheme}`);
    const request = profile.advanced?.request ?? {};
    const idempotencyIssue = Object.hasOwn(request, "idempotencyHeader") ? idempotencyHeaderIssue(request.idempotencyHeader, profile.workflow, credentialHeaderName(api.schemes, profile.securityScheme)) : undefined;
    if (idempotencyIssue) fail(`${file}.advanced.request.${idempotencyIssue}`);
  }

  const channelDocument = readDocument(channelPath);
  exactKeys(channelDocument, ["schemaVersion", "channels"], channelPath);
  if (channelDocument.schemaVersion !== 2) fail(`${channelPath}.schemaVersion must be 2`);
  const channels = array(channelDocument.channels, `${channelPath}.channels`, 1).map((raw, index) => {
    const value = object(raw, `${channelPath}.channels[${index}]`);
    exactKeys(value, ["id", "providerId", "adapterProfile", "internalOnly"], `${channelPath}.channels[${index}]`);
    const id = identifier(value.id, `${channelPath}.channels[${index}].id`, 64);
    const providerId = identifier(value.providerId, `Channel ${id}.providerId`, 64);
    if (!providerById.has(providerId)) fail(`Channel ${id} references missing Provider ${providerId}`);
    if (value.internalOnly !== true) fail(`Channel ${id} must be internalOnly`);
    const reference = object(value.adapterProfile, `Channel ${id}.adapterProfile`);
    exactKeys(reference, ["id", "version"], `Channel ${id}.adapterProfile`);
    const profileKey = `${string(reference.id, `Channel ${id}.adapterProfile.id`, 160)}@${string(reference.version, `Channel ${id}.adapterProfile.version`, 64)}`;
    const profile = profileByKey.get(profileKey);
    if (!profile) fail(`Channel ${id} references missing Profile ${profileKey}`);
    if (profile.securityScheme && !providerById.get(providerId).credentialSchemes.includes(profile.securityScheme)) fail(`Channel ${id} Profile security scheme ${profile.securityScheme} is not declared by Provider ${providerId}`);
    return { ...value, id, providerId, profile };
  });
  unique(channels, (value) => value.id, "Channel id");
  const channelById = new Map(channels.map((value) => [value.id, value]));

  const modelDocument = readDocument(modelPath);
  exactKeys(modelDocument, ["schemaVersion", "models"], modelPath);
  if (modelDocument.schemaVersion !== 2) fail(`${modelPath}.schemaVersion must be 2`);
  const models = array(modelDocument.models, `${modelPath}.models`, options.partial ? 0 : 1).map((raw, index) => {
    const value = validateModelShape(raw, `${modelPath}.models[${index}]`);
    const productKey = identifier(value.productKey, `${modelPath}.models[${index}].productKey`);
    string(value.displayName, `Model ${productKey}.displayName`, 191);
    if (!SOURCE_KINDS.has(value.sourceKind)) fail(`Model ${productKey} has invalid sourceKind`);
    const release = value.release;
    const channel = channelById.get(identifier(release.channelId, `Model ${productKey}.release.channelId`, 64));
    if (!channel) fail(`Model ${productKey} references missing Channel ${release.channelId}`);
    if (providerById.get(channel.providerId).sourceKind !== value.sourceKind) fail(`Model ${productKey} crosses the official/relay source boundary`);
    if (channel.profile.kind !== value.capability) fail(`Model ${productKey} capability does not match Profile ${channel.profile.id}`);
    const providerModel = release.execution.providerModel;
    const direct = typeof providerModel.modelId === "string" && providerModel.modelId.trim();
    const quality = typeof providerModel.defaultQuality === "string" && providerModel.modelIdByQuality[providerModel.defaultQuality];
    if (!direct && !quality) fail(`Model ${productKey} providerModel must define modelId or a valid defaultQuality/modelIdByQuality`);
    const interaction = release.publicInteraction;
    const paramSchema = interaction.paramSchema;
    if (channel.profile.advanced?.request?.parameterPolicy?.sizeParam && interaction.defaultParams.sizeMap === undefined) fail(`Model ${productKey} requires defaultParams.sizeMap: its Profile sends a size`);
    if (interaction.defaultParams.sizeMap !== undefined) validateSizeMap(interaction.defaultParams.sizeMap, array(paramSchema.qualities, `Model ${productKey}.publicInteraction.paramSchema.qualities`, 1), array(paramSchema.aspectRatios, `Model ${productKey}.publicInteraction.paramSchema.aspectRatios`, 1), `Model ${productKey}.publicInteraction.defaultParams.sizeMap`);
    const referenceLimits = interaction.referenceLimits;
    if (paramSchema.options !== undefined) validateOptionDefaults(paramSchema.options, interaction.defaultParams, `Model ${productKey}.publicInteraction.paramSchema.options`);
    const defaultIssues = defaultParamsIssues(interaction);
    if (defaultIssues.length) fail(`Model ${productKey} default parameters are refused by its own limits: ${defaultIssues.map((issue) => issue.field).join(", ")}`);
    const contractApi = openApiByKey.get(`${channel.profile.apiId}@${channel.profile.apiVersion}`);
    const contractPromptMinimum = contractApi?.promptMinLength ?? 0;
    if (contractPromptMinimum > 0 && !(Number(referenceLimits.minPromptCharacters) >= contractPromptMinimum)) {
      fail(`Model ${productKey} must declare minPromptCharacters of at least ${contractPromptMinimum}; its Provider contract requires a prompt`);
    }
    // Image models that accept an image must state their camera angle and relight support. Both are
    // expected by default; a model whose references cannot drive them (e.g. a style reference) opts
    // out by declaring imageOperations without that operation, which keeps the choice explicit.
    if (value.capability === "image.generate" && Number(referenceLimits.maxImageReferences ?? 0) >= 1 && referenceLimits.imageOperations === undefined) {
      fail(`Model ${productKey} must declare imageOperations; image models support camera-angle and relight by default and opt out with an explicit declaration`);
    }
    if (videoUpscaleOperation(referenceLimits)) validateVideoUpscaleModel(productKey, value.capability, interaction);
    if (paramSchema.usageEstimate !== undefined) validateTokenBilledModel(productKey, value.capability, interaction, channel.profile);
    if (paramSchema.tokenUsageCategories?.includes("totalWithVideoInput") && !(Number(referenceLimits.maxVideoReferences ?? 0) >= 1)) fail(`Model ${productKey} prices a video input but accepts no reference video`);
    return value;
  });
  unique(models, (value) => value.productKey, "Model productKey");

  const referencedFiles = ["manifest.json", providerPath, channelPath, modelPath, ...openApiPaths, ...profilePaths];
  return {
    status: "VALID",
    referencedFiles,
    bundleId: manifest.bundleId,
    bundleVersion: manifest.bundleVersion,
    providers: providers.length,
    channels: channels.length,
    models: models.length,
    openapiContracts: openApis.length,
    adapterProfiles: profileEntries.length,
  };
}
