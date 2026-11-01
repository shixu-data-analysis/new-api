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
