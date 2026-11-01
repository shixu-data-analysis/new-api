/**
 * What the canvas generation panel shows for a model. Canvas Web renders it and the admin form previews it, so one rule
 * change takes effect in both; each side keeps its own controls and styles.
 */
import { durationRangeForQuality } from "../request-validator/index.mjs";

const object = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const stringList = (value) => (Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : []);

/** Full reference has no field of its own: the canvas offers it when any reference type is on. */
export function videoModeSupported(mode, limits) {
  if (mode === "text-to-video") return limits.supportsTextToVideo !== false;
  if (mode === "image-to-video") return limits.supportsImageToVideo === true;
  if (mode === "first-last-frame") return limits.supportsStartEndFrames === true;
  return Boolean(limits.supportsImageReference || limits.supportsVideoReference || limits.supportsAudioReference);
}

export function modelOptionsFromSchema(schema) {
  const raw = object(schema).options;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || typeof entry.key !== "string" || !entry.key || typeof entry.label !== "string") return [];
    if (entry.type === "boolean") return [{ key: entry.key, label: entry.label, type: "boolean" }];
    if (entry.type !== "enum" || !Array.isArray(entry.values)) return [];
    const values = entry.values.filter((value) => value && typeof value === "object" && typeof value.value === "string" && typeof value.label === "string").map((value) => ({ value: value.value, label: value.label }));
    return values.length ? [{ key: entry.key, label: entry.label, type: "enum", values }] : [];
  });
}

function batchLimit(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/** Counts offered on the canvas; an equal minimum and maximum fixes the count. */
export function modelBatchOptions(schema) {
  const source = object(schema);
  const min = batchLimit(source.minBatchSize, 1);
  const max = Math.max(min, batchLimit(source.maxBatchSize, min));
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

export function durationOptions(schema, quality) {
  const source = object(schema);
  const discrete = Array.isArray(source.durations) ? source.durations.map(Number).filter((value) => Number.isFinite(value) && value > 0) : [];
  if (discrete.length) return { values: [...new Set(discrete)].sort((left, right) => left - right), discrete: true };
  if (!Object.keys(object(source.durationRange)).length) return { values: [], discrete: false };
  const range = durationRangeForQuality(source, quality);
  const min = Math.max(1, Math.trunc(Number(range.min) || 1));
  const max = Math.max(min, Math.trunc(Number(range.max) || min));
  const step = Math.max(1, Math.trunc(Number(range.step) || 1));
  const values = [];
  for (let value = min; value <= max; value += step) values.push(value);
  return { values, discrete: false };
}

export function generationPanelRules(input) {
  const schema = object(input?.paramSchema);
  const defaults = object(input?.defaultParams);
  const limits = object(input?.referenceLimits);
  const video = input?.capability === "video.generate";
  const image = input?.capability === "image.generate";
  const backgroundModes = stringList(schema.backgroundModes);
  const durations = video ? durationOptions(schema, input?.quality ?? defaults.quality) : { values: [], discrete: false };
  return {
    aspectRatios: stringList(schema.aspectRatios),
    defaultAspectRatio: typeof defaults.aspectRatio === "string" ? defaults.aspectRatio : undefined,
    qualities: stringList(schema.qualities),
    defaultQuality: typeof defaults.quality === "string" ? defaults.quality : undefined,
    apiQualities: image ? stringList(schema.apiQualities) : [],
    defaultApiQuality: typeof defaults.apiQuality === "string" ? defaults.apiQuality : undefined,
    durations: durations.values,
    durationDiscrete: durations.discrete,
    defaultDuration: typeof defaults.durationSeconds === "number" ? defaults.durationSeconds : undefined,
    supportsAudioGeneration: video && (schema.supportsAudioGeneration === true || typeof defaults.generateAudio === "boolean"),
    defaultGenerateAudio: defaults.generateAudio === true,
    supportsTransparentBackground: image && backgroundModes.includes("transparent"),
    transparentNeedsSingleAlphaImage: schema.backgroundInput === "singleAlphaImage",
    modelOptions: modelOptionsFromSchema(schema),
    optionDefaults: Object.fromEntries(modelOptionsFromSchema(schema).map((option) => [option.key, defaults[option.key]])),
    batchOptions: modelBatchOptions(schema),
    defaultBatchSize: typeof defaults.batchSize === "number" ? defaults.batchSize : undefined,
    videoModes: video ? {
      textToVideo: videoModeSupported("text-to-video", limits),
      imageToVideo: videoModeSupported("image-to-video", limits),
      firstLastFrame: videoModeSupported("first-last-frame", limits),
      fullReference: videoModeSupported("image-reference", limits),
    } : null,
    regionEdit: image && Boolean(object(limits.imageOperations)["region-edit"]),
  };
}
