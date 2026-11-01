/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// Contracts of the Cloud admin catalog editing endpoints.
export type CatalogJson = Record<string, unknown>
export type VersionSource = 'BUNDLE' | 'ADMIN'
export type CatalogCapability =
  | 'image.generate'
  | 'video.generate'
  | 'chat.generate'

export interface CatalogModelDefinition {
  productKey: string
  displayName: string
  description?: string
  capability: CatalogCapability
  sourceKind: 'official' | 'relay'
  release: {
    channelId: string
    execution: {
      providerModel:
        | { modelId: string }
        | { defaultQuality: string; modelIdByQuality: Record<string, string> }
    }
    publicInteraction: {
      defaultParams: CatalogJson
      paramSchema: CatalogJson
      referenceLimits: CatalogJson
      mediaConstraints?: CatalogJson
    }
  }
}

export interface CatalogProviderDefinition {
  id: string
  internalName: string
  sourceKind: 'official' | 'relay'
  baseUrl: string
  internalOnly: true
  trustPolicy: string
  credentialSchemes: string[]
}

export interface CatalogChannelDefinition {
  id: string
  providerId: string
  adapterProfile: { id: string; version: string }
  internalOnly: true
}

export interface CurrentCatalogView {
  bundle: {
    bundleId: string
    bundleVersion: string
    providers: CatalogProviderDefinition[]
    channels: CatalogChannelDefinition[]
    models: CatalogModelDefinition[]
    openapiContracts: Array<{ path: string; document: CatalogJson }>
    adapterProfiles: Array<{ path: string; profile: CatalogJson }>
  }
  sources: {
    providers: Record<string, VersionSource>
    channels: Record<string, VersionSource>
    models: Record<string, VersionSource>
  }
  versions: {
    channels: Record<string, number>
    models: Record<string, number>
  }
  /** The Bundle version a model's current version came from; absent for an admin version. */
  modelBundleVersions: Record<string, string>
  retiredModelKeys: string[]
  retiredChannelCodes: string[]
  credentialGroups: Array<{
    versionId: string
    name: string
    providerId: string
  }>
  modelCredentialGroups: Record<string, string>
  copiedModels: Record<string, string>
}

export interface CatalogEditorOptions {
  usageProtocols: string[]
  textUsageProtocols: string[]
  mediaDeliveries: string[]
  workflows: string[]
  capabilities: CatalogCapability[]
  sourceKinds: Array<'official' | 'relay'>
  defaults: {
    pollIntervalMs: number
    maxMultipartBytes: number
    syncRequestTimeoutMs: number
    assetRetentionSeconds: number
  }
  supportedFields: Record<
    | 'paramSchema'
    | 'defaultParams'
    | 'referenceLimits'
    | 'mediaConstraints'
    | 'profile',
    string[]
  >
}

export type ProviderRequestPreview =
  | {
      ok: true
      method: string
      url: string
      contentType: string | null
      body: unknown
      upstreamModelId: string
    }
  | { ok: false; stage: string | null; reason: string; message: string }

export interface CatalogRequestChange {
  productKey: string
  displayName: string
  before: ProviderRequestPreview | null
  after: ProviderRequestPreview
}

export interface CatalogEditDraftModel {
  baseVersion: number | null
  definition: CatalogModelDefinition
  credentialGroupVersionId?: string
  copy?: {
    sourceModelKey: string
    inheritCategory: boolean
    inheritIcon: boolean
  }
}

export interface CatalogEditDraftChannel {
  id: string
  providerId: string
  baseVersion: number | null
  profile: CatalogJson
  contract: CatalogJson
}

export interface CatalogEditDraftProvider {
  id: string
  internalName: string
  baseUrl: string
  sourceKind: 'official' | 'relay'
  credentialSchemes: string[]
  confirmHostChange: boolean
}

export interface CatalogEditDraft {
  providers: CatalogEditDraftProvider[]
  channels: CatalogEditDraftChannel[]
  models: CatalogEditDraftModel[]
}

export interface NewCredentialGroup {
  providerId: string
  name: string
  apiKey: string
}

export interface CatalogModelVersionFact {
  modelKey: string
  version: number
  status: string
  source: VersionSource
  publishedBy: string | null
  publishedAt: string
}

export interface CatalogRetirementImpact {
  modelKey: string
  retired: boolean
  versions: number
  channelId: string
  source: VersionSource
  quotes: number
  tasks: number
  inFlightTasks: number
}

export interface CatalogRealCallResult {
  sent: boolean
  request: ProviderRequestPreview
  response: {
    status: number | null
    body: string | null
    timedOut?: boolean
  } | null
  parsed: {
    state: string
    outputs: unknown[]
    usageProtocol: string | null
    usage: unknown
  } | null
}

export interface CatalogExportResult {
  bundleId: string
  bundleVersion: string
  files: Array<{ path: string; content: unknown }>
}
