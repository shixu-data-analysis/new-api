/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { api } from '@/lib/api'

import type {
  CatalogEditDraft,
  CatalogEditorOptions,
  CatalogExportResult,
  CatalogModelVersionFact,
  CatalogRealCallResult,
  CatalogRequestChange,
  CatalogRetirementImpact,
  CurrentCatalogView,
  NewCredentialGroup,
} from './catalog-edit-types'
import type { ModelCatalogPlan } from './generated/model-catalog-import'

const base = '/canvas-api/v1/web/admin/model-catalog'

export type CatalogEditPlan = Omit<ModelCatalogPlan, 'manifestSha256'> & {
  requestChanges: CatalogRequestChange[]
  editedModelKeys: string[]
}

export async function getCurrentCatalog(): Promise<CurrentCatalogView> {
  return (await api.get<CurrentCatalogView>(`${base}/current`)).data
}

export async function getCatalogEditorOptions(): Promise<CatalogEditorOptions> {
  return (await api.get<CatalogEditorOptions>(`${base}/editor-options`)).data
}

export async function getCatalogModelVersion(
  modelKey: string
): Promise<CatalogModelVersionFact> {
  return (
    await api.get<CatalogModelVersionFact>(
      `${base}/models/${encodeURIComponent(modelKey)}/version`,
      { skipErrorHandler: true }
    )
  ).data
}

export async function planCatalogEdit(
  draft: CatalogEditDraft,
  options: { sampleImage?: boolean } = {}
): Promise<CatalogEditPlan> {
  return (
    await api.post<CatalogEditPlan>(`${base}/edits/plan`, draft, {
      skipErrorHandler: true,
      params: options.sampleImage ? { sampleImages: '1' } : undefined,
    })
  ).data
}

export async function publishCatalogEdit(input: {
  draft: CatalogEditDraft
  expectedPlanToken: string
  idempotencyKey: string
  newCredentialGroup?: NewCredentialGroup
}) {
  return (
    await api.post<{
      models: Array<{
        productKey: string
        currentVersion: number | null
        version: number | null
      }>
    }>(
      `${base}/edits/publications`,
      {
        confirmed: true,
        draft: input.draft,
        expectedPlanToken: input.expectedPlanToken,
        ...(input.newCredentialGroup
          ? { newCredentialGroup: input.newCredentialGroup }
          : {}),
      },
      {
        headers: { 'Idempotency-Key': input.idempotencyKey },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getModelRetirementImpact(
  modelKey: string
): Promise<CatalogRetirementImpact> {
  return (
    await api.get<CatalogRetirementImpact>(
      `${base}/models/${encodeURIComponent(modelKey)}/retirement`
    )
  ).data
}

export async function retireCatalogModel(input: {
  modelKey: string
  expectedVersion: number
  reasonCode: string
  confirmedModelKey: string
  idempotencyKey: string
}) {
  return (
    await api.post(
      `${base}/models/${encodeURIComponent(input.modelKey)}/retirement`,
      {
        expectedVersion: input.expectedVersion,
        reasonCode: input.reasonCode,
        confirmedModelKey: input.confirmedModelKey,
      },
      {
        headers: { 'Idempotency-Key': input.idempotencyKey },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function retireCatalogChannel(input: {
  channelCode: string
  expectedVersion: number
  reasonCode: string
  confirmedChannelCode: string
  idempotencyKey: string
}) {
  return (
    await api.post(
      `${base}/channels/${encodeURIComponent(input.channelCode)}/retirement`,
      {
        expectedVersion: input.expectedVersion,
        reasonCode: input.reasonCode,
        confirmedChannelCode: input.confirmedChannelCode,
      },
      {
        headers: { 'Idempotency-Key': input.idempotencyKey },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function exportCurrentCatalog(): Promise<CatalogExportResult> {
  return (await api.get<CatalogExportResult>(`${base}/export`)).data
}

export async function sendCatalogRealCall(input: {
  draft: CatalogEditDraft
  modelKey: string
  credentialGroupVersionId?: string
  apiKey?: string
  pollTaskId?: string
}): Promise<CatalogRealCallResult> {
  return (
    await api.post<CatalogRealCallResult>(
      `${base}/real-calls`,
      { confirmed: true, ...input },
      { skipErrorHandler: true }
    )
  ).data
}
