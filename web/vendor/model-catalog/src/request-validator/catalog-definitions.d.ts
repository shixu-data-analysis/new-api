export type CatalogDefinitionSummary = {
  status: "VALID";
  referencedFiles: string[];
  bundleId: string;
  bundleVersion: string;
  providers: number;
  channels: number;
  models: number;
  openapiContracts: number;
  adapterProfiles: number;
};
export declare function validateCatalogDefinitions(read: (file: string) => unknown, options?: { tag?: string; partial?: boolean }): CatalogDefinitionSummary;
/** The first problem of a model's `mediaConstraints` (named `location` in the message), or undefined when they are valid. */
export declare function mediaConstraintsIssue(value: unknown, location?: string): string | undefined;
/** The first structural problem of one model definition of models.json, or undefined when its structure is valid. */
export declare function modelDefinitionIssue(model: unknown): string | undefined;
/** The longest note on how to write a model's prompt (`release.publicInteraction.promptGuide`). */
export declare const PROMPT_GUIDE_MAX_CHARACTERS: number;
