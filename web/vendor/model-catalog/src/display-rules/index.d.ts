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
  videoModes: { textToVideo: boolean; imageToVideo: boolean; firstLastFrame: boolean; fullReference: boolean } | null;
  regionEdit: boolean;
};
export declare function videoModeSupported(mode: VideoReferenceMode, limits: { supportsTextToVideo?: boolean; supportsImageToVideo?: boolean; supportsStartEndFrames?: boolean; supportsImageReference?: boolean; supportsVideoReference?: boolean; supportsAudioReference?: boolean }): boolean;
export declare function modelOptionsFromSchema(schema: unknown): ModelOption[];
export declare function modelBatchOptions(schema: unknown): number[];
export declare function durationOptions(schema: unknown, quality?: unknown): { values: number[]; discrete: boolean };
export declare function generationPanelRules(input: GenerationPanelInput): GenerationPanelRules;
