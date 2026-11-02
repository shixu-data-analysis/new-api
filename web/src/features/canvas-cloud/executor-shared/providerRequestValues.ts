// The request values a task sends, built from the customer request, the model's default parameters and the Adapter
// Profile. The Executor sends them; the Cloud admin page in Pinned New API previews the same values from a byte-identical
// copy, checked by canvas-workspace/scripts/verify-template-language-v1.mjs, so the preview cannot drift from a real call.
type JsonObject = Record<string, unknown>;

export function dotted(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => current && typeof current === "object" ? (current as JsonObject)[part] : undefined, value);
}

export function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseRawParams(value: unknown): JsonObject {
  if (value === undefined || value === null || value === "") return {};
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonObject;
  if (typeof value !== "string") throw new Error("Raw Params must be a JSON object");
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonObject;
  } catch { /* handled below */ }
  throw new Error("Raw Params must be a JSON object");
}

export function normalizedRequest(request: JsonObject): JsonObject {
  if (typeof request.prompt === "string") return request;
  const parts = [request.instruction, request.sourceContent].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return parts.length ? { ...request, prompt: parts.join("\n\n") } : request;
}

export interface ImageParameterPolicy {
  baseUrlMode?: "origin";
  rawDefaults: JsonObject;
  sizeParam?: string;
  qualityParam?: string;
  aspectRatioParam?: string;
  countParam?: string;
}

export function imageParameterPolicy(value: unknown): ImageParameterPolicy {
  const source = objectValue(value);
  const sizeParam = nonEmptyString(source.sizeParam);
  const qualityParam = nonEmptyString(source.qualityParam);
  const aspectRatioParam = nonEmptyString(source.aspectRatioParam);
  const countParam = nonEmptyString(source.countParam);
  return {
    ...(source.baseUrlMode === "origin" ? { baseUrlMode: "origin" as const } : {}),
    rawDefaults: objectValue(source.rawDefaults),
    ...(sizeParam ? { sizeParam } : {}),
    ...(qualityParam ? { qualityParam } : {}),
    ...(aspectRatioParam ? { aspectRatioParam } : {}),
    ...(countParam ? { countParam } : {}),
  };
}

export const IMAGE_INTERNAL_PARAM_KEYS = new Set(["adapterProfile", "executionMode", "requestMode", "referenceRequestMode", "generationPath", "submitPath", "editPath", "statusPath", "taskIdJsonPath", "statusJsonPath", "resultJsonPath", "requestPath", "imageFieldName", "imageInputFormat", "imageFieldShape", "includeN", "countParam", "includeSize", "sizeParam", "sizeMap", "includeQuality", "qualityParam", "apiQuality", "qualityMap", "aspectRatio", "aspectRatioParam", "quality", "upstreamDefaultQuality", "upstreamModelByQuality", "useBaseUrlOrigin", "generationConfig", "systemInstruction", "batchSize", "multiResultMode", "fanoutConcurrency", "maxImageReferences"]);

export function resolveImageSize(mapValue: unknown, ratio: unknown, quality: unknown): string {
  const size = objectValue(objectValue(mapValue)[String(ratio ?? "")])[String(quality ?? "")];
  if (typeof size !== "string" || !size) throw new Error(`The model declares no image size for quality ${String(quality ?? "")} at aspect ratio ${String(ratio ?? "")}`);
  return size;
}

// A model parameter with an empty value means "do not send": the field is left out of a merged request body.
export function withoutUnsentParams(params: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== null && value !== ""));
}

export function normalizedProviderRequest(requestValue: JsonObject, model: JsonObject, profile: JsonObject): JsonObject {
  const request = normalizedRequest(requestValue);
  const defaults = objectValue(model.defaultParams);
  const raw = parseRawParams(request.rawParams);
  const capability = String(model.canvasCapability ?? "");
  if (capability === "image.generate") {
    const params = { ...defaults, ...raw };
    const policy = imageParameterPolicy(dotted(profile, "advanced.request.parameterPolicy"));
    const publicParams: JsonObject = {
      ...policy.rawDefaults,
      ...Object.fromEntries(Object.entries(withoutUnsentParams(params)).filter(([key]) => !IMAGE_INTERNAL_PARAM_KEYS.has(key))),
    };
    if (policy.sizeParam) publicParams[policy.sizeParam] = resolveImageSize(params.sizeMap, request.aspectRatio, request.quality);
    if (policy.qualityParam) publicParams[policy.qualityParam] = request.apiQuality || params.apiQuality || request.quality;
    if (policy.aspectRatioParam) publicParams[policy.aspectRatioParam] = request.aspectRatio;
    if (policy.countParam) publicParams[policy.countParam] = request.batchSize;
    if (request.negativePrompt) publicParams.negative_prompt = request.negativePrompt;
    if (request.seed) publicParams.seed = request.seed;
    const systemInstruction = nonEmptyString(params.systemInstruction);
    return {
      ...request,
      ...(systemInstruction ? { systemInstruction } : {}),
      generationConfig: objectValue(params.generationConfig),
      rawParams: publicParams,
    };
  }
  if (capability === "video.generate") {
    const params = { ...defaults, ...raw };
    return {
      ...request,
      watermark: typeof params.watermark === "boolean" ? params.watermark : false,
      cameraFixed: typeof params.camera_fixed === "boolean" ? params.camera_fixed : false,
      enableUpsample: String(request.quality ?? "").toUpperCase() === "1080P",
      rawParams: withoutUnsentParams(params),
    };
  }
  return { ...request, rawParams: raw };
}
