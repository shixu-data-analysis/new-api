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
/** The first structural problem of one model definition of models.json, or undefined when its structure is valid. */
export declare function modelDefinitionIssue(model: unknown): string | undefined;
