export type ModelOption =
  | { key: string; label: string; type: "enum"; values: Array<{ value: string; label: string }> }
  | { key: string; label: string; type: "boolean" };
export type VideoReferenceMode = "text-to-video" | "image-to-video" | "first-last-frame" | "image-reference";
export type GenerationPanelInput = { capability: string; paramSchema?: unknown; defaultParams?: unknown; referenceLimits?: unknown; quality?: unknown };
export type GenerationPanelRules = {
  aspectRatios: string[];
  defaultAspectRatio?: string;
  qualities: string[];
  defaultQuality?: string;
  apiQualities: string[];
  defaultApiQuality?: string;
  durations: number[];
  durationDiscrete: boolean;
  defaultDuration?: number;
  supportsAudioGeneration: boolean;
  defaultGenerateAudio: boolean;
  supportsTransparentBackground: boolean;
  transparentNeedsSingleAlphaImage: boolean;
  modelOptions: ModelOption[];
  optionDefaults: Record<string, unknown>;
  batchOptions: number[];
  defaultBatchSize?: number;
  /** Set for an upscale model, which the video node toolbar offers instead of the generation panel. */
  videoUpscale: { sameResolution: boolean } | null;
  videoModes: { textToVideo: boolean; imageToVideo: boolean; firstLastFrame: boolean; fullReference: boolean } | null;
  regionEdit: boolean;
};
export declare function videoModeSupported(mode: VideoReferenceMode, limits: { supportsTextToVideo?: boolean; supportsImageToVideo?: boolean; supportsStartEndFrames?: boolean; supportsImageReference?: boolean; supportsVideoReference?: boolean; supportsAudioReference?: boolean }): boolean;
export declare function modelOptionsFromSchema(schema: unknown): ModelOption[];
export declare function modelBatchOptions(schema: unknown): number[];
export declare function durationOptions(schema: unknown, quality?: unknown): { values: number[]; discrete: boolean };
export declare function generationPanelRules(input: GenerationPanelInput): GenerationPanelRules;
export type VideoUpscaleSource = { width?: number | null; height?: number | null; durationMs?: number | null };
export type VideoUpscaleTier = { quality: string; block?: "BELOW_SOURCE" | "SAME_AS_SOURCE"; outputSize: { width: number; height: number } | null; sameSize: boolean };
export type VideoUpscaleDuration = { seconds: number } | { problem: "unknown" | "too-short" | "too-long"; limitSeconds?: number };
export declare function videoUpscalePanelRules(input: { paramSchema?: unknown; referenceLimits?: unknown }, source: VideoUpscaleSource): { tiers: VideoUpscaleTier[]; duration: VideoUpscaleDuration };
